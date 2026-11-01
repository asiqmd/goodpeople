import { bdProbationEnd } from '@gp/country-packs';
import {
  addDays,
  PROBATION_REVIEW_DUE_DAYS,
  PROBATION_REVIEW_LEAD_DAYS,
  type Competency,
  type ProbationReviewState,
} from '@gp/shared';

// When a probation review is asked for and due, and when HR has acted on the probation it was
// for. Probation is the Labour Act's (s.4): three months, or six for clerical work, unless HR
// set or extended the end.

/** Staff do clerical work in the Act's sense; workers' probation is the shorter one. */
const categoryOf = (workerCategory: string) => (workerCategory === 'staff' ? 'clerical' : 'other');

/** The last day of a person's probation: as HR set or extended it, else by the Act. */
export const probationEndOf = (
  person: { probationEndsOn: string | null; joinedOn: string },
  workerCategory: string,
) => person.probationEndsOn ?? bdProbationEnd(person.joinedOn, categoryOf(workerCategory));

/** A review is asked for once the probation ends within the lead time, and not after it ended. */
export const reviewWanted = (endsOn: string, today: string) =>
  endsOn >= today && endsOn <= addDays(today, PROBATION_REVIEW_LEAD_DAYS);

/** A week before the end, or the day it was asked for when that is later. */
export function reviewDueOn(probationEndsOn: string, askedOn: string): string {
  const due = addDays(probationEndsOn, -PROBATION_REVIEW_DUE_DAYS);
  return due < askedOn ? askedOn : due;
}

/** `acted`: stored by the daily job, or seen in the record since. */
export const stateOf = (review: {
  submittedAt: Date | null;
  acted: boolean;
}): ProbationReviewState => (review.acted ? 'acted' : review.submittedAt ? 'submitted' : 'due');

/** Where the person's probation stands now, for the review of one probation end. */
export interface ProbationNow {
  status: string;
  confirmedOn: string | null;
  /** In the job in force today; null without one. */
  employmentType: string | null;
  /** The probation end in force now. */
  endsOn: string;
  /** A separation HR approved, or one completed, since the review was asked for. */
  separated: boolean;
}

/**
 * HR has acted on the probation a review was for: confirmed the person, extended (or changed)
 * the end, or ended their employment. Whichever page they used, the record shows it.
 */
export const actedOn = (reviewedEnd: string, now: ProbationNow) =>
  now.status !== 'active' ||
  now.confirmedOn !== null ||
  now.employmentType !== 'probationer' ||
  now.endsOn !== reviewedEnd ||
  now.separated;

/** Why ratings do not fit the competencies rated, or null when there is one for each. */
export function ratingsProblem(
  competencies: readonly Competency[],
  ratings: Record<string, number>,
): string | null {
  const keys = new Set(competencies.map((c) => c.key));
  const unknown = Object.keys(ratings).filter((k) => !keys.has(k));
  if (unknown.length) return `Not a competency rated here: ${unknown.join(', ')}`;
  const missing = competencies.filter((c) => ratings[c.key] === undefined);
  if (missing.length) return `Rate every competency: ${missing.map((c) => c.en).join(', ')}`;
  return null;
}
