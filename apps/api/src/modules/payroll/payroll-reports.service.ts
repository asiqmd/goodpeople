import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CIPHER_FIELDS,
  employees,
  payGroups,
  payrollRunItems,
  payrollRuns,
  attendanceDays,
  employeeLoans,
  loanRepayments,
  shifts,
  pfEntries,
  pfMembers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  addDays,
  Decimal,
  fiscalYearBounds,
  formatAddress,
  groupBy,
  money,
  type CostDimension,
  type CostFigures,
  type CostSummary,
  type CostSummaryRow,
  type CostTrendPoint,
  type PayLineView,
  type RunTotals,
  type RunVariables,
} from '@gp/shared';
import { and, asc, countDistinct, eq, gte, inArray, lte, ne, notInArray } from 'drizzle-orm';
import { conflict } from '../../common/errors.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { PdfService } from '../letters/pdf.service.js';
import { ProjectSharesService } from '../projects/project-shares.service.js';
import { splitAmount } from '../projects/shares.js';
import { csv } from './disbursement.js';
import { componentsOf } from './payroll-setup.service.js';
import { partsOf, registerHtml, type RegisterColumn, type RegisterRow } from './reports-pdf.js';
import {
  overtimeRegisterHtml,
  wageRegisterHtml,
  type Establishment,
  type OvertimeRow,
  type WageRow,
} from './registers-pdf.js';
import { workOutPay } from './pay-calc.js';
import { approvedPay, jobsOn, sealed, type JobOnDate } from './run-context.js';

type RunRow = typeof payrollRuns.$inferSelect;
interface StoredItem {
  lines: PayLineView[];
  earnings: string;
  deductions: string;
  net: string;
  employerCost: string;
  variables: RunVariables;
}

const zero = () => new Decimal(0);
const cell = (s: Record<string, Decimal> | undefined, key: string) => money(s?.[key] ?? zero());

/** What a month's pay cost: the runs paid for it, not the fund's payouts. */
const COST_KINDS = ['regular', 'adjustment', 'bonus', 'settlement'] as const;

const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

const FIGURES = [
  'gross',
  'overtime',
  'otHours',
  'earnings',
  'deductions',
  'net',
  'employerCost',
] as const;
type Figures = Record<(typeof FIGURES)[number], Decimal>;
interface Tally extends Figures {
  people: Set<string>;
}
const tally = (): Tally => ({
  people: new Set(),
  gross: new Decimal(0),
  overtime: new Decimal(0),
  otHours: new Decimal(0),
  earnings: new Decimal(0),
  deductions: new Decimal(0),
  net: new Decimal(0),
  employerCost: new Decimal(0),
});
const figures = (t: Tally): CostFigures => ({
  headcount: t.people.size,
  gross: money(t.gross),
  overtime: money(t.overtime),
  otHours: t.otHours.toNumber(),
  earnings: money(t.earnings),
  deductions: money(t.deductions),
  net: money(t.net),
  employerCost: money(t.employerCost),
  cost: money(t.earnings.plus(t.employerCost)),
});

/**
 * Payroll's reports read locked results: the register of a run, what each month cost by
 * unit, company, site or pay group, and the cost over the months.
 */
