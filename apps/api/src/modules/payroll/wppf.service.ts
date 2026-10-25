import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { addMonths, BD_RULES, bdServiceMonths, bdWppfTdsPercent, ruleOn } from '@gp/country-packs';
import {
  CIPHER_FIELDS,
  employees,
  payGroups,
  payrollRuns,
  separations,
  wppfYears,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  money,
  todayIn,
  type PayLineView,
  type WppfAmounts,
  type WppfRunInput,
  type WppfYearInput,
  type WppfYearView,
} from '@gp/shared';
import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { componentsOf } from './payroll-setup.service.js';
import { approvedPay, sealed } from './run-context.js';
import type { EngineResult } from './run-engine.js';

type YearRow = typeof wppfYears.$inferSelect;
type RunRow = typeof payrollRuns.$inferSelect;

const whole = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_DOWN);
const earlier = (a: string, b: string) => (a < b ? a : b);
const later = (a: string, b: string) => (a > b ? a : b);

/**
 * A year's Workers' Participation Fund (Labour Act Chapter XV): 5% of net profit split
 * 80:10:10 between the participation fund, the welfare fund and the Workers' Welfare
 * Foundation, and the participation fund's cash part paid in equal shares to beneficiaries
 * through a run per pay group, with tax deducted at source (Income Tax Act s.88).
 */
