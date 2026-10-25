import type { LegalReference, Rulebook } from '../engine.js';

// Bangladesh statutory rules. Every change here is a pull request reviewed against the
// gazette; rules marked needs_review must be confirmed by counsel before release.

/** Labour Act day counting differs by establishment (s.117). */
export const ESTABLISHMENT_KINDS = [
  'factory',
  'shop_commercial',
  'tea_plantation',
  'newspaper',
] as const;
export type EstablishmentKind = (typeof ESTABLISHMENT_KINDS)[number];

const BLA = (section: string): LegalReference => ({
  act: 'Bangladesh Labour Act 2006',
  section,
});
const ORDINANCE_2025 = (section: string): LegalReference => ({
  act: 'Bangladesh Labour (Amendment) Ordinance 2025 (Act No. 43 of 2026)',
  section,
});

/** In force from the Labour Act's commencement. */
const ACT_START = '2006-10-11';
/** The 2025 amendment ordinance was gazetted and took effect on 17 November 2025. */
const AMENDMENT_2025 = '2025-11-17';

export interface BdRules {
  'leave.casual.days_per_year': number;
  'leave.casual.carry_forward': boolean;
  'leave.sick.days_per_year': number;
  'leave.sick.carry_forward': boolean;
  'leave.annual.worked_days_per_leave_day': Record<EstablishmentKind, number>;
  'leave.annual.min_service_days': number;
  'leave.annual.carry_forward_max_days': number;
  'leave.maternity.days': number;
  'leave.maternity.min_service_days': number;
  'holidays.festival.days_per_year': number;
  'holidays.weekly.min_days': number;
  'leave.annual.paid_leave_counts_as_worked': boolean;
  'work.daily_hours': number;
  'work.daily_max_hours_with_overtime': number;
  'work.weekly_hours': number;
  'work.weekly_max_hours_with_overtime': number;
  'work.weekly_average_max_hours': number;
  'work.rest_intervals': readonly RestInterval[];
  'work.overtime_rate_multiplier': number;
  'lifecycle.probation_months': Record<ProbationCategory, number>;
  'lifecycle.probation_extension_months': number;
  'separation.resignation_notice_days': NoticeTable;
  'separation.termination_notice_days': NoticeTable;
  'separation.retrenchment_notice_days': number;
  'separation.retirement_age': number;
  'pay.payment_deadline_working_days': number;
  'pay.overtime_hours_per_month': number;
  'pay.absence_days_divisor': number;
  'pf.required_min_permanent_workers': number | null;
  'pf.min_service_months': number;
  'pf.contribution_percent_of_basic': { min: number; max: number };
  'bonus.festival_per_year': number;
  'bonus.festival_max_percent_of_basic': number;
  'bonus.festival_min_service_months': number;
  'separation.part_year_counts_after_months': number;
  'separation.gratuity': SeparationBenefit;
  'separation.benefits': Record<SeparationKindKey, SeparationBenefit | null>;
  'separation.dues_within_working_days': number;
  'separation.wage_basis': SeparationWageBasis;
  'wppf.shares': WppfShares;
}

/** How the participation and welfare funds share a company's net profit (Chapter XV). */
export interface WppfShares {
  /** Of net profit, set aside each year. */
  percentOfNetProfit: number;
  /** The set-aside split between the participation, welfare and foundation funds. */
  participation: number;
  welfare: number;
  foundation: number;
  /** The part of the participation fund paid to workers in cash, equally, as a fraction. */
  cash: { numerator: number; denominator: number };
  /** Months employed that make a person a beneficiary at all. */
  minEmploymentMonths: number;
  /** Months of service within the accounting year needed to share in that year. */
  minMonthsInYear: number;
}

type SeparationKindKey =
  | 'resignation'
  | 'termination'
  | 'dismissal'
  | 'discharge'
  | 'retrenchment'
  | 'retirement'
  | 'death'
  | 'contract_end';

/**
 * Days of wages for each year of service, at the rate of the slab the whole service falls in.
 * Slabs go by months served, as the Act words them ("up to three years", "more than three
 * years", "ten years or more").
 */
