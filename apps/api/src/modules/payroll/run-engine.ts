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
  type RunVariables,
} from '@gp/shared';
import { workOutPay, type ComponentInfo, type StructureInfo } from './pay-calc.js';

// One person's pay for one period, worked out from their pay records, attendance and the
// amounts entered for the run. Pure: everything it needs is passed in, so a run of 20,000
// people is one bulk load and 20,000 calls of this function.

export interface EngineComponent extends ComponentInfo {
  prorate: boolean;
  inOvertimeBase: boolean;
  runFormula: string | null;
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
}

export interface EngineResult {
  status: 'ok' | 'error';
  problems: RunProblem[];
  lines: PayLineView[];
  earnings: string;
  deductions: string;
  net: string;
  employerCost: string;
  variables: RunVariables;
}

const ZERO = new Decimal(0);

/** The days someone was employed in the period, or null when they were not at all. */
export function employment(
  input: Pick<EngineInput, 'periodStart' | 'periodEnd' | 'joinedOn' | 'separatedOn'>,
) {
  const from = input.joinedOn > input.periodStart ? input.joinedOn : input.periodStart;
  const to =
    input.separatedOn && input.separatedOn < input.periodEnd ? input.separatedOn : input.periodEnd;
  return from <= to ? { from, to } : null;
}

const completedMonths = (from: string, to: string) => {
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
  });

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
  })) {
    variables.set(name, new Decimal(value));
  }
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
