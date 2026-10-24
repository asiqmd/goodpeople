import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { approvalSteps, employees, leaveRequests, leaveTypes, type Tx } from '@gp/db';
import type { ApprovalItem, DecisionInput } from '@gp/shared';
import { and, asc, count, eq, gt, inArray, ne, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { BalancesService } from './balances.service.js';
import { employeeOfUser, isHr, LeaveRequestsService } from './leave-requests.service.js';
import { loadRequests } from './leave-views.js';

/**
 * Deciding approval steps. Manager steps belong to one employee; HR steps to any HR admin.
 * Nobody decides their own request, and the first rejection ends the chain.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly requests: LeaveRequestsService,
    private readonly balances: BalancesService,
    private readonly audit: TenantAuditService,
  ) {}

  /**
   * Pending steps the user may decide: manager steps addressed to their employee record, and
   * HR steps if they are HR, never on their own requests. null when they decide nothing.
   */
  private async waitingFor(tx: Tx, user: AuthUser): Promise<SQL | null> {
    const me = await employeeOfUser(tx, user.id);
    const mine = me
      ? and(eq(approvalSteps.kind, 'manager'), eq(approvalSteps.approverEmployeeId, me.id))
      : undefined;
    const hr = isHr(user) ? eq(approvalSteps.kind, 'hr') : undefined;
    if (!mine && !hr) return null;
    return and(
      eq(approvalSteps.subjectType, 'leave_request'),
      eq(approvalSteps.status, 'pending'),
      or(mine, hr),
      me ? ne(leaveRequests.employeeId, me.id) : undefined,
    )!;
  }

  /** How many decisions wait for the user; cheap enough for every page's navigation. */
  count(user: AuthUser): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const where = await this.waitingFor(tx, user);
      if (!where) return 0;
      const [row] = await tx
        .select({ value: count() })
        .from(approvalSteps)
        .innerJoin(leaveRequests, eq(leaveRequests.id, approvalSteps.subjectId))
        .where(where);
      return row?.value ?? 0;
    });
  }

  /** Steps waiting for the signed-in user. */
  inbox(user: AuthUser): Promise<ApprovalItem[]> {
    return this.tenantDb.run(async (tx) => {
      const where = await this.waitingFor(tx, user);
      if (!where) return [];
      const steps = await tx
        .select({ step: approvalSteps, request: leaveRequests })
        .from(approvalSteps)
        .innerJoin(leaveRequests, eq(leaveRequests.id, approvalSteps.subjectId))
        .where(where)
        .orderBy(asc(leaveRequests.startDate));
      if (steps.length === 0) return [];
      const views = await loadRequests(
        tx,
        inArray(
          leaveRequests.id,
          steps.map((s) => s.request.id),
        ),
      );
      const items: ApprovalItem[] = [];
      for (const { step, request } of steps) {
        const [employee] = await tx
          .select()
          .from(employees)
          .where(eq(employees.id, request.employeeId));
        const [type] = await tx
          .select()
          .from(leaveTypes)
          .where(eq(leaveTypes.id, request.leaveTypeId));
        items.push({
          stepId: step.id,
          kind: step.kind,
          request: views.find((v) => v.id === request.id)!,
          balance: await this.balances.balance(
            tx,
            employee!,
            type!,
            Number(request.startDate.slice(0, 4)),
          ),
        });
      }
      return items;
    });
  }

  async decide(
    user: AuthUser,
    stepId: string,
    outcome: 'approved' | 'rejected',
    input: DecisionInput,
  ) {
    const requestId = await this.tenantDb.run(async (tx) => {
      const [step] = await tx
        .select()
        .from(approvalSteps)
        .where(eq(approvalSteps.id, stepId))
        .for('update');
      if (!step) throw new NotFoundException('Approval not found');
      if (step.status !== 'pending') {
        throw new ConflictException(`This step is ${step.status}, not waiting for a decision`);
      }
      const [request] = await tx
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, step.subjectId))
        .for('update');
      const me = await employeeOfUser(tx, user.id);
      if (me?.id === request!.employeeId) {
        throw new ForbiddenException('You cannot decide your own request');
      }
      const allowed =
        step.kind === 'hr' ? isHr(user) : me !== null && me.id === step.approverEmployeeId;
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

      if (outcome === 'rejected') {
        await this.requests.finalize(tx, request!.id, 'rejected', user.id);
      } else {
        const [next] = await tx
          .select()
          .from(approvalSteps)
          .where(
            and(
              eq(approvalSteps.subjectId, request!.id),
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
        } else {
          await this.requests.finalize(tx, request!.id, 'approved', user.id);
        }
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: `leave.${outcome === 'approved' ? 'approve' : 'reject'}`,
        entityType: 'leave_request',
        entityId: request!.id,
        after: { step: step.stepNo, kind: step.kind, comment: input.comment ?? null },
      });
      return request!.id;
    });
    return this.requests.get(requestId);
  }
}
