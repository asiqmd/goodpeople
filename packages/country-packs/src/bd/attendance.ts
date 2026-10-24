import { ruleOn, type IsoDate, type LegalReference } from '../engine.js';
import { BD_RULES } from './rules.js';

/** The parts of a shift the Labour Act limits. */
export interface ShiftHours {
  /** Scheduled minutes from start to end, intervals included. */
  spanMinutes: number;
  breakMinutes: number;
}

export interface ShiftViolation {
  field: 'span' | 'breakMinutes';
  message: string;
  reference: LegalReference;
}

/**
 * What a shift's schedule breaks on a date. Overtime is worked after the shift, so the shift
 * itself must fit the ordinary day (s.100) and allow the rest interval (s.101).
 */
export function bdShiftViolations(shift: ShiftHours, on: IsoDate): ShiftViolation[] {
  const out: ShiftViolation[] = [];
  const work = shift.spanMinutes - shift.breakMinutes;
  const daily = ruleOn(BD_RULES, 'work.daily_hours', on);
  if (work > daily.value * 60) {
    out.push({
      field: 'span',
      message: `A shift can schedule at most ${daily.value} hours of work; later hours are overtime`,
      reference: daily.reference,
    });
  }
  const rest = ruleOn(BD_RULES, 'work.rest_intervals', on);
  const needed = rest.value
    .filter((r) => work > r.overHours * 60)
    .toSorted((a, b) => b.minutes - a.minutes)[0];
  if (needed && shift.breakMinutes < needed.minutes) {
    out.push({
      field: 'breakMinutes',
      message: `Over ${needed.overHours} hours of work needs at least ${needed.minutes} minutes of rest`,
      reference: rest.reference,
    });
  }
  return out;
}

/** Daily and weekly hour limits, in minutes, for flagging attendance. */
export function bdWorkLimits(on: IsoDate) {
  return {
    dailyMaxMinutes: ruleOn(BD_RULES, 'work.daily_max_hours_with_overtime', on).value * 60,
    weeklyMaxMinutes: ruleOn(BD_RULES, 'work.weekly_max_hours_with_overtime', on).value * 60,
  };
}
