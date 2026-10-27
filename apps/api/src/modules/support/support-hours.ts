import { SUPPORT_HOURS } from '@gp/shared';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Dhaka is UTC+6 all year (no daylight saving), so a fixed shift gives its wall clock. */
const DHAKA_OFFSET = 6 * HOUR;
const WORKING_DAYS: readonly number[] = SUPPORT_HOURS.days;

/**
 * The moment `hours` of support hours after `from`: only Sunday to Thursday, 9:00 to 18:00 in
 * Dhaka count. Time outside them (nights, Friday and Saturday) passes without counting, so a
 * ticket opened on Thursday evening is due on Sunday.
 */
export function addSupportHours(from: Date, hours: number): Date {
  let remaining = hours * HOUR;
  // Milliseconds of Dhaka wall-clock time, read with the UTC getters.
  let local = from.getTime() + DHAKA_OFFSET;
  for (;;) {
    const dayStart = local - (((local % DAY) + DAY) % DAY);
    const opens = dayStart + SUPPORT_HOURS.startHour * HOUR;
    const closes = dayStart + SUPPORT_HOURS.endHour * HOUR;
    if (WORKING_DAYS.includes(new Date(dayStart).getUTCDay()) && local < closes) {
      local = Math.max(local, opens);
      if (remaining <= closes - local) return new Date(local + remaining - DHAKA_OFFSET);
      remaining -= closes - local;
    }
    local = dayStart + DAY;
  }
}
