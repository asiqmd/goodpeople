/** A clock reading without a zone, as a device shows it. */
export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Throws a RangeError for a zone name the runtime does not know. */
export function assertTimeZone(timeZone: string): void {
  formatter(timeZone);
}

export function isValidWallTime(w: WallTime): boolean {
  if (w.month < 1 || w.month > 12 || w.day < 1) return false;
  if (w.hour > 23 || w.minute > 59 || w.second > 59) return false;
  const daysInMonth = new Date(Date.UTC(w.year, w.month, 0)).getUTCDate();
  return w.day <= daysInMonth;
}

function utcOfWallTime(w: WallTime): number {
  const d = new Date(0);
  d.setUTCFullYear(w.year, w.month - 1, w.day);
  d.setUTCHours(w.hour, w.minute, w.second, 0);
  return d.getTime();
}

export function wallTimeAt(epochMs: number, timeZone: string): WallTime {
  const out: WallTime = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of formatter(timeZone).formatToParts(new Date(epochMs))) {
    if (part.type in out) out[part.type as keyof WallTime] = Number(part.value);
  }
  return out;
}

/** Minutes east of UTC that `timeZone` is at an instant (Asia/Dhaka: 360). */
export function offsetMinutesAt(epochMs: number, timeZone: string): number {
  const wholeSecond = Math.floor(epochMs / 1000) * 1000;
  return Math.round((utcOfWallTime(wallTimeAt(wholeSecond, timeZone)) - wholeSecond) / MINUTE);
}

/**
 * The instant a wall-clock reading in `timeZone` refers to. A reading that happens twice (clocks
 * going back) resolves to the first occurrence; one that never happens (clocks going forward) is
 * moved forward by the gap. This matches Temporal's "compatible" disambiguation.
 */
export function wallTimeToEpoch(w: WallTime, timeZone: string): number {
  const asUtc = utcOfWallTime(w);
  // At most one transition within a day either side, so the true offset is one of these two.
  const before = offsetMinutesAt(asUtc - DAY, timeZone) * MINUTE;
  const after = offsetMinutesAt(asUtc + DAY, timeZone) * MINUTE;
  const matches = [asUtc - before, asUtc - after]
    .filter((t) => t + offsetMinutesAt(t, timeZone) * MINUTE === asUtc)
    .toSorted((a, b) => a - b);
  return matches[0] ?? asUtc - before;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** ISO 8601 to the second with the zone's offset at that instant, e.g. 2026-10-24T08:59:12+06:00. */
export function formatInZone(epochMs: number, timeZone: string): string {
  const w = wallTimeAt(epochMs, timeZone);
  const offset = offsetMinutesAt(epochMs, timeZone);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return (
    `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Parses an ISO 8601 date-time. One without an offset is read as wall time in `timeZone`.
 * Returns null for anything that is not a real date-time.
 */
export function parseDateTime(value: string, timeZone: string): number | null {
  const m = ISO_PATTERN.exec(value.trim());
  if (!m) return null;
  const w: WallTime = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
  };
  if (!isValidWallTime(w)) return null;
  const zone = m[7];
  if (!zone) return wallTimeToEpoch(w, timeZone);
  if (zone.toUpperCase() === 'Z') return utcOfWallTime(w);
  const digits = zone.slice(1).replace(':', '');
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2) || 0);
  if (hours > 14 || minutes > 59) return null;
  const offset = (zone.startsWith('-') ? -1 : 1) * (hours * 60 + minutes);
  return utcOfWallTime(w) - offset * MINUTE;
}
