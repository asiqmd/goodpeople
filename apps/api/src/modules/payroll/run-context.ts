import { BD_INVESTMENT_CAPS, bdTaxYear, type Taxpayer } from '@gp/country-packs';
import {
  attendanceDays,
  attendanceSettings,
  CIPHER_FIELDS,
  designations,
  employeeLoans,
  employeePay,
  jobAssignments,
  leaveRequests,
  leaveTypes,
  legalEntities,
  orgUnits,
  payrollInputs,
  loanRepayments,
  payrollRunItems,
  payrollRuns,
  pfEntries,
  pfMembers,
  salaryStructures,
  taxDeclarations,
  taxOpenings,
  taxProfiles,
  type CipherField,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  addDays,
  ageOn,
  Decimal,
  DEFAULT_WEEKLY_OFF_DAYS,
  fiscalYearBounds,
  fiscalYearOf,
  groupBy,
  LOAN_COMPONENT,
  money,
  type Gender,
  type InvestmentKind,
  type PayLineView,
  type EmploymentType,
  type TenantWithAccess,
  type WorkerCategory,
  weekdayOf,
} from '@gp/shared';
import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { currentTenantId } from '../../common/request-context.js';
import type { WorkCalendarService } from '../calendar/work-calendar.service.js';
import type {
  computePay,
  EngineComponent,
  EngineDay,
  EngineLoan,
  EngineTax,
} from './run-engine.js';
import type { payrollSettingsOf } from './payroll-setup.service.js';

// What a run needs besides pay and attendance (the provident fund, loans), and what a locked
// run leaves behind in the fund's ledger and the loans' repayments.

type Settings = Awaited<ReturnType<typeof payrollSettingsOf>>;
type DecimalLike = Decimal | string | number;

/** JSON in and out of the field cipher, in the current workspace. */
export const sealed = (cipher: FieldCipher) => ({
  seal: (field: CipherField, value: unknown) =>
    cipher.encrypt(JSON.stringify(value), { tenantId: currentTenantId(), field }),
  open: <T>(field: CipherField, stored: string) =>
    JSON.parse(cipher.decrypt(stored, { tenantId: currentTenantId(), field })) as T,
});

/** A person's lines in a run, as stored. */
export interface StoredResult {
  lines: PayLineView[];
  loans?: { loanId: string; amount: string }[];
}

/** Contribution rates for the fund's members in a period; none when the fund is off. */
export async function pfRatesFor(
  tx: Tx,
  settings: Settings,
  ids: string[],
  period: { start: string; end: string },
) {
  const out = new Map<string, { employeeRate: string; employerRate: string }>();
  if (!settings.pfEnabled || ids.length === 0) return out;
  const members = await tx
    .select({ employeeId: pfMembers.employeeId })
    .from(pfMembers)
    .where(
      and(
        inArray(pfMembers.employeeId, ids),
        lte(pfMembers.joinedOn, period.end),
        or(isNull(pfMembers.leftOn), gte(pfMembers.leftOn, period.start)),
      ),
    );
  for (const m of members) {
    out.set(m.employeeId, {
      employeeRate: settings.pfEmployeeRate,
      employerRate: settings.pfEmployerRate,
    });
  }
  return out;
}

/** What is still owed on each loan, from its principal and repayments so far. */
export async function outstandingOf(tx: Tx, cipher: FieldCipher, loanIds: string[]) {
  const { open } = sealed(cipher);
  const repaid = new Map<string, Decimal>();
  if (loanIds.length === 0) return repaid;
  const rows = await tx
    .select({ loanId: loanRepayments.loanId, amountEnc: loanRepayments.amountEnc })
    .from(loanRepayments)
    .where(inArray(loanRepayments.loanId, loanIds));
  for (const r of rows) {
    const amount = open<string>(CIPHER_FIELDS.loanRepayments, r.amountEnc);
    repaid.set(r.loanId, (repaid.get(r.loanId) ?? new Decimal(0)).plus(amount));
  }
  return repaid;
}

