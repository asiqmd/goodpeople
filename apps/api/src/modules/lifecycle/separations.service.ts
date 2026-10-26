import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  approvalSteps,
  authSessions,
  employees,
  jobAssignments,
  leaveRequests,
  rosterEntries,
  separations,
  shiftAssignments,
  tenantUsers,
  type Tx,
} from '@gp/db';
import { bdNoticeDays } from '@gp/country-packs';
import {
  addDays,
  type ApprovalItem,
  type ChainStepKind,
  type ResignationInput,
  type SeparationInput,
  type SeparationStatus,
  type SeparationType,
  type SeparationView,
  todayIn,
} from '@gp/shared';
import { and, desc, eq, gt, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import {
  cancelOpenSteps,
  createApprovalSteps,
  type ApprovalStepRow,
  type ApprovalSubjectHandler,
  whose,
  type Whose,
} from '../approvals/approval-steps.js';
import {
  noticeRequested,
  separationSummary,
  type ApprovalSummary,
} from '../approvals/approval-notices.js';
import { loadSteps } from '../approvals/approval-views.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { AttendanceProcessor } from '../attendance/processor.service.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { userCan } from '../../common/roles.js';
import { inScope, mustChangeEmployee } from '../access-scopes/employee-scope.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { employeeOfUser, inForceOn } from '../employees/employee.queries.js';

type SeparationRow = typeof separations.$inferSelect;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Labour Act notice for this separation, judged by the job in force when notice is given. */
async function requiredNotice(
  tx: Tx,
  employeeId: string,
  type: SeparationType,
  noticeDate: string,
) {
  const [job] = await tx
    .select({ employmentType: jobAssignments.employmentType })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.employeeId, employeeId), inForceOn(noticeDate)));
  return bdNoticeDays(
    type,
    // Monthly wages are assumed until pay structures arrive with payroll.
    { permanent: job?.employmentType === 'permanent', monthlyRated: true },
    noticeDate,
  );
}

/**
 * How employment ends. An employee's resignation goes for approval (manager, then HR);
 * what HR records stands approved. Once the last working day has passed the separation is
 * completed: the job ends, the login is disabled and future plans are cleared.
 */
@Injectable()
export class SeparationsService implements ApprovalSubjectHandler<SeparationView> {
  readonly auditPrefix = 'separation';
  readonly entityType = 'separation' as const;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly attendance: AttendanceProcessor,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** HR records a separation of any kind; it is approved as it is saved. */
  async record(
    actor: AuthUser,
    employeeId: string,
    input: SeparationInput,
  ): Promise<SeparationView> {
    const id = await this.tenantDb.run(async (tx) => {
      await mustChangeEmployee(tx, actor, employeeId);
      const employee = await this.activeEmployee(tx, employeeId);
      const [row] = await tx
        .insert(separations)
        .values({
          tenantId: currentTenantId(),
          employeeId: employee.id,
          type: input.type,
          status: 'approved',
          noticeDate: input.noticeDate,
          lastWorkingDay: input.lastWorkingDay,
          reason: input.reason,
          noticeDaysRequired: await requiredNotice(tx, employee.id, input.type, input.noticeDate),
          initiatedBy: 'hr',
          appliedBy: actor.id,
          decidedAt: new Date(),
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'separation.record',
        entityType: 'separation',
        entityId: row!.id,
        after: { employeeId, ...input },
      });
      await this.completeIfDue(tx, row!, actor.id);
      return row!.id;
    });
    return this.view(id);
  }

