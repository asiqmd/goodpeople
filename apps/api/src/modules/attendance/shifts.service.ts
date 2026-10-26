import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  employees,
  jobAssignments,
  rosterEntries,
  shiftAssignments,
  shifts,
  type Tx,
} from '@gp/db';
import { bdShiftViolations } from '@gp/country-packs';
import {
  addDays,
  shiftSpanMinutes,
  todayIn,
  type ApiError,
  type RosterClearInput,
  type RosterInput,
  type RosterView,
  type ShiftAssignmentInput,
  type ShiftAssignmentView,
  type ShiftInput,
  type ShiftUpdate,
  type ShiftView,
} from '@gp/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeesInUnits, inForceOn, unitAndBelow } from '../employees/employee.queries.js';
import { employeeRef, toShiftRef, toShiftView } from './attendance-views.js';
import { AttendanceProcessor } from './processor.service.js';
import { ScheduleService, hhmm, type ShiftRow } from './schedule.service.js';
import { entityScope } from '../access-scopes/entity-scope.js';

/** Refuses a shift the Labour Act does not allow, quoting the section. */
function checkStatute(shift: Pick<ShiftRow, 'startTime' | 'endTime' | 'breakMinutes'>) {
  const violations = bdShiftViolations(
    {
      spanMinutes: shiftSpanMinutes(hhmm(shift.startTime), hhmm(shift.endTime)),
      breakMinutes: shift.breakMinutes,
    },
    todayIn(),
  );
  if (!violations.length) return;
  const body: ApiError = {
    statusCode: 400,
    error: 'Bad Request',
    message: 'Outside the Labour Act’s working hours',
    code: 'statutory_limit',
    issues: violations.map((v) => ({
      path: v.field === 'span' ? 'endTime' : v.field,
      message: `${v.message} (${v.reference.act}, s.${v.reference.section})`,
    })),
  };
  throw new BadRequestException(body);
}

