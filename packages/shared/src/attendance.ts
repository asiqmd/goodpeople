import { addDays, type IsoDate } from './dates.js';

export const PUNCH_SOURCES = ['device', 'web', 'mobile', 'manual', 'regularization'] as const;
export type PunchSource = (typeof PUNCH_SOURCES)[number];

/** How old a punch the app recorded offline may be when it finally reaches the server. */
export const OFFLINE_PUNCH_MAX_HOURS = 72;

export const PUNCH_DIRECTIONS = ['in', 'out', 'unknown'] as const;
export type PunchDirection = (typeof PUNCH_DIRECTIONS)[number];

export const DEVICE_VENDORS = ['zkteco', 'hikvision', 'other'] as const;
export type DeviceVendor = (typeof DEVICE_VENDORS)[number];

export const DAY_TYPES = ['working', 'weekly_off', 'holiday'] as const;
export type DayType = (typeof DAY_TYPES)[number];

/**
 * pending: the day is not over yet (or is in the future). missing_punch: only one punch, so
 * the hours are unknown until the day is regularized.
 */
export const ATTENDANCE_STATUSES = [
  'present',
  'half_day',
  'absent',
  'on_leave',
  'missing_punch',
  'off',
  'pending',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_FLAGS = [
  'late',
  'early_out',
  'over_daily_limit',
  'regularized',
  'on_duty',
  'outside_geofence',
] as const;
export type AttendanceFlag = (typeof ATTENDANCE_FLAGS)[number];

/** missed_punch: add the in or out time the device missed. on_duty: official work elsewhere. */
export const REGULARIZATION_KINDS = ['missed_punch', 'on_duty'] as const;
export type RegularizationKind = (typeof REGULARIZATION_KINDS)[number];

export const REGULARIZATION_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type RegularizationStatus = (typeof REGULARIZATION_STATUSES)[number];

/** Punching from the web or mobile app: off, only inside the location's geofence, or anywhere. */
export const SELF_PUNCH_MODES = ['off', 'geofenced', 'anywhere'] as const;
export type SelfPunchMode = (typeof SELF_PUNCH_MODES)[number];

/** What an approval step decides. */
export const APPROVAL_SUBJECTS = [
  'leave_request',
  'regularization',
  'separation',
  'compensation',
  'payroll_run',
  'loan',
  'pay_batch',
  'timesheet',
  /** Phase 4 M1: a position to fill, and an offer above its budget. */
  'job_opening',
  'offer',
] as const;
export type ApprovalSubject = (typeof APPROVAL_SUBJECTS)[number];

// ── Time zones ───────────────────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(at: Date, timeZone: string) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, format);
  }
  const parts: Record<string, string> = {};
  for (const p of format.formatToParts(at)) parts[p.type] = p.value;
  return parts as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;
}

