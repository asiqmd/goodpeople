import { Injectable } from '@nestjs/common';
import {
  attendanceDays,
  attendancePunches,
  attendanceSettings,
  employees,
  leaveRequests,
  leaveTypes,
  regularizationRequests,
  type Tx,
} from '@gp/db';
import { bdWorkLimits } from '@gp/country-packs';
import {
  addDays,
  type AttendanceFlag,
  dayBoundary,
  type DayResult,
  evaluateDay,
  groupBy,
  type LeaveCover,
  todayIn,
} from '@gp/shared';
import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { currentTenantId } from '../../common/request-context.js';
import { ScheduleService, toSchedule, type DayPlan } from './schedule.service.js';

export type AttendanceSettingsRow = typeof attendanceSettings.$inferSelect;

/** The workspace's attendance settings, created with the defaults on first use. */
export async function settingsOf(tx: Tx): Promise<AttendanceSettingsRow> {
  const [row] = await tx.select().from(attendanceSettings);
  if (row) return row;
  await tx.insert(attendanceSettings).values({ tenantId: currentTenantId() }).onConflictDoNothing();
  return (await tx.select().from(attendanceSettings))[0]!;
}

export interface ComputedDay {
  employeeId: string;
  plan: DayPlan;
  /** Punches in [opensAt, closesAt) belong to this day. */
  opensAt: Date;
  closesAt: Date;
  leave: { requestId: string; code: string; days: 1 | 0.5 } | null;
  result: DayResult;
}

/** The most days one processing call covers; longer ranges are split. */
const CHUNK_DAYS = 31;
const DAY_MS = 86_400_000;

/**
 * Turns schedules, leave and punches into attendance days. `compute` writes nothing and
 * serves every screen, so what people see is always current; `process` stores the result for
 * reports and payroll, and runs whenever an input changes and in the background.
 */
@Injectable()
export class AttendanceProcessor {
  constructor(private readonly schedule: ScheduleService) {}

  /** One employee's plan for one date, whether or not attendance is tracked yet. */
  async planFor(tx: Tx, employeeId: string, date: string): Promise<DayPlan | undefined> {
    return (await this.schedule.plans(tx, [employeeId], date, date)).get(employeeId)?.[0];
  }

