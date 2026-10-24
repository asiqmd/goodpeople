import { Injectable } from '@nestjs/common';
import {
  holidayCalendars,
  holidays,
  jobAssignments,
  locations,
  rosterEntries,
  shiftAssignments,
  shifts,
  type Tx,
} from '@gp/db';
import {
  DEFAULT_WEEKLY_OFF_DAYS,
  addDays,
  shiftWindow,
  weekdayOf,
  type DayType,
  type ShiftSchedule,
} from '@gp/shared';
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';

export type ShiftRow = typeof shifts.$inferSelect;

/** What an employee is scheduled to do on one date. */
export interface DayPlan {
  date: string;
  timeZone: string;
  locationId: string | null;
  shift: ShiftRow;
  shiftSource: 'roster' | 'assignment' | 'default';
  dayType: DayType;
  holidayName: string | null;
  window: { start: Date; end: Date };
}

const DEFAULT_TIME_ZONE = 'Asia/Dhaka';

/** Postgres returns times as HH:MM:SS. */
export const hhmm = (time: string) => time.slice(0, 5);

export const toSchedule = (s: ShiftRow): ShiftSchedule => ({
  startTime: hhmm(s.startTime),
  endTime: hhmm(s.endTime),
  breakMinutes: s.breakMinutes,
  lateGraceMinutes: s.lateGraceMinutes,
  earlyOutGraceMinutes: s.earlyOutGraceMinutes,
  halfDayMinutes: s.halfDayMinutes,
  fullDayMinutes: s.fullDayMinutes,
  overtimeEnabled: s.overtimeEnabled,
  overtimeMinMinutes: s.overtimeMinMinutes,
  overtimeRoundingMinutes: s.overtimeRoundingMinutes,
});

/** Used only if a workspace somehow has no default shift; every workspace is given one. */
const FALLBACK_SHIFT: ShiftRow = {
  id: '00000000-0000-0000-0000-000000000000',
  tenantId: '00000000-0000-0000-0000-000000000000',
  code: 'GEN',
  name: 'General shift',
  nameBn: null,
  startTime: '09:00:00',
  endTime: '18:00:00',
  breakMinutes: 60,
  lateGraceMinutes: 10,
  earlyOutGraceMinutes: 0,
  halfDayMinutes: 240,
  fullDayMinutes: 360,
  overtimeEnabled: true,
  overtimeMinMinutes: 30,
  overtimeRoundingMinutes: 30,
  isDefault: true,
  isActive: true,
  createdAt: new Date(0),
};

const inRange = <T extends { from: string; to: string | null }>(rows: T[], date: string) =>
  rows.find((r) => r.from <= date && (r.to === null || r.to >= date));

/**
 * Who works which shift on which day. A roster entry wins (a shift, or a day off); then the
 * employee's shift assignment; then the workspace default. Holidays come from the calendar of
 * the location the employee is assigned to that day, and weekly offs from that location.
 */