  /** The signed-in employee resigns, giving notice today. */
  async resign(user: AuthUser, input: ResignationInput): Promise<SeparationView> {
    const id = await this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      const employee = await this.activeEmployee(tx, me.id);
      const today = todayIn();
      if (input.lastWorkingDay < today) {
        throw badRequest('past_last_day', 'The last working day cannot be in the past');
      }
      const [row] = await tx
        .insert(separations)
        .values({
          tenantId: currentTenantId(),
          employeeId: employee.id,
          type: 'resignation',
          status: 'pending',
          noticeDate: today,
          lastWorkingDay: input.lastWorkingDay,
          reason: input.reason,
          noticeDaysRequired: await requiredNotice(tx, employee.id, 'resignation', today),
          initiatedBy: 'employee',
          appliedBy: user.id,
        })
        .returning();
      await createApprovalSteps(tx, {
        tenantId: row!.tenantId,
        type: 'separation',
        id: row!.id,
        employeeId: employee.id,
        onDate: today,
        chain: ['manager', 'hr'],
      });
      await noticeRequested(
        tx,
        this.notifications,
        { type: 'separation', id: row!.id },
        await this.summarize(tx, row!.id),
      );
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'separation.resign',
        entityType: 'separation',
        entityId: row!.id,
        after: input,
      });
      return row!.id;
    });
    return this.view(id);
  }

  /** Withdraws a resignation, or HR calls off a separation, before it is completed. */
  async cancel(user: AuthUser, id: string): Promise<SeparationView> {
    await this.tenantDb.run(async (tx) => {
      const [row] = await tx.select().from(separations).where(eq(separations.id, id)).for('update');
      if (!row) throw new NotFoundException('Separation not found');
      const me = await employeeOfUser(tx, user.id);
      if (
        !userCan(user, 'lifecycle.manage') &&
        (me?.id !== row.employeeId || row.status !== 'pending')
      ) {
        throw new ForbiddenException('Only HR can call off an approved separation');
      }
      if (me?.id !== row.employeeId && !(await inScope(tx, user, row.employeeId))) {
        throw new NotFoundException('Separation not found');
      }
      if (row.status !== 'pending' && row.status !== 'approved') {
        throw conflict('not_open', `This separation is ${row.status}`);
      }
      await tx
        .update(separations)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(separations.id, id));
      await cancelOpenSteps(tx, id, ['pending', 'waiting']);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'separation.cancel',
        entityType: 'separation',
        entityId: id,
        before: { status: row.status },
      });
    });
    return this.view(id);
  }

  private async activeEmployee(tx: Tx, employeeId: string) {
    const [employee] = await tx
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .for('update');
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.status !== 'active') throw conflict('separated', 'This employee has already left');
    const [open] = await tx
      .select({ id: separations.id })
      .from(separations)
      .where(
        and(
          eq(separations.employeeId, employeeId),
          inArray(separations.status, ['pending', 'approved']),
        ),
      );
    if (open) throw conflict('separation_open', 'A separation is already in progress');
    return employee;
  }

  /** Completes an approved separation once its last working day has passed. */
  async completeIfDue(tx: Tx, row: SeparationRow, actorUserId: string | null): Promise<boolean> {
    if (row.status !== 'approved' || row.lastWorkingDay >= todayIn()) return false;
    const last = row.lastWorkingDay;
    const [employee] = await tx
      .update(employees)
      .set({ status: 'separated', separatedOn: last, updatedAt: new Date() })
      .where(eq(employees.id, row.employeeId))
      .returning();
    // The job and shift end on the last working day; anything planned after it goes.
    await tx
      .delete(jobAssignments)
      .where(
        and(eq(jobAssignments.employeeId, row.employeeId), gt(jobAssignments.effectiveFrom, last)),
      );
    await tx
      .update(jobAssignments)
      .set({ effectiveTo: last })
      .where(
        and(
          eq(jobAssignments.employeeId, row.employeeId),
          or(isNull(jobAssignments.effectiveTo), gt(jobAssignments.effectiveTo, last)),
        ),
      );
    await tx
      .delete(shiftAssignments)
      .where(
        and(
          eq(shiftAssignments.employeeId, row.employeeId),
          gt(shiftAssignments.effectiveFrom, last),
        ),
      );
    await tx
      .update(shiftAssignments)
      .set({ effectiveTo: last })
      .where(
        and(
          eq(shiftAssignments.employeeId, row.employeeId),
          or(isNull(shiftAssignments.effectiveTo), gt(shiftAssignments.effectiveTo, last)),
        ),
      );
    await tx
      .delete(rosterEntries)
      .where(and(eq(rosterEntries.employeeId, row.employeeId), gt(rosterEntries.date, last)));
    const dropped = await tx
      .update(leaveRequests)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(
        and(
          eq(leaveRequests.employeeId, row.employeeId),
          eq(leaveRequests.status, 'pending'),
          gt(leaveRequests.startDate, last),
        ),
      )
      .returning({ id: leaveRequests.id });
    for (const r of dropped) await cancelOpenSteps(tx, r.id, ['pending', 'waiting']);
    if (employee?.userId) {
      await tx
        .update(tenantUsers)
        .set({ disabledAt: new Date() })
        .where(eq(tenantUsers.id, employee.userId));
      await tx
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(authSessions.subjectKind, 'tenant'),
            eq(authSessions.subjectId, employee.userId),
            isNull(authSessions.revokedAt),
          ),
        );
    }
    await tx
      .update(separations)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(separations.id, row.id));
    await this.attendance.processSince(tx, [row.employeeId], addDays(last, 1));
    await this.audit.record(tx, {
      actorUserId: actorUserId ?? row.appliedBy,
      action: 'employee.separate',
      entityType: 'employee',
      entityId: row.employeeId,
      after: { type: row.type, lastWorkingDay: last, separationId: row.id },
    });
    return true;
  }

  /** Every approved separation whose last day has passed: the background run calls this. */
  completeDue(): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const due = await tx.select().from(separations).where(eq(separations.status, 'approved'));
      let completed = 0;
      for (const row of due) if (await this.completeIfDue(tx, row, null)) completed += 1;
      return completed;
    });
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async load(tx: Tx, where: SQL | undefined): Promise<SeparationView[]> {
    const rows = await tx
      .select({ s: separations, employee: employees })
      .from(separations)
      .innerJoin(employees, eq(employees.id, separations.employeeId))
      .where(where)
      .orderBy(desc(separations.createdAt));
    const steps = await loadSteps(
      tx,
      'separation',
      rows.map((r) => r.s.id),
    );
    return rows.map(({ s, employee }) => ({
      id: s.id,
      employee: employeeRef(employee),
      type: s.type,
      status: s.status,
      noticeDate: s.noticeDate,
      lastWorkingDay: s.lastWorkingDay,
      reason: s.reason,
      noticeDaysRequired: s.noticeDaysRequired,
      noticeShortfallDays:
        s.noticeDaysRequired === null
          ? 0
          : Math.max(0, s.noticeDaysRequired - daysBetween(s.noticeDate, s.lastWorkingDay)),
      initiatedBy: s.initiatedBy,
      steps: steps.get(s.id) ?? [],
      createdAt: s.createdAt.toISOString(),
      decidedAt: s.decidedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
    }));
  }

  async view(id: string): Promise<SeparationView> {
    const [view] = await this.tenantDb.run((tx) => this.load(tx, eq(separations.id, id)));
    if (!view) throw new NotFoundException('Separation not found');
    return view;
  }

  /** For the companies the user looks after. */
  list(user: AuthUser, query: { status?: SeparationStatus }): Promise<SeparationView[]> {
    return this.tenantDb.run(async (tx) =>
      this.load(
        tx,
        and(
          query.status ? eq(separations.status, query.status) : undefined,
          await entityScope(tx, user, separations.employeeId),
        ),
      ),
    );
  }

  forEmployee(user: AuthUser, employeeId: string): Promise<SeparationView[]> {
    return this.tenantDb.run(async (tx) =>
      this.load(
        tx,
        and(
          eq(separations.employeeId, employeeId),
          await entityScope(tx, user, separations.employeeId),
        ),
      ),
    );
  }

  mine(user: AuthUser): Promise<SeparationView[]> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      return this.load(tx, eq(separations.employeeId, me.id));
    });
  }

  // ── Approvals ──────────────────────────────────────────────────────────────

  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const [row] = await tx
      .select({ s: separations, name: employees.fullName })
      .from(separations)
      .innerJoin(employees, eq(employees.id, separations.employeeId))
      .where(eq(separations.id, subjectId));
    return {
      employeeId: row!.s.employeeId,
      personName: row!.name,
      summary: separationSummary(row!.s.type, row!.s.lastWorkingDay),
      link: '/workspace/profile',
    };
  }

  async lockSubject(tx: Tx, subjectId: string) {
    const [row] = await tx
      .select({ employeeId: separations.employeeId })
      .from(separations)
      .where(eq(separations.id, subjectId))
      .for('update');
    return row ?? null;
  }

  ownedBy(tx: Tx, who: Whose): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx.select({ id: separations.id }).from(separations).where(whose(separations.employeeId, who)),
    );
  }

  async finalize(tx: Tx, subjectId: string, outcome: 'approved' | 'rejected', actorUserId: string) {
    const [row] = await tx
      .update(separations)
      .set({ status: outcome, decidedAt: new Date() })
      .where(eq(separations.id, subjectId))
      .returning();
    if (outcome === 'approved') await this.completeIfDue(tx, row!, actorUserId);
  }

  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const views = await this.load(
      tx,
      inArray(
        separations.id,
        steps.map((s) => s.subjectId),
      ),
    );
    const items: { sortKey: string; item: ApprovalItem }[] = [];
    for (const step of steps) {
      const separation = views.find((v) => v.id === step.subjectId);
      if (!separation) continue;
      items.push({
        sortKey: separation.lastWorkingDay,
        item: {
          subjectType: 'separation',
          stepId: step.id,
          kind: step.kind as ChainStepKind,
          separation,
        },
      });
    }
    return items;
  }
}