@Injectable()
export class WppfService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  list(): Promise<WppfYearView[]> {
    return this.tenantDb.run(async (tx) => {
      const years = await tx.select().from(wppfYears).orderBy(asc(wppfYears.yearStart));
      return Promise.all(years.map((y) => this.view(tx, y)));
    });
  }

  async create(actor: AuthUser, input: WppfYearInput): Promise<WppfYearView> {
    return this.tenantDb.run(async (tx) => {
      const [taken] = await tx
        .select({ id: wppfYears.id })
        .from(wppfYears)
        .where(eq(wppfYears.accountingYear, input.accountingYear));
      if (taken) throw conflict('wppf_year_exists', 'This year already has a fund');
      const rule = ruleOn(BD_RULES, 'wppf.shares', input.yearEnd).value;
      const fund = new Decimal(input.netProfit)
        .times(rule.percentOfNetProfit)
        .dividedBy(100)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      const participation = whole(fund.times(rule.participation).dividedBy(100));
      const welfare = whole(fund.times(rule.welfare).dividedBy(100));
      const cash = whole(participation.times(rule.cash.numerator).dividedBy(rule.cash.denominator));
      const amounts: WppfAmounts = {
        netProfit: money(input.netProfit),
        fund: money(fund),
        participation: money(participation),
        welfare: money(welfare),
        // What rounding leaves goes to the foundation, so the three add up to the fund.
        foundation: money(fund.minus(participation).minus(welfare)),
        cash: money(cash),
        invested: money(participation.minus(cash)),
      };
      const [row] = await tx
        .insert(wppfYears)
        .values({
          tenantId: currentTenantId(),
          accountingYear: input.accountingYear,
          yearStart: input.yearStart,
          yearEnd: input.yearEnd,
          amountsEnc: sealed(this.cipher).seal(CIPHER_FIELDS.wppfAmounts, amounts),
          minServiceMonths: input.minServiceMonths ?? rule.minMonthsInYear,
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.wppf.create',
        entityType: 'wppf_year',
        entityId: row!.id,
        after: { accountingYear: input.accountingYear, fund: amounts.fund, cash: amounts.cash },
      });
      return this.view(tx, row!);
    });
  }

  /** Opens the run paying a pay group's beneficiaries their shares; one per group and year. */
  async openRun(actor: AuthUser, yearId: string, input: WppfRunInput): Promise<string> {
    return this.tenantDb.run(async (tx) => {
      const year = await this.yearOf(tx, yearId);
      const [group] = await tx.select().from(payGroups).where(eq(payGroups.id, input.payGroupId));
      if (!group?.isActive)
        throw badRequest('pay_group_inactive', 'Choose a pay group that is in use');
      if (input.paymentDate <= year.yearEnd) {
        throw badRequest('wppf_before_year_end', 'Pay the fund after the year it is for');
      }
      const [open] = await tx
        .select({ id: payrollRuns.id })
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.wppfId, year.id),
            eq(payrollRuns.payGroupId, group.id),
            ne(payrollRuns.status, 'cancelled'),
          ),
        );
      if (open) throw conflict('wppf_run_exists', 'This pay group already has a run for the year');
      const [row] = await tx
        .insert(payrollRuns)
        .values({
          tenantId: currentTenantId(),
          payGroupId: group.id,
          kind: 'wppf',
          wppfId: year.id,
          periodStart: year.yearStart,
          periodEnd: year.yearEnd,
          // Within nine months of the year end (s.234).
          paymentDue: addMonths(year.yearEnd, 9),
          paymentDate: input.paymentDate,
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.wppf',
        entityType: 'payroll_run',
        entityId: row!.id,
        after: { accountingYear: year.accountingYear, payGroup: group.code },
      });
      return row!.id;
    });
  }

  /** Each of the pay group's beneficiaries gets the equal share, less tax at source. */
  async compute(tx: Tx, run: RunRow) {
    const year = await this.yearOf(tx, run.wppfId!);
    const { people, share } = await this.beneficiaries(tx, year, run.paymentDate);
    const components = await componentsOf(tx);
    const name = (code: string) => components.find((c) => c.code === code);
    const tds = share
      .times(bdWppfTdsPercent(run.paymentDate))
      .dividedBy(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const line = (code: string, kind: PayLineView['kind'], amount: Decimal): PayLineView => ({
      code,
      name: name(code)?.name ?? code,
      nameBn: name(code)?.nameBn ?? null,
      kind,
      inGross: false,
      amount: money(amount),
    });
    return people
      .filter((p) => p.payGroupId === run.payGroupId && share.greaterThan(0))
      .map((p) => {
        const lines = [line('WPPF', 'earning', share)];
        if (tds.greaterThan(0)) lines.push(line('WPPF_TDS', 'deduction', tds));
        const result: EngineResult = {
          status: 'ok',
          problems: [],
          lines,
          earnings: money(share),
          deductions: money(tds),
          net: money(share.minus(tds)),
          employerCost: '0.00',
          variables: {
            periodDays: 0,
            employedDays: 0,
            paidDays: 0,
            workedDays: 0,
            absentDays: 0,
            unpaidLeaveDays: 0,
            otHours: 0,
          },
          taxable: '0.00',
          tax: null,
          loans: [],
        };
        return { employeeId: p.id, result, flagged: false };
      });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async yearOf(tx: Tx, id: string): Promise<YearRow> {
    const [year] = await tx.select().from(wppfYears).where(eq(wppfYears.id, id));
    if (!year) throw new NotFoundException('Participation fund year not found');
    return year;
  }

  private amountsOf(year: YearRow): WppfAmounts {
    return sealed(this.cipher).open<WppfAmounts>(CIPHER_FIELDS.wppfAmounts, year.amountsEnc);
  }

  /**
   * Everyone of any rank employed nine months, six of them in the year, except those
   * dismissed, who forfeit (s.233, s.242). Leavers keep their share; each is paid through the
   * pay group of their latest pay.
   */
  private async beneficiaries(tx: Tx, year: YearRow, paidOn: string) {
    const rule = ruleOn(BD_RULES, 'wppf.shares', year.yearEnd).value;
    const rows = await tx
      .select()
      .from(employees)
      .where(
        and(
          lte(employees.joinedOn, year.yearEnd),
          or(isNull(employees.separatedOn), sql`${employees.separatedOn} >= ${year.yearStart}`),
        ),
      );
    const dismissed = new Set(
      (
        await tx
          .select({ employeeId: separations.employeeId })
          .from(separations)
          .where(
            and(
              eq(separations.type, 'dismissal'),
              inArray(separations.status, ['approved', 'completed']),
            ),
          )
      ).map((r) => r.employeeId),
    );
    const pay = await approvedPay(tx, this.cipher, paidOn);
    const people = rows.flatMap((p) => {
      const until = earlier(p.separatedOn ?? year.yearEnd, year.yearEnd);
      const employed = bdServiceMonths(p.joinedOn, until);
      const inYear = bdServiceMonths(later(p.joinedOn, year.yearStart), until);
      const record = pay.get(p.id)?.at(-1);
      if (
        dismissed.has(p.id) ||
        !record ||
        employed < rule.minEmploymentMonths ||
        inYear < year.minServiceMonths
      ) {
        return [];
      }
      return [{ id: p.id, payGroupId: record.payGroupId }];
    });
    const cash = new Decimal(this.amountsOf(year).cash);
    const share = people.length ? whole(cash.dividedBy(people.length)) : new Decimal(0);
    return { people, share };
  }

  private async view(tx: Tx, year: YearRow): Promise<WppfYearView> {
    const runs = await tx
      .select({ run: payrollRuns, group: payGroups.name })
      .from(payrollRuns)
      .innerJoin(payGroups, eq(payGroups.id, payrollRuns.payGroupId))
      .where(and(eq(payrollRuns.wppfId, year.id), ne(payrollRuns.status, 'cancelled')))
      .orderBy(asc(payGroups.name));
    const { people, share } = await this.beneficiaries(tx, year, later(todayIn(), year.yearEnd));
    return {
      id: year.id,
      accountingYear: year.accountingYear,
      yearStart: year.yearStart,
      yearEnd: year.yearEnd,
      amounts: this.amountsOf(year),
      minServiceMonths: year.minServiceMonths,
      beneficiaries: people.length,
      share: money(share),
      runs: runs.map(({ run, group }) => ({
        id: run.id,
        payGroupId: run.payGroupId,
        payGroup: group,
        status: run.status,
        headcount: run.headcount,
      })),
      createdAt: year.createdAt.toISOString(),
    };
  }
}
