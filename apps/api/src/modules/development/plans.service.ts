import { Injectable } from '@nestjs/common';
import {
  employees,
  improvementPlans,
  planCheckins,
  reviewCycles,
  reviews,
  tenantAuditLog,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  addDays,
  OPEN_PLAN_STATUSES,
  RUNNING_PLAN_STATUSES,
  todayIn,
  type EmployeeRef,
  type PlanAcknowledgeInput,
  type PlanCheckinInput,
  type PlanCloseInput,
  type PlanCreateInput,
  type PlanExtendInput,
  type PlanListItem,
  type PlanListQuery,
  type PlanStatus,
  type PlanUpdateInput,
  type PlanView,
} from '@gp/shared';
import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { localDate, NotificationsService } from '../notifications/notifications.service.js';
import {
  employeeRefs,
  jobOn,
  managesPerson,
  notFound,
  reportsBelow,
  viewerOf,
  type Viewer,
} from './access.js';

type PlanRow = typeof improvementPlans.$inferSelect;
type Role = 'manage' | 'person';

const AUDIT = { entityType: 'improvement_plan' } as const;
const running = (status: PlanStatus) =>
  (RUNNING_PLAN_STATUSES as readonly PlanStatus[]).includes(status);

const listItem = (plan: PlanRow, refs: Map<string, EmployeeRef>, viewer: Viewer): PlanListItem => ({
  id: plan.id,
  employee: refs.get(plan.employeeId)!,
  manager: plan.managerEmployeeId ? (refs.get(plan.managerEmployeeId) ?? null) : null,
  status: plan.status,
  startsOn: plan.startsOn,
  endsOn: plan.endsOn,
  acknowledgedAt: plan.acknowledgedAt?.toISOString() ?? null,
  decidedAt: plan.decidedAt?.toISOString() ?? null,
  mine: plan.employeeId === viewer.employeeId,
});

