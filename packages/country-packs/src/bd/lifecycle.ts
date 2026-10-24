import { ruleOn, type IsoDate } from '../engine.js';
import { BD_RULES, type NoticeTable, type ProbationCategory } from './rules.js';

/** Calendar months later, clamped to the month's end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0));
  target.setUTCDate(Math.min(d, lastDay.getUTCDate()));
  return target.toISOString().slice(0, 10);
}

const dayBefore = (date: IsoDate) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** The last day of probation under the Act: three months, or six for clerical work. */
export function bdProbationEnd(joinedOn: IsoDate, category: ProbationCategory): IsoDate {
  const months = ruleOn(BD_RULES, 'lifecycle.probation_months', joinedOn).value[category];
  return dayBefore(addMonths(joinedOn, months));
}

/**
 * The latest probation may run: a skilled worker's can be extended by three months when
 * their work could not be judged in time; otherwise the statutory period is the limit.
 */
export function bdProbationLatestEnd(
  joinedOn: IsoDate,
  category: ProbationCategory,
  skilled: boolean,
): IsoDate {
  const months = ruleOn(BD_RULES, 'lifecycle.probation_months', joinedOn).value[category];
  const extra = skilled
    ? ruleOn(BD_RULES, 'lifecycle.probation_extension_months', joinedOn).value
    : 0;
  return dayBefore(addMonths(joinedOn, months + extra));
}

export type SeparationKind =
  | 'resignation'
  | 'termination'
  | 'dismissal'
  | 'discharge'
  | 'retrenchment'
  | 'retirement'
  | 'death'
  | 'contract_end';

/**
 * Days of notice the Act asks for, or null when it asks for none (dismissal for misconduct,
 * discharge, death, retirement, the end of a contract). Workers on monthly wages are assumed
 * until pay structures arrive.
 */
export function bdNoticeDays(
  kind: SeparationKind,
  worker: { permanent: boolean; monthlyRated: boolean },
  on: IsoDate,
): number | null {
  const pick = (table: NoticeTable) =>
    table[
      `${worker.permanent ? 'permanent' : 'temporary'}_${worker.monthlyRated ? 'monthly' : 'other'}`
    ];
  switch (kind) {
    case 'resignation':
      return pick(ruleOn(BD_RULES, 'separation.resignation_notice_days', on).value);
    case 'termination':
      return pick(ruleOn(BD_RULES, 'separation.termination_notice_days', on).value);
    case 'retrenchment':
      return ruleOn(BD_RULES, 'separation.retrenchment_notice_days', on).value;
    default:
      return null;
  }
}

/** The day a worker reaches retirement age, under the rule in force around then. */
export function bdRetirementDate(dateOfBirth: IsoDate): IsoDate {
  const sixty = addMonths(dateOfBirth, 60 * 12);
  const on = sixty < '2006-10-11' ? '2006-10-11' : sixty;
  return addMonths(dateOfBirth, ruleOn(BD_RULES, 'separation.retirement_age', on).value * 12);
}
