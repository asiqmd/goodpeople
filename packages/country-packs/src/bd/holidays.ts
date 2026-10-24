import type { IsoDate } from '../engine.js';

export type HolidayKind = 'public' | 'festival' | 'optional' | 'company';

export interface HolidayTemplate {
  date: IsoDate;
  name: string;
  nameBn: string;
  kind: HolidayKind;
  /** Lunar and calendar-dependent dates are estimates until the government announces them. */
  tentative: boolean;
}

const fixed = (year: number): HolidayTemplate[] => [
  {
    date: `${year}-02-21`,
    name: 'Shaheed Day and International Mother Language Day',
    nameBn: 'শহীদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস',
    kind: 'public',
    tentative: false,
  },
  {
    date: `${year}-03-26`,
    name: 'Independence Day',
    nameBn: 'স্বাধীনতা ও জাতীয় দিবস',
    kind: 'public',
    tentative: false,
  },
  {
    date: `${year}-04-14`,
    name: 'Bengali New Year (Pohela Boishakh)',
    nameBn: 'বাংলা নববর্ষ (পহেলা বৈশাখ)',
    kind: 'public',
    tentative: false,
  },
  { date: `${year}-05-01`, name: 'May Day', nameBn: 'মে দিবস', kind: 'public', tentative: false },
  {
    date: `${year}-12-16`,
    name: 'Victory Day',
    nameBn: 'বিজয় দিবস',
    kind: 'public',
    tentative: false,
  },
  {
    date: `${year}-12-25`,
    name: 'Christmas Day',
    nameBn: 'যিশুখ্রিস্টের জন্মদিন (বড়দিন)',
    kind: 'public',
    tentative: false,
  },
];

const estimate = (
  date: IsoDate,
  name: string,
  nameBn: string,
  kind: HolidayKind = 'public',
): HolidayTemplate => ({
  date,
  name,
  nameBn,
  kind,
  tentative: true,
});

/** Three festival days around an Eid: the day before, the day itself and the day after. */
const eid = (dates: [IsoDate, IsoDate, IsoDate], name: string, nameBn: string): HolidayTemplate[] =>
  dates.map((date) => estimate(date, name, nameBn, 'festival'));

/**
 * Estimated lunar and calendar-dependent holidays. Every one is tentative: the government
 * announces exact dates each year, and HR confirms them in the calendar.
 */
const ESTIMATED: Record<number, HolidayTemplate[]> = {
  2026: [
    ...eid(['2026-03-19', '2026-03-20', '2026-03-21'], 'Eid-ul-Fitr', 'ঈদুল ফিতর'),
    ...eid(['2026-05-26', '2026-05-27', '2026-05-28'], 'Eid-ul-Adha', 'ঈদুল আজহা'),
  ],
  2027: [
    estimate('2027-01-23', 'Shab-e-Barat', 'শবে বরাত'),
    estimate('2027-03-06', 'Shab-e-Qadr', 'শবে কদর'),
    ...eid(['2027-03-09', '2027-03-10', '2027-03-11'], 'Eid-ul-Fitr', 'ঈদুল ফিতর'),
    ...eid(['2027-05-16', '2027-05-17', '2027-05-18'], 'Eid-ul-Adha', 'ঈদুল আজহা'),
    estimate('2027-05-20', 'Buddha Purnima', 'বুদ্ধ পূর্ণিমা'),
    estimate('2027-06-16', 'Ashura', 'আশুরা'),
    estimate('2027-08-15', 'Eid-e-Miladunnabi', 'ঈদে মিলাদুন্নবী'),
    estimate('2027-08-25', 'Janmashtami', 'জন্মাষ্টমী'),
    estimate('2027-10-09', 'Durga Puja (Bijoya Dashami)', 'দুর্গাপূজা (বিজয়া দশমী)'),
  ],
};

/** Years the template has estimates for. Fixed national days are known for any year. */
export const BD_HOLIDAY_TEMPLATE_YEARS = Object.keys(ESTIMATED).map(Number);

export function bdHolidayTemplate(year: number): HolidayTemplate[] {
  return [...fixed(year), ...(ESTIMATED[year] ?? [])].toSorted((a, b) =>
    a.date.localeCompare(b.date),
  );
}