/** How far a time zone is ahead of UTC at an instant, in minutes (Asia/Dhaka: 360). */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const p = wallClock(at, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant a wall-clock date and time (HH:MM) happen in a time zone. */
export function zonedInstant(date: IsoDate, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsets = new Set(
    [-36, 0, 36].map((hours) => zoneOffsetMinutes(timeZone, new Date(guess + hours * 3600000))),
  );
  const matches = [...offsets]
    .map((offset) => new Date(guess - offset * 60000))
    .filter((candidate) => {
      const parts = localParts(candidate, timeZone);
      return parts.date === date && parts.time === time.slice(0, 5);
    });
  if (matches.length !== 1)
    throw new Error(matches.length ? 'ambiguous_local_time' : 'nonexistent_local_time');
  return matches[0]!;
}

/** The wall-clock date and time (HH:MM) of an instant in a time zone. */
export function localParts(at: Date, timeZone: string): { date: IsoDate; time: string } {
  const p = wallClock(at, timeZone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// ── Geofence ─────────────────────────────────────────────────────────────────

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** GPS accuracy forgiven when checking a geofence, at most this many metres. */
export const GEOFENCE_TOLERANCE_M = 50;

// ── Shifts and days ──────────────────────────────────────────────────────────

export interface ShiftSchedule {
  /** HH:MM local time. An end at or before the start runs past midnight (night shift). */
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  earlyOutGraceMinutes: number;
  /** Worked minutes needed for a half day and a full day. */
  halfDayMinutes: number;
  fullDayMinutes: number;
  overtimeEnabled: boolean;
  /** Overtime below this is ignored; the rest is rounded down to whole blocks. */
  overtimeMinMinutes: number;
  overtimeRoundingMinutes: number;
}

export const minutesOfDay = (time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** Minutes from a shift's start to its end, intervals included. */
export function shiftSpanMinutes(startTime: string, endTime: string): number {
  const span = minutesOfDay(endTime) - minutesOfDay(startTime);
  return span <= 0 ? span + 1440 : span;
}

export const spansMidnight = (startTime: string, endTime: string) =>
  minutesOfDay(endTime) <= minutesOfDay(startTime);

/** When a shift starting on `date` begins and ends. */
export function shiftWindow(
  date: IsoDate,
  shift: Pick<ShiftSchedule, 'startTime' | 'endTime'>,
  timeZone: string,
): { start: Date; end: Date } {
  const endDate = spansMidnight(shift.startTime, shift.endTime) ? addDays(date, 1) : date;
  return {
    start: zonedInstant(date, shift.startTime, timeZone),
    end: zonedInstant(endDate, shift.endTime, timeZone),
  };
}

/** How early before a shift a punch still counts as arriving for it. */
const EARLY_ARRIVAL_MS = 4 * 60 * 60_000;

/**
 * The instant one day's punches stop and the next day's begin: up to four hours before the
 * next shift, but never before the midpoint of the gap, so a night shift's late out-punch is
 * not mistaken for the next morning's arrival.
 */
export function dayBoundary(end: Date, nextStart: Date): Date {
  const midpoint = (end.getTime() + nextStart.getTime()) / 2;
  return new Date(Math.max(nextStart.getTime() - EARLY_ARRIVAL_MS, midpoint));
}

export type LeaveCover = { days: 1 } | { days: 0.5; half: 'first_half' | 'second_half' };

export interface DayInput {
  shift: ShiftSchedule;
  /** The scheduled shift on this date. */
  window: { start: Date; end: Date };
  /** After this instant punches belong to the next day, and this day is final. */
  closesAt: Date;
  dayType: DayType;
  /** Approved leave covering the day. */
  leave: LeaveCover | null;
  /** An approved on-duty regularization: counts as a full scheduled day. */
  onDuty: boolean;
  /** Punches attributed to this day. */
  punches: readonly Date[];
  now: Date;
  /** Most minutes allowed in a day, overtime included (Labour Act s.100). */
  dailyMaxMinutes: number;
}

export interface DayResult {
  status: AttendanceStatus;
  firstIn: Date | null;
  lastOut: Date | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  flags: AttendanceFlag[];
}

const minutes = (ms: number) => Math.floor(ms / 60_000);

/**
 * One employee's day, from the first punch to the last. The shift's break is taken out of
 * anything longer than five hours (s.101); overtime is the time worked after the shift's end
 * beyond the scheduled hours, and on weekly offs and holidays all of the time worked.
 */
export function evaluateDay(input: DayInput): DayResult {
  const { shift, window, leave, dayType } = input;
  const open = input.now < input.closesAt;
  const scheduled = minutes(window.end.getTime() - window.start.getTime()) - shift.breakMinutes;
  const punches = input.punches.toSorted((a, b) => a.getTime() - b.getTime());
  const result: DayResult = {
    status: 'pending',
    firstIn: punches[0] ?? null,
    lastOut: null,
    workedMinutes: 0,
    lateMinutes: 0,
    earlyOutMinutes: 0,
    overtimeMinutes: 0,
    flags: [],
  };

  if (leave?.days === 1) return { ...result, status: 'on_leave' };

  let firstIn: Date;
  let lastOut: Date;
  if (input.onDuty) {
    [firstIn, lastOut] = [window.start, window.end];
    result.flags.push('on_duty');
  } else {
    const last = punches.at(-1);
    if (!punches[0] || !last || minutes(last.getTime() - punches[0].getTime()) < 1) {
      // A day off nobody works is off, today and in the future too.
      if (!punches[0] && dayType !== 'working') return { ...result, status: 'off' };
      if (open) return result;
      if (!punches[0]) return { ...result, status: 'absent' };
      return { ...result, status: 'missing_punch' };
    }
    [firstIn, lastOut] = [punches[0], last];
  }

  const span = minutes(lastOut.getTime() - firstIn.getTime());
  const worked = span - Math.min(shift.breakMinutes, Math.max(0, span - 300));
  Object.assign(result, { firstIn, lastOut, workedMinutes: worked });

  if (dayType === 'working' && !input.onDuty) {
    // Half-day leave moves the expected arrival or departure to the middle of the shift.
    const middle = new Date((window.start.getTime() + window.end.getTime()) / 2);
    const expectedIn = leave?.days === 0.5 && leave.half === 'first_half' ? middle : window.start;
    const expectedOut = leave?.days === 0.5 && leave.half === 'second_half' ? middle : window.end;
    const lateBy = minutes(firstIn.getTime() - expectedIn.getTime());
    if (lateBy > shift.lateGraceMinutes) result.lateMinutes = lateBy;
    const earlyBy = minutes(expectedOut.getTime() - lastOut.getTime());
    if (earlyBy > shift.earlyOutGraceMinutes) result.earlyOutMinutes = earlyBy;
  }

  if (shift.overtimeEnabled) {
    const raw =
      dayType === 'working'
        ? Math.max(
            0,
            Math.min(worked - scheduled, minutes(lastOut.getTime() - window.end.getTime())),
          )
        : worked;
    const block = Math.max(1, shift.overtimeRoundingMinutes);
    result.overtimeMinutes = raw >= shift.overtimeMinMinutes ? Math.floor(raw / block) * block : 0;
  }

  const share = leave ? 0.5 : 1;
  if (open) result.status = 'pending';
  else if (dayType !== 'working' || worked >= shift.fullDayMinutes * share) {
    result.status = 'present';
  } else if (worked >= shift.halfDayMinutes * share) result.status = 'half_day';
  else result.status = 'absent';

  if (result.lateMinutes) result.flags.push('late');
  if (result.earlyOutMinutes) result.flags.push('early_out');
  if (worked > input.dailyMaxMinutes) result.flags.push('over_daily_limit');
  return result;
}