@Injectable()
export class PayrollReportsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly pdf: PdfService,
    private readonly projectShares: ProjectSharesService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** A run's register: everyone's components and totals, as CSV or a printable PDF. */
  async register(runId: string, format: 'csv' | 'pdf', language: 'en' | 'bn') {
    const data = await this.tenantDb.run(async (tx) => {
      const [found] = await tx
        .select({ run: payrollRuns, group: payGroups.name })
        .from(payrollRuns)
        .innerJoin(payGroups, eq(payGroups.id, payrollRuns.payGroupId))
        .where(eq(payrollRuns.id, runId));
      if (!found) throw new NotFoundException('Payroll run not found');
      if (found.run.status === 'draft' || found.run.status === 'cancelled') {
        throw conflict('run_not_computed', 'Compute the run first');
      }
      const { open } = sealed(this.cipher);
      const components = await componentsOf(tx);
      const items = await tx
        .select({ item: payrollRunItems, employee: employees })
        .from(payrollRunItems)
        .innerJoin(employees, eq(employees.id, payrollRunItems.employeeId))
        .where(and(eq(payrollRunItems.runId, runId), eq(payrollRunItems.status, 'ok')))
        .orderBy(asc(employees.employeeCode));
      const jobs = await jobsOn(
        tx,
        items.map((i) => i.employee.id),
        found.run.periodEnd,
      );
      const present = new Set<string>();
      const bn = language === 'bn';
      const rows: RegisterRow[] = items.map(({ item, employee }) => {
        const r = open<StoredItem>(CIPHER_FIELDS.runResults, item.resultEnc);
        const amounts: Record<string, string> = {};
        for (const l of r.lines) {
          present.add(l.code);
          amounts[l.code] = money(new Decimal(amounts[l.code] ?? 0).plus(l.amount));
        }
        const job = jobs.get(employee.id);
        return {
          code: employee.employeeCode,
          name: bn && employee.fullNameBn ? employee.fullNameBn : employee.fullName,
          designation: (bn ? job?.designationBn : null) ?? job?.designation ?? null,
          unit: (bn ? job?.orgUnitBn : null) ?? job?.orgUnit ?? null,
          paidDays: r.variables.paidDays,
          amounts,
          earnings: r.earnings,
          deductions: r.deductions,
          net: r.net,
        };
      });
      // Grouped by unit, then by code, as the register is read and signed.
      rows.sort(
        (a, b) => (a.unit ?? '').localeCompare(b.unit ?? '') || a.code.localeCompare(b.code),
      );
      const columns: RegisterColumn[] = components.flatMap((c) =>
        present.has(c.code) && c.kind !== 'info'
          ? [{ code: c.code, label: bn && c.nameBn ? c.nameBn : c.name, kind: c.kind }]
          : [],
      );
      const entity = jobs.values().next().value?.entity;
      return { run: found.run, group: found.group, rows, columns, entity };
    });
    const period = data.run.periodStart.slice(0, 7);
    if (format === 'csv') {
      const earn = data.columns.filter((c) => c.kind === 'earning');
      const deduct = data.columns.filter((c) => c.kind === 'deduction');
      const employer = data.columns.filter((c) => c.kind === 'employer_cost');
      const text = csv([
        [
          'Employee code',
          'Name',
          'Designation',
          'Unit',
          'Paid days',
          ...earn.map((c) => c.label),
          'Total earnings',
          ...deduct.map((c) => c.label),
          'Total deductions',
          'Net pay',
          ...employer.map((c) => c.label),
        ],
        ...data.rows.map((r) => [
          r.code,
          r.name,
          r.designation ?? '',
          r.unit ?? '',
          String(r.paidDays),
          ...earn.map((c) => r.amounts[c.code] ?? ''),
          r.earnings,
          ...deduct.map((c) => r.amounts[c.code] ?? ''),
          r.deductions,
          r.net,
          ...employer.map((c) => r.amounts[c.code] ?? ''),
        ]),
      ]);
      return {
        bytes: Buffer.from(text),
        contentType: 'text/csv; charset=utf-8',
        fileName: `payroll-register-${period}.csv`,
      };
    }
    const doc = {
      language,
      company: {
        name: data.entity?.legalName ?? data.entity?.name ?? '',
        details: data.entity?.tin ? `TIN ${data.entity.tin}` : '',
      },
      group: data.group,
      run: data.run,
      columns: data.columns,
      rows: data.rows,
    };
    const bytes = await this.pdf.renderParts(
      partsOf(data.rows.length).map((part) => registerHtml(doc, part)),
    );
    return {
      bytes,
      contentType: 'application/pdf',
      fileName: `payroll-register-${period}-${language}.pdf`,
    };
  }

  /** What a month cost, grouped, against the month before. */
  summary(month: string, by: CostDimension): Promise<CostSummary> {
    return this.tenantDb.run(async (tx) => {
      const now = await this.tallies(tx, month, by);
      const before = await this.tallies(tx, shiftMonth(month, -1), by);
      const rows: CostSummaryRow[] = [...now.groups]
        .map(([key, g]) => {
          const prior = before.groups.get(key)?.tally;
          return {
            key,
            label: g.label,
            ...figures(g.tally),
            previousCost: prior ? money(prior.earnings.plus(prior.employerCost)) : null,
            previousHeadcount: prior ? prior.people.size : null,
          };
        })
        .toSorted(
          (a, b) => new Decimal(b.cost).comparedTo(a.cost) || a.label.localeCompare(b.label),
        );
      const total = (t: typeof now) => {
        const all = tally();
        for (const g of t.groups.values()) {
          for (const p of g.tally.people) all.people.add(p);
          for (const k of FIGURES) all[k] = all[k].plus(g.tally[k]);
        }
        return all;
      };
      const all = total(now);
      const prior = total(before);
      return {
        month,
        by,
        rows,
        total: {
          key: 'total',
          label: 'Total',
          ...figures(all),
          previousCost: before.runs ? money(prior.earnings.plus(prior.employerCost)) : null,
          previousHeadcount: before.runs ? prior.people.size : null,
        },
        runs: now.runs,
        unlocked: now.unlocked,
      };
    });
  }

  /** The cost of each month up to `to`, from the locked runs' totals. */
  trend(to: string, months: number): Promise<CostTrendPoint[]> {
    return this.tenantDb.run(async (tx) => {
      const from = shiftMonth(to, -(months - 1));
      const runs = await tx
        .select()
        .from(payrollRuns)
        .where(
          and(
            inArray(payrollRuns.kind, [...COST_KINDS]),
            eq(payrollRuns.status, 'locked'),
            gte(payrollRuns.periodStart, `${from}-01`),
            lte(payrollRuns.periodStart, monthEnd(to)),
          ),
        );
      const heads = runs.length
        ? await tx
            .select({ runId: payrollRunItems.runId, employeeId: payrollRunItems.employeeId })
            .from(payrollRunItems)
            .where(
              and(
                inArray(
                  payrollRunItems.runId,
                  runs.map((r) => r.id),
                ),
                eq(payrollRunItems.status, 'ok'),
              ),
            )
        : [];
      const monthOf = new Map(runs.map((r) => [r.id, r.periodStart.slice(0, 7)]));
      const people = new Map<string, Set<string>>();
      for (const h of heads) {
        const m = monthOf.get(h.runId)!;
        people.set(m, (people.get(m) ?? new Set()).add(h.employeeId));
      }
      const { open } = sealed(this.cipher);
      return Array.from({ length: months }, (_, i) => {
        const month = shiftMonth(from, i);
        const sums = {
          earnings: new Decimal(0),
          net: new Decimal(0),
          employerCost: new Decimal(0),
        };
        for (const r of runs.filter((x) => x.periodStart.startsWith(month) && x.totalsEnc)) {
          const t = open<RunTotals>(CIPHER_FIELDS.runTotals, r.totalsEnc!);
          sums.earnings = sums.earnings.plus(t.earnings);
          sums.net = sums.net.plus(t.net);
          sums.employerCost = sums.employerCost.plus(t.employerCost);
        }
        return {
          month,
          headcount: people.get(month)?.size ?? 0,
          earnings: money(sums.earnings),
          net: money(sums.net),
          employerCost: money(sums.employerCost),
          cost: money(sums.earnings.plus(sums.employerCost)),
        };
      });
    });
  }

  /**
   * The provident fund's year: each member's balance brought forward, the year's movements by
   * kind, and the balance carried forward, as CSV for the trustees.
   */
  pfRegister(fiscalYear: string): Promise<{ text: string; fileName: string }> {
    return this.tenantDb.run(async (tx) => {
      const { start, end } = fiscalYearBounds(fiscalYear);
      const { open } = sealed(this.cipher);
      const members = await tx
        .select({ member: pfMembers, employee: employees })
        .from(pfMembers)
        .innerJoin(employees, eq(employees.id, pfMembers.employeeId))
        .where(lte(pfMembers.joinedOn, end))
        .orderBy(asc(employees.employeeCode));
      const entries = members.length
        ? await tx
            .select()
            .from(pfEntries)
            .where(
              and(
                inArray(
                  pfEntries.employeeId,
                  members.map((m) => m.employee.id),
                ),
                lte(pfEntries.date, end),
              ),
            )
        : [];
      const sums = new Map<string, Record<string, Decimal>>();
      for (const e of entries) {
        const s = sums.get(e.employeeId) ?? {};
        const amount = new Decimal(open<string>(CIPHER_FIELDS.pfEntries, e.amountEnc));
        const key =
          e.date < start
            ? `opening_${e.account}`
            : e.kind === 'contribution'
              ? `contribution_${e.account}`
              : e.kind;
        s[key] = (s[key] ?? zero()).plus(amount);
        s[`closing_${e.account}`] = (s[`closing_${e.account}`] ?? zero()).plus(amount);
        sums.set(e.employeeId, s);
      }
      return {
        text: csv([
          [
            'Employee code',
            'Name',
            'Member from',
            'Left on',
            'Brought forward (own)',
            'Brought forward (employer)',
            'Contributions (own)',
            'Contributions (employer)',
            'Interest',
            'Loans out',
            'Loans repaid',
            'Paid out',
            'Forfeited',
            'Carried forward (own)',
            'Carried forward (employer)',
            'Carried forward',
          ],
          ...members.map(({ member, employee }) => {
            const s = sums.get(employee.id);
            return [
              employee.employeeCode,
              employee.fullName,
              member.joinedOn,
              member.leftOn ?? '',
              cell(s, 'opening_own'),
              cell(s, 'opening_employer'),
              cell(s, 'contribution_own'),
              cell(s, 'contribution_employer'),
              cell(s, 'interest'),
              cell(s, 'loan_out'),
              cell(s, 'loan_repaid'),
              cell(s, 'withdrawal'),
              cell(s, 'forfeited'),
              cell(s, 'closing_own'),
              cell(s, 'closing_employer'),
              money((s?.closing_own ?? zero()).plus(s?.closing_employer ?? zero())),
            ];
          }),
        ]),
        fileName: `provident-fund-${fiscalYear}.csv`,
      };
    });
  }

  /** Form 38, the wage register, for a run's workers: as CSV, or a PDF to be signed. */
  async wageRegister(runId: string, format: 'csv' | 'pdf', language: 'en' | 'bn') {
    const data = await this.tenantDb.run(async (tx) => {
      const ctx = await this.workersOf(tx, runId, language);
      const rows: WageRow[] = ctx.people.map((p) => {
        const amount = (code: string) => money(p.amounts.get(code) ?? zero());
        const named = [
          'BASIC',
          'HOUSE_RENT',
          'CONVEYANCE',
          'MEDICAL',
          'FOOD',
          'ATTENDANCE_BONUS',
          'OVERTIME',
        ];
        const other = new Decimal(p.result.earnings).minus(
          named.reduce((s, c) => s.plus(p.amounts.get(c) ?? 0), zero()),
        );
        return {
          code: p.code,
          name: p.name,
          basic: amount('BASIC'),
          houseRent: amount('HOUSE_RENT'),
          conveyance: amount('CONVEYANCE'),
          medical: amount('MEDICAL'),
          food: amount('FOOD'),
          attendanceBonus: amount('ATTENDANCE_BONUS'),
          otHours: p.result.variables.otHours,
          otRate: p.otRate,
          otAmount: amount('OVERTIME'),
          other: money(other),
          total: p.result.earnings,
          deduction: p.result.deductions,
          net: p.result.net,
        };
      });
      return { ...ctx, rows };
    });
    const period = data.run.periodStart.slice(0, 7);
    if (format === 'csv') {
      return {
        bytes: Buffer.from(
          csv([
            [
              'Worker no.',
              'Name',
              'Basic',
              'House rent',
              'Conveyance',
              'Medical',
              'Food',
              'Attendance bonus',
              'OT hours',
              'OT rate per hour',
              'OT amount',
              'Other',
              'Total',
              'Deduction',
              'Net payable',
            ],
            ...data.rows.map((r) => [
              r.code,
              r.name,
              r.basic,
              r.houseRent,
              r.conveyance,
              r.medical,
              r.food,
              r.attendanceBonus,
              String(r.otHours),
              r.otRate,
              r.otAmount,
              r.other,
              r.total,
              r.deduction,
              r.net,
            ]),
          ]),
        ),
        contentType: 'text/csv; charset=utf-8',
        fileName: `wage-register-form-38-${period}.csv`,
      };
    }
    return {
      bytes: await this.pdf.renderParts(
        partsOf(data.rows.length).map((part) =>
          wageRegisterHtml(
            {
              language,
              establishment: data.establishment,
              from: data.run.periodStart,
              to: data.run.periodEnd,
              rows: data.rows,
            },
            part,
          ),
        ),
      ),
      contentType: 'application/pdf',
      fileName: `wage-register-form-38-${period}-${language}.pdf`,
    };
  }

  /** Form 34, kept monthly: each worker's hours each day, payable overtime, rate and amount. */
  async overtimeRegister(runId: string, format: 'csv' | 'pdf', language: 'en' | 'bn') {
    const data = await this.tenantDb.run(async (tx) => {
      const ctx = await this.workersOf(tx, runId, language);
      const dates: string[] = [];
      for (let d = ctx.run.periodStart; d <= ctx.run.periodEnd; d = addDays(d, 1)) dates.push(d);
      const ids = ctx.people.map((p) => p.employeeId);
      const days = ids.length
        ? await tx
            .select({
              employeeId: attendanceDays.employeeId,
              date: attendanceDays.date,
              workedMinutes: attendanceDays.workedMinutes,
              shift: shifts.name,
            })
            .from(attendanceDays)
            .leftJoin(shifts, eq(shifts.id, attendanceDays.shiftId))
            .where(
              and(
                inArray(attendanceDays.employeeId, ids),
                gte(attendanceDays.date, ctx.run.periodStart),
                lte(attendanceDays.date, ctx.run.periodEnd),
              ),
            )
        : [];
      const byPerson = groupBy(days, (d) => d.employeeId);
      const rows: OvertimeRow[] = ctx.people.map((p) => {
        const mine = byPerson.get(p.employeeId) ?? [];
        const worked = new Map(mine.map((d) => [d.date, d.workedMinutes]));
        const hours = dates.map((x) => {
          const m = worked.get(x);
          return m ? Math.round((m / 60) * 10) / 10 : null;
        });
        const shiftCount = new Map<string, number>();
        for (const d of mine)
          if (d.shift) shiftCount.set(d.shift, (shiftCount.get(d.shift) ?? 0) + 1);
        const shift = [...shiftCount].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        return {
          code: p.code,
          name: p.name,
          designation: p.designation ?? '',
          shift,
          days: hours,
          hours: Math.round(hours.reduce((s: number, h) => s + (h ?? 0), 0) * 10) / 10,
          otHours: p.result.variables.otHours,
          rate: p.otRate,
          amount: money(p.amounts.get('OVERTIME') ?? zero()),
        };
      });
      return { ...ctx, dates, rows };
    });
    const period = data.run.periodStart.slice(0, 7);
    if (format === 'csv') {
      return {
        bytes: Buffer.from(
          csv([
            [
              'Worker no.',
              'Name',
              'Designation',
              'Shift',
              ...data.dates,
              'Total hours',
              'Payable OT hours',
              'Hourly rate',
              'OT amount',
            ],
            ...data.rows.map((r) => [
              r.code,
              r.name,
              r.designation,
              r.shift,
              ...r.days.map((h) => (h === null ? '' : String(h))),
              String(r.hours),
              String(r.otHours),
              r.rate,
              r.amount,
            ]),
          ]),
        ),
        contentType: 'text/csv; charset=utf-8',
        fileName: `overtime-register-form-34-${period}.csv`,
      };
    }
    return {
      bytes: await this.pdf.renderParts(
        partsOf(data.rows.length).map((part) =>
          overtimeRegisterHtml(
            {
              language,
              establishment: data.establishment,
              from: data.run.periodStart,
              to: data.run.periodEnd,
              dates: data.dates,
              rows: data.rows,
            },
            part,
          ),
        ),
      ),
      contentType: 'application/pdf',
      fileName: `overtime-register-form-34-${period}-${language}.pdf`,
    };
  }

  /** Form 40: salary advances in a fiscal year, each instalment recovered, as CSV. */
  advancesRegister(fiscalYear: string): Promise<{ text: string; fileName: string }> {
    return this.tenantDb.run(async (tx) => {
      const { start, end } = fiscalYearBounds(fiscalYear);
      const { open } = sealed(this.cipher);
      const loans = await tx
        .select({ loan: employeeLoans, employee: employees })
        .from(employeeLoans)
        .innerJoin(employees, eq(employees.id, employeeLoans.employeeId))
        .where(
          and(
            eq(employeeLoans.kind, 'advance'),
            inArray(employeeLoans.status, ['active', 'closed']),
            lte(employeeLoans.startMonth, end.slice(0, 7)),
          ),
        )
        .orderBy(asc(employees.employeeCode), asc(employeeLoans.createdAt));
      const inYear = loans.filter(
        ({ loan }) => !loan.closedAt || loan.closedAt.toISOString().slice(0, 10) >= start,
      );
      const repayments = inYear.length
        ? await tx
            .select()
            .from(loanRepayments)
            .where(
              inArray(
                loanRepayments.loanId,
                inYear.map((l) => l.loan.id),
              ),
            )
            .orderBy(asc(loanRepayments.date))
        : [];
      const byLoan = groupBy(repayments, (r) => r.loanId);
      const jobs = await jobsOn(
        tx,
        inYear.map((l) => l.employee.id),
        end,
      );
      return {
        text: csv([
          [
            'SL',
            'Worker no.',
            'Name',
            'Designation and section',
            'Advance',
            'Given on',
            'Instalments recovered',
            'Fully recovered on',
            'Remarks',
          ],
          ...inYear.map(({ loan, employee }, i) => {
            const job = jobs.get(employee.id);
            const amounts = open<{ principal: string }>(CIPHER_FIELDS.loanAmounts, loan.amountsEnc);
            const paid = (byLoan.get(loan.id) ?? [])
              .map(
                (r) =>
                  `${money(open<string>(CIPHER_FIELDS.loanRepayments, r.amountEnc))} on ${r.date}`,
              )
              .join('; ');
            return [
              String(i + 1),
              employee.employeeCode,
              employee.fullName,
              [job?.designation, job?.orgUnit].filter(Boolean).join(', '),
              money(amounts.principal),
              (loan.decidedAt ?? loan.createdAt).toISOString().slice(0, 10),
              paid,
              loan.closedAt?.toISOString().slice(0, 10) ?? '',
              loan.reason,
            ];
          }),
        ]),
        fileName: `advances-register-form-40-${fiscalYear}.csv`,
      };
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * A month's locked items, added up by group. By project, each person's month is split by
   * their shares (as the journal charges it), the rest kept under no project.
   */
  private async tallies(tx: Tx, month: string, by: CostDimension) {
    const inMonth = and(
      inArray(payrollRuns.kind, [...COST_KINDS]),
      gte(payrollRuns.periodStart, `${month}-01`),
      lte(payrollRuns.periodStart, monthEnd(month)),
    );
    const runs = await tx
      .select({ run: payrollRuns, group: payGroups.name })
      .from(payrollRuns)
      .innerJoin(payGroups, eq(payGroups.id, payrollRuns.payGroupId))
      .where(and(inMonth, eq(payrollRuns.status, 'locked')));
    const [unlocked] = await tx
      .select({ n: countDistinct(payrollRuns.id) })
      .from(payrollRuns)
      .where(and(inMonth, notInArray(payrollRuns.status, ['locked', 'cancelled'])));
    const groups = new Map<string, { label: string; tally: Tally }>();
    const add = (key: string, label: string, employeeId: string, f: Figures) => {
      const g = groups.get(key) ?? { label, tally: tally() };
      g.tally.people.add(employeeId);
      for (const k of FIGURES) g.tally[k] = g.tally[k].plus(f[k]);
      groups.set(key, g);
    };
    if (runs.length) {
      const components = await componentsOf(tx);
      const inGross = new Set(components.filter((c) => c.inGross).map((c) => c.code));
      const { open } = sealed(this.cipher);
      const items = await tx
        .select()
        .from(payrollRunItems)
        .where(
          and(
            inArray(
              payrollRunItems.runId,
              runs.map((r) => r.run.id),
            ),
            ne(payrollRunItems.status, 'error'),
          ),
        );
      const ids = [...new Set(items.map((i) => i.employeeId))];
      const jobs = await jobsOn(tx, ids, monthEnd(month));
      const runOf = new Map(runs.map((r) => [r.run.id, r]));
      const byPerson = new Map<string, Figures>();
      for (const item of items) {
        const r = open<StoredItem>(CIPHER_FIELDS.runResults, item.resultEnc);
        const f: Figures = {
          gross: zero(),
          overtime: zero(),
          otHours: new Decimal(r.variables.otHours),
          earnings: new Decimal(r.earnings),
          deductions: new Decimal(r.deductions),
          net: new Decimal(r.net),
          employerCost: new Decimal(r.employerCost),
        };
        for (const l of r.lines) {
          if (l.kind === 'earning' && inGross.has(l.code)) f.gross = f.gross.plus(l.amount);
          if (l.code === 'OVERTIME') f.overtime = f.overtime.plus(l.amount);
        }
        if (by === 'project') {
          const mine = byPerson.get(item.employeeId);
          if (mine) for (const k of FIGURES) mine[k] = mine[k].plus(f[k]);
          else byPerson.set(item.employeeId, f);
          continue;
        }
        const { key, label } = dimension(by, jobs.get(item.employeeId), runOf.get(item.runId)!);
        add(key, label, item.employeeId, f);
      }
      if (by === 'project') {
        const shares = (await this.projectShares.inPlan())
          ? await this.projectShares.sharesFor(tx, ids, month)
          : null;
        for (const [employeeId, f] of byPerson) {
          const mine = shares?.get(employeeId)?.shares ?? [];
          const fractions = mine.map((s) => s.fraction);
          const parts = FIGURES.map((k) => splitAmount(f[k], fractions));
          const part = (i: number) =>
            Object.fromEntries(FIGURES.map((k, j) => [k, parts[j]!.parts[i]!])) as Figures;
          mine.forEach((s, i) => add(s.projectId, `${s.code} · ${s.name}`, employeeId, part(i)));
          if (fractions.reduce((sum, x) => sum.plus(x), zero()).lessThan(1)) {
            const rest = Object.fromEntries(FIGURES.map((k, j) => [k, parts[j]!.rest])) as Figures;
            add('none', 'Not charged to a project', employeeId, rest);
          }
        }
      }
    }
    return { groups, runs: runs.length, unlocked: unlocked?.n ?? 0 };
  }

  /**
   * A run's workers (the Act's registers are for workers, not management staff) with their
   * lines, and the establishment the registers are headed with.
   */
  private async workersOf(tx: Tx, runId: string, language: 'en' | 'bn') {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'draft' || run.status === 'cancelled') {
      throw conflict('run_not_computed', 'Compute the run first');
    }
    const { open } = sealed(this.cipher);
    const components = await componentsOf(tx);
    const items = await tx
      .select({ item: payrollRunItems, employee: employees })
      .from(payrollRunItems)
      .innerJoin(employees, eq(employees.id, payrollRunItems.employeeId))
      .where(and(eq(payrollRunItems.runId, runId), eq(payrollRunItems.status, 'ok')))
      .orderBy(asc(employees.employeeCode));
    const jobs = await jobsOn(
      tx,
      items.map((i) => i.employee.id),
      run.periodEnd,
    );
    const pay = await approvedPay(tx, this.cipher, run.periodEnd);
    const otBase = new Set(components.filter((c) => c.inOvertimeBase).map((c) => c.code));
    const bn = language === 'bn';
    const people = items
      .filter(({ employee }) => jobs.get(employee.id)?.workerCategory !== 'staff')
      .map(({ item, employee }) => {
        const result = open<StoredItem>(CIPHER_FIELDS.runResults, item.resultEnc);
        const amounts = new Map<string, Decimal>();
        for (const l of result.lines)
          amounts.set(l.code, (amounts.get(l.code) ?? zero()).plus(l.amount));
        // The hourly overtime rate on the month's full basic (and dearness allowance): ×2 ÷ 208.
        const record = pay.get(employee.id)?.at(-1);
        const full = record
          ? workOutPay(
              record.engine.structure,
              components,
              record.engine.amount,
              record.engine.fixed,
            ).lines
          : [];
        const base = full
          .filter((l) => otBase.has(l.code))
          .reduce((s, l) => s.plus(l.amount), zero());
        const job = jobs.get(employee.id);
        return {
          employeeId: employee.id,
          code: employee.employeeCode,
          name: bn && employee.fullNameBn ? employee.fullNameBn : employee.fullName,
          designation: (bn ? job?.designationBn : null) ?? job?.designation ?? null,
          result,
          amounts,
          otRate: money(base.times(2).dividedBy(208).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)),
        };
      });
    const entity = jobs.values().next().value?.entity;
    const establishment: Establishment = {
      name: entity?.legalName ?? entity?.name ?? '',
      address: entity?.address ? formatAddress(entity.address, language) : '',
      registrationNo: entity?.registrationNo ?? null,
    };
    return { run, people, establishment };
  }
}

function dimension(
  by: CostDimension,
  job: JobOnDate | undefined,
  run: { run: RunRow; group: string },
): { key: string; label: string } {
  switch (by) {
    case 'entity':
      return { key: job?.entity?.id ?? 'none', label: job?.entity?.name ?? '—' };
    case 'location':
      return { key: job?.locationId ?? 'none', label: job?.location ?? '—' };
    case 'group':
      return { key: run.run.payGroupId, label: run.group };
    default:
      return { key: job?.orgUnitId ?? 'none', label: job?.orgUnit ?? '—' };
  }
}
