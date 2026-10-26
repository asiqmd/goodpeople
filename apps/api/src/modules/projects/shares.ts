import {
  addDays,
  daysInclusive,
  Decimal,
  monthBounds,
  type AllocationBasis,
  type ProjectCostKind,
} from '@gp/shared';

// How a person's salary for a month is split across projects, and how an amount is split by
// those shares to the paisa. Pure, so payroll's journal, its cost summary and the project
// reports all split the same way.

/** A planned share of salary, from a date. */
export interface PlannedAllocation {
  projectId: string;
  percent: string;
  costKind: ProjectCostKind;
  fromOn: string;
  toOn: string | null;
}

/** Hours on an approved timesheet: for a project, or (no project) for the person's unit. */
export interface TimesheetHours {
  projectId: string | null;
  hours: string;
}

export interface Share {
  projectId: string;
  costKind: ProjectCostKind;
  /** The part of the month's salary charged to the project, 0 to 1. */
  fraction: Decimal;
  /** Hours on the project, when the share comes from a timesheet. */
  hours: Decimal | null;
}

const ONE = new Decimal(1);
const total = (values: Decimal[]) => values.reduce((s, v) => s.plus(v), new Decimal(0));
const round = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Months from one to another, both included: ['2026-01', '2026-02', …]. */
export function monthsFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addDays(monthBounds(m).end, 1).slice(0, 7)) out.push(m);
  return out;
}

/** Days of a range in force within a month. */
function daysWithin(range: { fromOn: string; toOn: string | null }, month: string): number {
  const { start, end } = monthBounds(month);
  const from = range.fromOn > start ? range.fromOn : start;
  const to = range.toOn && range.toOn < end ? range.toOn : end;
  return to < from ? 0 : daysInclusive(from, to);
}

/** Never more than the whole salary: an excess from rounding comes off the largest share. */
function capped(shares: Share[]): Share[] {
  const sum = total(shares.map((s) => s.fraction));
  if (sum.lte(ONE) || shares.length === 0) return shares;
  const largest = shares.reduce((a, b) => (b.fraction.greaterThan(a.fraction) ? b : a));
  largest.fraction = largest.fraction.minus(sum.minus(ONE));
  return shares;
}

/**
 * The plan for a month: each allocation's percent weighted by the days it is in force
 * (percent × days ÷ days in the month), added up per project and kind of cost.
 */
export function plannedShares(allocations: PlannedAllocation[], month: string): Share[] {
  const { start, end } = monthBounds(month);
  const days = new Decimal(daysInclusive(start, end)).times(100);
  const byKey = new Map<string, Share>();
  for (const a of allocations) {
    const inForce = daysWithin(a, month);
    if (inForce === 0) continue;
    const fraction = new Decimal(a.percent).times(inForce).dividedBy(days);
    const key = `${a.projectId}|${a.costKind}`;
    const share = byKey.get(key);
    if (share) share.fraction = share.fraction.plus(fraction);
    else byKey.set(key, { projectId: a.projectId, costKind: a.costKind, fraction, hours: null });
  }
  return capped([...byKey.values()]);
}

/** Programme or administration: the person's planned share in the project for most of the month. */
function kindOf(
  projectId: string,
  allocations: PlannedAllocation[],
  month: string,
): ProjectCostKind {
  let best: { kind: ProjectCostKind; days: number } | null = null;
  for (const a of allocations) {
    if (a.projectId !== projectId) continue;
    const days = daysWithin(a, month);
    if (days > 0 && (!best || days > best.days)) best = { kind: a.costKind, days };
  }
  return best?.kind ?? 'programme';
}

/**
 * An approved timesheet's split: hours on each project over all hours on the timesheet;
 * hours on no project stay with the person's unit. Null when it has no hours at all.
 */
export function timesheetShares(
  entries: TimesheetHours[],
  allocations: PlannedAllocation[],
  month: string,
): Share[] | null {
  const all = total(entries.map((e) => new Decimal(e.hours)));
  if (all.isZero()) return null;
  const hours = new Map<string, Decimal>();
  for (const e of entries) {
    if (e.projectId) {
      hours.set(e.projectId, (hours.get(e.projectId) ?? new Decimal(0)).plus(e.hours));
    }
  }
  return capped(
    [...hours]
      .filter(([, h]) => h.greaterThan(0))
      .map(([projectId, h]) => ({
        projectId,
        costKind: kindOf(projectId, allocations, month),
        fraction: h.dividedBy(all),
        hours: h,
      })),
  );
}

/**
 * A person's split for a month. Donors take salaries charged on actual effort, with budget
 * estimates only in the meantime (2 CFR 200.430(i)), so an approved timesheet wins over the
 * plan; a timesheet with no hours leaves the plan in place.
 */
export function sharesOf(
  allocations: PlannedAllocation[],
  timesheet: TimesheetHours[] | null,
  month: string,
): { basis: AllocationBasis; shares: Share[] } {
  const actual = timesheet ? timesheetShares(timesheet, allocations, month) : null;
  return actual
    ? { basis: 'timesheet', shares: actual }
    : { basis: 'planned', shares: plannedShares(allocations, month) };
}

/**
 * An amount split by fractions to the paisa: a part per fraction and the rest. Each is rounded
 * half up and the rounding difference goes on the largest, so they add up to the amount.
 */
export function splitAmount(
  amount: Decimal | string | number,
  fractions: Decimal[],
): { parts: Decimal[]; rest: Decimal } {
  const whole = new Decimal(amount);
  const all = [...fractions, ONE.minus(total(fractions))].map((f) => round(whole.times(f)));
  const difference = whole.minus(total(all));
  if (!difference.isZero()) {
    let largest = 0;
    all.forEach((p, i) => {
      if (p.abs().greaterThan(all[largest]!.abs())) largest = i;
    });
    all[largest] = all[largest]!.plus(difference);
  }
  return { parts: all.slice(0, -1), rest: all.at(-1)! };
}

/**
 * The first day of a new share's range on which the person's shares in force would add up
 * to more than 100%, or null. The sum only rises where a share starts, so those days suffice.
 */
export function overAllocatedOn(
  existing: { percent: string; fromOn: string; toOn: string | null }[],
  added: { percent: string; fromOn: string; toOn: string | null },
): string | null {
  const within = (day: string) => day >= added.fromOn && (!added.toOn || day <= added.toOn);
  const days = [added.fromOn, ...existing.map((e) => e.fromOn).filter(within)].toSorted();
  for (const day of new Set(days)) {
    const sum = existing
      .filter((e) => e.fromOn <= day && (!e.toOn || e.toOn >= day))
      .reduce((s, e) => s.plus(e.percent), new Decimal(added.percent));
    if (sum.greaterThan(100)) return day;
  }
  return null;
}
