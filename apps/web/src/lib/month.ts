/** Month helpers for pages that take ?month=YYYY-MM. */

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-10" → its first and last dates. */
export function monthRange(month: string): { from: string; to: string } {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from: `${month}-01`, to: end.toISOString().slice(0, 10) };
}

/** The month before or after "YYYY-MM". */
export function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}
