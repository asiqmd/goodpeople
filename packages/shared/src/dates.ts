// Calendar dates travel as ISO strings (YYYY-MM-DD). Arithmetic happens in UTC so a date
// never shifts with the server's time zone.

export type IsoDate = string;

let defaultZone = () => 'Asia/Dhaka';
/** The API supplies an async-context resolver; pure consumers retain the explicit legacy BD default. */
export function setBusinessZoneResolver(resolver: () => string) {
  defaultZone = resolver;
}

/** Today's calendar date in a time zone (Bangladesh by default). */
export function todayIn(timeZone: string | undefined = undefined, now = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone ?? defaultZone() }).format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The same day `months` later, or the month's last day when it is shorter (31 Jan + 1 → 28 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Completed years between a birth date and another date. */
export function ageOn(dateOfBirth: IsoDate, on: IsoDate): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number) as [number, number, number];
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Days from one date to another, counting both: 1 Oct to 31 Oct is 31. */
export function daysInclusive(from: IsoDate, to: IsoDate): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}

/** The first and last day of a month given as YYYY-MM. */
export function monthBounds(month: string): { start: IsoDate; end: IsoDate } {
  const start = `${month}-01`;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { start, end: addDays(next.toISOString().slice(0, 10), -1) };
}
