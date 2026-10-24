import { Injectable } from '@nestjs/common';
import { holidayCalendars, holidays, jobAssignments, locations, type Tx } from '@gp/db';
import type { EstablishmentKind } from '@gp/country-packs';
import { DEFAULT_WEEKLY_OFF_DAYS, countLeaveDays } from '@gp/shared';
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

  /** Scheduled working days in a period. Attendance (M3) will replace this with days worked. */
  async workingDays(tx: Tx, calendar: WorkCalendar, from: string, to: string): Promise<number> {
    if (to < from) return 0;
    return countLeaveDays(from, to, {
      weeklyOffDays: calendar.weeklyOffDays,
      holidays: await this.holidaysIn(tx, calendar.calendarId, from, to),
      countsOffDays: false,
    }).days;
  }
}
