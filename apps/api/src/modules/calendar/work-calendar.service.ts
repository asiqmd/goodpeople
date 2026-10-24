import { Injectable } from '@nestjs/common';
import {
  attendanceDays,
  attendanceSettings,
  holidayCalendars,
  holidays,
  jobAssignments,
  leaveRequests,
  leaveTypes,
  locations,
  type Tx,
} from '@gp/db';
import { BD_RULES, ruleOn } from '@gp/country-packs';
import type { EstablishmentKind } from '@gp/country-packs';
import { DEFAULT_WEEKLY_OFF_DAYS, addDays, countLeaveDays } from '@gp/shared';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { inForceOn } from '../employees/employee.queries.js';

export interface WorkCalendar {
  /** null when the workspace has no calendar yet. */
  calendarId: string | null;
  weeklyOffDays: number[];
  establishment: EstablishmentKind;
}

/**
 * Where and when an employee works: the holiday calendar and weekly offs of the location
 * they are assigned to on a date. Every method takes the caller's tenant transaction.
 */
@Injectable()
export class WorkCalendarService {
  async forEmployee(tx: Tx, employeeId: string, onDate: string): Promise<WorkCalendar> {
    const [job] = await tx
      .select({ location: locations })
      .from(jobAssignments)
      .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
      .where(and(eq(jobAssignments.employeeId, employeeId), inForceOn(onDate)));
    // Someone not yet joined on that date: use their first assignment.
    const location =
      job?.location ??
      (
        await tx
          .select({ location: locations })
          .from(jobAssignments)
          .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
          .where(eq(jobAssignments.employeeId, employeeId))
          .orderBy(asc(jobAssignments.effectiveFrom))
          .limit(1)
      )[0]?.location;
    return {
      calendarId: location?.holidayCalendarId ?? (await this.defaultCalendarId(tx)),
      weeklyOffDays: location?.weeklyOffDays ?? DEFAULT_WEEKLY_OFF_DAYS,
      establishment: location?.kind === 'factory' ? 'factory' : 'shop_commercial',
    };
  }

  async defaultCalendarId(tx: Tx): Promise<string | null> {
    const [calendar] = await tx
      .select({ id: holidayCalendars.id })
      .from(holidayCalendars)
      .where(eq(holidayCalendars.isDefault, true));
    return calendar?.id ?? null;
  }

  async holidaysIn(
    tx: Tx,
    calendarId: string | null,
    from: string,
    to: string,
  ): Promise<Map<string, string>> {
    if (!calendarId) return new Map();
    const rows = await tx
      .select({ date: holidays.date, name: holidays.name })
      .from(holidays)
      .where(
        and(eq(holidays.calendarId, calendarId), gte(holidays.date, from), lte(holidays.date, to)),
      );
    return new Map(rows.map((h) => [h.date, h.name]));
  }

  /**
   * Days worked in a period, for earning annual leave (s.117). Where attendance is tracked
   * it counts present days, half days as half, and paid leave if the rule says so; before
   * attendance went live, scheduled working days stand in.
   */
  async daysWorked(
    tx: Tx,
    employeeId: string,
    calendar: WorkCalendar,
    from: string,
    to: string,
  ): Promise<number> {
    if (to < from) return 0;
    const [settings] = await tx
      .select({ trackingFrom: attendanceSettings.trackingFrom })
      .from(attendanceSettings);
    const trackedFrom = settings?.trackingFrom ?? addDays(to, 1);
    const scheduledTo = trackedFrom <= to ? addDays(trackedFrom, -1) : to;
    let days = await this.workingDays(tx, calendar, from, scheduledTo);
    const start = trackedFrom > from ? trackedFrom : from;
    if (start > to) return days;
    const leaveCounts = ruleOn(BD_RULES, 'leave.annual.paid_leave_counts_as_worked', to).value;
    const rows = await tx
      .select({
        status: attendanceDays.status,
        leaveDays: attendanceDays.leaveDays,
        paid: leaveTypes.paid,
      })
      .from(attendanceDays)
      .leftJoin(leaveRequests, eq(leaveRequests.id, attendanceDays.leaveRequestId))
      .leftJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(
        and(
          eq(attendanceDays.employeeId, employeeId),
          gte(attendanceDays.date, start),
          lte(attendanceDays.date, to),
        ),
      );
    for (const r of rows) {
      if (r.status === 'present') days += 1;
      else if (r.status === 'half_day') days += 0.5;
      if (leaveCounts && r.paid && r.status !== 'present') days += r.leaveDays;
    }
    return days;
  }

  /** Scheduled working days in a period. */
  async workingDays(tx: Tx, calendar: WorkCalendar, from: string, to: string): Promise<number> {
    if (to < from) return 0;
    return countLeaveDays(from, to, {
      weeklyOffDays: calendar.weeklyOffDays,
      holidays: await this.holidaysIn(tx, calendar.calendarId, from, to),
      countsOffDays: false,
    }).days;
  }
}
