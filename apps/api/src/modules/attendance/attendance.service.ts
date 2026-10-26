import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  attendanceDays,
  attendanceDevices,
  attendancePunches,
  attendanceSettings,
  employees,
  jobAssignments,
  locations,
  regularizationRequests,
  type Tx,
} from '@gp/db';
import { bdWorkLimits } from '@gp/country-packs';
import {
  addDays,
  type AttendanceProcessInput,
  type AttendanceRangeView,
  type AttendanceSettingsInput,
  type AttendanceSettingsView,
  type AttendanceStatus,
  type EmployeeAttendanceView,
  groupBy,
  type MonthSummaryView,
  type MyAttendanceToday,
  type PunchView,
  type TeamDayView,
  todayIn,
  weekdayOf,
} from '@gp/shared';
import { and, asc, eq, gte, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import {
  employeeOfUser,
  inForceOn,
  teamScope,
  unitAndBelow,
  employeesInUnits,
} from '../employees/employee.queries.js';
import {
  employeeRef,
  toDayView,
  toPunchView,
  totalsOf,
  type RegularizationMark,
} from './attendance-views.js';
import { AttendanceProcessor, settingsOf, type ComputedDay } from './processor.service.js';
import { ShiftsService } from './shifts.service.js';
import { PolicyService } from '../group/policy.service.js';
import { entityScope } from '../access-scopes/entity-scope.js';

type EmployeeRow = typeof employees.$inferSelect;

/** The time zone of the location an employee works at today. */
export async function timeZoneOf(tx: Tx, employeeId: string): Promise<string> {
  const [row] = await tx
    .select({ timeZone: locations.timeZone })
    .from(jobAssignments)
    .innerJoin(locations, eq(locations.id, jobAssignments.locationId))
    .where(and(eq(jobAssignments.employeeId, employeeId), inForceOn(todayIn())));
  return row?.timeZone ?? 'Asia/Dhaka';
}

/** The latest open or approved correction for each day, for marking the days. */
export async function regularizationMarks(
  tx: Tx,
  employeeIds: string[],
  from: string,
  to: string,
): Promise<Map<string, RegularizationMark>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await tx
    .select({
      id: regularizationRequests.id,
      employeeId: regularizationRequests.employeeId,
      date: regularizationRequests.date,
      kind: regularizationRequests.kind,
      status: regularizationRequests.status,
    })
    .from(regularizationRequests)
    .where(
      and(
        inArray(regularizationRequests.employeeId, employeeIds),
        inArray(regularizationRequests.status, ['pending', 'approved']),
        gte(regularizationRequests.date, from),
        lte(regularizationRequests.date, to),
      ),
    )
    .orderBy(asc(regularizationRequests.createdAt));
  return new Map(rows.map((r) => [`${r.employeeId}|${r.date}`, r]));
}

/** Punches that belong to a day, voided ones included, with device names. */
export async function punchesOf(
  tx: Tx,
  employeeId: string,
  from: Date,
  to: Date,
): Promise<PunchView[]> {
  const rows = await tx
    .select({
      punch: attendancePunches,
      device: { id: attendanceDevices.id, name: attendanceDevices.name },
    })
    .from(attendancePunches)
    .leftJoin(attendanceDevices, eq(attendanceDevices.id, attendancePunches.deviceId))
    .where(
      and(
        eq(attendancePunches.employeeId, employeeId),
        gte(attendancePunches.punchedAt, from),
        lt(attendancePunches.punchedAt, to),
      ),
    )
    .orderBy(asc(attendancePunches.punchedAt));
  return rows.map((r) => toPunchView(r.punch, r.device?.id ? r.device : null));
}

const toSettingsView = (s: typeof attendanceSettings.$inferSelect): AttendanceSettingsView => ({
  selfPunch: s.selfPunch,
  regularizationChain: s.regularizationChain,
  regularizationWindowDays: s.regularizationWindowDays,
  trackingFrom: s.trackingFrom,
  requireSelfie: s.requireSelfie,
});

