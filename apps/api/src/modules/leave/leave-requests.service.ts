import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  approvalSteps,
  employees,
  holidays,
  jobAssignments,
  leaveLedger,
  leaveRequests,
  leaveTypes,
  orgUnits,
  type Tx,
} from '@gp/db';
import { bdMaternityDays } from '@gp/country-packs';
import {
  HR_ROLES,
  addDays,
  countLeaveDays,
  todayIn,
  type LeaveCalendarView,
  type LeavePreview,
  type LeavePreviewInput,
  type LeaveRequestInput,
  type LeaveRequestView,
} from '@gp/shared';
import { and, asc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { inForceOn } from '../employees/employee.queries.js';
import { BalancesService, type LeaveTypeRow } from './balances.service.js';
import { loadRequests } from './leave-views.js';
import { WorkCalendarService } from './work-calendar.service.js';

type EmployeeRow = typeof employees.$inferSelect;

export const isHr = (user: AuthUser) => (HR_ROLES as readonly string[]).includes(user.role);

/** The employee record linked to a workspace login, if any. */
export async function employeeOfUser(tx: Tx, userId: string): Promise<EmployeeRow | null> {
  const [row] = await tx.select().from(employees).where(eq(employees.userId, userId));
  return row ?? null;
}

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly calendars: WorkCalendarService,
    private readonly balances: BalancesService,
    private readonly audit: TenantAuditService,
  ) {}

  // ── Preview and apply ──────────────────────────────────────────────────────

  /** What a request would cost, and why it would be refused. Writes nothing. */
  preview(
    user: AuthUser,
    employeeId: string | null,
    input: LeavePreviewInput,
  ): Promise<LeavePreview> {
    return this.tenantDb.run(async (tx) => {
      const employee = await this.resolveEmployee(tx, user, employeeId);
      return this.evaluate(tx, employee, input);
    });
  }

  /**
   * Submits a request for the signed-in employee, or for `employeeId` when HR applies on
   * someone's behalf. Approval steps are created from the type's chain.
   */
  async apply(
    user: AuthUser,
    employeeId: string | null,
    input: LeaveRequestInput,
  ): Promise<LeaveRequestView> {
    const id = await this.tenantDb.run(async (tx) => {
      const target = await this.resolveEmployee(tx, user, employeeId);
      // One request at a time per employee, so balances and overlaps cannot race.
      const [employee] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, target.id))
        .for('update');
      const result = await this.evaluate(tx, employee!, input);
      if (result.problems.length) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: result.problems.join(' '),
          code: 'leave_not_allowed',
        });
      }
      const [type] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, input.leaveTypeId));
      const [request] = await tx
        .insert(leaveRequests)
        .values({
          tenantId: currentTenantId(),
          employeeId: employee!.id,
          leaveTypeId: input.leaveTypeId,
          startDate: input.startDate,
          endDate: input.endDate,
          halfDay: input.halfDay ?? null,
          days: result.days,
          reason: input.reason,
          needsDocument:
            type!.requiresDocumentAfterDays !== null &&
            result.days > type!.requiresDocumentAfterDays,
          appliedBy: user.id,
        })
        .returning();
      await this.createSteps(tx, request!, type!);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'leave.apply',
        entityType: 'leave_request',
        entityId: request!.id,
        after: { employeeId: employee!.id, type: type!.code, ...input, days: result.days },
      });
      return request!.id;
    });
    return this.get(id);
  }

  private async evaluate(
    tx: Tx,
    employee: EmployeeRow,
    input: LeavePreviewInput,
  ): Promise<LeavePreview> {
    const [type] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, input.leaveTypeId));
    if (!type) throw new NotFoundException('Leave type not found');
    const problems: string[] = [];
    const calendar = await this.calendars.forEmployee(tx, employee.id, input.startDate);
    const counted = countLeaveDays(input.startDate, input.endDate, {
      weeklyOffDays: calendar.weeklyOffDays,
      holidays: await this.calendars.holidaysIn(
        tx,
        calendar.calendarId,
        input.startDate,
        input.endDate,
      ),
      countsOffDays: type.countsOffDays,
      halfDay: input.halfDay,
    });

    if (!type.isActive) problems.push('This leave type is no longer in use.');
    if (employee.status !== 'active') problems.push('This employee has separated.');
    if (type.gender && type.gender !== employee.gender) {
      problems.push(`This leave is only for ${type.gender} employees.`);
    }
    const eligibleFrom = type.minServiceDays
      ? addDays(employee.joinedOn, type.minServiceDays)
      : null;
    if (eligibleFrom && input.startDate < eligibleFrom) {
      problems.push(`Eligible from ${eligibleFrom}, after ${type.minServiceDays} days of service.`);
    }
    if (input.halfDay && !type.allowHalfDay)
      problems.push('Half days are not allowed for this leave.');
    if (counted.days === 0) problems.push('These dates are all weekly offs or holidays.');

    if (type.accrual === 'per_event') {
      const max =
        type.statutoryKey === 'maternity'
          ? bdMaternityDays(type.maxDaysPerRequest, input.startDate)
          : (type.maxDaysPerRequest ?? Infinity);
      if (counted.days > max) problems.push(`At most ${max} days per request.`);
    }

    const [overlap] = await tx
      .select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, employee.id),
          inArray(leaveRequests.status, ['pending', 'approved']),
          lte(leaveRequests.startDate, input.endDate),
          gte(leaveRequests.endDate, input.startDate),
        ),
      );
    if (overlap) {
      problems.push(
        `Overlaps leave already requested from ${overlap.startDate} to ${overlap.endDate}.`,
      );
    }

    const balance = await this.balances.balance(
      tx,
      employee,
      type,
      Number(input.startDate.slice(0, 4)),
      calendar,
    );
    if (balance.available !== null && counted.days > balance.available) {
      problems.push(`Only ${balance.available} days available.`);
    }
    return { days: counted.days, excluded: counted.excluded, balance, problems };
  }

  /**
   * Builds the approval steps. A manager step goes to the manager on the start date; if there
   * is no manager, or they have no workspace login, it is skipped so the request never sticks.
   * If that leaves no one to decide, an HR step is added.
   */
  private async createSteps(
    tx: Tx,
    request: typeof leaveRequests.$inferSelect,
    type: LeaveTypeRow,
  ) {
    const [job] = await tx
      .select({ managerId: jobAssignments.managerId })
      .from(jobAssignments)
      .where(and(eq(jobAssignments.employeeId, request.employeeId), inForceOn(request.startDate)));
    const manager = job?.managerId
      ? (await tx.select().from(employees).where(eq(employees.id, job.managerId)))[0]
      : undefined;

    let pendingSet = false;
    const steps = type.approvalChain.map((kind, i) => {
      const approverEmployeeId = kind === 'manager' ? (manager?.id ?? null) : null;
      const reachable =
        kind === 'hr' || (manager?.userId != null && manager.id !== request.employeeId);
      const status = !reachable ? 'skipped' : pendingSet ? 'waiting' : 'pending';
      if (status === 'pending') pendingSet = true;
      return {
        tenantId: request.tenantId,
        subjectType: 'leave_request',
        subjectId: request.id,
        stepNo: i + 1,
        kind,
        approverEmployeeId,
        status: status as 'skipped' | 'waiting' | 'pending',
      };
    });
    // Every step was skipped (no reachable manager): HR decides rather than auto-approving.
    if (steps.length && !pendingSet) {
      steps.push({
        tenantId: request.tenantId,
        subjectType: 'leave_request',
        subjectId: request.id,
        stepNo: steps.length + 1,
        kind: 'hr',
        approverEmployeeId: null,
        status: 'pending',
      });
      pendingSet = true;
    }
    if (steps.length) await tx.insert(approvalSteps).values(steps);
    // An empty approval chain means the type needs no approval: it stands approved.
    if (!pendingSet) await this.finalize(tx, request.id, 'approved', request.appliedBy);
  }

  /** Marks a request approved (debiting the balance) or rejected. Used by approvals too. */
  async finalize(tx: Tx, requestId: string, outcome: 'approved' | 'rejected', actorUserId: string) {
    const [request] = await tx
      .update(leaveRequests)
      .set({ status: outcome, decidedAt: new Date() })
      .where(eq(leaveRequests.id, requestId))
      .returning();
    if (outcome === 'approved') {
      const [type] = await tx
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.id, request!.leaveTypeId));
      if (type!.accrual !== 'per_event') {
        await tx.insert(leaveLedger).values({
          tenantId: request!.tenantId,
          employeeId: request!.employeeId,
          leaveTypeId: request!.leaveTypeId,
          leaveYear: Number(request!.startDate.slice(0, 4)),
          kind: 'taken',
          days: -request!.days,
          requestId,
          createdBy: actorUserId,
        });
      }
    } else {
      await tx
        .update(approvalSteps)
        .set({ status: 'cancelled' })
        .where(and(eq(approvalSteps.subjectId, requestId), eq(approvalSteps.status, 'waiting')));
    }
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  /** The employee or HR cancels: pending at any time, approved only before it starts. */
  async cancel(user: AuthUser, requestId: string): Promise<LeaveRequestView> {
    await this.tenantDb.run(async (tx) => {
      const [request] = await tx
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, requestId))
        .for('update');
      if (!request) throw new NotFoundException('Leave request not found');
      const mine = await employeeOfUser(tx, user.id);
      if (mine?.id !== request.employeeId && !isHr(user)) {
        throw new ForbiddenException('You can only cancel your own leave');
      }
      if (request.status === 'approved' && request.startDate <= todayIn()) {
        throw new ConflictException(
          'Leave that has started cannot be cancelled; ask HR to adjust it',
        );
      }
      if (request.status !== 'pending' && request.status !== 'approved') {
        throw new ConflictException(`This request is already ${request.status}`);
      }
      await tx
        .update(leaveRequests)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(leaveRequests.id, requestId));
      await tx
        .update(approvalSteps)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(approvalSteps.subjectId, requestId),
            inArray(approvalSteps.status, ['pending', 'waiting']),
          ),
        );
      if (request.status === 'approved') {
        await tx.insert(leaveLedger).values({
          tenantId: request.tenantId,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          leaveYear: Number(request.startDate.slice(0, 4)),
          kind: 'reversal',
          days: request.days,
          requestId,
          note: 'Cancelled before it started',
          createdBy: user.id,
        });
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'leave.cancel',
        entityType: 'leave_request',
        entityId: requestId,
        before: { status: request.status },
      });
    });
    return this.get(requestId);
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async get(id: string): Promise<LeaveRequestView> {
    const [request] = await this.tenantDb.run((tx) => loadRequests(tx, eq(leaveRequests.id, id)));
    if (!request) throw new NotFoundException('Leave request not found');
    return request;
  }

  listForEmployee(employeeId: string, year?: number): Promise<LeaveRequestView[]> {
    return this.tenantDb.run((tx) =>
      loadRequests(tx, and(eq(leaveRequests.employeeId, employeeId), yearFilter(year))),
    );
  }

  async listMine(user: AuthUser, year?: number): Promise<LeaveRequestView[]> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      return loadRequests(tx, and(eq(leaveRequests.employeeId, me.id), yearFilter(year)));
    });
  }

  listAll(query: { status?: string; year?: number }): Promise<LeaveRequestView[]> {
    return this.tenantDb.run((tx) =>
      loadRequests(
        tx,
        and(
          query.status ? eq(leaveRequests.status, query.status as 'pending') : undefined,
          yearFilter(query.year),
        ),
      ),
    );
  }

  /**
   * Who is away in a date range. HR sees everyone (optionally one unit and below); others
   * see themselves, their direct reports and colleagues in their own unit.
   */
  calendar(
    user: AuthUser,
    query: { from: string; to: string; orgUnitId?: string },
  ): Promise<LeaveCalendarView> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const me = await employeeOfUser(tx, user.id);
      let scope: SQL | undefined;
      if (isHr(user)) {
        if (query.orgUnitId) {
          const units = await unitAndBelow(tx, query.orgUnitId);
          scope = inArray(leaveRequests.employeeId, employeesInUnits(tx, units, today));
        }
      } else {
        if (!me) throw new NotFoundException('No employee record is linked to your login');
        const [myJob] = await tx
          .select()
          .from(jobAssignments)
          .where(and(eq(jobAssignments.employeeId, me.id), inForceOn(today)));
        const sameUnit = myJob?.orgUnitId
          ? employeesInUnits(tx, [myJob.orgUnitId], today)
          : undefined;
        const reports = tx
          .select({ id: jobAssignments.employeeId })
          .from(jobAssignments)
          .where(and(eq(jobAssignments.managerId, me.id), inForceOn(today)));
        scope = or(
          eq(leaveRequests.employeeId, me.id),
          inArray(leaveRequests.employeeId, reports),
          sameUnit ? inArray(leaveRequests.employeeId, sameUnit) : undefined,
        );
      }
      const requests = await loadRequests(
        tx,
        and(
          inArray(leaveRequests.status, ['pending', 'approved']),
          lte(leaveRequests.startDate, query.to),
          gte(leaveRequests.endDate, query.from),
          scope,
        ),
      );
      const calendar = me
        ? await this.calendars.forEmployee(tx, me.id, query.from)
        : { calendarId: await this.calendars.defaultCalendarId(tx) };
      const holidayRows = calendar.calendarId
        ? await tx
            .select()
            .from(holidays)
            .where(
              and(
                eq(holidays.calendarId, calendar.calendarId),
                gte(holidays.date, query.from),
                lte(holidays.date, query.to),
              ),
            )
            .orderBy(asc(holidays.date))
        : [];
      return {
        from: query.from,
        to: query.to,
        holidays: holidayRows.map((h) => ({
          id: h.id,
          calendarId: h.calendarId,
          date: h.date,
          name: h.name,
          nameBn: h.nameBn,
          kind: h.kind,
          isTentative: h.isTentative,
        })),
        entries: requests
          .map((r) => ({
            requestId: r.id,
            employee: r.employee,
            leaveType: {
              code: r.leaveType.code,
              name: r.leaveType.name,
              nameBn: r.leaveType.nameBn,
            },
            startDate: r.startDate,
            endDate: r.endDate,
            status: r.status,
          }))
          .toSorted((a, b) => a.employee.fullName.localeCompare(b.employee.fullName)),
      };
    });
  }

  // ── Holiday recalculation ─────────────────────────────────────────────────

  /**
   * After a holiday is added, moved or removed, recounts the days of open and approved leave
   * covering those dates for employees on that calendar. Approved leave gets a correction in
   * the ledger, so the history shows what changed.
   */
  async recalculateForHoliday(tx: Tx, calendarId: string, dates: string[], actorUserId: string) {
    const touched = await tx
      .select()
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.status, ['pending', 'approved']),
          or(
            ...dates.map((d) =>
              and(lte(leaveRequests.startDate, d), gte(leaveRequests.endDate, d)),
            ),
          ),
        ),
      );
    let changed = 0;
    for (const request of touched) {
      const calendar = await this.calendars.forEmployee(tx, request.employeeId, request.startDate);
      if (calendar.calendarId !== calendarId) continue;
      const [type] = await tx
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.id, request.leaveTypeId));
      const { days } = countLeaveDays(request.startDate, request.endDate, {
        weeklyOffDays: calendar.weeklyOffDays,
        holidays: await this.calendars.holidaysIn(
          tx,
          calendarId,
          request.startDate,
          request.endDate,
        ),
        countsOffDays: type!.countsOffDays,
        halfDay: request.halfDay,
      });
      if (days === request.days) continue;
      changed += 1;
      await tx.update(leaveRequests).set({ days }).where(eq(leaveRequests.id, request.id));
      if (request.status === 'approved' && type!.accrual !== 'per_event') {
        await tx.insert(leaveLedger).values({
          tenantId: request.tenantId,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          leaveYear: Number(request.startDate.slice(0, 4)),
          kind: 'recalculation',
          days: request.days - days,
          requestId: request.id,
          note: `Holiday change: ${request.days} → ${days} days`,
          createdBy: actorUserId,
        });
      }
    }
    return changed;
  }

  /** HR may act for anyone; everyone else only for themselves. */
  private async resolveEmployee(
    tx: Tx,
    user: AuthUser,
    employeeId: string | null,
  ): Promise<EmployeeRow> {
    if (employeeId) {
      if (!isHr(user)) throw new ForbiddenException('Only HR can apply on someone else’s behalf');
      const [row] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!row) throw new NotFoundException('Employee not found');
      return row;
    }
    const me = await employeeOfUser(tx, user.id);
    if (!me) throw new NotFoundException('No employee record is linked to your login');
    return me;
  }
}

const yearFilter = (year?: number) =>
  year === undefined ? undefined : sql`extract(year from ${leaveRequests.startDate}) = ${year}`;

/** Employees whose job today sits in one of these units, as a subquery. */
const employeesInUnits = (tx: Tx, units: string[], today: string) =>
  tx
    .select({ id: jobAssignments.employeeId })
    .from(jobAssignments)
    .where(and(inArray(jobAssignments.orgUnitId, units), inForceOn(today)));

export async function unitAndBelow(tx: Tx, unitId: string): Promise<string[]> {
  const all = await tx.select({ id: orgUnits.id, parentId: orgUnits.parentId }).from(orgUnits);
  const ids = [unitId];
  for (let i = 0; i < ids.length; i++) {
    ids.push(...all.filter((u) => u.parentId === ids[i]).map((u) => u.id));
  }
  return ids;
}
