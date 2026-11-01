import { Injectable } from '@nestjs/common';
import {
  employees,
  jobAssignments,
  legalEntities,
  peerFeedback,
  reviewCycles,
  reviews,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  addDays,
  PEER_STATUSES,
  REVIEW_STATUSES,
  todayIn,
  type CycleDatesInput,
  type CycleDetail,
  type CycleInput,
  type CycleLaunchResult,
  type CycleListItem,
  type CycleProgress,
  type CycleReviewItem,
  type CycleReviewsQuery,
  type Page,
  type ReviewStatus,
} from '@gp/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { inScope, mustUseCompany } from '../access-scopes/employee-scope.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { inForceOn } from '../employees/employee.queries.js';
import {
  localDate,
  NotificationsService,
  type Localized,
} from '../notifications/notifications.service.js';
import {
  changesCycle,
  cycleFor,
  notFound,
  seesCycle,
  viewerOf,
  type CycleRow,
  type Viewer,
} from './access.js';
import {
  managerReviewTask,
  releasedToManagerTask,
  selfReviewTask,
  teamReviewsDetail,
  teamReviewsTitle,
} from './notices.js';
import { cycleSummary, employeeRefs, entityRefs, iso, asRating, settingsOf } from './views.js';

/** Managers are asked to go through released reviews with their people within this many days. */
const RELEASE_TALK_DAYS = 7;

const noChange = () =>
  forbidden('cycle_not_yours', 'This cycle covers companies you do not look after');

const mustBe = (cycle: CycleRow, ...statuses: CycleRow['status'][]) => {
  if (!statuses.includes(cycle.status)) {
    throw conflict(
      'cycle_status',
      `The cycle is ${cycle.status}; this needs it ${statuses.join(' or ')}`,
    );
  }
};

/** A review's waiting step is past its date. */
const overdueOf = (
  cycle: Pick<CycleRow, 'selfDueOn' | 'managerDueOn'>,
  status: ReviewStatus,
  today: string,
) =>
  (status === 'self' && !!cycle.selfDueOn && cycle.selfDueOn < today) ||
  ((status === 'self' || status === 'manager') &&
    !!cycle.managerDueOn &&
    cycle.managerDueOn < today);

interface CreatedReview {
  id: string;
  employeeId: string;
  status: ReviewStatus;
  managerEmployeeId: string | null;
}

/**
 * Review cycles for those who manage performance: setting one up, launching it (a review for
 * each person in it), its progress, moving it to calibration, releasing it and closing it.
 */