/** Active advances and loans due from `month` (YYYY-MM), oldest first, per person. */
export async function loansFor(tx: Tx, cipher: FieldCipher, ids: string[], month: string) {
  const { open } = sealed(cipher);
  const out = new Map<string, EngineLoan[]>();
  if (ids.length === 0) return out;
  const loans = await tx
    .select()
    .from(employeeLoans)
    .where(
      and(
        inArray(employeeLoans.employeeId, ids),
        eq(employeeLoans.status, 'active'),
        lte(employeeLoans.startMonth, month),
      ),
    )
    .orderBy(employeeLoans.startMonth, employeeLoans.createdAt);
  const repaid = await outstandingOf(
    tx,
    cipher,
    loans.map((l) => l.id),
  );
  for (const loan of loans) {
    const amounts = open<{ principal: string; installment: string }>(
      CIPHER_FIELDS.loanAmounts,
      loan.amountsEnc,
    );
    const outstanding = new Decimal(amounts.principal).minus(repaid.get(loan.id) ?? 0);
    if (outstanding.lessThanOrEqualTo(0)) continue;
    const list = out.get(loan.employeeId) ?? [];
    list.push({
      loanId: loan.id,
      component: LOAN_COMPONENT[loan.kind],
      installment: amounts.installment,
      outstanding: money(outstanding),
    });
    out.set(loan.employeeId, list);
  }
  return out;
}

/**
 * What a run leaves behind when it locks: provident fund contributions (and an adjustment's
 * differences) in the members' ledgers, and repayments against loans, closing those repaid.
 */
export async function postLockedRun(tx: Tx, cipher: FieldCipher, runId: string, actorId: string) {
  const { seal, open } = sealed(cipher);
  const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
  if (!run) return;
  const items = await tx
    .select()
    .from(payrollRunItems)
    .where(and(eq(payrollRunItems.runId, runId), eq(payrollRunItems.status, 'ok')));
  const entries: (typeof pfEntries.$inferInsert)[] = [];
  const repayments: (typeof loanRepayments.$inferInsert)[] = [];
  const touched = new Set<string>();
  for (const item of items) {
    const result = open<StoredResult>(CIPHER_FIELDS.runResults, item.resultEnc);
    for (const [code, account] of [
      ['PF_EMPLOYEE', 'own'],
      ['PF_EMPLOYER', 'employer'],
    ] as const) {
      const line = result.lines.find((l) => l.code === code);
      if (!line || new Decimal(line.amount).isZero()) continue;
      entries.push({
        tenantId: currentTenantId(),
        employeeId: item.employeeId,
        date: run.paymentDate,
        kind: 'contribution',
        account,
        amountEnc: seal(CIPHER_FIELDS.pfEntries, line.amount),
        runId,
        createdBy: actorId,
      });
    }
    for (const r of result.loans ?? []) {
      touched.add(r.loanId);
      repayments.push({
        tenantId: currentTenantId(),
        loanId: r.loanId,
        runId,
        date: run.paymentDate,
        amountEnc: seal(CIPHER_FIELDS.loanRepayments, r.amount),
        createdBy: actorId,
      });
    }
  }
  // A provident fund loan comes back into the member's own account.
  if (touched.size) {
    const fundLoans = await tx
      .select({ id: employeeLoans.id, employeeId: employeeLoans.employeeId })
      .from(employeeLoans)
      .where(and(inArray(employeeLoans.id, [...touched]), eq(employeeLoans.kind, 'pf_loan')));
    const fund = new Map(fundLoans.map((l) => [l.id, l.employeeId]));
    for (const r of repayments) {
      const employeeId = fund.get(r.loanId);
      if (!employeeId) continue;
      entries.push({
        tenantId: currentTenantId(),
        employeeId,
        date: run.paymentDate,
        kind: 'loan_repaid',
        account: 'own',
        amountEnc: seal(
          CIPHER_FIELDS.pfEntries,
          open<string>(CIPHER_FIELDS.loanRepayments, r.amountEnc),
        ),
        runId,
        loanId: r.loanId,
        createdBy: actorId,
      });
    }
  }
  for (let i = 0; i < entries.length; i += 1000) {
    await tx.insert(pfEntries).values(entries.slice(i, i + 1000));
  }
  for (let i = 0; i < repayments.length; i += 1000) {
    await tx.insert(loanRepayments).values(repayments.slice(i, i + 1000));
  }
  await closeRepaid(tx, cipher, [...touched]);
}

/** Loans with nothing left to repay are closed. */
export async function closeRepaid(tx: Tx, cipher: FieldCipher, loanIds: string[]) {
  if (loanIds.length === 0) return;
  const { open } = sealed(cipher);
  const loans = await tx.select().from(employeeLoans).where(inArray(employeeLoans.id, loanIds));
  const repaid = await outstandingOf(tx, cipher, loanIds);
  const done = loans
    .filter((l) => {
      const { principal } = open<{ principal: string }>(CIPHER_FIELDS.loanAmounts, l.amountsEnc);
      return (repaid.get(l.id) ?? new Decimal(0)).greaterThanOrEqualTo(principal);
    })
    .map((l) => l.id);
  if (done.length) {
    await tx
      .update(employeeLoans)
      .set({ status: 'closed', closedAt: new Date() })
      .where(inArray(employeeLoans.id, done));
  }
}