@Injectable()
export class ScheduleService {
  async plans(
    tx: Tx,
    employeeIds: string[],
    from: string,
    to: string,
  ): Promise<Map<string, DayPlan[]>> {
    const out = new Map<string, DayPlan[]>();
    if (employeeIds.length === 0) return out;

    const shiftRows = await tx.select().from(shifts);
    const jobs = await tx
      .select({
        employeeId: jobAssignments.employeeId,
        from: jobAssignments.effectiveFrom,
        to: jobAssignments.effectiveTo,
        locationId: locations.id,
        timeZone: locations.timeZone,
        weeklyOffDays: locations.weeklyOffDays,
        calendarId: locations.holidayCalendarId,
      })
      .from(jobAssignments)
      .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
      .where(inArray(jobAssignments.employeeId, employeeIds));
    const assignments = await tx
      .select({
        employeeId: shiftAssignments.employeeId,
        shiftId: shiftAssignments.shiftId,
        from: shiftAssignments.effectiveFrom,
        to: shiftAssignments.effectiveTo,
      })
      .from(shiftAssignments)
      .where(
        and(
          inArray(shiftAssignments.employeeId, employeeIds),
          lte(shiftAssignments.effectiveFrom, to),
          or(isNull(shiftAssignments.effectiveTo), gte(shiftAssignments.effectiveTo, from)),
        ),
      );
    const roster = await tx
      .select()
      .from(rosterEntries)
      .where(
        and(
          inArray(rosterEntries.employeeId, employeeIds),
          gte(rosterEntries.date, from),
          lte(rosterEntries.date, to),
        ),
      );
    const [defaultCalendar] = await tx
      .select({ id: holidayCalendars.id })
      .from(holidayCalendars)
      .where(eq(holidayCalendars.isDefault, true));
    const shiftById = new Map(shiftRows.map((s) => [s.id, s]));
    const defaultShift = shiftRows.find((s) => s.isDefault) ?? FALLBACK_SHIFT;
    const calendarIds = [
      ...new Set(
        jobs.map((j) => j.calendarId ?? defaultCalendar?.id).filter((c): c is string => !!c),
      ),
    ];
    if (defaultCalendar) calendarIds.push(defaultCalendar.id);
    const holidayRows = calendarIds.length
      ? await tx
          .select({ calendarId: holidays.calendarId, date: holidays.date, name: holidays.name })
          .from(holidays)
          .where(
            and(
              inArray(holidays.calendarId, calendarIds),
              gte(holidays.date, from),
              lte(holidays.date, to),
            ),
          )
      : [];
    const holidayName = new Map(holidayRows.map((h) => [`${h.calendarId}|${h.date}`, h.name]));
    const rosterOn = new Map(roster.map((r) => [`${r.employeeId}|${r.date}`, r]));

    // Many people share a shift and a time zone; work out each window once.
    const windows = new Map<string, DayPlan['window']>();
    const windowOf = (date: string, shift: ShiftRow, timeZone: string) => {
      const key = `${date}|${shift.id}|${shift.startTime}|${shift.endTime}|${timeZone}`;
      let w = windows.get(key);
      if (!w) {
        w = shiftWindow(date, toSchedule(shift), timeZone);
        windows.set(key, w);
      }
      return w;
    };

    for (const employeeId of employeeIds) {
      const myJobs = jobs
        .filter((j) => j.employeeId === employeeId)
        .toSorted((a, b) => a.from.localeCompare(b.from));
      const myShifts = assignments.filter((a) => a.employeeId === employeeId);
      const days: DayPlan[] = [];
      for (let date = from; date <= to; date = addDays(date, 1)) {
        // Before someone joins, their first assignment stands in.
        const job = inRange(myJobs, date) ?? myJobs[0];
        const timeZone = job?.timeZone ?? DEFAULT_TIME_ZONE;
        const calendarId = job?.calendarId ?? defaultCalendar?.id ?? null;
        const entry = rosterOn.get(`${employeeId}|${date}`);
        const assigned = inRange(myShifts, date);
        const assignedShift = (assigned && shiftById.get(assigned.shiftId)) || defaultShift;
        const shift = (entry?.shiftId && shiftById.get(entry.shiftId)) || assignedShift;
        const holiday = calendarId ? (holidayName.get(`${calendarId}|${date}`) ?? null) : null;
        let dayType: DayType = 'working';
        if (holiday) dayType = 'holiday';
        else if (entry) dayType = entry.shiftId ? 'working' : 'weekly_off';
        else if ((job?.weeklyOffDays ?? DEFAULT_WEEKLY_OFF_DAYS).includes(weekdayOf(date))) {
          dayType = 'weekly_off';
        }
        days.push({
          date,
          timeZone,
          locationId: job?.locationId ?? null,
          shift,
          shiftSource: entry ? 'roster' : assigned ? 'assignment' : 'default',
          dayType,
          holidayName: holiday,
          window: windowOf(date, shift, timeZone),
        });
      }
      out.set(employeeId, days);
    }
    return out;
  }
}