  /**
   * Days in [from, to] for these employees (everyone when omitted), from the workspace's
   * attendance go-live and each person's joining date to their separation.
   */
  async compute(
    tx: Tx,
    input: { employeeIds?: string[]; from: string; to: string; now?: Date },
  ): Promise<ComputedDay[]> {
    const now = input.now ?? new Date();
    const settings = await settingsOf(tx);
    const from = input.from < settings.trackingFrom ? settings.trackingFrom : input.from;
    const { to } = input;
    if (from > to) return [];

    const people = await tx
      .select({
        id: employees.id,
        joinedOn: employees.joinedOn,
        separatedOn: employees.separatedOn,
      })
      .from(employees)
      .where(
        and(
          input.employeeIds ? inArray(employees.id, input.employeeIds) : undefined,
          lte(employees.joinedOn, to),
          or(isNull(employees.separatedOn), gte(employees.separatedOn, from)),
        ),
      );
    if (people.length === 0) return [];
    const ids = people.map((p) => p.id);

    const plans = await this.schedule.plans(tx, ids, addDays(from, -1), addDays(to, 1));
    const leave = await tx
      .select({
        id: leaveRequests.id,
        employeeId: leaveRequests.employeeId,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        halfDay: leaveRequests.halfDay,
        code: leaveTypes.code,
        countsOffDays: leaveTypes.countsOffDays,
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(
        and(
          inArray(leaveRequests.employeeId, ids),
          eq(leaveRequests.status, 'approved'),
          lte(leaveRequests.startDate, to),
          gte(leaveRequests.endDate, from),
        ),
      );
    const onDuty = await tx
      .select({
        employeeId: regularizationRequests.employeeId,
        date: regularizationRequests.date,
      })
      .from(regularizationRequests)
      .where(
        and(
          inArray(regularizationRequests.employeeId, ids),
          eq(regularizationRequests.kind, 'on_duty'),
          eq(regularizationRequests.status, 'approved'),
          gte(regularizationRequests.date, from),
          lte(regularizationRequests.date, to),
        ),
      );
    const punches = await tx
      .select({
        employeeId: attendancePunches.employeeId,
        punchedAt: attendancePunches.punchedAt,
        source: attendancePunches.source,
        insideGeofence: attendancePunches.insideGeofence,
      })
      .from(attendancePunches)
      .where(
        and(
          inArray(attendancePunches.employeeId, ids),
          isNull(attendancePunches.voidedAt),
          gte(attendancePunches.punchedAt, new Date(Date.parse(from) - 2 * DAY_MS)),
          lte(attendancePunches.punchedAt, new Date(Date.parse(to) + 3 * DAY_MS)),
        ),
      );
    const onDutyDays = new Set(onDuty.map((r) => `${r.employeeId}|${r.date}`));
    const limits = new Map<string, number>();
    const dailyMax = (date: string) => {
      let v = limits.get(date);
      if (v === undefined) limits.set(date, (v = bdWorkLimits(date).dailyMaxMinutes));
      return v;
    };

    const punchesOf = groupBy(punches, (p) => p.employeeId!);
    const leaveOf = groupBy(leave, (l) => l.employeeId);
    const out: ComputedDay[] = [];
    for (const person of people) {
      const days = plans.get(person.id)!;
      const mine = punchesOf.get(person.id) ?? [];
      const myLeave = leaveOf.get(person.id) ?? [];
      const start = person.joinedOn > from ? person.joinedOn : from;
      const end = person.separatedOn && person.separatedOn < to ? person.separatedOn : to;
      for (let i = 1; i < days.length - 1; i++) {
        const [prev, plan, next] = [days[i - 1]!, days[i]!, days[i + 1]!];
        if (plan.date < start || plan.date > end) continue;
        const opensAt = dayBoundary(prev.window.end, plan.window.start);
        const closesAt = dayBoundary(plan.window.end, next.window.start);
        const dayPunches = mine.filter((p) => p.punchedAt >= opensAt && p.punchedAt < closesAt);

        const request = myLeave.find(
          (l) =>
            l.startDate <= plan.date &&
            l.endDate >= plan.date &&
            (plan.dayType === 'working' || l.countsOffDays),
        );
        const cover: LeaveCover | null = !request
          ? null
          : request.halfDay
            ? { days: 0.5, half: request.halfDay }
            : { days: 1 };

        const result = evaluateDay({
          shift: toSchedule(plan.shift),
          window: plan.window,
          closesAt,
          dayType: plan.dayType,
          leave: cover,
          onDuty: onDutyDays.has(`${person.id}|${plan.date}`),
          punches: dayPunches.map((p) => p.punchedAt),
          now,
          dailyMaxMinutes: dailyMax(plan.date),
        });
        const extra: AttendanceFlag[] = [];
        if (dayPunches.some((p) => p.source === 'regularization')) extra.push('regularized');
        if (dayPunches.some((p) => p.insideGeofence === false)) extra.push('outside_geofence');
        result.flags.push(...extra);
        out.push({
          employeeId: person.id,
          plan,
          opensAt,
          closesAt,
          leave:
            request && cover
              ? { requestId: request.id, code: request.code, days: cover.days }
              : null,
          result,
        });
      }
    }
    return out;
  }

  /**
   * After a change that applies from a date (a shift move, a holiday, approved leave): stores
   * the days from then until today, at most a year back.
   */
  processSince(tx: Tx, employeeIds: string[] | undefined, from: string, to?: string) {
    const today = todayIn();
    const start = from > addDays(today, -366) ? from : addDays(today, -366);
    const end = to && to < today ? to : today;
    if (start > end) return Promise.resolve(0);
    return this.process(tx, { employeeIds, from: start, to: end });
  }

  /**
   * Recomputes and stores days in [from, to], up to each employee's today, in chunks of a
   * month. One processing at a time per workspace, so concurrent triggers never collide.
   */
  async process(
    tx: Tx,
    input: { employeeIds?: string[]; from: string; to: string },
  ): Promise<number> {
    if (input.employeeIds?.length === 0) return 0;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('attendance'), hashtext(${currentTenantId()}))`,
    );
    let written = 0;
    for (let from = input.from; from <= input.to; from = addDays(from, CHUNK_DAYS)) {
      const chunkEnd = addDays(from, CHUNK_DAYS - 1);
      const to = chunkEnd < input.to ? chunkEnd : input.to;
      const days = (await this.compute(tx, { employeeIds: input.employeeIds, from, to })).filter(
        (d) => d.plan.date <= todayIn(d.plan.timeZone),
      );
      await tx
        .delete(attendanceDays)
        .where(
          and(
            input.employeeIds ? inArray(attendanceDays.employeeId, input.employeeIds) : undefined,
            gte(attendanceDays.date, from),
            lte(attendanceDays.date, to),
          ),
        );
      for (let i = 0; i < days.length; i += 1000) {
        await tx.insert(attendanceDays).values(
          days.slice(i, i + 1000).map((d) => ({
            tenantId: currentTenantId(),
            employeeId: d.employeeId,
            date: d.plan.date,
            // The built-in fallback shift is not a row in this workspace.
            shiftId: d.plan.shift.tenantId === currentTenantId() ? d.plan.shift.id : null,
            dayType: d.plan.dayType,
            status: d.result.status,
            firstIn: d.result.firstIn,
            lastOut: d.result.lastOut,
            workedMinutes: d.result.workedMinutes,
            lateMinutes: d.result.lateMinutes,
            earlyOutMinutes: d.result.earlyOutMinutes,
            overtimeMinutes: d.result.overtimeMinutes,
            leaveRequestId: d.leave?.requestId ?? null,
            leaveDays: d.leave?.days ?? 0,
            flags: d.result.flags,
          })),
        );
      }
      written += days.length;
    }
    return written;
  }
}