/** Shifts, who works them (assignments) and rotating rosters. */
@Injectable()
export class ShiftsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly processor: AttendanceProcessor,
    private readonly schedule: ScheduleService,
    private readonly audit: TenantAuditService,
  ) {}

  list(includeInactive: boolean): Promise<ShiftView[]> {
    return this.tenantDb.run(async (tx) =>
      (
        await tx
          .select()
          .from(shifts)
          .where(includeInactive ? undefined : eq(shifts.isActive, true))
          .orderBy(asc(shifts.startTime), asc(shifts.code))
      ).map(toShiftView),
    );
  }

  create(actor: AuthUser, input: ShiftInput): Promise<ShiftView> {
    return this.tenantDb.run(async (tx) => {
      checkStatute(input);
      if (input.isDefault) await tx.update(shifts).set({ isDefault: false });
      const [row] = await tx
        .insert(shifts)
        .values({ ...input, tenantId: currentTenantId() })
        .returning();
      await this.record(tx, actor, 'attendance.shift.create', row!.id, null, input);
      return toShiftView(row!);
    });
  }

  update(actor: AuthUser, id: string, input: ShiftUpdate): Promise<ShiftView> {
    return this.tenantDb.run(async (tx) => {
      const [current] = await tx.select().from(shifts).where(eq(shifts.id, id));
      if (!current) throw new NotFoundException('Shift not found');
      const merged = { ...current, ...input };
      if (merged.halfDayMinutes > merged.fullDayMinutes) {
        throw new BadRequestException('A half day cannot need more minutes than a full day');
      }
      if (current.isDefault && (input.isDefault === false || input.isActive === false)) {
        throw new BadRequestException('Make another shift the default first');
      }
      checkStatute(merged);
      if (input.isDefault)
        await tx.update(shifts).set({ isDefault: false }).where(ne(shifts.id, id));
      const [row] = await tx.update(shifts).set(input).where(eq(shifts.id, id)).returning();
      await this.record(tx, actor, 'attendance.shift.update', id, toShiftView(current), input);
      // New hours change this month's lateness and overtime for everyone on the shift.
      const timesChanged = (
        [
          'startTime',
          'endTime',
          'breakMinutes',
          'lateGraceMinutes',
          'earlyOutGraceMinutes',
          'halfDayMinutes',
          'fullDayMinutes',
          'overtimeEnabled',
          'overtimeMinMinutes',
          'overtimeRoundingMinutes',
        ] as const
      ).some((k) => input[k] !== undefined && input[k] !== current[k]);
      if (timesChanged || input.isDefault) {
        await this.processor.processSince(tx, undefined, `${todayIn().slice(0, 7)}-01`);
      }
      return toShiftView(row!);
    });
  }

  /**
   * Moves employees onto a shift from a date. Anything already planned from that date on is
   * replaced; the assignment before it ends the day before.
   */
  assign(actor: AuthUser, input: ShiftAssignmentInput): Promise<{ assigned: number }> {
    return this.tenantDb.run(async (tx) => {
      const [shift] = await tx.select().from(shifts).where(eq(shifts.id, input.shiftId));
      if (!shift?.isActive) throw new NotFoundException('Shift not found');
      const found = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(inArray(employees.id, input.employeeIds));
      if (found.length !== new Set(input.employeeIds).size) {
        throw new NotFoundException('Employee not found');
      }
      const ids = found.map((e) => e.id);
      await tx
        .delete(shiftAssignments)
        .where(
          and(
            inArray(shiftAssignments.employeeId, ids),
            gte(shiftAssignments.effectiveFrom, input.effectiveFrom),
          ),
        );
      await tx
        .update(shiftAssignments)
        .set({ effectiveTo: addDays(input.effectiveFrom, -1) })
        .where(
          and(
            inArray(shiftAssignments.employeeId, ids),
            lt(shiftAssignments.effectiveFrom, input.effectiveFrom),
            or(
              isNull(shiftAssignments.effectiveTo),
              gte(shiftAssignments.effectiveTo, input.effectiveFrom),
            ),
          ),
        );
      await tx.insert(shiftAssignments).values(
        ids.map((employeeId) => ({
          tenantId: currentTenantId(),
          employeeId,
          shiftId: input.shiftId,
          effectiveFrom: input.effectiveFrom,
          createdBy: actor.id,
        })),
      );
      await this.processor.processSince(tx, ids, input.effectiveFrom);
      await this.record(tx, actor, 'attendance.shift.assign', input.shiftId, null, input);
      return { assigned: ids.length };
    });
  }

  async history(tx: Tx, employeeId: string): Promise<ShiftAssignmentView[]> {
    const rows = await tx
      .select({ a: shiftAssignments, shift: shifts })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
      .where(eq(shiftAssignments.employeeId, employeeId))
      .orderBy(desc(shiftAssignments.effectiveFrom));
    return rows.map((r) => ({
      id: r.a.id,
      shift: toShiftRef(r.shift),
      effectiveFrom: r.a.effectiveFrom,
      effectiveTo: r.a.effectiveTo,
    }));
  }

  /** Writes a rotating pattern over a date range: day i gets pattern[i mod length]. */
  setRoster(actor: AuthUser, input: RosterInput): Promise<{ entries: number }> {
    return this.tenantDb.run(async (tx) => {
      const shiftIds = [...new Set(input.pattern.filter((p): p is string => p !== null))];
      if (shiftIds.length) {
        const active = await tx
          .select({ id: shifts.id })
          .from(shifts)
          .where(and(inArray(shifts.id, shiftIds), eq(shifts.isActive, true)));
        if (active.length !== shiftIds.length) throw new NotFoundException('Shift not found');
      }
      const values = [];
      for (let d = input.from, i = 0; d <= input.to; d = addDays(d, 1), i++) {
        for (const employeeId of input.employeeIds) {
          values.push({
            tenantId: currentTenantId(),
            employeeId,
            date: d,
            shiftId: input.pattern[i % input.pattern.length]!,
            createdBy: actor.id,
          });
        }
      }
      for (let i = 0; i < values.length; i += 1000) {
        await tx
          .insert(rosterEntries)
          .values(values.slice(i, i + 1000))
          .onConflictDoUpdate({
            target: [rosterEntries.tenantId, rosterEntries.employeeId, rosterEntries.date],
            set: { shiftId: sql`excluded.shift_id`, createdBy: actor.id },
          });
      }
      await this.processor.processSince(tx, input.employeeIds, input.from, input.to);
      await this.record(tx, actor, 'attendance.roster.set', null, null, input);
      return { entries: values.length };
    });
  }

  clearRoster(actor: AuthUser, input: RosterClearInput): Promise<{ entries: number }> {
    return this.tenantDb.run(async (tx) => {
      const removed = await tx
        .delete(rosterEntries)
        .where(
          and(
            inArray(rosterEntries.employeeId, input.employeeIds),
            gte(rosterEntries.date, input.from),
            lte(rosterEntries.date, input.to),
          ),
        )
        .returning({ id: rosterEntries.id });
      await this.processor.processSince(tx, input.employeeIds, input.from, input.to);
      await this.record(tx, actor, 'attendance.roster.clear', null, null, input);
      return { entries: removed.length };
    });
  }

  /** Who works what, day by day, for the people at a unit or location. */
  roster(
    user: AuthUser,
    query: {
      from: string;
      to: string;
      orgUnitId?: string;
      locationId?: string;
    },
  ): Promise<RosterView> {
    return this.tenantDb.run(async (tx) => {
      const units = query.orgUnitId ? await unitAndBelow(tx, query.orgUnitId) : null;
      const people = await tx
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.status, 'active'),
            units ? inArray(employees.id, employeesInUnits(tx, units, query.from)) : undefined,
            await entityScope(tx, user, employees.id),
            query.locationId
              ? inArray(
                  employees.id,
                  tx
                    .select({ id: jobAssignments.employeeId })
                    .from(jobAssignments)
                    .where(
                      and(eq(jobAssignments.locationId, query.locationId), inForceOn(query.from)),
                    ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(employees.employeeCode));
      const plans = await this.schedule.plans(
        tx,
        people.map((p) => p.id),
        query.from,
        query.to,
      );
      return {
        from: query.from,
        to: query.to,
        rows: people.map((person) => ({
          employee: employeeRef(person),
          days: plans.get(person.id)!.map((p) => ({
            date: p.date,
            shift: p.dayType === 'working' ? { id: p.shift.id, code: p.shift.code } : null,
            source: p.shiftSource,
            dayType: p.dayType,
          })),
        })),
      };
    });
  }

  private record(
    tx: Tx,
    actor: AuthUser,
    action: string,
    entityId: string | null,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record(tx, {
      actorUserId: actor.id,
      action,
      entityType: 'shift',
      entityId,
      before,
      after,
    });
  }
}
