// Hours are worked out in hundredths, so a month's sums and shares are exact.

/** '7.50' → 750. */
export const centi = (hours: string | number) => Math.round(Number(hours) * 100);

/** 750 → '7.50'. */
export const hoursText = (hundredths: number) => (hundredths / 100).toFixed(2);

/**
 * Whole units shared out in proportion to weights, the leftover going to the largest
 * remainders, so the parts add up to exactly `units`.
 */
function apportion(units: number, weights: number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0 || units <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (units * w) / total);
  const parts = exact.map(Math.floor);
  let left = units - parts.reduce((sum, p) => sum + p, 0);
  const order = exact
    .map((e, i) => ({ i, rest: e - Math.floor(e) }))
    .toSorted((a, b) => b.rest - a.rest);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i]! += 1;
    left -= 1;
  }
  return parts;
}

/** Each part's share of the whole as a percentage to two decimals, adding up to 100.00. */
export function percentages(hundredths: number[]): string[] {
  return apportion(10_000, hundredths).map((bp) => (bp / 100).toFixed(2));
}

/**
 * A day's worked hours split across the projects a person is allocated to, by their planned
 * shares; what the shares leave (they add up to at most 100) is work not charged to a project.
 */
export function splitHours(
  hundredths: number,
  allocations: { projectId: string; percent: string }[],
): { projectId: string | null; hundredths: number }[] {
  const weights = allocations.map((a) => Math.round(Number(a.percent) * 100));
  const planned = Math.min(
    weights.reduce((sum, w) => sum + w, 0),
    10_000,
  );
  const charged = Math.round((hundredths * planned) / 10_000);
  const parts = apportion(charged, weights);
  const out: { projectId: string | null; hundredths: number }[] = allocations
    .map((a, i) => ({ projectId: a.projectId as string | null, hundredths: parts[i]! }))
    .filter((p) => p.hundredths > 0);
  if (hundredths > charged) out.push({ projectId: null, hundredths: hundredths - charged });
  return out;
}