// ── Salary tax ─────────────────────────────────────────────────────────────

/** An investment declared for the rebate, and what payroll accepted once it saw the proof. */
export interface DeclarationItem {
  kind: InvestmentKind;
  declared: string;
  verified: string | null;
  note: string | null;
  documentId: string | null;
}

/** Salary income in stored lines: taxable earnings less the deductions that reduce it. */
export function salaryIn(lines: PayLineView[], components: EngineComponent[]) {
  const treatment = new Map(components.map((c) => [c.code, c.taxTreatment]));
  let sum = new Decimal(0);
  for (const l of lines) {
    if ((treatment.get(l.code) ?? 'exempt') === 'exempt') continue;
    if (l.kind === 'earning') sum = sum.plus(l.amount);
    else if (l.kind === 'deduction') sum = sum.minus(l.amount);
  }
  return sum;
}

const lineOf = (lines: PayLineView[], code: string) =>
  new Decimal(lines.find((l) => l.code === code)?.amount ?? 0);

/** Months between two YYYY-MM months, exclusive of the first. */
const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
  Number(to.slice(5, 7)) -
  Number(from.slice(5, 7));

export interface TaxPerson {
  id: string;
  gender: Gender;
  dateOfBirth: string;
  separatedOn: string | null;
  hasTin: boolean;
}

/**
 * Each person's tax context for a month's run: the fiscal year so far (locked runs and any
 * opening figures), their taxpayer category, investments for the rebate, and the months left.
 * `null` when the run does not work tax out; `missing` when the pack has no rules for the year.
 */
export async function taxContextsFor(
  tx: Tx,
  cipher: FieldCipher,
  settings: Settings,
  run: { id: string; periodStart: string; periodEnd: string },
  people: TaxPerson[],
  components: EngineComponent[],
): Promise<Map<string, EngineTax> | 'missing' | null> {
  if (!settings.autoTax || people.length === 0) return null;
  const fiscalYear = fiscalYearOf(run.periodEnd);
  const year = bdTaxYear(fiscalYear);
  if (!year) return 'missing';
  const { open } = sealed(cipher);
  const ids = people.map((p) => p.id);
  const bounds = fiscalYearBounds(fiscalYear);

  // Locked earlier in the year: any run of the year except regular months from this one on.
  const earlier = await tx
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.status, 'locked'),
        ne(payrollRuns.id, run.id),
        gte(payrollRuns.periodStart, bounds.start),
        lte(payrollRuns.periodStart, bounds.end),
        or(ne(payrollRuns.kind, 'regular'), lt(payrollRuns.periodStart, run.periodStart)),
      ),
    );
  const sofar = new Map<string, { salary: Decimal; tax: Decimal; pf: Decimal }>();
  const add = (id: string, salary: DecimalLike, tax: DecimalLike, pf: DecimalLike) => {
    const s = sofar.get(id) ?? { salary: new Decimal(0), tax: new Decimal(0), pf: new Decimal(0) };
    sofar.set(id, { salary: s.salary.plus(salary), tax: s.tax.plus(tax), pf: s.pf.plus(pf) });
  };
  if (earlier.length) {
    const items = await tx
      .select({ employeeId: payrollRunItems.employeeId, resultEnc: payrollRunItems.resultEnc })
      .from(payrollRunItems)
      .where(
        and(
          inArray(
            payrollRunItems.runId,
            earlier.map((r) => r.id),
          ),
          eq(payrollRunItems.status, 'ok'),
          inArray(payrollRunItems.employeeId, ids),
        ),
      );
    for (const item of items) {
      const { lines } = open<StoredResult>(CIPHER_FIELDS.runResults, item.resultEnc);
      add(
        item.employeeId,
        salaryIn(lines, components),
        lineOf(lines, 'TAX'),
        lineOf(lines, 'PF_EMPLOYEE').plus(lineOf(lines, 'PF_EMPLOYER')),
      );
    }
  }
  const openings = await tx
    .select()
    .from(taxOpenings)
    .where(and(eq(taxOpenings.fiscalYear, fiscalYear), inArray(taxOpenings.employeeId, ids)));
  for (const o of openings) {
    const a = open<{ salary: string; tax: string; pf: string }>(
      CIPHER_FIELDS.taxOpenings,
      o.amountsEnc,
    );
    add(o.employeeId, a.salary, a.tax, a.pf);
  }

  const profiles = new Map(
    (await tx.select().from(taxProfiles).where(inArray(taxProfiles.employeeId, ids))).map((p) => [
      p.employeeId,
      p,
    ]),
  );
  const investments = new Map<string, Decimal>();
  const declarations = await tx
    .select()
    .from(taxDeclarations)
    .where(
      and(
        eq(taxDeclarations.fiscalYear, fiscalYear),
        inArray(taxDeclarations.employeeId, ids),
        ne(taxDeclarations.status, 'draft'),
      ),
    );
  for (const d of declarations) {
    const items = open<DeclarationItem[]>(CIPHER_FIELDS.taxDeclarations, d.itemsEnc);
    // Once verified, only what payroll accepted counts; until then, what was declared. Some
    // kinds count only up to a yearly amount.
    const byKind = new Map<string, Decimal>();
    for (const i of items) {
      const amount = d.status === 'verified' ? (i.verified ?? 0) : i.declared;
      byKind.set(i.kind, (byKind.get(i.kind) ?? new Decimal(0)).plus(amount));
    }
    let total = new Decimal(0);
    for (const [kind, amount] of byKind) {
      const cap = BD_INVESTMENT_CAPS[kind];
      total = total.plus(cap === undefined ? amount : Decimal.min(amount, cap));
    }
    investments.set(d.employeeId, total);
  }

  const month = run.periodStart.slice(0, 7);
  const out = new Map<string, EngineTax>();
  for (const p of people) {
    const profile = profiles.get(p.id);
    const lastMonth =
      p.separatedOn && p.separatedOn <= bounds.end
        ? p.separatedOn.slice(0, 7)
        : bounds.end.slice(0, 7);
    const age = ageOn(p.dateOfBirth, bounds.end);
    const taxpayer: Taxpayer = {
      female: p.gender === 'female',
      thirdGender: p.gender === 'third_gender',
      senior: age >= 65,
      disabled: profile?.disabled ?? false,
      freedomFighter: profile?.freedomFighter ?? false,
      disabledDependants: profile?.disabledDependants ?? 0,
      area: profile?.area ?? (settings.taxArea as Taxpayer['area']),
    };
    const s = sofar.get(p.id);
    out.set(p.id, {
      year,
      taxpayer,
      ytdSalary: money(s?.salary ?? 0),
      ytdTax: money(s?.tax ?? 0),
      ytdPf: money(s?.pf ?? 0),
      monthsAfter: Math.max(0, monthsBetween(month, lastMonth)),
      investment: money(investments.get(p.id) ?? 0),
      pfRecognised: settings.pfRecognised,
      hasTin: p.hasTin,
    });
  }
  return out;
}

