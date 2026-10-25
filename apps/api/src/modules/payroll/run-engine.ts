import {
  addDays,
  Decimal,
  daysInclusive,
  evaluateFormula,
  money,
  parseFormula,
  type AttendanceStatus,
  type PayLineView,
  type RunProblem,
  type RunTaxWorking,
  type RunVariables,
  type TaxTreatment,
} from '@gp/shared';
import { bdSalaryTax, type BdSalaryTaxYear, type Taxpayer } from '@gp/country-packs';
import { workOutPay, type ComponentInfo, type StructureInfo } from './pay-calc.js';

// One person's pay for one period, worked out from their pay records, attendance and the
// amounts entered for the run. Pure: everything it needs is passed in, so a run of 20,000
// people is one bulk load and 20,000 calls of this function.

export interface EngineComponent extends ComponentInfo {
  prorate: boolean;
  inOvertimeBase: boolean;
  runFormula: string | null;
  taxTreatment: TaxTreatment;
}

export interface EnginePayRecord {
  effectiveFrom: string;
  structure: StructureInfo;
  amount: string;
  fixed: Record<string, string>;
}

export interface EngineDay {
  date: string;
  status: AttendanceStatus;
  overtimeMinutes: number;
  leaveDays: number;
  /** The day's leave is leave without pay. */
  unpaidLeave: boolean;
  /** Arrived after the shift's grace time. */
  late: boolean;
}

/** An advance or loan being repaid, and what is left of it before this run. */
export interface EngineLoan {
  loanId: string;
  /** ADVANCE, LOAN or PF_LOAN. */
  component: string;
  installment: string;
  outstanding: string;
}

/** What salary tax needs beyond this month: the year so far and the rest of it. */
export interface EngineTax {
  year: BdSalaryTaxYear;
  taxpayer: Taxpayer;
  /** From runs locked earlier in the fiscal year: salary income, tax deducted, recognised PF. */
  ytdSalary: string;
  ytdTax: string;
  ytdPf: string;
  /** Months of the fiscal year after this one in which the person will still be paid. */
  monthsAfter: number;
  /** Investments declared (or verified) for the rebate. */
  investment: string;
  /** Contributions to a recognised fund count as investment. */
  pfRecognised: boolean;
  hasTin: boolean;
}

export interface EngineInput {
  periodStart: string;
  periodEnd: string;
  /** Today in the workspace, to tell finished periods and days from unfinished ones. */
  today: string;
  joinedOn: string;
  separatedOn: string | null;
  /** A worker rather than staff, for overtime under the Labour Act. */
  worker: boolean;
  /** Approved pay, oldest first. */
  records: EnginePayRecord[];
  /** Processed days; null where attendance is not tracked and every employed day counts. */
  attendance: EngineDay[] | null;
  /** The first day attendance is tracked; every past day from it should be processed. */
  trackingFrom?: string;
  /** Amounts entered for run components, by code. */
  inputs: Record<string, string>;
  components: EngineComponent[];
  /** Provident fund rates (percent of basic) when the person is a member this period. */
  pf?: { employeeRate: string; employerRate: string } | null;
  /** Advances and loans to recover, oldest first. */
  loans?: EngineLoan[];
  /** Salary tax to deduct; null or absent where the run does not work it out. */
  tax?: EngineTax | null;
  /**
   * Formula variables from other modules, by name: production (PIECES, PIECE_EARNINGS,
   * PRODUCTION_INCENTIVE) and union dues (UNION_DUES). Missing ones are zero.
   */
  extra?: Partial<Record<ExtraVariable, string>>;
}

/** Run variables that come from outside attendance and pay records. */
export const EXTRA_VARIABLES = [
  'PIECES',
  'PIECE_EARNINGS',
  'PRODUCTION_INCENTIVE',
  'UNION_DUES',
] as const;
export type ExtraVariable = (typeof EXTRA_VARIABLES)[number];

export interface EngineResult {
  status: 'ok' | 'error';
  problems: RunProblem[];
  lines: PayLineView[];
  earnings: string;
  deductions: string;
  net: string;
  employerCost: string;
  variables: RunVariables;
  /** Salary income this period for tax: taxable earnings less the deductions that reduce it. */
  taxable: string;
  /** How this month's TAX was worked out, when the run worked it out. */
  tax: RunTaxWorking | null;
  /** What each advance or loan got back. */
  loans: { loanId: string; amount: string }[];
}

