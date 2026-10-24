import { addDays } from './dates.js';

export const HOLIDAY_KINDS = ['public', 'festival', 'optional', 'company'] as const;
export type HolidayKind = (typeof HOLIDAY_KINDS)[number];

export const STATUTORY_LEAVES = ['casual', 'sick', 'annual', 'maternity'] as const;
export type StatutoryLeave = (typeof STATUTORY_LEAVES)[number];

/** annual_grant: a yearly allowance; earned: by days worked; per_event: no balance (maternity). */
export const LEAVE_ACCRUALS = ['annual_grant', 'earned', 'per_event'] as const;
export type LeaveAccrual = (typeof LEAVE_ACCRUALS)[number];

/** Steps a leave type or correction chain may have. */
export const CHAIN_STEP_KINDS = ['manager', 'hr'] as const;
export type ChainStepKind = (typeof CHAIN_STEP_KINDS)[number];

/** Every kind of approval step; `payroll` is the second person on a pay change. */
export const APPROVAL_STEP_KINDS = [...CHAIN_STEP_KINDS, 'payroll'] as const;
export type ApprovalStepKind = (typeof APPROVAL_STEP_KINDS)[number];

export const APPROVAL_STATUSES = [
  'waiting',
  'pending',
  'approved',
  'rejected',
  'skipped',
  'cancelled',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const LEAVE_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const HALF_DAYS = ['first_half', 'second_half'] as const;
export type HalfDay = (typeof HALF_DAYS)[number];

/** Balance movements. Entitlement and carry-forward are computed, never stored. */
export const LEDGER_KINDS = [
  'taken',
  'reversal',
  'adjustment',
  'opening',
  'recalculation',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** 0 = Sunday … 6 = Saturday, as Date#getUTCDay. Friday (5) is the usual weekly holiday. */
export const DEFAULT_WEEKLY_OFF_DAYS = [5];

export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export interface ExcludedDay {
  date: string;
  reason: 'weekly_off' | 'holiday';
  name?: string;
}

/**
 * Leave days between two dates (inclusive). Weekly offs and holidays are skipped unless the
 * leave type counts them (maternity counts calendar days). A half day counts 0.5.
 */
export function countLeaveDays(
  startDate: string,
  endDate: string,
  options: {
    weeklyOffDays: readonly number[];
    holidays: ReadonlyMap<string, string>;
    countsOffDays: boolean;
    halfDay?: HalfDay | null;
  },
): { days: number; excluded: ExcludedDay[] } {
  const excluded: ExcludedDay[] = [];
  let days = 0;
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const holiday = options.holidays.get(d);
    if (!options.countsOffDays && holiday !== undefined) {
      excluded.push({ date: d, reason: 'holiday', name: holiday });
    } else if (!options.countsOffDays && options.weeklyOffDays.includes(weekdayOf(d))) {
      excluded.push({ date: d, reason: 'weekly_off' });
    } else {
      days += 1;
    }
  }
  if (options.halfDay && days > 0) days = 0.5;
  return { days, excluded };
}