// ── Jobs ───────────────────────────────────────────────────────────────────

export interface JobOnDate {
  entity: typeof legalEntities.$inferSelect | null;
  designation: string | null;
  designationBn: string | null;
  orgUnit: string | null;
  orgUnitBn: string | null;
  /** The unit's code: the cost centre in the journal. */
  orgUnitCode: string | null;
  workerCategory: WorkerCategory;
  employmentType: EmploymentType;
}

/** Each person's job on a date: company, designation and unit. */
export async function jobsOn(tx: Tx, ids: string[], on: string) {
  const out = new Map<string, JobOnDate>();
  if (ids.length === 0) return out;
  const rows = await tx
    .select({
      employeeId: jobAssignments.employeeId,
      entity: legalEntities,
      designation: designations.name,
      designationBn: designations.nameBn,
      orgUnit: orgUnits.name,
      orgUnitBn: orgUnits.nameBn,
      orgUnitCode: orgUnits.code,
      workerCategory: jobAssignments.workerCategory,
      employmentType: jobAssignments.employmentType,
    })
    .from(jobAssignments)
    .innerJoin(legalEntities, eq(legalEntities.id, jobAssignments.legalEntityId))
    .leftJoin(designations, eq(designations.id, jobAssignments.designationId))
    .leftJoin(orgUnits, eq(orgUnits.id, jobAssignments.orgUnitId))
    .where(and(inArray(jobAssignments.employeeId, ids), lte(jobAssignments.effectiveFrom, on)))
    .orderBy(asc(jobAssignments.effectiveFrom));
  for (const row of rows) out.set(row.employeeId, row);
  return out;
}

// ── Data the engine reads ────────────────────────────────────────────────────