/** Reading attendance. Every view is computed from the current inputs, so it is never stale. */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly processor: AttendanceProcessor,
    private readonly shifts: ShiftsService,
    private readonly audit: TenantAuditService,
    private readonly policy: PolicyService,
  ) {}

  private async me(tx: Tx, user: AuthUser): Promise<EmployeeRow> {
    const me = await employeeOfUser(tx, user.id);
    if (!me) throw new NotFoundException('No employee record is linked to your login');
    return me;
  }

  async rangeFor(
    tx: Tx,
    employee: EmployeeRow,
    from: string,
    to: string,
  ): Promise<AttendanceRangeView> {
    const days = await this.processor.compute(tx, { employeeIds: [employee.id], from, to });
    const marks = await regularizationMarks(tx, [employee.id], from, to);
    const views = days.map((d) => toDayView(d, marks.get(`${employee.id}|${d.plan.date}`)));
    return {
      employee: employeeRef(employee),
      timeZone: days[0]?.plan.timeZone ?? (await timeZoneOf(tx, employee.id)),
      from,
      to,
      days: views,
      totals: totalsOf(views.filter((v) => v.status !== 'pending')),
    };
  }

  // ── Me ─────────────────────────────────────────────────────────────────────

  /** Today's day, or a night shift that began yesterday and has not closed yet. */
  async currentDay(tx: Tx, me: EmployeeRow): Promise<{ day: ComputedDay; timeZone: string }> {
    const timeZone = await timeZoneOf(tx, me.id);
    const today = todayIn(timeZone);
    const days = await this.processor.compute(tx, {
      employeeIds: [me.id],
      from: addDays(today, -1),
      to: today,
    });
    const now = new Date();
    const day =
      days.find((d) => d.plan.date < today && d.closesAt > now && d.result.firstIn) ??
      days.find((d) => d.plan.date === today) ??
      (await this.unscheduledToday(tx, me, today));
    return { day, timeZone };
  }

  today(user: AuthUser): Promise<MyAttendanceToday> {
    return this.tenantDb.run(async (tx) => {
      const me = await this.me(tx, user);
      const { day, timeZone } = await this.currentDay(tx, me);
      // The punch follows the person's company's rule, so the screen shows that one.
      const settings = await this.policy.forEmployee(
        tx,
        'attendance',
        await settingsOf(tx),
        me.id,
        day.plan.date,
      );
      const marks = await regularizationMarks(tx, [me.id], day.plan.date, day.plan.date);
      const punches = await punchesOf(tx, me.id, day.opensAt, day.closesAt);
      const geofence = await this.geofenceOf(tx, day.plan.locationId);
      const live = punches.filter((p) => !p.voided);
      return {
        employee: employeeRef(me),
        timeZone,
        day: toDayView(day, marks.get(`${me.id}|${day.plan.date}`)),
        punches,
        selfPunch: {
          mode: settings.selfPunch,
          blockedReason:
            settings.selfPunch === 'off'
              ? 'disabled'
              : settings.selfPunch === 'geofenced' && !geofence
                ? 'no_geofence'
                : null,
          geofence,
          requireSelfie: settings.requireSelfie,
        },
        nextDirection: live.length % 2 === 0 ? 'in' : 'out',
      };
    });
  }

  /** Today before attendance goes live or before joining: an empty day on the default plan. */
  private async unscheduledToday(tx: Tx, me: EmployeeRow, today: string): Promise<ComputedDay> {
    const plan = (await this.processor.planFor(tx, me.id, today))!;
    return {
      employeeId: me.id,
      plan,
      opensAt: plan.window.start,
      closesAt: plan.window.end,
      leave: null,
      result: {
        status: 'pending',
        firstIn: null,
        lastOut: null,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyOutMinutes: 0,
        overtimeMinutes: 0,
        flags: [],
      },
    };
  }

  async geofenceOf(tx: Tx, locationId: string | null) {
    if (!locationId) return null;
    const [loc] = await tx.select().from(locations).where(eq(locations.id, locationId));
    if (loc?.latitude == null || loc.longitude == null || loc.geofenceRadiusM == null) return null;
    return { latitude: loc.latitude, longitude: loc.longitude, radiusM: loc.geofenceRadiusM };
  }

  myRange(user: AuthUser, from: string, to: string): Promise<AttendanceRangeView> {
    return this.tenantDb.run(async (tx) => this.rangeFor(tx, await this.me(tx, user), from, to));
  }

  // ── HR and managers ────────────────────────────────────────────────────────

  employee(employeeId: string, from: string, to: string): Promise<EmployeeAttendanceView> {
    return this.tenantDb.run(async (tx) => {
      const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      const range = await this.rangeFor(tx, employee, from, to);
      const rangeStart = new Date(Date.parse(from) - 86_400_000);
      const rangeEnd = new Date(Date.parse(addDays(to, 2)));
      return {
        attendancePin: employee.attendancePin,
        shifts: await this.shifts.history(tx, employeeId),
        range,
        punches: await punchesOf(tx, employeeId, rangeStart, rangeEnd),
      };
    });
  }

  /** One day for a team: HR sees everyone (or a unit); others their reports and unit. */
  daily(
    user: AuthUser,
    query: { date: string; orgUnitId?: string; status?: AttendanceStatus },
  ): Promise<TeamDayView> {
    return this.tenantDb.run(async (tx) => {
      const scope = await teamScope(tx, user, employees.id, {
        onDate: query.date,
        orgUnitId: query.orgUnitId,
      });
      if (scope === null) throw new NotFoundException('No employee record is linked to your login');
      const people = await tx
        .select()
        .from(employees)
        .where(
          and(
            scope,
            lte(employees.joinedOn, query.date),
            or(isNull(employees.separatedOn), gte(employees.separatedOn, query.date)),
          ),
        )
        .orderBy(asc(employees.fullName));
      const ids = people.map((p) => p.id);
      const days = ids.length
        ? await this.processor.compute(tx, { employeeIds: ids, from: query.date, to: query.date })
        : [];
      const marks = await regularizationMarks(tx, ids, query.date, query.date);
      const byEmployee = new Map(days.map((d) => [d.employeeId, d]));
      const counts: TeamDayView['counts'] = {};
      const rows = [];
      for (const person of people) {
        const day = byEmployee.get(person.id);
        if (!day) continue;
        const view = toDayView(day, marks.get(`${person.id}|${query.date}`));
        counts[view.status] = (counts[view.status] ?? 0) + 1;
        if (!query.status || view.status === query.status) {
          rows.push({ employee: employeeRef(person), timeZone: day.plan.timeZone, day: view });
        }
      }
      return { date: query.date, counts, rows };
    });
  }

  /**
   * A month's totals per employee, from the processed days (what payroll will use), with the
   * weeks that went over the Labour Act's weekly limit.
   */
  monthSummary(
    user: AuthUser,
    query: { month: string; orgUnitId?: string },
  ): Promise<MonthSummaryView> {
    return this.tenantDb.run(async (tx) => {
      const from = `${query.month}-01`;
      const nextMonth = new Date(`${from}T00:00:00Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const to = addDays(nextMonth.toISOString().slice(0, 10), -1);
      const units = query.orgUnitId ? await unitAndBelow(tx, query.orgUnitId) : null;
      const people = await tx
        .select()
        .from(employees)
        .where(
          and(
            units ? inArray(employees.id, employeesInUnits(tx, units, to)) : undefined,
            await entityScope(tx, user, employees.id),
            lte(employees.joinedOn, to),
            or(isNull(employees.separatedOn), gte(employees.separatedOn, from)),
          ),
        )
        .orderBy(asc(employees.employeeCode));
      const rows = people.length
        ? await tx
            .select()
            .from(attendanceDays)
            .where(
              and(
                inArray(
                  attendanceDays.employeeId,
                  people.map((p) => p.id),
                ),
                gte(attendanceDays.date, from),
                lte(attendanceDays.date, to),
              ),
            )
        : [];
      const weeklyMax = bdWorkLimits(from).weeklyMaxMinutes;
      const daysOf = groupBy(rows, (r) => r.employeeId);
      return {
        month: query.month,
        from,
        to,
        rows: people.map((person) => {
          const days = (daysOf.get(person.id) ?? []).filter((r) => r.status !== 'pending');
          const weeks = new Map<string, number>();
          for (const d of days) {
            // Weeks run Saturday to Friday, the usual working week in Bangladesh.
            const saturday = addDays(d.date, -((weekdayOf(d.date) + 1) % 7));
            weeks.set(saturday, (weeks.get(saturday) ?? 0) + d.workedMinutes);
          }
          return {
            employee: employeeRef(person),
            totals: totalsOf(days),
            weeksOverLimit: [...weeks.values()].filter((m) => m > weeklyMax).length,
          };
        }),
      };
    });
  }

  // ── Settings and processing ────────────────────────────────────────────────

  settings(): Promise<AttendanceSettingsView> {
    return this.tenantDb.run(async (tx) => toSettingsView(await settingsOf(tx)));
  }

  updateSettings(user: AuthUser, input: AttendanceSettingsInput): Promise<AttendanceSettingsView> {
    return this.tenantDb.run(async (tx) => {
      const before = await settingsOf(tx);
      const today = todayIn();
      if (input.trackingFrom && input.trackingFrom > today) {
        throw new BadRequestException('Attendance cannot go live in the future');
      }
      const [row] = await tx
        .update(attendanceSettings)
        .set({ ...input, updatedAt: new Date() })
        .returning();
      if (input.trackingFrom && input.trackingFrom !== before.trackingFrom) {
        await tx.delete(attendanceDays).where(lt(attendanceDays.date, input.trackingFrom));
        const from =
          input.trackingFrom > addDays(today, -62) ? input.trackingFrom : addDays(today, -62);
        await this.processor.process(tx, { from, to: today });
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'attendance.settings.update',
        entityType: 'attendance_settings',
        entityId: null,
        before: toSettingsView(before),
        after: input,
      });
      return toSettingsView(row!);
    });
  }

  reprocess(user: AuthUser, input: AttendanceProcessInput): Promise<{ days: number }> {
    return this.tenantDb.run(async (tx) => {
      const days = await this.processor.process(tx, input);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'attendance.reprocess',
        entityType: 'attendance_days',
        entityId: null,
        after: { ...input, days },
      });
      return { days };
    });
  }
}