const ZERO = new Decimal(0);
const whole = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/** The days someone was employed in the period, or null when they were not at all. */
export function employment(
  input: Pick<EngineInput, 'periodStart' | 'periodEnd' | 'joinedOn' | 'separatedOn'>,
) {
  const from = input.joinedOn > input.periodStart ? input.joinedOn : input.periodStart;
  const to =
    input.separatedOn && input.separatedOn < input.periodEnd ? input.separatedOn : input.periodEnd;
  return from <= to ? { from, to } : null;
}

/** Whole months from one date to another (a month is complete on the same day of the month). */
export const completedMonths = (from: string, to: string) => {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
};

export function computePay(input: EngineInput): EngineResult {
  const problems: RunProblem[] = [];
  const periodDays = daysInclusive(input.periodStart, input.periodEnd);
  const span = employment(input) ?? { from: input.periodStart, to: input.periodStart };
  const employedDays = employment(input) ? daysInclusive(span.from, span.to) : 0;
  const byCode = new Map(input.components.map((c) => [c.code, c]));
  const fail = (result: RunProblem[]): EngineResult => ({
    status: 'error',
    problems: result,
    lines: [],
    earnings: '0.00',
    deductions: '0.00',
    net: '0.00',
    employerCost: '0.00',
    variables: {
      periodDays,
      employedDays,
      paidDays: 0,
      workedDays: 0,
      absentDays: 0,
      unpaidLeaveDays: 0,
      otHours: 0,
    },
    taxable: '0.00',
    tax: null,
    loans: [],
  });
  /** Taxable earnings less taxable deductions (absence, leave without pay). */
  const taxableOf = (entries: Iterable<[string, Decimal]>) => {
    let sum = ZERO;
    for (const [code, v] of entries) {
      const c = byCode.get(code);
      if (!c || c.taxTreatment === 'exempt') continue;
      if (c.kind === 'earning') sum = sum.plus(v);
      else if (c.kind === 'deduction') sum = sum.minus(v);
    }
    return sum;
  };

  // ── Pay in force, split where it changed ───────────────────────────────────
  const segments = input.records.flatMap((record, i) => {
    const next = input.records[i + 1];
    const start = record.effectiveFrom > span.from ? record.effectiveFrom : span.from;
    const end =
      next && addDays(next.effectiveFrom, -1) < span.to ? addDays(next.effectiveFrom, -1) : span.to;
    return start <= end ? [{ record, start, end, days: daysInclusive(start, end) }] : [];
  });
  if (segments.length === 0) {
    return fail([
      { code: 'no_pay', severity: 'error', message: 'No approved pay for this period' },
    ]);
  }
  if (segments[0]!.start > span.from) {
    problems.push({
      code: 'pay_starts_late',
      severity: 'warning',
      message: `Pay starts on ${segments[0]!.start}; the days before it are not paid`,
      count: daysInclusive(span.from, addDays(segments[0]!.start, -1)),
    });
  }

  const amounts = new Map<string, Decimal>();
  let full = new Map<string, Decimal>();
  for (const [i, segment] of segments.entries()) {
    const result = workOutPay(
      segment.record.structure,
      input.components,
      segment.record.amount,
      segment.record.fixed,
    );
    if (result.problems.length) {
      return fail([
        {
          code: 'formula_failed',
          severity: 'error',
          message: result.problems
            .map((p) => (p.code ? `${p.code}: ${p.message}` : p.message))
            .join('; '),
        },
      ]);
    }
    const last = i === segments.length - 1;
    full = new Map(result.lines.map((l) => [l.code, new Decimal(l.amount)]));
    for (const line of result.lines) {
      const value = new Decimal(line.amount);
      const c = byCode.get(line.code);
      // Prorated components follow the days paid on this pay; others are paid once, in full.
      const share =
        c?.prorate !== false
          ? value.times(segment.days).dividedBy(periodDays)
          : last
            ? value
            : ZERO;
      amounts.set(line.code, (amounts.get(line.code) ?? ZERO).plus(share));
    }
  }
  // Whole taka per line; the rounding difference goes to the structure's last line (house
  // rent in the pack's structures), so the lines add up to the prorated gross as a whole.
  const grossOf = () =>
    [...amounts].reduce((sum, [code, v]) => (byCode.get(code)?.inGross ? sum.plus(v) : sum), ZERO);
  const exactGross = grossOf();
  for (const [code, value] of amounts) {
    amounts.set(code, value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
  }
  const balancing = segments.at(-1)!.record.structure.lines.at(-1)?.component;
  const remainder = exactGross.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).minus(grossOf());
  if (balancing && !remainder.isZero() && amounts.has(balancing)) {
    amounts.set(balancing, amounts.get(balancing)!.plus(remainder));
  }

  // ── Attendance and leave ───────────────────────────────────────────────────
  let absentDays = 0;
  let unpaidLeaveDays = 0;
  let leaveDays = 0;
  let lateDays = 0;
  let workedDays = employedDays;
  let otMinutes = 0;
  if (input.attendance) {
    const days = input.attendance.filter((d) => d.date >= span.from && d.date <= span.to);
    if (days.length === 0) {
      problems.push({
        code: 'no_attendance',
        severity: 'warning',
        message: 'No attendance recorded in this period',
      });
    }
    workedDays = 0;
    let missing = 0;
    // A past day without a processed row would otherwise be paid without anyone looking.
    let unprocessed = 0;
    if (days.length > 0) {
      const seen = new Set(days.map((d) => d.date));
      const yesterday = addDays(input.today, -1);
      const to = span.to < yesterday ? span.to : yesterday;
      const from =
        input.trackingFrom && input.trackingFrom > span.from ? input.trackingFrom : span.from;
      for (let date = from; date <= to; date = addDays(date, 1)) {
        if (!seen.has(date)) unprocessed += 1;
      }
    }
    for (const day of days) {
      if (day.status === 'absent') absentDays += 1;
      else if (day.status === 'half_day') {
        absentDays += 0.5;
        workedDays += 0.5;
      } else if (day.status === 'present') workedDays += 1;
      else if (day.status === 'missing_punch') missing += 1;
      else if (day.status === 'pending' && day.date < input.today) unprocessed += 1;
      if (day.unpaidLeave) unpaidLeaveDays += day.leaveDays;
      leaveDays += day.leaveDays;
      if (day.late) lateDays += 1;
      otMinutes += day.overtimeMinutes;
    }
    if (missing) {
      problems.push({
        code: 'missing_punches',
        severity: 'warning',
        message: `${missing} day${missing === 1 ? '' : 's'} with one punch, paid as worked until corrected`,
        count: missing,
      });
    }
    if (unprocessed) {
      problems.push({
        code: 'not_processed',
        // Once the period is over, pay waits for every day to be processed.
        severity: input.periodEnd < input.today ? 'error' : 'warning',
        message: `${unprocessed} past day${unprocessed === 1 ? '' : 's'} not processed yet`,
        count: unprocessed,
      });
    }
  }
  if (input.periodEnd >= input.today) {
    problems.push({
      code: 'period_not_over',
      severity: 'warning',
      message: 'The period has not ended yet',
    });
  }
  const otHours = Math.round((otMinutes / 60) * 100) / 100;
  const paidDays = Math.max(0, employedDays - absentDays - unpaidLeaveDays);

  // ── Run components (overtime, absence, entered amounts) ────────────────────
  const gross = [...full].reduce(
    (sum, [code, v]) => (byCode.get(code)?.inGross ? sum.plus(v) : sum),
    ZERO,
  );
  const otBase = [...full].reduce(
    (sum, [code, v]) => (byCode.get(code)?.inOvertimeBase ? sum.plus(v) : sum),
    ZERO,
  );
  const variables = new Map<string, Decimal>(full);
  for (const [name, value] of Object.entries({
    GROSS: gross,
    OT_BASE: otBase,
    PERIOD_DAYS: periodDays,
    EMPLOYED_DAYS: employedDays,
    PAID_DAYS: paidDays,
    WORKED_DAYS: workedDays,
    ABSENT_DAYS: absentDays,
    UNPAID_LEAVE_DAYS: unpaidLeaveDays,
    OT_HOURS: otHours,
    SERVICE_YEARS: Math.floor(completedMonths(input.joinedOn, span.to) / 12),
    SERVICE_MONTHS: completedMonths(input.joinedOn, span.to),
    WORKER: input.worker ? 1 : 0,
    LATE_DAYS: lateDays,
    LEAVE_DAYS: leaveDays,
  })) {
    variables.set(name, new Decimal(value));
  }
  for (const name of EXTRA_VARIABLES) variables.set(name, new Decimal(input.extra?.[name] ?? 0));
  for (const c of input.components) {
    if (c.calculation !== 'run' || !c.isActive) continue;
    let value: Decimal | null = null;
    if (input.inputs[c.code] !== undefined) value = new Decimal(input.inputs[c.code]!);
    else if (c.runFormula) {
      try {
        value = evaluateFormula(parseFormula(c.runFormula), variables);
      } catch (error) {
        return fail([
          {
            code: 'formula_failed',
            severity: 'error',
            message: `${c.code}: ${(error as Error).message}`,
          },
        ]);
      }
    }
    if (!value || value.isZero()) continue;
    if (value.isNegative()) {
      return fail([
        { code: 'formula_failed', severity: 'error', message: `${c.code} comes out below zero` },
      ]);
    }
    amounts.set(c.code, value);
  }

  // ── Provident fund: a percentage of the basic paid this period ─────────────
  if (input.pf) {
    const basic = amounts.get('BASIC') ?? ZERO;
    for (const [code, rate] of [
      ['PF_EMPLOYEE', input.pf.employeeRate],
      ['PF_EMPLOYER', input.pf.employerRate],
    ] as const) {
      if (input.inputs[code] !== undefined || !byCode.get(code)?.isActive) continue;
      const value = whole(basic.times(rate).dividedBy(100));
      if (!value.isZero()) amounts.set(code, value);
    }
  }

  // ── Salary tax: the year's tax, projected, less what was deducted, spread ──
  const taxableNow = taxableOf(amounts);
  let taxWorking: RunTaxWorking | null = null;
  if (input.tax && input.inputs.TAX === undefined && byCode.get('TAX')?.isActive) {
    const t = input.tax;
    // What recurs each month: the structure's and fixed lines at their full monthly amounts.
    const recurring = taxableOf(full);
    const projected = new Decimal(t.ytdSalary)
      .plus(taxableNow)
      .plus(recurring.times(t.monthsAfter));
    const pfNow = (amounts.get('PF_EMPLOYEE') ?? ZERO).plus(amounts.get('PF_EMPLOYER') ?? ZERO);
    const pfYear = t.pfRecognised
      ? new Decimal(t.ytdPf).plus(pfNow.times(t.monthsAfter + 1))
      : ZERO;
    const breakdown = bdSalaryTax(t.year, {
      salary: projected.toNumber(),
      investment: new Decimal(t.investment).plus(pfYear).toNumber(),
      taxpayer: t.taxpayer,
    });
    const left = Decimal.max(ZERO, new Decimal(breakdown.tax).minus(t.ytdTax));
    const due = whole(left.dividedBy(t.monthsAfter + 1));
    if (!due.isZero()) amounts.set('TAX', due);
    taxWorking = {
      ...breakdown,
      deductedBefore: money(t.ytdTax),
      monthsLeft: t.monthsAfter + 1,
      thisMonth: money(due),
    };
    if (!due.isZero() && !t.hasTin) {
      problems.push({
        code: 'tin_missing',
        severity: 'warning',
        message: 'Tax is deducted but the employee has no TIN on record',
      });
    }
  }

  // ── Advances and loans, never taking net pay below zero ────────────────────
  const recovered: { loanId: string; amount: string }[] = [];
  if (input.loans?.length) {
    const loanCodes = new Set(input.loans.map((l) => l.component));
    let available = ZERO;
    for (const [code, v] of amounts) {
      if (loanCodes.has(code)) continue;
      const kind = byCode.get(code)?.kind;
      if (kind === 'earning') available = available.plus(v);
      else if (kind === 'deduction') available = available.minus(v);
    }
    const byComponent = new Map<string, Decimal>();
    let short = 0;
    for (const code of loanCodes) {
      // An amount entered for the component is what is recovered, shared oldest first.
      const entered = input.inputs[code] === undefined ? null : new Decimal(input.inputs[code]);
      let pool = entered;
      for (const loan of input.loans.filter((l) => l.component === code)) {
        const outstanding = new Decimal(loan.outstanding);
        let take = Decimal.min(outstanding, pool ?? new Decimal(loan.installment));
        if (pool) pool = pool.minus(take);
        else if (take.greaterThan(available)) {
          take = Decimal.max(ZERO, available);
          short += 1;
        }
        available = available.minus(take);
        if (take.isZero()) continue;
        recovered.push({ loanId: loan.loanId, amount: money(take) });
        byComponent.set(code, (byComponent.get(code) ?? ZERO).plus(take));
      }
      if (entered) byComponent.set(code, entered);
    }
    for (const [code, v] of byComponent) {
      if (v.isZero()) amounts.delete(code);
      else amounts.set(code, v);
    }
    if (short) {
      problems.push({
        code: 'loan_not_recovered',
        severity: 'warning',
        message: 'Not enough pay left to recover the full installment',
        count: short,
      });
    }
  }

  // s.126: an absence deduction may not exceed the pay for the days absent.
  const absence = amounts.get('ABSENCE');
  if (absence && absence.greaterThan(gross.times(absentDays).dividedBy(30))) {
    problems.push({
      code: 'absence_over_limit',
      severity: 'warning',
      message: 'The absence deduction is more than the pay for the days absent (Labour Act s.126)',
    });
  }

  // ── Lines and totals ───────────────────────────────────────────────────────
  const lines: PayLineView[] = [...amounts]
    .filter(([, v]) => !v.isZero())
    .map(([code, v]) => ({ code, value: v, c: byCode.get(code) }))
    .toSorted(
      (a, b) => (a.c?.sortOrder ?? 999) - (b.c?.sortOrder ?? 999) || a.code.localeCompare(b.code),
    )
    .map(({ code, value, c }) => ({
      code,
      name: c?.name ?? code,
      nameBn: c?.nameBn ?? null,
      kind: c?.kind ?? 'earning',
      inGross: c?.inGross ?? false,
      amount: money(value),
    }));
  const total = (kind: PayLineView['kind']) =>
    lines.filter((l) => l.kind === kind).reduce((sum, l) => sum.plus(l.amount), ZERO);
  const earnings = total('earning');
  const deductions = total('deduction');
  const net = earnings.minus(deductions);
  if (net.isNegative()) {
    problems.push({
      code: 'negative_net',
      severity: 'error',
      message: 'Deductions are more than earnings',
    });
  }
  return {
    status: problems.some((p) => p.severity === 'error') ? 'error' : 'ok',
    problems,
    lines,
    earnings: money(earnings),
    deductions: money(deductions),
    net: money(net),
    employerCost: money(total('employer_cost')),
    variables: {
      periodDays,
      employedDays,
      paidDays,
      workedDays,
      absentDays,
      unpaidLeaveDays,
      otHours,
    },
    taxable: money(taxableNow),
    tax: taxWorking,
    loans: recovered,
  };
}