/** Approved pay up to a date, per person, oldest first, with what the engine needs. */
export async function approvedPay(tx: Tx, cipher: FieldCipher, upTo: string) {
  const rows = await tx
    .select({ p: employeePay, structure: salaryStructures })
    .from(employeePay)
    .innerJoin(salaryStructures, eq(salaryStructures.id, employeePay.structureId))
    .where(and(eq(employeePay.status, 'approved'), lte(employeePay.effectiveFrom, upTo)))
    .orderBy(asc(employeePay.effectiveFrom));
  const out = new Map<
    string,
    {
      effectiveFrom: string;
      payGroupId: string;
      engine: Parameters<typeof computePay>[0]['records'][number];
    }[]
  >();
  for (const { p, structure } of rows) {
    const amounts = JSON.parse(
      cipher.decrypt(p.amountsEnc, {
        tenantId: currentTenantId(),
        field: CIPHER_FIELDS.payAmounts,
      }),
    ) as { amount: string; fixed: Record<string, string> };
    const list = out.get(p.employeeId) ?? [];
    list.push({
      effectiveFrom: p.effectiveFrom,
      payGroupId: p.payGroupId,
      engine: {
        effectiveFrom: p.effectiveFrom,
        structure: {
          basis: structure.basis,
          lines: structure.lines,
          wageBoard: structure.wageBoard,
        },
        amount: amounts.amount,
        fixed: amounts.fixed,
      },
    });
    out.set(p.employeeId, list);
  }
  return out;
}

/** Processed days per person, or null where attendance is not tracked for the period. */
export async function attendanceOf(
  tx: Tx,
  ids: string[],
  run: { periodStart: string; periodEnd: string },
  tenant: TenantWithAccess,
): Promise<{ trackingFrom: string; days: Map<string, EngineDay[]> } | null> {
  if (!tenant.access.features.includes('attendance')) return null;
  const [settings] = await tx.select().from(attendanceSettings);
  if (!settings || settings.trackingFrom > run.periodEnd) return null;
  const out = new Map<string, EngineDay[]>();
  for (let i = 0; i < ids.length; i += 10_000) {
    const rows = await tx
      .select({
        employeeId: attendanceDays.employeeId,
        date: attendanceDays.date,
        status: attendanceDays.status,
        overtimeMinutes: attendanceDays.overtimeMinutes,
        lateMinutes: attendanceDays.lateMinutes,
        leaveDays: attendanceDays.leaveDays,
        paid: leaveTypes.paid,
      })
      .from(attendanceDays)
      .leftJoin(leaveRequests, eq(leaveRequests.id, attendanceDays.leaveRequestId))
      .leftJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(
        and(
          inArray(attendanceDays.employeeId, ids.slice(i, i + 10_000)),
          sql`${attendanceDays.date} between ${run.periodStart} and ${run.periodEnd}`,
        ),
      );
    for (const [employeeId, days] of groupBy(rows, (r) => r.employeeId)) {
      out.set(
        employeeId,
        days.map((d) => ({
          date: d.date,
          status: d.status,
          overtimeMinutes: d.overtimeMinutes,
          leaveDays: d.leaveDays,
          unpaidLeave: d.paid === false,
          late: d.lateMinutes > 0,
        })),
      );
    }
  }
  return { trackingFrom: settings.trackingFrom, days: out };
}

/** Amounts entered in a run, per person. */
export async function inputsOf(tx: Tx, cipher: FieldCipher, runId: string, ids?: string[]) {
  if (ids?.length === 0)
    return new Map<string, { employeeId: string; component: string; amount: string }[]>();
  const rows = await tx
    .select()
    .from(payrollInputs)
    .where(
      and(eq(payrollInputs.runId, runId), ids ? inArray(payrollInputs.employeeId, ids) : undefined),
    );
  return groupBy(
    rows.map((r) => ({
      employeeId: r.employeeId,
      component: r.component,
      amount: JSON.parse(
        cipher.decrypt(r.amountEnc, {
          tenantId: currentTenantId(),
          field: CIPHER_FIELDS.runInputs,
        }),
      ) as string,
    })),
    (r) => r.employeeId,
  );
}

/** The day `n` working days after a date: weekly offs and the workspace's holidays skipped. */
export async function workingDaysAfter(
  tx: Tx,
  calendars: WorkCalendarService,
  from: string,
  n: number,
): Promise<string> {
  const calendarId = await calendars.defaultCalendarId(tx);
  const holidays = await calendars.holidaysIn(
    tx,
    calendarId,
    addDays(from, 1),
    addDays(from, n * 2 + 30),
  );
  let day = from;
  let counted = 0;
  while (counted < n) {
    day = addDays(day, 1);
    if (!DEFAULT_WEEKLY_OFF_DAYS.includes(weekdayOf(day)) && !holidays.has(day)) counted += 1;
  }
  return day;
}
