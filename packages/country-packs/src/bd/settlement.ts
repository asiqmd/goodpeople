import { ruleOn, type IsoDate } from '../engine.js';
import { addMonths, bdNoticeDays, type SeparationKind } from './lifecycle.js';
import { BD_RULES, type SeparationBenefit } from './rules.js';

// A leaver's final dues under the Labour Act, in days of wages: notice not given, unused
// earned leave, gratuity and the benefit each kind of separation carries. Money is worked
// out by payroll from the wage these days are counted on (s.14(3)).

export interface SettlementInput {
  kind: SeparationKind;
  joinedOn: IsoDate;
  noticeDate: IsoDate;
  lastWorkingDay: IsoDate;
  permanent: boolean;
  /** Earned (annual) leave days left on the last working day. */
  earnedLeaveDays: number;
  /** The employer pays gratuity under a scheme, contract or service rules. */
  gratuity: boolean;
  /** The death was caused by an accident at or on the way to work. */
  workAccident?: boolean;
}

export interface SettlementBenefitDays {
  code: 'GRATUITY' | 'SEPARATION_BENEFIT';
  label: string;
  /** Years counted, and the slab's days for each. */
  years: number;
  daysPerYear: number;
  days: number;
  reference: string;
}

export interface SettlementDays {
  /** Completed years and months of service on the last working day. */
  serviceYears: number;
  serviceMonths: number;
  notice: {
    requiredDays: number | null;
    servedDays: number;
    shortDays: number;
    /** The employer pays notice not given; a resigning worker forfeits it. */
    owedBy: 'employer' | 'employee' | null;
  };
  leaveDays: number;
  benefits: SettlementBenefitDays[];
}

const DAY = 86_400_000;
const dayAfter = (date: IsoDate) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** Whole months from the first day of service to the end of the last working day. */
export function bdServiceMonths(joinedOn: IsoDate, lastWorkingDay: IsoDate): number {
  const end = dayAfter(lastWorkingDay);
  const [jy, jm, jd] = joinedOn.split('-').map(Number) as [number, number, number];
  const [ey, em, ed] = end.split('-').map(Number) as [number, number, number];
  let months = (ey - jy) * 12 + (em - jm) - (ed < jd ? 1 : 0);
  // A month counts once its last day is served: 31 Jan to 28 Feb is a month.
  if (addMonths(joinedOn, months + 1) <= end) months += 1;
  return Math.max(0, months);
}

/**
 * Years of service on the last working day. Completed years, unless the part year counts:
 * gratuity and the death benefit count a part longer than six months as a whole year.
 */
export function bdServiceYears(
  joinedOn: IsoDate,
  lastWorkingDay: IsoDate,
  partYearCounts = false,
): number {
  const months = bdServiceMonths(joinedOn, lastWorkingDay);
  const years = Math.floor(months / 12);
  if (!partYearCounts) return years;
  const limit = ruleOn(BD_RULES, 'separation.part_year_counts_after_months', lastWorkingDay).value;
  // "More than six months": past the date six months into the part year.
  return addMonths(joinedOn, years * 12 + limit) < dayAfter(lastWorkingDay) ? years + 1 : years;
}

/** Days of wages a benefit gives: the slab the whole service falls in, for each year. */
function benefitDays(
  benefit: SeparationBenefit,
  joinedOn: IsoDate,
  lastWorkingDay: IsoDate,
): { years: number; daysPerYear: number; days: number } {
  const months = bdServiceMonths(joinedOn, lastWorkingDay);
  const years = bdServiceYears(joinedOn, lastWorkingDay, benefit.partYearCounts);
  const slab = benefit.slabs.filter((s) => months >= s.fromMonths).at(-1);
  if (!slab || months < benefit.minServiceMonths) return { years, daysPerYear: 0, days: 0 };
  return { years, daysPerYear: slab.daysPerYear, days: slab.daysPerYear * years };
}

/** The gratuity owed on a date to someone who joined on another, in days of wages. */
export function bdGratuity(joinedOn: IsoDate, on: IsoDate) {
  return benefitDays(ruleOn(BD_RULES, 'separation.gratuity', on).value, joinedOn, on);
}

/** What a leaver is owed, in days of wages, with the sections that give it. */
export function bdSettlement(input: SettlementInput): SettlementDays {
  const on = input.lastWorkingDay;
  const months = bdServiceMonths(input.joinedOn, on);
  const required = bdNoticeDays(input.kind, { permanent: input.permanent, monthlyRated: true }, on);
  const served = Math.max(0, daysBetween(input.noticeDate, input.lastWorkingDay));
  const short = required === null ? 0 : Math.max(0, required - served);
  const notice = {
    requiredDays: required,
    servedDays: served,
    shortDays: short,
    owedBy:
      short === 0
        ? null
        : input.kind === 'resignation'
          ? ('employee' as const)
          : ('employer' as const),
  };

  const gratuityRule = ruleOn(BD_RULES, 'separation.gratuity', on).value;
  const gratuity =
    input.gratuity && input.permanent
      ? {
          code: 'GRATUITY' as const,
          label: gratuityRule.label,
          reference: gratuityRule.section,
          ...benefitDays(gratuityRule, input.joinedOn, on),
        }
      : null;
  const rule = ruleOn(BD_RULES, 'separation.benefits', on).value[input.kind];
  const benefit =
    rule && (input.permanent || !rule.permanentOnly)
      ? {
          code: 'SEPARATION_BENEFIT' as const,
          label: rule.label,
          reference: rule.section,
          ...benefitDays(
            input.kind === 'death' && input.workAccident && rule.workAccidentDaysPerYear
              ? {
                  ...rule,
                  slabs: rule.slabs.map((s) => ({
                    ...s,
                    daysPerYear: rule.workAccidentDaysPerYear!,
                  })),
                }
              : rule,
            input.joinedOn,
            on,
          ),
        }
      : null;

  const benefits: SettlementBenefitDays[] = [];
  const add = (b: SettlementBenefitDays | null) => b && b.days > 0 && benefits.push(b);
  if (!rule) {
    // Leaving without a statutory benefit (a contract ending): the scheme's gratuity alone.
    add(gratuity);
  } else if (rule.orGratuity) {
    // The Act's "or gratuity, whichever is higher": one of the two, never both.
    add((gratuity?.days ?? 0) > (benefit?.days ?? 0) ? gratuity : benefit);
  } else {
    add(benefit);
  }
  return {
    serviceYears: Math.floor(months / 12),
    serviceMonths: months,
    notice,
    leaveDays: Math.max(0, input.earnedLeaveDays),
    benefits,
  };
}
