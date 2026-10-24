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
};