@Injectable()
export class CyclesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list(user: AuthUser): Promise<CycleListItem[]> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const cycles = (
        await tx
          .select()
          .from(reviewCycles)
          .orderBy(desc(reviewCycles.periodStart), desc(reviewCycles.createdAt))
      ).filter((c) => seesCycle(viewer, c));
      if (cycles.length === 0) return [];
      const scope = await entityScope(tx, user, reviews.employeeId);
      const counts = await tx
        .select({ cycleId: reviews.cycleId, status: reviews.status, n: count() })
        .from(reviews)
        .where(
          and(
            inArray(
              reviews.cycleId,
              cycles.map((c) => c.id),
            ),
            scope,
          ),
        )
        .groupBy(reviews.cycleId, reviews.status);
      const entities = new Map(
        (await entityRefs(tx, [...new Set(cycles.flatMap((c) => c.legalEntityIds))])).map((e) => [
          e.id,
          e,
        ]),
      );
      return cycles.map((c) => {
        const mine = counts.filter((r) => r.cycleId === c.id);
        return {
          ...cycleSummary(c),
          legalEntities: c.legalEntityIds.flatMap((id) => entities.get(id) ?? []),
          reviews: mine.reduce((sum, r) => sum + r.n, 0),
          released: mine
            .filter((r) => r.status === 'released' || r.status === 'acknowledged')
            .reduce((sum, r) => sum + r.n, 0),
          createdAt: c.createdAt.toISOString(),
        };
      });
    });
  }

  detail(user: AuthUser, id: string): Promise<CycleDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      return this.view(tx, viewer, (await cycleFor(tx, viewer, id)).cycle);
    });
  }

  create(user: AuthUser, input: CycleInput): Promise<CycleDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const legalEntityIds = await this.companiesFor(tx, viewer, input.legalEntityIds);
      const [cycle] = await tx
        .insert(reviewCycles)
        .values({
          tenantId: currentTenantId(),
          ...this.fields(input),
          legalEntityIds,
          competencies: input.competencies ?? (await settingsOf(tx)).competencies,
          createdByUserId: user.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'review_cycle.create',
        entityType: 'review_cycle',
        entityId: cycle!.id,
        after: {
          name: cycle!.name,
          legalEntityIds,
          period: [cycle!.periodStart, cycle!.periodEnd],
        },
      });
      return this.view(tx, viewer, cycle!);
    });
  }

  /** The whole set-up, while the cycle is a draft. */
  update(user: AuthUser, id: string, input: CycleInput): Promise<CycleDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { cycle, canChange } = await cycleFor(tx, viewer, id, { lock: true });
      if (!canChange) throw noChange();
      mustBe(cycle, 'draft');
      const legalEntityIds = await this.companiesFor(tx, viewer, input.legalEntityIds);
      const [row] = await tx
        .update(reviewCycles)
        .set({
          ...this.fields(input),
          legalEntityIds,
          competencies: input.competencies ?? cycle.competencies,
          updatedAt: new Date(),
        })
        .where(eq(reviewCycles.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'review_cycle.update',
        entityType: 'review_cycle',
        entityId: id,
        before: { ...this.fields(cycle), legalEntityIds: cycle.legalEntityIds },
        after: { ...this.fields(row!), legalEntityIds },
      });
      return this.view(tx, viewer, row!);
    });
  }

  /** A launched cycle's name and step dates (a deadline moved, say). */
  dates(user: AuthUser, id: string, input: CycleDatesInput): Promise<CycleDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { cycle, canChange } = await cycleFor(tx, viewer, id, { lock: true });
      if (!canChange) throw noChange();
      mustBe(cycle, 'draft', 'active', 'calibration');
      const values = {
        name: input.name,
        goalsDueOn: input.goalsDueOn ?? null,
        selfDueOn: input.selfDueOn ?? null,
        peerDueOn: input.peerDueOn ?? null,
        managerDueOn: input.managerDueOn ?? null,
        calibrationDueOn: input.calibrationDueOn ?? null,
      };
      if (cycle.status !== 'draft') this.mustHaveDates({ ...cycle, ...values });
      const [row] = await tx
        .update(reviewCycles)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(reviewCycles.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'review_cycle.dates',
        entityType: 'review_cycle',
        entityId: id,
        before: {
          name: cycle.name,
          goalsDueOn: cycle.goalsDueOn,
          selfDueOn: cycle.selfDueOn,
          peerDueOn: cycle.peerDueOn,
          managerDueOn: cycle.managerDueOn,
          calibrationDueOn: cycle.calibrationDueOn,
        },
        after: values,
      });
      return this.view(tx, viewer, row!);
    });
  }

  /**
   * Launches a draft: a review for each active person in it, with the manager they have today.
   * Again on an active cycle, it adds those who have come into it since; nobody twice.
   */
  launch(user: AuthUser, id: string): Promise<CycleLaunchResult> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { cycle, canChange } = await cycleFor(tx, viewer, id, { lock: true });
      if (!canChange) throw noChange();
      mustBe(cycle, 'draft', 'active');
      this.mustHaveDates(cycle);
      const today = todayIn();
      const people = await tx
        .selectDistinctOn([employees.id], {
          id: employees.id,
          userId: employees.userId,
          disabledAt: tenantUsers.disabledAt,
          managerId: jobAssignments.managerId,
        })
        .from(employees)
        .innerJoin(
          jobAssignments,
          and(eq(jobAssignments.employeeId, employees.id), inForceOn(today)),
        )
        .leftJoin(tenantUsers, eq(tenantUsers.id, employees.userId))
        .where(
          and(
            eq(employees.status, 'active'),
            cycle.legalEntityIds.length
              ? inArray(jobAssignments.legalEntityId, cycle.legalEntityIds)
              : undefined,
            cycle.joinedOnOrBefore ? lte(employees.joinedOn, cycle.joinedOnOrBefore) : undefined,
          ),
        )
        .orderBy(employees.id, desc(jobAssignments.effectiveFrom));
      const created: CreatedReview[] = [];
      const rows = people.map((p) => ({
        tenantId: currentTenantId(),
        cycleId: cycle.id,
        employeeId: p.id,
        managerEmployeeId: p.managerId && p.managerId !== p.id ? p.managerId : null,
        status: (cycle.selfReview && p.userId && !p.disabledAt
          ? 'self'
          : 'manager') as ReviewStatus,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        created.push(
          ...(await tx
            .insert(reviews)
            .values(rows.slice(i, i + 500))
            .onConflictDoNothing({ target: [reviews.cycleId, reviews.employeeId] })
            .returning({
              id: reviews.id,
              employeeId: reviews.employeeId,
              status: reviews.status,
              managerEmployeeId: reviews.managerEmployeeId,
            })),
        );
      }
      const [current] =
        cycle.status === 'draft'
          ? await tx
              .update(reviewCycles)
              .set({ status: 'active', launchedAt: new Date(), updatedAt: new Date() })
              .where(eq(reviewCycles.id, id))
              .returning()
          : [cycle];
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: cycle.status === 'draft' ? 'review_cycle.launch' : 'review_cycle.add_people',
        entityType: 'review_cycle',
        entityId: id,
        after: { created: created.length },
      });
      await this.tellLaunched(tx, current!, created);
      return { created: created.length, cycle: await this.view(tx, viewer, current!) };
    });
  }

  /** Adds one person to a launched cycle, whoever they are (a newcomer HR wants reviewed). */
  addPerson(user: AuthUser, id: string, employeeId: string): Promise<CycleLaunchResult> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { cycle, canChange } = await cycleFor(tx, viewer, id, { lock: true });
      if (!canChange) throw noChange();
      mustBe(cycle, 'active');
      const today = todayIn();
      const [person] = await tx
        .select({
          id: employees.id,
          status: employees.status,
          userId: employees.userId,
          disabledAt: tenantUsers.disabledAt,
          managerId: jobAssignments.managerId,
          legalEntityId: jobAssignments.legalEntityId,
        })
        .from(employees)
        .innerJoin(
          jobAssignments,
          and(eq(jobAssignments.employeeId, employees.id), inForceOn(today)),
        )
        .leftJoin(tenantUsers, eq(tenantUsers.id, employees.userId))
        .where(eq(employees.id, employeeId));
      if (!person || !(await inScope(tx, user, employeeId))) throw notFound('employee');
      if (person.status !== 'active') {
        throw conflict('employee_separated', 'This person has left');
      }
      if (cycle.legalEntityIds.length && !cycle.legalEntityIds.includes(person.legalEntityId)) {
        throw conflict(
          'not_in_cycle_companies',
          'This person works for a company outside the cycle',
        );
      }
      const [review] = await tx
        .insert(reviews)
        .values({
          tenantId: currentTenantId(),
          cycleId: id,
          employeeId,
          managerEmployeeId:
            person.managerId && person.managerId !== employeeId ? person.managerId : null,
          status: cycle.selfReview && person.userId && !person.disabledAt ? 'self' : 'manager',
        })
        .onConflictDoNothing({ target: [reviews.cycleId, reviews.employeeId] })
        .returning({
          id: reviews.id,
          employeeId: reviews.employeeId,
          status: reviews.status,
          managerEmployeeId: reviews.managerEmployeeId,
        });
      if (!review) throw conflict('already_in_cycle', 'This person is already in the cycle');
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'review_cycle.add_person',
        entityType: 'review_cycle',
        entityId: id,
        after: { employeeId, reviewId: review.id },
      });
      await this.tellLaunched(tx, cycle, [review]);
      return { created: 1, cycle: await this.view(tx, viewer, cycle) };
    });
  }

  reviews(user: AuthUser, id: string, query: CycleReviewsQuery): Promise<Page<CycleReviewItem>> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { cycle } = await cycleFor(tx, viewer, id);
      const search = query.search ? `%${query.search.replace(/[%_\\]/g, '\\$&')}%` : null;
      const where = and(
        eq(reviews.cycleId, id),
        await entityScope(tx, user, reviews.employeeId),
        query.status ? eq(reviews.status, query.status) : undefined,
        search
          ? or(ilike(employees.fullName, search), ilike(employees.employeeCode, search))
          : undefined,
      );
      const [total] = await tx
        .select({ n: count() })
        .from(reviews)
        .innerJoin(employees, eq(employees.id, reviews.employeeId))
        .where(where);
      const rows = await tx
        .select({ review: reviews })
        .from(reviews)
        .innerJoin(employees, eq(employees.id, reviews.employeeId))
        .where(where)
        .orderBy(asc(employees.fullName), asc(employees.employeeCode))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const refs = await employeeRefs(
        tx,
        rows.flatMap(({ review: r }) => [r.employeeId, r.managerEmployeeId]),
      );
      const today = todayIn();
      return {
        items: rows.map(({ review: r }) => ({
          id: r.id,
          employee: refs.get(r.employeeId)!,
          manager: r.managerEmployeeId ? (refs.get(r.managerEmployeeId) ?? null) : null,
          status: r.status,
          proposedRating: asRating(r.proposedRating),
          finalRating: asRating(r.finalRating),
          selfSubmittedAt: iso(r.selfSubmittedAt),
          managerSubmittedAt: iso(r.managerSubmittedAt),
          acknowledgedAt: iso(r.acknowledgedAt),
          employeeAgrees: r.employeeAgrees,
          overdue: overdueOf(cycle, r.status, today),
        })),
        total: total?.n ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /**
   * Moves the cycle to calibration once the manager reviews are in, or before, by HR's choice,
   * with a note: the people still missing one are recorded with it.
   */
  calibrate(user: AuthUser, id: string, note: string | undefined): Promise<CycleDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { cycle, canChange } = await cycleFor(tx, viewer, id, { lock: true });
      if (!canChange) throw noChange();
      mustBe(cycle, 'active');
      const missing = await tx
        .select({
          employeeId: reviews.employeeId,
          code: employees.employeeCode,
          status: reviews.status,
        })
        .from(reviews)
        .innerJoin(employees, eq(employees.id, reviews.employeeId))
        .where(and(eq(reviews.cycleId, id), inArray(reviews.status, ['self', 'manager'])));
      if (missing.length && !note) {
        throw conflict(
          'manager_reviews_missing',
          `${missing.length} ${missing.length === 1 ? 'review has' : 'reviews have'} no manager review yet; give a note to move on without them`,
        );
      }
      const [row] = await tx
        .update(reviewCycles)
        .set({ status: 'calibration', updatedAt: new Date() })
        .where(eq(reviewCycles.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'review_cycle.calibration',
        entityType: 'review_cycle',
        entityId: id,
        before: { status: cycle.status },
        after: {
          status: 'calibration',
          note: note ?? null,
          missing: missing.map((m) => ({
            employeeId: m.employeeId,
            code: m.code,
            status: m.status,
          })),
        },
      });
      return this.view(tx, viewer, row!);
    });
  }

  /**
   * Releases every review once each has a final rating; people with a login are told, and their
   * managers asked to go through them. Released reviews never change.
   */
  release(user: AuthUser, id: string): Promise<CycleDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { cycle, canChange } = await cycleFor(tx, viewer, id, { lock: true });
      if (!canChange) throw noChange();
      mustBe(cycle, 'calibration');
      const [missing] = await tx
        .select({ n: count() })
        .from(reviews)
        .where(and(eq(reviews.cycleId, id), isNull(reviews.finalRating)));
      if (missing && missing.n > 0) {
        throw conflict(
          'final_ratings_missing',
          `${missing.n} ${missing.n === 1 ? 'review has' : 'reviews have'} no final rating yet`,
        );
      }
      const now = new Date();
      const released = await tx
        .update(reviews)
        .set({ status: 'released', releasedAt: now, updatedAt: now })
        .where(eq(reviews.cycleId, id))
        .returning({
          employeeId: reviews.employeeId,
          managerEmployeeId: reviews.managerEmployeeId,
        });
      const [row] = await tx
        .update(reviewCycles)
        .set({ status: 'released', releasedAt: now, updatedAt: now })
        .where(eq(reviewCycles.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'review_cycle.release',
        entityType: 'review_cycle',
        entityId: id,
        before: { status: cycle.status },
        after: { status: 'released', reviews: released.length },
      });
      // Only people with a login can read it; workers without one hear it from their manager.
      const withLogins = released.length
        ? await tx
            .select({ id: employees.id })
            .from(employees)
            .where(
              and(
                inArray(
                  employees.id,
                  released.map((r) => r.employeeId),
                ),
                isNotNull(employees.userId),
              ),
            )
        : [];
      await this.notifications.notify(tx, {
        event: 'performance.released',
        recipients: withLogins.map((r) => ({ employeeId: r.id })),
        values: { 'cycle.name': cycle.name },
        link: '/workspace/performance',
        dedupeKey: `review.released:${id}`,
        data: { cycleId: id },
      });
      const managers = [...new Set(released.flatMap((r) => r.managerEmployeeId ?? []))];
      await this.notifications.notify(tx, {
        event: 'performance.task',
        recipients: managers.map((employeeId) => ({ employeeId })),
        values: releasedToManagerTask(cycle.name, addDays(todayIn(), RELEASE_TALK_DAYS)),
        link: '/workspace/performance/team',
        dedupeKey: `review.released.team:${id}`,
        data: { cycleId: id },
      });
      return this.view(tx, viewer, row!);
    });
  }

  close(user: AuthUser, id: string): Promise<CycleDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { cycle, canChange } = await cycleFor(tx, viewer, id, { lock: true });
      if (!canChange) throw noChange();
      mustBe(cycle, 'released');
      const [row] = await tx
        .update(reviewCycles)
        .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
        .where(eq(reviewCycles.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'review_cycle.close',
        entityType: 'review_cycle',
        entityId: id,
        before: { status: cycle.status },
        after: { status: 'closed' },
      });
      return this.view(tx, viewer, row!);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private fields(input: Omit<CycleInput, 'legalEntityIds' | 'competencies'> | CycleRow) {
    return {
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      joinedOnOrBefore: input.joinedOnOrBefore ?? null,
      selfReview: input.selfReview,
      peerReview: input.peerReview,
      goalsDueOn: input.goalsDueOn ?? null,
      selfDueOn: input.selfDueOn ?? null,
      peerDueOn: input.peerDueOn ?? null,
      managerDueOn: input.managerDueOn ?? null,
      calibrationDueOn: input.calibrationDueOn ?? null,
    };
  }

  /**
   * The companies a cycle covers. A login limited to some companies gets those for "every
   * company", and cannot name another.
   */
  private async companiesFor(tx: Tx, viewer: Viewer, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (unique.length) {
      const known = await tx
        .select({ id: legalEntities.id })
        .from(legalEntities)
        .where(inArray(legalEntities.id, unique));
      if (known.length !== unique.length) {
        throw badRequest('unknown_company', 'One of the companies does not exist');
      }
      for (const id of unique) await mustUseCompany(tx, viewer.user, id);
      return unique;
    }
    return viewer.companies ?? [];
  }

  /** A cycle cannot start without the dates people are asked to finish by. */
  private mustHaveDates(
    cycle: Pick<CycleRow, 'selfReview' | 'peerReview' | 'selfDueOn' | 'peerDueOn' | 'managerDueOn'>,
  ) {
    const missing = [
      ...(cycle.selfReview && !cycle.selfDueOn ? ['selfDueOn'] : []),
      ...(cycle.peerReview && !cycle.peerDueOn ? ['peerDueOn'] : []),
      ...(!cycle.managerDueOn ? ['managerDueOn'] : []),
    ];
    if (missing.length) {
      throw badRequest('cycle_dates_missing', `Set the dates first: ${missing.join(', ')}`);
    }
  }

  /** Tells each new reviewee with a self review, and each manager of the rest, at once. */
  private async tellLaunched(tx: Tx, cycle: CycleRow, created: CreatedReview[]) {
    const selves = created.filter((r) => r.status === 'self');
    if (selves.length && cycle.selfDueOn) {
      await this.notifications.notify(tx, {
        event: 'performance.task',
        recipients: selves.map((r) => ({ employeeId: r.employeeId })),
        values: selfReviewTask(cycle.name, cycle.selfDueOn),
        link:
          selves.length === 1
            ? `/workspace/performance/reviews/${selves[0]!.id}`
            : '/workspace/performance',
        dedupeKey: selves.length === 1 ? `review.self:${selves[0]!.id}` : `review.self:${cycle.id}`,
        data: { cycleId: cycle.id },
      });
    }
    const forManagers = created.filter((r) => r.status === 'manager' && r.managerEmployeeId);
    if (!forManagers.length || !cycle.managerDueOn) return;
    if (forManagers.length === 1) {
      const [review] = forManagers;
      const person = (await employeeRefs(tx, [review!.employeeId])).get(review!.employeeId)!;
      await this.notifications.notify(tx, {
        event: 'performance.task',
        recipients: [{ employeeId: review!.managerEmployeeId }],
        values: managerReviewTask(cycle.name, person, cycle.managerDueOn),
        link: `/workspace/performance/reviews/${review!.id}`,
        dedupeKey: `review.manager:${review!.id}`,
        data: { cycleId: cycle.id, reviewId: review!.id },
      });
      return;
    }
    const perManager = new Map<string, number>();
    for (const r of forManagers) {
      perManager.set(r.managerEmployeeId!, (perManager.get(r.managerEmployeeId!) ?? 0) + 1);
    }
    await this.notifications.notify(tx, {
      event: 'performance.task',
      recipients: [...perManager.keys()].map((employeeId) => ({ employeeId })),
      values: {
        'task.title': teamReviewsTitle,
        'task.detail': teamReviewsDetail(cycle.name, forManagers.length),
        'task.due': localDate(cycle.managerDueOn),
      },
      perRecipient: new Map(
        [...perManager].map(([employeeId, n]): [string, Record<string, Localized>] => [
          employeeId,
          { 'task.detail': teamReviewsDetail(cycle.name, n) },
        ]),
      ),
      link: '/workspace/performance/team',
      data: { cycleId: cycle.id },
    });
  }

  private async view(tx: Tx, viewer: Viewer, cycle: CycleRow): Promise<CycleDetail> {
    return {
      ...cycleSummary(cycle),
      legalEntityIds: cycle.legalEntityIds,
      legalEntities: await entityRefs(tx, cycle.legalEntityIds),
      joinedOnOrBefore: cycle.joinedOnOrBefore,
      competencies: cycle.competencies,
      launchedAt: iso(cycle.launchedAt),
      releasedAt: iso(cycle.releasedAt),
      closedAt: iso(cycle.closedAt),
      createdAt: cycle.createdAt.toISOString(),
      canChange: changesCycle(viewer, cycle),
      progress: await this.progress(tx, viewer, cycle),
    };
  }

  private async progress(tx: Tx, viewer: Viewer, cycle: CycleRow): Promise<CycleProgress> {
    const scope: SQL | undefined = await entityScope(tx, viewer.user, reviews.employeeId);
    const mine = and(eq(reviews.cycleId, cycle.id), scope);
    const today = todayIn();
    const noManager = sql<boolean>`${reviews.managerEmployeeId} is null`;
    const final = sql<boolean>`${reviews.finalRating} is not null`;
    const rows = await tx
      .select({ status: reviews.status, noManager, final, n: count() })
      .from(reviews)
      .where(mine)
      .groupBy(reviews.status, noManager, final);
    const peers = await tx
      .select({ status: peerFeedback.status, n: count() })
      .from(peerFeedback)
      .innerJoin(reviews, eq(reviews.id, peerFeedback.reviewId))
      .where(mine)
      .groupBy(peerFeedback.status);
    const byStatus = Object.fromEntries(REVIEW_STATUSES.map((s) => [s, 0])) as Record<
      ReviewStatus,
      number
    >;
    for (const r of rows) byStatus[r.status] += r.n;
    const sum = (pick: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(pick).reduce((total, r) => total + r.n, 0);
    const peerCounts = Object.fromEntries(
      PEER_STATUSES.map((s) => [s, 0]),
    ) as CycleProgress['peers'];
    for (const p of peers) peerCounts[p.status] += p.n;
    const past = (date: string | null) => !!date && date < today;
    return {
      total: sum(() => true),
      byStatus,
      overdue: {
        self: past(cycle.selfDueOn) ? byStatus.self : 0,
        peer: past(cycle.peerDueOn) ? peerCounts.approved : 0,
        manager: past(cycle.managerDueOn) ? byStatus.self + byStatus.manager : 0,
      },
      noManager: sum((r) => r.noManager && (r.status === 'self' || r.status === 'manager')),
      withFinalRating: sum((r) => r.final),
      peers: peerCounts,
    };
  }
}