/**
 * Improvement plans. The person's manager (or HR for their company) drafts one, starts it,
 * holds check-ins, extends it and closes it with an outcome; the person reads it once started
 * and acknowledges it. A plan records concerns and help given: it never ends anyone's
 * employment, and closing it changes nothing in their job (Labour Act ss.23–24 and 26 govern
 * dismissal and termination). Every change is audited.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * HR's plans within their companies, the plans of everyone below a manager, and the
   * viewer's own once started.
   */
  list(user: AuthUser, query: PlanListQuery): Promise<PlanListItem[]> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const visible = await this.visibleTo(tx, viewer);
      if (!visible) return [];
      const rows = await tx
        .select()
        .from(improvementPlans)
        .where(
          and(
            visible,
            query.status ? eq(improvementPlans.status, query.status) : undefined,
            query.employeeId ? eq(improvementPlans.employeeId, query.employeeId) : undefined,
          ),
        )
        .orderBy(desc(improvementPlans.startsOn), desc(improvementPlans.createdAt));
      const refs = await employeeRefs(
        tx,
        rows.flatMap((r) => [r.employeeId, r.managerEmployeeId]),
      );
      return rows.map((r) => listItem(r, refs, viewer));
    });
  }

  /** The plans of one person the caller already may see the record of. */
  async forEmployee(tx: Tx, viewer: Viewer, employeeId: string): Promise<PlanListItem[]> {
    const self = viewer.employeeId === employeeId;
    const rows = await tx
      .select()
      .from(improvementPlans)
      .where(
        and(
          eq(improvementPlans.employeeId, employeeId),
          self ? ne(improvementPlans.status, 'draft') : undefined,
        ),
      )
      .orderBy(desc(improvementPlans.startsOn));
    const refs = await employeeRefs(
      tx,
      rows.flatMap((r) => [r.employeeId, r.managerEmployeeId]),
    );
    return rows.map((r) => listItem(r, refs, viewer));
  }

  /** The active people the viewer may draft a plan for: below them, or in HR's companies. */
  people(user: AuthUser, search?: string): Promise<EmployeeRef[]> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const conditions: SQL[] = [];
      if (viewer.manage) {
        conditions.push((await entityScope(tx, user, employees.id)) ?? sql`true`);
      }
      if (viewer.employeeId) {
        const team = await reportsBelow(tx, viewer.employeeId, todayIn());
        if (team.length) conditions.push(inArray(employees.id, team));
      }
      if (conditions.length === 0) return [];
      const pattern = search ? `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
      return tx
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          fullName: employees.fullName,
          fullNameBn: employees.fullNameBn,
        })
        .from(employees)
        .where(
          and(
            or(...conditions),
            eq(employees.status, 'active'),
            viewer.employeeId ? ne(employees.id, viewer.employeeId) : undefined,
            pattern
              ? or(ilike(employees.fullName, pattern), ilike(employees.employeeCode, pattern))
              : undefined,
          ),
        )
        .orderBy(asc(employees.fullName))
        .limit(50);
    });
  }

  get(user: AuthUser, id: string): Promise<PlanView> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { plan, role } = await this.planFor(tx, viewer, id);
      return this.view(tx, plan, role, viewer);
    });
  }

  /** A draft for someone below the viewer, or in HR's companies; one open plan per person. */
  create(user: AuthUser, input: PlanCreateInput): Promise<PlanView> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const today = todayIn();
      // Locked, so two plans for one person cannot be drafted at once.
      const [person] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, input.employeeId))
        .for('update');
      if (!person || !(await managesPerson(tx, viewer, person.id, today))) {
        throw notFound('employee');
      }
      if (person.status !== 'active') {
        throw conflict('employee_not_active', 'This person no longer works here');
      }
      await this.mustHaveNoOpenPlan(tx, person.id);
      await this.mustBeTheirReview(tx, input.reviewId, person.id);
      const job = await jobOn(tx, person.id, today);
      const [plan] = await tx
        .insert(improvementPlans)
        .values({
          tenantId: currentTenantId(),
          employeeId: person.id,
          managerEmployeeId: job?.a.managerId ?? null,
          reviewId: input.reviewId ?? null,
          reason: input.reason,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          objectives: input.objectives,
          support: input.support ?? null,
          createdByUserId: user.id,
        })
        .returning();
      await this.audit.record(tx, {
        ...AUDIT,
        actorUserId: user.id,
        action: 'improvement_plan.create',
        entityId: plan!.id,
        after: input,
      });
      return this.view(tx, plan!, 'manage', viewer);
    });
  }

  update(user: AuthUser, id: string, input: PlanUpdateInput): Promise<PlanView> {
    return this.change(user, id, async (tx, plan) => {
      this.mustBe(plan, ['draft'], 'plan_not_draft', 'Only a draft plan can be changed');
      await this.mustBeTheirReview(tx, input.reviewId, plan.employeeId);
      await tx
        .update(improvementPlans)
        .set({
          reason: input.reason,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          objectives: input.objectives,
          support: input.support ?? null,
          reviewId: input.reviewId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(improvementPlans.id, id));
      return {
        action: 'update',
        before: {
          reason: plan.reason,
          startsOn: plan.startsOn,
          endsOn: plan.endsOn,
          objectives: plan.objectives,
          support: plan.support,
          reviewId: plan.reviewId,
        },
        after: input,
      };
    });
  }

  /** Starts a draft: the person can now read it, and is asked to acknowledge it. */
  start(user: AuthUser, id: string): Promise<PlanView> {
    return this.change(user, id, async (tx, plan) => {
      this.mustBe(plan, ['draft'], 'plan_not_draft', 'This plan has already started');
      const [other] = await tx
        .select({ id: improvementPlans.id })
        .from(improvementPlans)
        .where(
          and(
            eq(improvementPlans.employeeId, plan.employeeId),
            inArray(improvementPlans.status, [...RUNNING_PLAN_STATUSES]),
            ne(improvementPlans.id, plan.id),
          ),
        );
      if (other) throw conflict('plan_open', 'This person already has a plan under way');
      await tx
        .update(improvementPlans)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(improvementPlans.id, id));
      const starts = localDate(plan.startsOn);
      const ends = localDate(plan.endsOn);
      await this.notifications.notify(tx, {
        event: 'performance.task',
        recipients: [{ employeeId: plan.employeeId }],
        values: {
          'task.title': {
            en: 'An improvement plan for you',
            bn: 'আপনার জন্য একটি উন্নয়ন পরিকল্পনা',
          },
          'task.detail': {
            en: `An improvement plan runs for you from ${starts.en} to ${ends.en}. Read it, and acknowledge it with your comments.`,
            bn: `${starts.bn} থেকে ${ends.bn} পর্যন্ত আপনার জন্য একটি উন্নয়ন পরিকল্পনা চলবে। এটি পড়ুন এবং নিজের মন্তব্যসহ স্বীকার করুন।`,
          },
          'task.due': localDate(addDays(todayIn(), 7)),
        },
        link: `/workspace/performance/plans/${plan.id}`,
        dedupeKey: `performance.plan:${plan.id}`,
        data: { planId: plan.id },
      });
      return { action: 'start', before: { status: plan.status }, after: { status: 'active' } };
    });
  }

  /** A draft nobody has seen can be discarded. */
  remove(user: AuthUser, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { plan, role } = await this.planFor(tx, viewer, id, { lock: true });
      this.mustManage(role);
      this.mustBe(plan, ['draft'], 'plan_not_draft', 'Only a draft plan can be deleted');
      await tx.delete(improvementPlans).where(eq(improvementPlans.id, id));
      await this.audit.record(tx, {
        ...AUDIT,
        actorUserId: user.id,
        action: 'improvement_plan.delete',
        entityId: id,
        before: { employeeId: plan.employeeId, reason: plan.reason, startsOn: plan.startsOn },
      });
    });
  }

  /** A dated note from the manager or HR while the plan runs. */
  checkin(user: AuthUser, id: string, input: PlanCheckinInput): Promise<PlanView> {
    return this.change(user, id, async (tx, plan) => {
      this.mustBeRunning(plan);
      if (input.heldOn < plan.startsOn || input.heldOn > todayIn()) {
        throw badRequest(
          'checkin_date',
          `A check-in is held between the plan's start (${plan.startsOn}) and today`,
        );
      }
      const [row] = await tx
        .insert(planCheckins)
        .values({
          tenantId: currentTenantId(),
          planId: id,
          heldOn: input.heldOn,
          note: input.note,
          authorUserId: user.id,
        })
        .returning({ id: planCheckins.id });
      return { action: 'checkin', after: { checkinId: row!.id, ...input } };
    });
  }

  extend(user: AuthUser, id: string, input: PlanExtendInput): Promise<PlanView> {
    return this.change(user, id, async (tx, plan) => {
      this.mustBeRunning(plan);
      if (input.endsOn <= plan.endsOn) {
        throw badRequest('plan_extend_earlier', `The plan already runs until ${plan.endsOn}`);
      }
      await tx
        .update(improvementPlans)
        .set({ endsOn: input.endsOn, status: 'extended', updatedAt: new Date() })
        .where(eq(improvementPlans.id, id));
      return {
        action: 'extend',
        before: { endsOn: plan.endsOn, status: plan.status },
        after: { endsOn: input.endsOn, status: 'extended', reason: input.reason },
      };
    });
  }

  /**
   * Closes the plan with its outcome. Not met is a record: it never starts a separation or
   * changes the person's job. Dismissal for misconduct needs the Labour Act's show-cause
   * notice and inquiry (ss.23–24); other termination, notice or pay (s.26).
   */
  close(user: AuthUser, id: string, input: PlanCloseInput): Promise<PlanView> {
    return this.change(user, id, async (tx, plan) => {
      this.mustBeRunning(plan);
      await tx
        .update(improvementPlans)
        .set({
          status: input.outcome,
          outcomeNote: input.note,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(improvementPlans.id, id));
      return {
        action: 'close',
        before: { status: plan.status },
        after: { status: input.outcome, note: input.note },
      };
    });
  }

  /** The person has read the plan; their comment may disagree with it. */
  acknowledge(user: AuthUser, id: string, input: PlanAcknowledgeInput): Promise<PlanView> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { plan, role } = await this.planFor(tx, viewer, id, { lock: true });
      if (role !== 'person') {
        throw forbidden('plan_person_only', 'Only the person on the plan acknowledges it');
      }
      if (plan.acknowledgedAt) {
        throw conflict('plan_acknowledged', 'You have already acknowledged this plan');
      }
      const [saved] = await tx
        .update(improvementPlans)
        .set({
          acknowledgedAt: new Date(),
          employeeComment: input.comment ?? null,
          updatedAt: new Date(),
        })
        .where(eq(improvementPlans.id, id))
        .returning();
      await this.audit.record(tx, {
        ...AUDIT,
        actorUserId: user.id,
        action: 'improvement_plan.acknowledge',
        entityId: id,
        after: { comment: input.comment ?? null },
      });
      return this.view(tx, saved!, role, viewer);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** One change by the manager or HR to a locked plan, audited, returning the plan after. */
  private change(
    user: AuthUser,
    id: string,
    apply: (
      tx: Tx,
      plan: PlanRow,
    ) => Promise<{ action: string; before?: unknown; after?: unknown }>,
  ): Promise<PlanView> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { plan, role } = await this.planFor(tx, viewer, id, { lock: true });
      this.mustManage(role);
      const { action, before, after } = await apply(tx, plan);
      await this.audit.record(tx, {
        ...AUDIT,
        actorUserId: user.id,
        action: `improvement_plan.${action}`,
        entityId: id,
        before,
        after,
      });
      const [saved] = await tx.select().from(improvementPlans).where(eq(improvementPlans.id, id));
      return this.view(tx, saved!, role, viewer);
    });
  }

  /** The plan for those who run it and, once started, for the person; not found for others. */
  private async planFor(
    tx: Tx,
    viewer: Viewer,
    id: string,
    options: { lock?: boolean } = {},
  ): Promise<{ plan: PlanRow; role: Role }> {
    const query = tx.select().from(improvementPlans).where(eq(improvementPlans.id, id));
    const [plan] = options.lock ? await query.for('update') : await query;
    if (!plan) throw notFound('plan');
    if (plan.employeeId === viewer.employeeId) {
      if (plan.status === 'draft') throw notFound('plan');
      return { plan, role: 'person' };
    }
    if (!(await managesPerson(tx, viewer, plan.employeeId, todayIn()))) throw notFound('plan');
    return { plan, role: 'manage' };
  }

  private async visibleTo(tx: Tx, viewer: Viewer): Promise<SQL | null> {
    const conditions: (SQL | undefined)[] = [];
    const notOwn = viewer.employeeId
      ? ne(improvementPlans.employeeId, viewer.employeeId)
      : undefined;
    if (viewer.manage) {
      conditions.push(
        and(notOwn, await entityScope(tx, viewer.user, improvementPlans.employeeId)) ?? sql`true`,
      );
    }
    if (viewer.employeeId) {
      const team = await reportsBelow(tx, viewer.employeeId, todayIn());
      if (team.length) conditions.push(inArray(improvementPlans.employeeId, team));
      conditions.push(
        and(
          eq(improvementPlans.employeeId, viewer.employeeId),
          ne(improvementPlans.status, 'draft'),
        ),
      );
    }
    return conditions.length ? or(...conditions)! : null;
  }

  private mustManage(role: Role) {
    if (role !== 'manage') {
      throw forbidden('plan_manager_only', 'Only the manager or HR changes a plan');
    }
  }

  private mustBe(plan: PlanRow, statuses: PlanStatus[], code: string, message: string) {
    if (!statuses.includes(plan.status)) throw conflict(code, message);
  }

  private mustBeRunning(plan: PlanRow) {
    if (!running(plan.status)) throw conflict('plan_not_running', 'This plan is not under way');
  }

  private async mustHaveNoOpenPlan(tx: Tx, employeeId: string) {
    const [open] = await tx
      .select({ id: improvementPlans.id })
      .from(improvementPlans)
      .where(
        and(
          eq(improvementPlans.employeeId, employeeId),
          inArray(improvementPlans.status, [...OPEN_PLAN_STATUSES]),
        ),
      );
    if (open) {
      throw conflict('plan_open', 'This person already has a plan, drafted or under way');
    }
  }

  private async mustBeTheirReview(tx: Tx, reviewId: string | null | undefined, employeeId: string) {
    if (!reviewId) return;
    const [review] = await tx
      .select({ employeeId: reviews.employeeId })
      .from(reviews)
      .where(eq(reviews.id, reviewId));
    if (review?.employeeId !== employeeId) {
      throw badRequest('plan_review_not_theirs', 'That review is not one of this person’s');
    }
  }

  private async view(tx: Tx, plan: PlanRow, role: Role, viewer: Viewer): Promise<PlanView> {
    const refs = await employeeRefs(tx, [plan.employeeId, plan.managerEmployeeId]);
    const job = await jobOn(tx, plan.employeeId, todayIn());
    const [review] = plan.reviewId
      ? await tx
          .select({ id: reviews.id, cycleId: reviewCycles.id, cycleName: reviewCycles.name })
          .from(reviews)
          .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
          .where(eq(reviews.id, plan.reviewId))
      : [];
    const checkins = await tx
      .select({ c: planCheckins, author: tenantUsers.name })
      .from(planCheckins)
      .leftJoin(tenantUsers, eq(tenantUsers.id, planCheckins.authorUserId))
      .where(eq(planCheckins.planId, plan.id))
      .orderBy(asc(planCheckins.heldOn), asc(planCheckins.createdAt));
    const extensions = await tx
      .select({ entry: tenantAuditLog, by: tenantUsers.name })
      .from(tenantAuditLog)
      .leftJoin(tenantUsers, eq(tenantUsers.id, tenantAuditLog.actorUserId))
      .where(
        and(
          eq(tenantAuditLog.entityType, AUDIT.entityType),
          eq(tenantAuditLog.entityId, plan.id),
          eq(tenantAuditLog.action, 'improvement_plan.extend'),
        ),
      )
      .orderBy(asc(tenantAuditLog.createdAt));
    const [creator] = plan.createdByUserId
      ? await tx
          .select({ name: tenantUsers.name })
          .from(tenantUsers)
          .where(eq(tenantUsers.id, plan.createdByUserId))
      : [];
    const manage = role === 'manage';
    const isRunning = running(plan.status);
    return {
      ...listItem(plan, refs, viewer),
      designation: job?.designation?.name ?? null,
      orgUnit: job?.orgUnit?.name ?? null,
      review: review ?? null,
      reason: plan.reason,
      objectives: plan.objectives,
      support: plan.support,
      outcomeNote: plan.outcomeNote,
      employeeComment: plan.employeeComment,
      checkins: checkins.map(({ c, author }) => ({
        id: c.id,
        heldOn: c.heldOn,
        note: c.note,
        author,
        createdAt: c.createdAt.toISOString(),
      })),
      extensions: extensions.map(({ entry, by }) => {
        const before = entry.before as { endsOn: string } | null;
        const after = entry.after as { endsOn: string; reason?: string } | null;
        return {
          from: before?.endsOn ?? '',
          to: after?.endsOn ?? '',
          reason: after?.reason ?? null,
          by,
          at: entry.createdAt.toISOString(),
        };
      }),
      createdBy: creator?.name ?? null,
      createdAt: plan.createdAt.toISOString(),
      role,
      can: {
        edit: manage && plan.status === 'draft',
        start: manage && plan.status === 'draft',
        delete: manage && plan.status === 'draft',
        checkin: manage && isRunning,
        extend: manage && isRunning,
        close: manage && isRunning,
        acknowledge: role === 'person' && !plan.acknowledgedAt,
      },
    };
  }
}
