import { BD_RULES, ruleOn } from '@gp/country-packs';
import { addDays, addMonths, type EmploymentType, type WorkerCategory } from '@gp/shared';

// Probation on an offer, as the employee module applies it on hiring: a probationer's
// probation is at most the Labour Act's period (s.4), six months for clerical work and three
// for other work, and that period is the default. The skilled worker's three-month extension
// is decided later, when the work could not be judged in time, never in the offer.

/** The statutory probation in months on a joining date. */
export const statutoryProbation = (joiningOn: string) =>
  ruleOn(BD_RULES, 'lifecycle.probation_months', joiningOn).value;

/** Staff (officers and management) do clerical work under s.4; everyone else other work. */
export const probationCategory = (category: WorkerCategory) =>
  category === 'staff' ? ('clerical' as const) : ('other' as const);

/**
 * The probation an offer carries: none unless the person joins as a probationer; else the
 * months asked, or the statutory period. `tooLong` when the months asked pass the Act's limit.
 */
export function offerProbation(
  employmentType: EmploymentType,
  category: WorkerCategory,
  joiningOn: string,
  asked: number | null | undefined,
): { months: number | null; limit: number; tooLong: boolean } {
  const limit = statutoryProbation(joiningOn)[probationCategory(category)];
  if (employmentType !== 'probationer') return { months: null, limit, tooLong: false };
  const months = asked ?? limit;
  return { months, limit, tooLong: months > limit };
}

/** The last day of a probation of `months` from joining, as the hire records it. */
export const probationEnd = (joiningOn: string, months: number) =>
  addDays(addMonths(joiningOn, months), -1);
