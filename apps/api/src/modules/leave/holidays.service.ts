import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { holidayCalendars, holidays, locations, type Tx } from '@gp/db';
import { BD_RULES, bdHolidayTemplate, ruleOn } from '@gp/country-packs';
import type {
  HolidayCalendarInput,
  HolidayCalendarView,
  HolidayChangeResult,
  HolidayInput,
  HolidayUpdate,
  HolidayView,
  HolidayYearView,
  RuleView,
} from '@gp/shared';
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeOfUser, LeaveRequestsService } from './leave-requests.service.js';
import { WorkCalendarService } from './work-calendar.service.js';

const toHolidayView = (h: typeof holidays.$inferSelect): HolidayView => ({
  id: h.id,
  calendarId: h.calendarId,
  date: h.date,
  name: h.name,
  nameBn: h.nameBn,
  kind: h.kind,
  isTentative: h.isTentative,
});

/**
 * Holiday calendars. Changing a holiday recounts the leave that covers it, so balances stay
 * right when a tentative Eid date moves after the moon sighting.
 */
@Injectable()
export class HolidaysService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly calendars: WorkCalendarService,
    private readonly requests: LeaveRequestsService,
    private readonly audit: TenantAuditService,
  ) {}

  listCalendars(): Promise<HolidayCalendarView[]> {
    return this.tenantDb.run(async (tx) => {
      const calendars = await tx
        .select()
        .from(holidayCalendars)
        .orderBy(asc(holidayCalendars.name));
      const locs = await tx
        .select({ id: locations.id, name: locations.name, calendarId: locations.holidayCalendarId })
        .from(locations);
      return calendars.map((c) => ({
        id: c.id,
        name: c.name,
        isDefault: c.isDefault,
        // Locations without their own calendar use the default one.
        locations: locs
          .filter((l) => l.calendarId === c.id || (l.calendarId === null && c.isDefault))
          .map((l) => ({ id: l.id, name: l.name })),
      }));
    });
  }

  async createCalendar(actor: AuthUser, input: HolidayCalendarInput): Promise<HolidayCalendarView> {
    const id = await this.tenantDb.run(async (tx) => {
      if (input.isDefault) await tx.update(holidayCalendars).set({ isDefault: false });
      const [row] = await tx
        .insert(holidayCalendars)
        .values({ tenantId: currentTenantId(), name: input.name, isDefault: input.isDefault })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'holiday.calendar.create',
        entityType: 'holiday_calendar',
        entityId: row!.id,
        after: input,
      });
      return row!.id;
    });
    return (await this.listCalendars()).find((c) => c.id === id)!;
  }

  year(calendarId: string, year: number): Promise<HolidayYearView> {
    return this.tenantDb.run((tx) => this.yearView(tx, calendarId, year));
  }

  /** The signed-in employee's own calendar (their location's, or the default). */
  myYear(user: AuthUser, year: number): Promise<HolidayYearView> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      const calendarId = me
        ? (await this.calendars.forEmployee(tx, me.id, `${year}-01-01`)).calendarId
        : await this.calendars.defaultCalendarId(tx);
      if (!calendarId) throw new NotFoundException('This workspace has no holiday calendar yet');
      return this.yearView(tx, calendarId, year);
    });
  }

  async add(
    actor: AuthUser,
    calendarId: string,
    input: HolidayInput,
  ): Promise<HolidayChangeResult> {
    return this.tenantDb.run(async (tx) => {
      await this.calendarOrThrow(tx, calendarId);
      const [row] = await tx
        .insert(holidays)
        .values({ ...input, tenantId: currentTenantId(), calendarId })
        .returning();
      const recalculated = await this.requests.recalculateForHoliday(
        tx,
        calendarId,
        [input.date],
        actor.id,
      );
      await this.record(tx, actor, 'holiday.add', row!.id, null, input);
      return { holiday: toHolidayView(row!), recalculatedRequests: recalculated };
    });
  }

  async update(actor: AuthUser, id: string, input: HolidayUpdate): Promise<HolidayChangeResult> {
    return this.tenantDb.run(async (tx) => {
      const [current] = await tx.select().from(holidays).where(eq(holidays.id, id));
      if (!current) throw new NotFoundException('Holiday not found');
      const [row] = await tx
        .update(holidays)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(holidays.id, id))
        .returning();
      const dates = [...new Set([current.date, row!.date])];
      const recalculated = await this.requests.recalculateForHoliday(
        tx,
        current.calendarId,
        dates,
        actor.id,
      );
      await this.record(tx, actor, 'holiday.update', id, toHolidayView(current), input);
      return { holiday: toHolidayView(row!), recalculatedRequests: recalculated };
    });
  }

  async remove(actor: AuthUser, id: string): Promise<HolidayChangeResult> {
    return this.tenantDb.run(async (tx) => {
      const [current] = await tx.select().from(holidays).where(eq(holidays.id, id));
      if (!current) throw new NotFoundException('Holiday not found');
      await tx.delete(holidays).where(eq(holidays.id, id));
      const recalculated = await this.requests.recalculateForHoliday(
        tx,
        current.calendarId,
        [current.date],
        actor.id,
      );
      await this.record(tx, actor, 'holiday.remove', id, toHolidayView(current), null);
      return { holiday: null, recalculatedRequests: recalculated };
    });
  }

  /** Adds the Bangladesh template for a year, skipping dates the calendar already has. */
  async importBd(actor: AuthUser, calendarId: string, year: number) {
    return this.tenantDb.run(async (tx) => {
      await this.calendarOrThrow(tx, calendarId);
      const template = bdHolidayTemplate(year);
      const added = await tx
        .insert(holidays)
        .values(
          template.map((h) => ({
            tenantId: currentTenantId(),
            calendarId,
            date: h.date,
            name: h.name,
            nameBn: h.nameBn,
            kind: h.kind,
            isTentative: h.tentative,
          })),
        )
        .onConflictDoNothing()
        .returning({ date: holidays.date });
      const recalculated = added.length
        ? await this.requests.recalculateForHoliday(
            tx,
            calendarId,
            added.map((h) => h.date),
            actor.id,
          )
        : 0;
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'holiday.import',
        entityType: 'holiday_calendar',
        entityId: calendarId,
        after: { year, added: added.length },
      });
      return {
        added: added.length,
        skipped: template.length - added.length,
        recalculatedRequests: recalculated,
      };
    });
  }

  private async yearView(tx: Tx, calendarId: string, year: number): Promise<HolidayYearView> {
    const calendar = await this.calendarOrThrow(tx, calendarId);
    const rows = await tx
      .select()
      .from(holidays)
      .where(
        and(
          eq(holidays.calendarId, calendarId),
          gte(holidays.date, `${year}-01-01`),
          lte(holidays.date, `${year}-12-31`),
        ),
      )
      .orderBy(asc(holidays.date));
    const rule = ruleOn(BD_RULES, 'holidays.festival.days_per_year', `${year}-12-31`);
    const locs = await tx
      .select({ id: locations.id, name: locations.name, calendarId: locations.holidayCalendarId })
      .from(locations);
    return {
      calendar: {
        id: calendar.id,
        name: calendar.name,
        isDefault: calendar.isDefault,
        locations: locs
          .filter(
            (l) => l.calendarId === calendar.id || (l.calendarId === null && calendar.isDefault),
          )
          .map((l) => ({ id: l.id, name: l.name })),
      },
      year,
      holidays: rows.map(toHolidayView),
      festivalDays: rows.filter((h) => h.kind === 'festival').length,
      festivalDaysRequired: rule.value,
      festivalRule: rule as RuleView,
    };
  }

  private async calendarOrThrow(tx: Tx, id: string) {
    const [calendar] = await tx.select().from(holidayCalendars).where(eq(holidayCalendars.id, id));
    if (!calendar) throw new NotFoundException('Holiday calendar not found');
    return calendar;
  }

  async renameCalendar(actor: AuthUser, id: string, input: Partial<HolidayCalendarInput>) {
    await this.tenantDb.run(async (tx) => {
      await this.calendarOrThrow(tx, id);
      if (input.isDefault === false) {
        throw new BadRequestException('Make another calendar the default instead');
      }
      if (input.isDefault) {
        await tx
          .update(holidayCalendars)
          .set({ isDefault: false })
          .where(ne(holidayCalendars.id, id));
      }
      await tx.update(holidayCalendars).set(input).where(eq(holidayCalendars.id, id));
      await this.record(tx, actor, 'holiday.calendar.update', id, null, input);
    });
    const view = (await this.listCalendars()).find((c) => c.id === id);
    if (!view) throw new ConflictException('Calendar changed concurrently');
    return view;
  }

  private record(
    tx: Tx,
    actor: AuthUser,
    action: string,
    id: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record(tx, {
      actorUserId: actor.id,
      action,
      entityType: 'holiday',
      entityId: id,
      before,
      after,
    });
  }
}
