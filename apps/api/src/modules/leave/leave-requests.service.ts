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
  leaveLedger,
  leaveRequests,
  leaveTypes,
  type Tx,
} from '@gp/db';
import { bdMaternityDays } from '@gp/country-packs';
import {
  addDays,
  countLeaveDays,
  todayIn,
  type ApprovalItem,
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
import {
  cancelOpenSteps,
  createApprovalSteps,
  type ApprovalStepRow,
  type ApprovalSubjectHandler,
} from '../approvals/approval-steps.js';
import { AttendanceProcessor } from '../attendance/processor.service.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { WorkCalendarService } from '../calendar/work-calendar.service.js';
import { userCan } from '../../common/roles.js';
import { employeeOfUser, teamScope } from '../employees/employee.queries.js';
import {
  leaveSummary,
  noticeRequested,
  type ApprovalSummary,
} from '../approvals/approval-notices.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BalancesService, type LeaveTypeRow } from './balances.service.js';
import { loadRequests } from './leave-views.js';

type EmployeeRow = typeof employees.$inferSelect;

@Injectable()
export class LeaveRequestsService implements ApprovalSubjectHandler<LeaveRequestView> {
  readonly auditPrefix = 'leave';
  readonly entityType = 'leave_request' as const;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly calendars: WorkCalendarService,
    private readonly balances: BalancesService,
    private readonly attendance: AttendanceProcessor,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
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

  /** Approval steps from the type's chain; a type without a chain stands approved. */
  private async createSteps(
    tx: Tx,
    request: typeof leaveRequests.$inferSelect,
    type: LeaveTypeRow,
  ) {
    const someoneDecides = await createApprovalSteps(tx, {
      tenantId: request.tenantId,
      type: 'leave_request',
      id: request.id,
      employeeId: request.employeeId,
      onDate: request.startDate,
      chain: type.approvalChain,
    });
    if (!someoneDecides) await this.finalize(tx, request.id, 'approved', request.appliedBy);
    else {
      await noticeRequested(
        tx,
        this.notifications,
        { type: 'leave_request', id: request.id },
        await this.summarize(tx, request.id),
      );
    }
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
      // Days already past now show as leave instead of absent.
      await this.attendance.processSince(
        tx,
        [request!.employeeId],
        request!.startDate,
        request!.endDate,
      );
    } else {
      await cancelOpenSteps(tx, requestId, ['waiting']);
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
      if (mine?.id !== request.employeeId && !userCan(user, 'leave.manage')) {
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
      await cancelOpenSteps(tx, requestId, ['pending', 'waiting']);
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
      const scope = await teamScope(tx, user, leaveRequests.employeeId, {
        onDate: today,
        orgUnitId: query.orgUnitId,
      });
      if (scope === null) throw new NotFoundException('No employee record is linked to your login');
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
    // Attendance on those dates becomes holiday or working day too.
    const sorted = dates.toSorted();
    await this.attendance.processSince(tx, undefined, sorted[0]!, sorted.at(-1)!);
    return changed;
  }

  // ── Approvals ──────────────────────────────────────────────────────────────

  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const [request] = await loadRequests(tx, eq(leaveRequests.id, subjectId));
    return {
      employeeId: request!.employee.id,
      personName: request!.employee.fullName,
      summary: leaveSummary(request!),
      link: '/workspace/leave',
    };
  }

  async lockSubject(tx: Tx, subjectId: string) {
    const [row] = await tx
      .select({ employeeId: leaveRequests.employeeId })
      .from(leaveRequests)
      .where(eq(leaveRequests.id, subjectId))
      .for('update');
    return row ?? null;
  }

  ownedBy(tx: Tx, employeeId: string): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(eq(leaveRequests.employeeId, employeeId)),
    );
  }

  /** Each waiting request with the balance it would draw on. */
  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const views = await loadRequests(
      tx,
      inArray(
        leaveRequests.id,
        steps.map((s) => s.subjectId),
      ),
    );
    const items: { sortKey: string; item: ApprovalItem }[] = [];
    for (const step of steps) {
      const request = views.find((v) => v.id === step.subjectId);
      if (!request) continue;
      const [employee] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, request.employee.id));
      const [type] = await tx
        .select()
        .from(leaveTypes)
        .where(eq(leaveTypes.id, request.leaveType.id));
      items.push({
        sortKey: request.startDate,
        item: {
          subjectType: 'leave_request',
          stepId: step.id,
          kind: step.kind,
          request,
          balance: await this.balances.balance(
            tx,
            employee!,
            type!,
            Number(request.startDate.slice(0, 4)),
          ),
        },
      });
    }
    return items;
  }

  view(subjectId: string): Promise<LeaveRequestView> {
    return this.get(subjectId);
  }

  /** HR may act for anyone; everyone else only for themselves. */
  private async resolveEmployee(
    tx: Tx,
    user: AuthUser,
    employeeId: string | null,
  ): Promise<EmployeeRow> {
    if (employeeId) {
      if (!userCan(user, 'leave.manage')) {
        throw new ForbiddenException('Only HR can apply on someone else’s behalf');
      }
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
