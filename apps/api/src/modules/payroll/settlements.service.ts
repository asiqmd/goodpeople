import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BD_RULES, bdSettlement, ruleOn } from '@gp/country-packs';
import {
  CIPHER_FIELDS,
  employees,
  leaveTypes,
  payrollRunItems,
  payrollRuns,
  separations,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  ageOn,
  Decimal,
  money,
  todayIn,
  type PayLineView,
  type SeparationType,
  type SettlementCase,
  type SettlementWorking,
  type TenantWithAccess,
} from '@gp/shared';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { WorkCalendarService } from '../calendar/work-calendar.service.js';
import { PolicyService } from '../group/policy.service.js';
import { BalancesService } from '../leave/balances.service.js';
import { workOutPay } from './pay-calc.js';
import { componentsOf, payrollSettingsOf } from './payroll-setup.service.js';
import { pfBalances, vestedPercent } from './provident-fund.service.js';
import {
  approvedPay,
  attendanceOf,
  extraVariablesOf,
  inputsOf,
  jobsOn,
  loansFor,
  pfRatesFor,
  sealed,
  taxContextsFor,
  workingDaysAfter,
  type StoredResult,
} from './run-context.js';
import { computePay, difference, type EngineResult } from './run-engine.js';

type RunRow = typeof payrollRuns.$inferSelect;

/** Components a settlement adds; HR may enter any of them to replace what is worked out. */
export const SETTLEMENT_CODES = [
  'NOTICE_PAY',
  'NOTICE_RECOVERY',
  'LEAVE_ENCASHMENT',
  'GRATUITY',
  'SEPARATION_BENEFIT',
] as const;
const LOAN_CODES = new Set(['ADVANCE', 'LOAN', 'PF_LOAN']);

const monthStart = (date: string) => `${date.slice(0, 8)}01`;
const monthEnd = (date: string) => {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
/** The average monthly basic over the twelve months to the last day, of the months employed. */
function averageBasic(basicOf: (date: string) => Decimal, joinedOn: string, last: string) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const [y, m] = last.split('-').map(Number) as [number, number];
    const end = new Date(Date.UTC(y, m - 1 - i + 1, 0)).toISOString().slice(0, 10);
    return end > last ? last : end;
  }).filter((date) => date >= joinedOn);
  if (months.length === 0) return basicOf(last);
  return months
    .reduce((s, date) => s.plus(basicOf(date)), new Decimal(0))
    .dividedBy(months.length)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
const sum = (lines: PayLineView[], kind: PayLineView['kind']) =>
  lines.filter((l) => l.kind === kind).reduce((s, l) => s.plus(l.amount), new Decimal(0));

