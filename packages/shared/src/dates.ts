// Calendar dates travel as ISO strings (YYYY-MM-DD). Arithmetic happens in UTC so a date
// never shifts with the server's time zone.

export type IsoDate = string;

/** Today's calendar date in a time zone (Bangladesh by default). */
export function todayIn(timeZone = 'Asia/Dhaka', now = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Completed years between a birth date and another date. */
export function ageOn(dateOfBirth: IsoDate, on: IsoDate): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number) as [number, number, number];
  const [y, m, d] = on.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