/**
 * A festival bonus: a share of one month's basic in force on the cut-off day, for people with
 * enough continuous service by then (Labour Rules 2015, rule 111). null when they do not
 * qualify.
 */
export function computeBonus(input: {
  record: EnginePayRecord;
  joinedOn: string;
  cutOff: string;
  percentOfBasic: number;
  minServiceMonths: number;
  components: EngineComponent[];
}): EngineResult | null {
  if (completedMonths(input.joinedOn, input.cutOff) < input.minServiceMonths) return null;
  const pay = workOutPay(
    input.record.structure,
    input.components,
    input.record.amount,
    input.record.fixed,
  );
  const basic = new Decimal(pay.lines.find((l) => l.code === 'BASIC')?.amount ?? 0);
  const amount = whole(basic.times(input.percentOfBasic).dividedBy(100));
  const c = input.components.find((x) => x.code === 'FESTIVAL_BONUS');
  const lines: PayLineView[] = amount.isZero()
    ? []
    : [
        {
          code: 'FESTIVAL_BONUS',
          name: c?.name ?? 'Festival bonus',
          nameBn: c?.nameBn ?? null,
          kind: 'earning',
          inGross: false,
          amount: money(amount),
        },
      ];
  const taxable = c && c.taxTreatment !== 'exempt' ? amount : ZERO;
  return {
    status: 'ok',
    problems: [],
    lines,
    earnings: money(amount),
    deductions: '0.00',
    net: money(amount),
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
    taxable: money(taxable),
    tax: null,
    loans: [],
  };
}

/** Per component, what `after` pays more (or less) than `before`: an adjustment's lines. */
export function difference(before: PayLineView[], after: PayLineView[]): PayLineView[] {
  const codes = new Set([...before, ...after].map((l) => l.code));
  return [...codes].flatMap((code) => {
    const a = after.find((l) => l.code === code);
    const b = before.find((l) => l.code === code);
    const delta = new Decimal(a?.amount ?? 0).minus(b?.amount ?? 0);
    return delta.isZero() ? [] : [{ ...(a ?? b)!, amount: money(delta) }];
  });
}