/**
 * A leaver's final settlement, as a run for their last month: the days of that month not yet
 * paid, pay in lieu of notice (or the notice not served), unused earned leave, gratuity or the
 * separation's benefit, every loan left recovered, and their provident fund paid out when it
 * locks. Approved, locked and paid like any run, within the Act's 30 working days (s.30).
 */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly calendars: WorkCalendarService,
    private readonly balances: BalancesService,
    private readonly policy: PolicyService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** Opens the settlement run for a decided separation; one at a time per separation. */
  async create(actor: AuthUser, separationId: string): Promise<string> {
    return this.tenantDb.run(async (tx) => {
      const [separation] = await tx
        .select()
        .from(separations)
        .where(eq(separations.id, separationId));
      if (!separation) throw new NotFoundException('Separation not found');
      if (separation.status !== 'approved' && separation.status !== 'completed') {
        throw badRequest('separation_not_decided', 'Settle a separation once it is approved');
      }
      const [open] = await tx
        .select({ id: payrollRuns.id })
        .from(payrollRuns)
        .where(
          and(eq(payrollRuns.separationId, separationId), ne(payrollRuns.status, 'cancelled')),
        );
      if (open) throw conflict('settlement_exists', 'This separation already has a settlement');
      const last = separation.lastWorkingDay;
      const records = (await approvedPay(tx, this.cipher, last)).get(separation.employeeId) ?? [];
      const inForce = records.filter((r) => r.effectiveFrom <= last).at(-1);
      if (!inForce) throw badRequest('no_pay', 'There is no approved pay to settle on');
      const days = ruleOn(BD_RULES, 'separation.dues_within_working_days', last).value;
      const due = await workingDaysAfter(tx, this.calendars, last, days);
      const [row] = await tx
        .insert(payrollRuns)
        .values({
          tenantId: currentTenantId(),
          payGroupId: inForce.payGroupId,
          kind: 'settlement',
          separationId,
          periodStart: monthStart(last),
          periodEnd: monthEnd(last),
          paymentDue: due,
          paymentDate: due,
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.run.settlement',
        entityType: 'payroll_run',
        entityId: row!.id,
        after: { separationId, employeeId: separation.employeeId, type: separation.type },
      });
      return row!.id;
    });
  }

  /** Decided separations, newest last day first, with their settlement if one was opened. */
  list(): Promise<SettlementCase[]> {
    return this.tenantDb.run(async (tx) => {
      const { open } = sealed(this.cipher);
      const rows = await tx
        .select({ separation: separations, employee: employees })
        .from(separations)
        .innerJoin(employees, eq(employees.id, separations.employeeId))
        .where(inArray(separations.status, ['approved', 'completed']))
        .orderBy(desc(separations.lastWorkingDay));
      const runs = rows.length
        ? await tx
            .select({ run: payrollRuns, item: payrollRunItems })
            .from(payrollRuns)
            .leftJoin(payrollRunItems, eq(payrollRunItems.runId, payrollRuns.id))
            .where(
              and(
                inArray(
                  payrollRuns.separationId,
                  rows.map((r) => r.separation.id),
                ),
                ne(payrollRuns.status, 'cancelled'),
              ),
            )
        : [];
      return rows.map(({ separation, employee }) => {
        const found = runs.find((r) => r.run.separationId === separation.id);
        return {
          separationId: separation.id,
          employee: employeeRef(employee),
          type: separation.type as SeparationType,
          status: separation.status,
          noticeDate: separation.noticeDate,
          lastWorkingDay: separation.lastWorkingDay,
          run: found
            ? {
                id: found.run.id,
                status: found.run.status,
                net: found.item
                  ? open<{ net: string }>(CIPHER_FIELDS.runResults, found.item.resultEnc).net
                  : null,
                paidOn: found.run.paidOn,
              }
            : null,
        };
      });
    });
  }

  /** People whose last month a settlement pays, so the month's regular run leaves them out. */
  async settledIn(tx: Tx, periodStart: string): Promise<Set<string>> {
    const rows = await tx
      .select({ employeeId: separations.employeeId })
      .from(payrollRuns)
      .innerJoin(separations, eq(separations.id, payrollRuns.separationId))
      .where(
        and(
          eq(payrollRuns.kind, 'settlement'),
          eq(payrollRuns.periodStart, periodStart),
          ne(payrollRuns.status, 'cancelled'),
        ),
      );
    return new Set(rows.map((r) => r.employeeId));
  }

  /** The leaver's final dues, worked out from today's data. */
  async compute(tx: Tx, run: RunRow, tenant: TenantWithAccess) {
    const [separation] = await tx
      .select()
      .from(separations)
      .where(eq(separations.id, run.separationId!));
    const [employee] = await tx
      .select()
      .from(employees)
      .where(eq(employees.id, separation!.employeeId));
    const last = separation!.lastWorkingDay;
    const person = { ...employee!, separatedOn: last };
    const settings = await payrollSettingsOf(tx);
    const components = await componentsOf(tx);
    const records = (await approvedPay(tx, this.cipher, run.periodEnd)).get(person.id) ?? [];
    const job = (await jobsOn(tx, [person.id], last)).get(person.id);

    // Compensation and notice pay go on the s.14(3) wage: the last month's basic, or before
    // the 2025 amendment the average of the last twelve months'. Gratuity is on the last
    // basic, leave on a day's gross.
    const payOn = (date: string) => {
      const record = records.filter((r) => r.effectiveFrom <= date).at(-1);
      return record
        ? workOutPay(record.engine.structure, components, record.engine.amount, record.engine.fixed)
        : null;
    };
    const basicOf = (date: string) =>
      new Decimal(payOn(date)?.lines.find((l) => l.code === 'BASIC')?.amount ?? 0);
    const lastBasic = basicOf(last);
    const wageBasis = ruleOn(BD_RULES, 'separation.wage_basis', last).value;
    const wage =
      wageBasis === 'last_month' ? lastBasic : averageBasic(basicOf, person.joinedOn, last);
    const daily = wage.dividedBy(30);
    const gratuityDaily = lastBasic.dividedBy(30);
    const leaveDaily = new Decimal(payOn(last)?.gross ?? 0).dividedBy(30);

    const [annual] = await tx
      .select()
      .from(leaveTypes)
      .where(and(eq(leaveTypes.statutoryKey, 'annual'), eq(leaveTypes.isActive, true)));
    const balance = annual
      ? await this.balances.balance(tx, person, annual, Number(last.slice(0, 4)))
      : null;
    const days = bdSettlement({
      kind: separation!.type,
      joinedOn: person.joinedOn,
      noticeDate: separation!.noticeDate,
      lastWorkingDay: last,
      permanent: job?.employmentType === 'permanent',
      earnedLeaveDays: balance?.available ?? 0,
      gratuity: settings.gratuityEnabled,
    });
    const amount = (n: number, rate = daily) =>
      rate.times(n).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const rateOf = (code: string) => (code === 'GRATUITY' ? gratuityDaily : daily);
    const worked: Record<string, Decimal> = {};
    if (days.notice.owedBy === 'employer') worked.NOTICE_PAY = amount(days.notice.shortDays);
    if (days.notice.owedBy === 'employee') worked.NOTICE_RECOVERY = amount(days.notice.shortDays);
    if (days.leaveDays > 0) worked.LEAVE_ENCASHMENT = amount(days.leaveDays, leaveDaily);
    for (const b of days.benefits) worked[b.code] = amount(b.days, rateOf(b.code));
    const entered = Object.fromEntries(
      ((await inputsOf(tx, this.cipher, run.id)).get(person.id) ?? []).map((i) => [
        i.component,
        i.amount,
      ]),
    );
    const inputs: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(worked)
          .filter(([, v]) => v.greaterThan(0))
          .map(([k, v]) => [k, money(v)]),
      ),
      ...entered,
    };

    // The last month to the last day, with the dues as entered amounts so tax and loan
    // recovery see them; every loan left is recovered in full.
    const attendance = await attendanceOf(tx, [person.id], run, tenant);
    const loans = (
      (await loansFor(tx, this.cipher, [person.id], '9999-12')).get(person.id) ?? []
    ).map((l) => ({ ...l, installment: l.outstanding }));
    const tax = await taxContextsFor(
      tx,
      this.cipher,
      settings,
      run,
      [
        {
          id: person.id,
          gender: person.gender,
          dateOfBirth: person.dateOfBirth,
          separatedOn: last,
          hasTin: !!person.tinEnc,
        },
      ],
      components,
    );
    const pf = await pfRatesFor(
      tx,
      settings,
      [person.id],
      { start: run.periodStart, end: run.periodEnd },
      this.policy,
    );
    // Pieces made in the last month are paid; a leaver's union dues are not deducted.
    const extra = await extraVariablesOf(tx, [person.id], run, tenant, {
      production: true,
      unionDues: false,
    });
    const now = computePay({
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      today: todayIn(),
      joinedOn: person.joinedOn,
      separatedOn: last,
      worker: job?.workerCategory !== 'staff',
      records: records.map((r) => r.engine),
      attendance: attendance ? (attendance.days.get(person.id) ?? []) : null,
      trackingFrom: attendance?.trackingFrom,
      inputs,
      components,
      pf: pf.get(person.id) ?? null,
      loans,
      tax: tax && tax !== 'missing' ? (tax.get(person.id) ?? null) : null,
      extra: extra.get(person.id),
    });
    if (now.status === 'error') return [{ employeeId: person.id, result: now, flagged: false }];

    // Less what the month's locked runs already paid them; loans are recovered as they stand.
    const paid = await this.paidThisMonth(tx, run, person.id);
    const lines = [
      ...difference(
        paid.filter((l) => !LOAN_CODES.has(l.code)),
        now.lines.filter((l) => !LOAN_CODES.has(l.code)),
      ),
      ...now.lines.filter((l) => LOAN_CODES.has(l.code)),
    ].toSorted((a, b) => (sortOf(components, a.code) ?? 0) - (sortOf(components, b.code) ?? 0));

    const fundBalance = (await pfBalances(tx, this.cipher, [person.id])).get(person.id);
    const contribution = (code: string) =>
      new Decimal(lines.find((l) => l.code === code)?.amount ?? 0);
    const vested = vestedPercent(settings.pfVesting, ageOn(person.joinedOn, last));
    const own = (fundBalance?.own ?? new Decimal(0)).plus(contribution('PF_EMPLOYEE'));
    const employer = (fundBalance?.employer ?? new Decimal(0))
      .plus(contribution('PF_EMPLOYER'))
      .times(vested)
      .dividedBy(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const settlement: SettlementWorking = {
      separationId: separation!.id,
      type: separation!.type as SeparationType,
      noticeDate: separation!.noticeDate,
      lastWorkingDay: last,
      serviceYears: days.serviceYears,
      serviceMonths: days.serviceMonths,
      wageBasis,
      monthlyWage: money(wage),
      dailyWage: money(daily),
      notice: {
        ...days.notice,
        amount: money(worked.NOTICE_PAY ?? worked.NOTICE_RECOVERY ?? 0),
      },
      leave: {
        days: days.leaveDays,
        dailyWage: money(leaveDaily),
        amount: money(worked.LEAVE_ENCASHMENT ?? 0),
      },
      benefits: days.benefits.map((b) => ({
        ...b,
        dailyWage: money(rateOf(b.code)),
        amount: money(worked[b.code] ?? 0),
      })),
      providentFund:
        fundBalance || pf.get(person.id)
          ? { own: money(own), employer: money(employer), total: money(own.plus(employer)) }
          : null,
      loansRecovered: money(now.loans.reduce((s, l) => s.plus(l.amount), new Decimal(0))),
      dueBy: run.paymentDue,
    };
    const earnings = sum(lines, 'earning');
    const deductions = sum(lines, 'deduction');
    const result: EngineResult & { settlement: SettlementWorking } = {
      ...now,
      problems: now.problems.filter((p) => p.code !== 'period_not_over'),
      lines,
      earnings: money(earnings),
      deductions: money(deductions),
      net: money(earnings.minus(deductions)),
      employerCost: money(sum(lines, 'employer_cost')),
      settlement,
    };
    if (earnings.minus(deductions).isNegative()) {
      result.status = 'error';
      result.problems = [
        ...result.problems,
        { code: 'negative_net', severity: 'error', message: 'Deductions are more than earnings' },
      ];
    }
    return [{ employeeId: person.id, result, flagged: false }];
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** What locked regular and adjustment runs paid this person for the month, summed. */
  private async paidThisMonth(tx: Tx, run: RunRow, employeeId: string): Promise<PayLineView[]> {
    const { open } = sealed(this.cipher);
    const runs = await tx
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.periodStart, run.periodStart),
          eq(payrollRuns.status, 'locked'),
          inArray(payrollRuns.kind, ['regular', 'adjustment']),
        ),
      );
    if (runs.length === 0) return [];
    const items = await tx
      .select()
      .from(payrollRunItems)
      .where(
        and(
          inArray(
            payrollRunItems.runId,
            runs.map((r) => r.id),
          ),
          eq(payrollRunItems.employeeId, employeeId),
          eq(payrollRunItems.status, 'ok'),
        ),
      );
    const sums = new Map<string, PayLineView>();
    for (const item of items) {
      for (const line of open<StoredResult>(CIPHER_FIELDS.runResults, item.resultEnc).lines) {
        const before = sums.get(line.code);
        sums.set(line.code, {
          ...line,
          amount: money(new Decimal(before?.amount ?? 0).plus(line.amount)),
        });
      }
    }
    return [...sums.values()];
  }
}

const sortOf = (components: { code: string; sortOrder: number }[], code: string) =>
  components.find((c) => c.code === code)?.sortOrder;
