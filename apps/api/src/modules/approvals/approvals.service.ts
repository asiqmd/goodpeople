import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { approvalSteps, tenantUsers, type Tx } from '@gp/db';
import type { ApprovalItem, ApprovalSubject, DecisionInput } from '@gp/shared';
import { and, asc, count, eq, gt, inArray, not, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { TenantDb } from '../../db/db.module.js';
import { RegularizationsService } from '../attendance/regularizations.service.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { userCan } from '../../common/roles.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { LeaveRequestsService } from '../leave/leave-requests.service.js';
import { SeparationsService } from '../lifecycle/separations.service.js';
import { EmployeePayService } from '../payroll/employee-pay.service.js';
import { forbidden } from '../../common/errors.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { noticeDecided, noticeRequested } from './approval-notices.js';
import { cancelOpenSteps, type ApprovalSubjectHandler } from './approval-steps.js';

/**
 * Deciding approval steps, whatever they approve (leave, attendance corrections,
 * resignations). Manager steps belong to one employee; HR
 * steps to any HR admin. Nobody decides their own request, and the first rejection ends the
 * chain.
 */
@Injectable()
export class ApprovalsService {
  private readonly handlers: Record<ApprovalSubject, ApprovalSubjectHandler>;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
    leave: LeaveRequestsService,
    regularizations: RegularizationsService,
    separations: SeparationsService,
    pay: EmployeePayService,
  ) {
    this.handlers = {
      leave_request: leave,
      regularization: regularizations,
      separation: separations,
      compensation: pay,
    };
  }

  /**
   * Pending steps the user may decide: manager steps addressed to their employee record, and
   * HR steps if they are HR, never on their own requests. null when they decide nothing.
   */
  private async waitingFor(tx: Tx, user: AuthUser): Promise<SQL | null> {
    const me = await employeeOfUser(tx, user.id);
    const mine = me
      ? and(eq(approvalSteps.kind, 'manager'), eq(approvalSteps.approverEmployeeId, me.id))
      : undefined;
    const hr = userCan(user, 'approvals.hr') ? eq(approvalSteps.kind, 'hr') : undefined;
    const payroll = userCan(user, 'payroll.approve')
      ? eq(approvalSteps.kind, 'payroll')
      : undefined;
    if (!mine && !hr && !payroll) return null;
    // What this login proposed itself waits for someone else (maker-checker).
    const made = Object.values(this.handlers).flatMap((h) =>
      h.madeBy ? [h.madeBy(tx, user.id)] : [],
    );
    return and(
      eq(approvalSteps.status, 'pending'),
      inArray(approvalSteps.subjectType, Object.keys(this.handlers)),
      or(mine, hr, payroll),
      me ? not(or(...Object.values(this.handlers).map((h) => h.ownedBy(tx, me.id)))!) : undefined,
      made.length ? not(or(...made)!) : undefined,
    )!;
  }

  /** How many decisions wait for the user; cheap enough for every page's navigation. */
  count(user: AuthUser): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const where = await this.waitingFor(tx, user);
      if (!where) return 0;
      const [row] = await tx.select({ value: count() }).from(approvalSteps).where(where);
      return row?.value ?? 0;
    });
  }

  /** Steps waiting for the signed-in user, oldest first. */
  inbox(user: AuthUser): Promise<ApprovalItem[]> {
    return this.tenantDb.run(async (tx) => {
      const where = await this.waitingFor(tx, user);
      if (!where) return [];
      const steps = await tx.select().from(approvalSteps).where(where);
      // One transaction runs one query at a time, so the handlers go in turn.
      const entries = [];
      for (const type of Object.keys(this.handlers) as ApprovalSubject[]) {
        const ofType = steps.filter((s) => s.subjectType === type);
        if (ofType.length) entries.push(...(await this.handlers[type].inboxItems(tx, ofType)));
      }
      return entries.toSorted((a, b) => a.sortKey.localeCompare(b.sortKey)).map((e) => e.item);
    });
  }

  async decide(
    user: AuthUser,
    stepId: string,
    outcome: 'approved' | 'rejected',
    input: DecisionInput,
  ): Promise<unknown> {
    const decided = await this.tenantDb.run(async (tx) => {
      const [step] = await tx
        .select()
        .from(approvalSteps)
        .where(eq(approvalSteps.id, stepId))
        .for('update');
      if (!step) throw new NotFoundException('Approval not found');
      if (step.status !== 'pending') {
        throw new ConflictException(`This step is ${step.status}, not waiting for a decision`);
      }
      const handler = this.handlers[step.subjectType as ApprovalSubject];
      const subject = handler ? await handler.lockSubject(tx, step.subjectId) : null;
      if (!handler || !subject) throw new NotFoundException('Approval not found');
      const me = await employeeOfUser(tx, user.id);
      if (me?.id === subject.employeeId) {
        throw new ForbiddenException('You cannot decide your own request');
      }
      if (subject.madeBy && subject.madeBy === user.id) {
        throw forbidden('own_change', 'Someone else must approve a change you proposed');
      }
      const allowed =
        step.kind === 'hr'
          ? userCan(user, 'approvals.hr')
          : step.kind === 'payroll'
            ? userCan(user, 'payroll.approve')
            : me !== null && me.id === step.approverEmployeeId;
      if (!allowed) throw new ForbiddenException('This approval is not yours to decide');

      await tx
        .update(approvalSteps)
        .set({
          status: outcome,
          decidedByUserId: user.id,
          decidedAt: new Date(),
          comment: input.comment ?? null,
        })
        .where(eq(approvalSteps.id, stepId));

      const subjectRef = { type: step.subjectType as ApprovalSubject, id: step.subjectId };
      const conclude = async (final: 'approved' | 'rejected') => {
        await handler.finalize(tx, step.subjectId, final, user.id);
        const [decider] = await tx
          .select({ name: tenantUsers.name })
          .from(tenantUsers)
          .where(eq(tenantUsers.id, user.id));
        await noticeDecided(
          tx,
          this.notifications,
          subjectRef,
          await handler.summarize(tx, step.subjectId),
          {
            outcome: final,
            by: decider?.name ?? '',
            comment: input.comment ?? null,
          },
        );
      };
      if (outcome === 'rejected') {
        await cancelOpenSteps(tx, step.subjectId, ['waiting']);
        await conclude('rejected');
      } else {
        const [next] = await tx
          .select()
          .from(approvalSteps)
          .where(
            and(
              eq(approvalSteps.subjectId, step.subjectId),
              eq(approvalSteps.status, 'waiting'),
              gt(approvalSteps.stepNo, step.stepNo),
            ),
          )
          .orderBy(asc(approvalSteps.stepNo))
          .limit(1);
        if (next) {
          await tx
            .update(approvalSteps)
            .set({ status: 'pending' })
            .where(eq(approvalSteps.id, next.id));
          await noticeRequested(
            tx,
            this.notifications,
            subjectRef,
            await handler.summarize(tx, step.subjectId),
          );
        } else {
          await conclude('approved');
        }
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: `${handler.auditPrefix}.${outcome === 'approved' ? 'approve' : 'reject'}`,
        entityType: handler.entityType,
        entityId: step.subjectId,
        after: { step: step.stepNo, kind: step.kind, comment: input.comment ?? null },
      });
      return { handler, subjectId: step.subjectId };
    });
    return decided.handler.view(decided.subjectId);
  }
}