export interface SeparationBenefit {
  label: string;
  section: string;
  /** Months of service before anything is due. */
  minServiceMonths: number;
  slabs: readonly { fromMonths: number; daysPerYear: number }[];
  /** A part year longer than six months counts as a year (gratuity and the death benefit). */
  partYearCounts?: boolean;
  /** "Or gratuity, whichever is higher": one of the two. */
  orGratuity?: boolean;
  /** Only a permanent worker is owed it (termination and resignation). */
  permanentOnly?: boolean;
  /** For a death caused by an accident at or on the way to work. */
  workAccidentDaysPerYear?: number;
}

/** Which wage compensation and notice pay are counted on (s.14(3)). */
export type SeparationWageBasis = 'average_12_months' | 'last_month';

/** Clerical work has a longer probation than other work (s.4). */
export type ProbationCategory = 'clerical' | 'other';

/** Notice in days by tenure and wage period; s.26–27 distinguish monthly-rated workers. */
export interface NoticeTable {
  permanent_monthly: number;
  permanent_other: number;
  temporary_monthly: number;
  temporary_other: number;
}

/** Work beyond `overHours` in a day needs at least `minutes` of rest or meal interval. */
export interface RestInterval {
  overHours: number;
  minutes: number;
}

export const BD_RULES: Rulebook<BdRules> = {
  'leave.casual.days_per_year': {
    title: 'Casual leave with full wages, days per calendar year',
    versions: [{ from: ACT_START, value: 10, reference: BLA('115'), status: 'verified' }],
  },
  'leave.casual.carry_forward': {
    title: 'Unused casual leave carries forward',
    versions: [{ from: ACT_START, value: false, reference: BLA('115'), status: 'verified' }],
  },
  'leave.sick.days_per_year': {
    title: 'Sick leave with full wages, days per calendar year',
    versions: [
      {
        from: ACT_START,
        value: 14,
        reference: BLA('116'),
        status: 'verified',
        note: 'Granted on a registered medical practitioner’s certificate.',
      },
    ],
  },
  'leave.sick.carry_forward': {
    title: 'Unused sick leave carries forward',
    versions: [{ from: ACT_START, value: false, reference: BLA('116'), status: 'verified' }],
  },
  'leave.annual.worked_days_per_leave_day': {
    title: 'Annual leave: days worked to earn one day of leave',
    versions: [
      {
        from: ACT_START,
        value: { factory: 18, shop_commercial: 18, tea_plantation: 22, newspaper: 11 },
        reference: BLA('117'),
        status: 'verified',
        note: 'Adult workers. Adolescent workers earn at different rates (not modelled yet).',
      },
      {
        from: AMENDMENT_2025,
        value: { factory: 14, shop_commercial: 18, tea_plantation: 22, newspaper: 11 },
        reference: ORDINANCE_2025('117'),
        status: 'needs_review',
        note: 'Factory rate reported as one day per 14 days worked; confirm against the gazette.',
      },
    ],
  },
  'leave.annual.min_service_days': {
    title: 'Annual leave: continuous service before it can be taken, in days',
    versions: [{ from: ACT_START, value: 365, reference: BLA('117'), status: 'verified' }],
  },
  'leave.annual.carry_forward_max_days': {
    title: 'Annual leave: most unused days that can accumulate (adults)',
    versions: [{ from: ACT_START, value: 40, reference: BLA('117'), status: 'needs_review' }],
  },
  'leave.maternity.days': {
    title: 'Maternity leave with benefit, in days',
    versions: [
      {
        from: ACT_START,
        value: 112,
        reference: BLA('46'),
        status: 'verified',
        note: 'Eight weeks before and eight weeks after delivery.',
      },
      {
        from: AMENDMENT_2025,
        value: 120,
        reference: ORDINANCE_2025('46'),
        status: 'needs_review',
        note: 'Raised to 120 days by the 2025 amendment; confirm against the gazette.',
      },
    ],
  },
  'leave.maternity.min_service_days': {
    title: 'Maternity benefit: service before the expected delivery, in days',
    versions: [{ from: ACT_START, value: 180, reference: BLA('47'), status: 'verified' }],
  },
  'holidays.festival.days_per_year': {
    title: 'Festival holidays with wages, days per calendar year',
    versions: [
      { from: ACT_START, value: 11, reference: BLA('118'), status: 'verified' },
      {
        from: AMENDMENT_2025,
        value: 13,
        reference: ORDINANCE_2025('118'),
        status: 'needs_review',
        note: 'Raised from 11 to 13 by the 2025 amendment; confirm against the gazette.',
      },
    ],
  },
  'holidays.weekly.min_days': {
    title: 'Weekly holiday, days per week (factories)',
    versions: [
      {
        from: ACT_START,
        value: 1,
        reference: BLA('103'),
        status: 'verified',
        note: 'Shops and commercial establishments: one and a half days.',
      },
    ],
  },
  'leave.annual.paid_leave_counts_as_worked': {
    title: 'Annual leave: days on paid leave count as days worked',
    versions: [
      {
        from: ACT_START,
        value: true,
        reference: BLA('117'),
        status: 'needs_review',
        note: 'Whether paid leave and festival holidays count towards days worked must be confirmed by counsel.',
      },
    ],
  },
  'work.daily_hours': {
    title: 'Ordinary working hours in a day (adults)',
    versions: [{ from: ACT_START, value: 8, reference: BLA('100'), status: 'verified' }],
  },
  'work.daily_max_hours_with_overtime': {
    title: 'Most working hours in a day, including overtime (adults)',
    versions: [
      {
        from: ACT_START,
        value: 10,
        reference: BLA('100'),
        status: 'verified',
        note: 'Hours beyond 8 are overtime and paid under s.108.',
      },
    ],
  },
  'work.weekly_hours': {
    title: 'Ordinary working hours in a week (adults)',
    versions: [{ from: ACT_START, value: 48, reference: BLA('102'), status: 'verified' }],
  },
  'work.weekly_max_hours_with_overtime': {
    title: 'Most working hours in a week, including overtime (adults)',
    versions: [{ from: ACT_START, value: 60, reference: BLA('102'), status: 'verified' }],
  },
  'work.weekly_average_max_hours': {
    title: 'Average weekly hours over a year, including overtime (adults)',
    versions: [{ from: ACT_START, value: 56, reference: BLA('102'), status: 'needs_review' }],
  },
  'work.rest_intervals': {
    title: 'Rest or meal interval needed for a day’s work',
    versions: [
      {
        from: ACT_START,
        value: [
          { overHours: 5, minutes: 30 },
          { overHours: 6, minutes: 60 },
        ],
        reference: BLA('101'),
        status: 'verified',
        note: 'Over 8 hours: one 1-hour interval or two half-hour intervals.',
      },
    ],
  },
  'work.overtime_rate_multiplier': {
    title: 'Overtime allowance, times the ordinary hourly rate',
    versions: [
      {
        from: ACT_START,
        value: 2,
        reference: BLA('108'),
        status: 'verified',
        note: 'Ordinary rate: basic wage plus dearness allowance and any ad hoc or interim wage.',
      },
    ],
  },
  'lifecycle.probation_months': {
    title: 'Probation period, in months',
    versions: [
      {
        from: ACT_START,
        value: { clerical: 6, other: 3 },
        reference: BLA('4'),
        status: 'verified',
        note: 'A worker who keeps working after probation without a decision is deemed permanent.',
      },
    ],
  },
  'lifecycle.probation_extension_months': {
    title: 'Probation extension for a skilled worker, in months',
    versions: [{ from: ACT_START, value: 3, reference: BLA('4'), status: 'verified' }],
  },
  'separation.resignation_notice_days': {
    title: 'Notice a worker gives to resign, in days',
    versions: [
      {
        from: ACT_START,
        value: {
          permanent_monthly: 60,
          permanent_other: 60,
          temporary_monthly: 30,
          temporary_other: 14,
        },
        reference: BLA('27'),
        status: 'needs_review',
        note: 'Without notice, wages for the notice period may be deducted (s.27(3)). Unchanged by the 2025/26 amendments.',
      },
    ],
  },
  'separation.termination_notice_days': {
    title: 'Notice an employer gives to terminate (other than for misconduct), in days',
    versions: [
      {
        from: ACT_START,
        value: {
          permanent_monthly: 120,
          permanent_other: 60,
          temporary_monthly: 30,
          temporary_other: 14,
        },
        reference: BLA('26'),
        status: 'needs_review',
        note: 'Or wages in lieu of notice (s.26(3)). Unchanged by the 2025/26 amendments.',
      },
    ],
  },
  'separation.retrenchment_notice_days': {
    title: 'Notice before retrenchment, in days',
    versions: [
      {
        from: ACT_START,
        value: 30,
        reference: BLA('20'),
        status: 'verified',
        note: 'Or wages in lieu of notice; the inspector must be told.',
      },
    ],
  },
  'separation.retirement_age': {
    title: 'Retirement age',
    versions: [{ from: ACT_START, value: 60, reference: BLA('28'), status: 'verified' }],
  },
  'pay.payment_deadline_working_days': {
    title: 'Wages paid before the expiry of this working day after the wage period',
    versions: [{ from: ACT_START, value: 7, reference: BLA('123'), status: 'verified' }],
  },
  'pay.overtime_hours_per_month': {
    title: 'Hours in a month for the hourly overtime rate (52 ÷ 12 × 48)',
    versions: [
      {
        from: '2015-09-15',
        value: 208,
        reference: { act: 'Bangladesh Labour Rules 2015', section: '102' },
        status: 'needs_review',
        note:
          'Monthly basic + dearness allowance + ad hoc pay × 2 × hours ÷ 208. Secondary sources ' +
          'cite rule 102; confirm the rule and its wording against the gazetted Rules.',
      },
    ],
  },
  'pay.absence_days_divisor': {
    title: 'Days a monthly wage is divided by for an absence deduction',
    versions: [
      {
        from: ACT_START,
        value: 30,
        reference: BLA('126'),
        status: 'needs_review',
        note: 'The Act caps the deduction at the pay for the absent period; dividing by 30 is practice.',
      },
    ],
  },
  'pf.required_min_permanent_workers': {
    title: 'Permanent workers from which an establishment must have a provident fund',
    versions: [
      {
        from: ACT_START,
        value: null,
        reference: BLA('264'),
        status: 'needs_review',
        note: 'Before the 2025 amendment a fund was due within six months of a written demand by three quarters of the workers.',
      },
      {
        from: AMENDMENT_2025,
        value: 100,
        reference: ORDINANCE_2025('264'),
        status: 'needs_review',
        note:
          'Mandatory from 100 permanent workers; joining the government Progoti pension, half ' +
          'paid by the employer, is an alternative.',
      },
      {
        from: '2026-04-10',
        value: 100,
        reference: { act: 'Bangladesh Labour (Amendment) Act 2026 (Act No. 43)', section: '264' },
        status: 'needs_review',
        note:
          'From 100 permanent workers only when two thirds of the workers ask in writing; ' +
          's.264(1) is back to "may". Progoti remains an alternative. 7–8% of basic after a year.',
      },
    ],
  },
  'pf.min_service_months': {
    title: 'Service before a permanent worker joins the provident fund, in months',
    versions: [{ from: ACT_START, value: 12, reference: BLA('264'), status: 'needs_review' }],
  },
  'pf.contribution_percent_of_basic': {
    title: "A member's contribution, in percent of basic wages; the employer pays the same",
    versions: [
      { from: ACT_START, value: { min: 7, max: 8 }, reference: BLA('264'), status: 'needs_review' },
    ],
  },
  'bonus.festival_per_year': {
    title: 'Festival bonuses a year for workers with a year of service',
    versions: [
      {
        from: '2015-09-15',
        value: 2,
        reference: { act: 'Bangladesh Labour Rules 2015', section: '111' },
        status: 'needs_review',
      },
    ],
  },
  'bonus.festival_max_percent_of_basic': {
    title: 'Each festival bonus at most this much of a month’s basic',
    versions: [
      {
        from: '2015-09-15',
        value: 100,
        reference: { act: 'Bangladesh Labour Rules 2015', section: '111' },
        status: 'needs_review',
      },
    ],
  },
  'bonus.festival_min_service_months': {
    title: 'Continuous service before festival bonuses are due, in months',
    versions: [
      {
        from: '2015-09-15',
        value: 12,
        reference: { act: 'Bangladesh Labour Rules 2015', section: '111' },
        status: 'needs_review',
      },
    ],
  },
  'separation.part_year_counts_after_months': {
    title: 'A part year of service counts as a year when longer than this many months',
    versions: [
      {
        from: ACT_START,
        value: 6,
        reference: BLA('2'),
        status: 'needs_review',
        note: 'Clause (10), on counting service for gratuity.',
      },
    ],
  },
  'separation.gratuity': {
    title: 'Gratuity: days of wages for each completed year of service',
    versions: [
      {
        from: ACT_START,
        value: {
          label: 'Gratuity',
          section: '2(10)',
          minServiceMonths: 0,
          slabs: [
            { fromMonths: 0, daysPerYear: 30 },
            { fromMonths: 121, daysPerYear: 45 },
          ],
          partYearCounts: true,
        },
        reference: BLA('2'),
        status: 'needs_review',
        note:
          'Clause (10), not changed in 2025/26: 30 days at the last wage for each year or part ' +
          'over six months, 45 once service exceeds ten years. Only payable where the employer ' +
          'has a scheme, contract or service rule ("gratuity, if payable").',
      },
    ],
  },
  'separation.benefits': {
    title: 'What each kind of separation pays, in days of wages per completed year',
    versions: [
      {
        from: ACT_START,
        value: {
          resignation: {
            label: 'Resignation benefit',
            section: '27(4)',
            minServiceMonths: 60,
            slabs: [
              { fromMonths: 60, daysPerYear: 14 },
              { fromMonths: 120, daysPerYear: 30 },
            ],
            orGratuity: true,
            permanentOnly: true,
          },
          termination: {
            label: 'Termination compensation',
            section: '26(4)',
            minServiceMonths: 0,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            orGratuity: true,
            permanentOnly: true,
          },
          retrenchment: {
            label: 'Retrenchment compensation',
            section: '20(2)',
            minServiceMonths: 12,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            orGratuity: true,
          },
          discharge: {
            label: 'Discharge compensation',
            section: '22(2)',
            minServiceMonths: 12,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            orGratuity: true,
          },
          dismissal: {
            label: 'Dismissal compensation',
            section: '23(3)',
            minServiceMonths: 12,
            slabs: [{ fromMonths: 0, daysPerYear: 15 }],
          },
          retirement: {
            label: 'Retirement benefit',
            section: '28',
            minServiceMonths: 0,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            orGratuity: true,
          },
          contract_end: null,
          death: {
            label: 'Death benefit',
            section: '19',
            minServiceMonths: 25,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            partYearCounts: true,
            orGratuity: true,
            workAccidentDaysPerYear: 45,
          },
        },
        reference: BLA('19'),
        status: 'needs_review',
        note:
          'Sections 19 (death, after more than two years), 20 (retrenchment), 22 (discharge), ' +
          '23 (dismissal, other than for theft, fraud or riot under s.23(4)(b) and (g)), 26 ' +
          '(termination of a permanent worker), 27 (resignation, from five years) and 28 ' +
          '(retirement, as s.26(4)). Nominees receive the death benefit.',
      },
      {
        from: AMENDMENT_2025,
        value: {
          resignation: {
            label: 'Resignation benefit',
            section: '27(4)',
            minServiceMonths: 0,
            slabs: [
              { fromMonths: 0, daysPerYear: 7 },
              { fromMonths: 37, daysPerYear: 15 },
              { fromMonths: 120, daysPerYear: 30 },
            ],
            orGratuity: true,
            permanentOnly: true,
          },
          termination: {
            label: 'Termination compensation',
            section: '26(4)',
            minServiceMonths: 0,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            orGratuity: true,
            permanentOnly: true,
          },
          retrenchment: {
            label: 'Retrenchment compensation',
            section: '20(2)',
            minServiceMonths: 12,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            orGratuity: true,
          },
          discharge: {
            label: 'Discharge compensation',
            section: '22(2)',
            minServiceMonths: 12,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            orGratuity: true,
          },
          dismissal: {
            label: 'Dismissal compensation',
            section: '23(3)',
            minServiceMonths: 12,
            slabs: [{ fromMonths: 0, daysPerYear: 15 }],
          },
          retirement: {
            label: 'Retirement benefit',
            section: '28',
            minServiceMonths: 0,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            orGratuity: true,
          },
          contract_end: null,
          death: {
            label: 'Death benefit',
            section: '19',
            minServiceMonths: 13,
            slabs: [{ fromMonths: 0, daysPerYear: 30 }],
            partYearCounts: true,
            orGratuity: true,
            workAccidentDaysPerYear: 45,
          },
        },
        reference: ORDINANCE_2025('13'),
        status: 'needs_review',
        note:
          'Section 13 substituted s.27(4): 7 days a year for service up to three years, 15 for ' +
          'more than three and under ten, 30 from ten (or gratuity). Section 11 lowered the ' +
          "death benefit's service to more than one year; s.12 extended s.23(3) to dismissed " +
          'workers. Act 43 of 2026 re-enacted the same text. Counsel to confirm the 7-day tier ' +
          'starts from the first completed year.',
      },
    ],
  },
  'separation.wage_basis': {
    title: 'The wage compensation and notice pay are counted on',
    versions: [
      {
        from: ACT_START,
        value: 'average_12_months',
        reference: BLA('14'),
        status: 'needs_review',
        note: 'Subsection (3): the average basic, dearness and ad hoc wages of the last 12 months.',
      },
      {
        from: AMENDMENT_2025,
        value: 'last_month',
        reference: ORDINANCE_2025('8'),
        status: 'needs_review',
        note: "Substituted s.14(3): the last month's basic, dearness and ad hoc wages.",
      },
    ],
  },
  'separation.dues_within_working_days': {
    title: 'Final dues paid within this many working days of leaving',
    versions: [{ from: ACT_START, value: 30, reference: BLA('30'), status: 'needs_review' }],
  },
  'wppf.shares': {
    title: "Workers' participation fund: the share of net profit and how it is paid",
    versions: [
      {
        from: ACT_START,
        value: {
          percentOfNetProfit: 5,
          participation: 80,
          welfare: 10,
          foundation: 10,
          cash: { numerator: 2, denominator: 3 },
          minEmploymentMonths: 9,
          minMonthsInYear: 6,
        },
        reference: BLA('234'),
        status: 'needs_review',
        note:
          'Companies with paid-up capital of Tk 1 crore or fixed assets of Tk 2 crore (s.232): ' +
          '5% of net profit within nine months of the year end, 80:10:10 (s.234). Two thirds of ' +
          'the participation fund paid equally in cash, one third invested (s.242). Beneficiaries ' +
          'of any rank but owners and directors, employed nine months, six in the year (s.233); ' +
          'dismissed workers forfeit their share.',
      },
      {
        from: AMENDMENT_2025,
        value: {
          percentOfNetProfit: 5,
          participation: 80,
          welfare: 10,
          foundation: 10,
          cash: { numerator: 1, denominator: 1 },
          minEmploymentMonths: 9,
          minMonthsInYear: 6,
        },
        reference: ORDINANCE_2025('55'),
        status: 'needs_review',
        note: 'Substituted s.242(1): the whole participation fund is paid equally to beneficiaries.',
      },
    ],
  },
};
