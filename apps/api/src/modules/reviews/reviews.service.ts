import { Injectable } from '@nestjs/common';
import {
  designations,
  goals,
  jobAssignments,
  peerFeedback,
  probationReviews,
  reviewCycles,
  reviews,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  todayIn,
  type AcknowledgeInput,
  type FinalRatingInput,
  type ManagerReviewInput,
  type MyReviewItem,
  type PeerQuestion,
  type PerformanceMe,
  type PerformanceTask,
  type ReviewAnswersInput,
  type ReviewDetail,
  type ReviewGoal,
  type SelfReviewInput,
  type TeamReviewItem,
} from '@gp/shared';
import { and, asc, count, desc, eq, inArray, isNull, ne, notInArray, or } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { inScope } from '../access-scopes/employee-scope.js';
import { reportsBelow } from '../development/access.js';
import { probationReviewsDueFor } from '../development/probation-reviews.service.js';
import { reviewDueOn } from '../development/probation.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { inForceOn } from '../employees/employee.queries.js';
import { refreshRecordKpis } from '../goals/review-goals.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  notFound,
  reviewFor,
  viewerOf,
  writesManagerPart,
  type CycleRow,
  type ReviewAccess,
  type ReviewRow,
  type Viewer,
} from './access.js';
import { managerReviewTask } from './notices.js';
import { goalScore, peerSummary } from './scoring.js';
import {
  asRating,
  cycleSummary,
  employeeRefs,
  iso,
  jobsOf,
  recommendationsView,
  reviewGoals,
} from './views.js';

const LIVE_CYCLES = ['active', 'calibration'] as const;
const isReleased = (r: Pick<ReviewRow, 'status'>) =>
  r.status === 'released' || r.status === 'acknowledged';

const stepClosed = (what: string) =>
  conflict('review_step_closed', `The ${what} is no longer open for changes`);

/** The date of the step a review waits on. */
const dueOf = (cycle: CycleRow, r: Pick<ReviewRow, 'status'>) =>
  r.status === 'self'
    ? cycle.selfDueOn
    : r.status === 'manager'
      ? cycle.managerDueOn
      : r.status === 'calibration'
        ? cycle.calibrationDueOn
        : null;

/**
 * Ratings for the review's goals and the cycle's competencies only; on submit, every one of
 * them rated.
 */
function checkAnswers(
  answers: ReviewAnswersInput,
  goalList: ReviewGoal[],
  cycle: CycleRow,
  submit: boolean,
) {
  const goalIds = new Set(goalList.map((g) => g.id));
  const keys = new Set(cycle.competencies.map((c) => c.key));
  const unknownGoal = Object.keys(answers.goals).find((id) => !goalIds.has(id));
  if (unknownGoal) throw badRequest('unknown_goal', 'A rated goal is not one of this review');
  const unknownKey = Object.keys(answers.competencies).find((k) => !keys.has(k));
  if (unknownKey)
    throw badRequest('unknown_competency', `${unknownKey} is not rated in this cycle`);
  if (
    submit &&
    (goalList.some((g) => !answers.goals[g.id]) ||
      cycle.competencies.some((c) => !answers.competencies[c.key]))
  ) {
    throw badRequest('ratings_missing', 'Rate every goal and competency before submitting');
  }
}

/**
 * One person's review: the person's self review, their manager's review with a proposed
 * rating, HR's final rating, release and the person's acknowledgement. Peer feedback lives in
 * PeersService.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  detail(user: AuthUser, id: string): Promise<ReviewDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      return detailOf(tx, viewer, await reviewFor(tx, viewer, id));
    });
  }

  /** The person's own ratings and comments; submitting sends the review to the manager. */
  saveSelf(user: AuthUser, id: string, input: SelfReviewInput): Promise<ReviewDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await reviewFor(tx, viewer, id, { lock: true });
      const { review, cycle } = access;
      if (access.role !== 'person') {
        throw forbidden('not_your_part', 'Only the person writes their self review');
      }
      if (review.status !== 'self' || cycle.status !== 'active') throw stepClosed('self review');
      checkAnswers(input.answers, await reviewGoals(tx, review), cycle, input.submit);
      const now = new Date();
      const [row] = await tx
        .update(reviews)
        .set({
          selfAnswers: input.answers,
          ...(input.submit ? { status: 'manager', selfSubmittedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(reviews.id, id))
        .returning();
      if (input.submit && review.managerEmployeeId && cycle.managerDueOn) {
        const person = (await employeeRefs(tx, [review.employeeId])).get(review.employeeId)!;
        await this.notifications.notify(tx, {
          event: 'performance.task',
          recipients: [{ employeeId: review.managerEmployeeId }],
          values: managerReviewTask(cycle.name, person, cycle.managerDueOn),
          link: `/workspace/performance/reviews/${id}`,
          dedupeKey: `review.manager:${id}`,
          data: { cycleId: cycle.id, reviewId: id },
        });
      }
      return detailOf(tx, viewer, { ...access, review: row! });
    });
  }

  /**
   * The manager's ratings, comments, proposed rating and recommendations. Submitting fixes the
   * proposed rating and the goal score, and the review goes to calibration.
   */
  saveManager(user: AuthUser, id: string, input: ManagerReviewInput): Promise<ReviewDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await reviewFor(tx, viewer, id, { lock: true });
      const { review, cycle } = access;
      if (!writesManagerPart(access)) {
        throw forbidden('not_your_part', "Only the person's manager writes this part");
      }
      if (review.status !== 'manager' || !LIVE_CYCLES.includes(cycle.status as 'active')) {
        throw stepClosed('manager review');
      }
      const goalList = await reviewGoals(tx, review);
      checkAnswers(input.answers, goalList, cycle, input.submit);
      if (input.submit && !input.proposedRating) {
        throw badRequest('proposed_rating_required', 'Propose an overall rating before submitting');
      }
      const recommendations = input.recommendations ?? review.recommendations;
      if (recommendations?.promotionDesignationId) {
        const [designation] = await tx
          .select({ id: designations.id })
          .from(designations)
          .where(eq(designations.id, recommendations.promotionDesignationId));
        if (!designation) throw badRequest('unknown_designation', 'No such designation');
      }
      const now = new Date();
      const [row] = await tx
        .update(reviews)
        .set({
          managerAnswers: input.answers,
          proposedRating: input.proposedRating ?? null,
          recommendations: recommendations ?? null,
          goalScore: goalScore(goalList, input.answers.goals),
          ...(input.submit ? { status: 'calibration', managerSubmittedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(reviews.id, id))
        .returning();
      if (input.submit) {
        // The KPIs from the records, stored as they stood when the manager rated them.
        await refreshRecordKpis(
          tx,
          goalList.map((g) => g.id),
        );
        await this.audit.record(tx, {
          actorUserId: user.id,
          action: 'review.manager_submit',
          entityType: 'review',
          entityId: id,
          after: {
            proposedRating: row!.proposedRating,
            goalScore: row!.goalScore,
            recommendations: row!.recommendations,
          },
        });
      }
      return detailOf(tx, viewer, { ...access, review: row! });
    });
  }

  /**
   * HR settles the final rating in calibration; a change from the proposed one records why,
   * who and when. A review still without its manager's part is settled by HR's choice.
   */
  setFinal(user: AuthUser, id: string, input: FinalRatingInput): Promise<ReviewDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await reviewFor(tx, viewer, id, { lock: true });
      const { review, cycle } = access;
      if (access.role === 'person') {
        throw forbidden('own_review', 'Someone else settles your own rating');
      }
      if (!viewer.manage || !(await inScope(tx, user, review.employeeId))) throw notFound();
      if (isReleased(review)) throw conflict('review_released', 'A released review never changes');
      if (cycle.status !== 'calibration') {
        throw conflict('cycle_status', 'Final ratings are set while the cycle is in calibration');
      }
      const changed = input.finalRating !== review.proposedRating;
      if (changed && !input.note) {
        throw badRequest(
          'calibration_note_required',
          'Say why the final rating differs from the proposed one',
        );
      }
      const [row] = await tx
        .update(reviews)
        .set({
          finalRating: input.finalRating,
          calibrationNote: input.note ?? null,
          calibratedByUserId: user.id,
          calibratedAt: new Date(),
          status: 'calibration',
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'review.final_rating',
        entityType: 'review',
        entityId: id,
        before: { finalRating: review.finalRating, status: review.status },
        after: {
          finalRating: input.finalRating,
          proposedRating: review.proposedRating,
          note: input.note ?? null,
        },
      });
      return detailOf(tx, viewer, { ...access, review: row! });
    });
  }

  /** The person has read their released review, and says whether they agree. */
  acknowledge(user: AuthUser, id: string, input: AcknowledgeInput): Promise<ReviewDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await reviewFor(tx, viewer, id, { lock: true });
      if (access.role !== 'person') {
        throw forbidden('not_your_part', 'Only the person acknowledges their review');
      }
      if (access.review.status === 'acknowledged') {
        throw conflict('already_acknowledged', 'You have already acknowledged this review');
      }
      if (access.review.status !== 'released') {
        throw conflict('review_not_released', 'This review has not been released yet');
      }
      const [row] = await tx
        .update(reviews)
        .set({
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          employeeAgrees: input.agrees,
          employeeComment: input.comment || null,
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, id))
        .returning();
      return detailOf(tx, viewer, { ...access, review: row! });
    });
  }

  /** The reviews the login writes or oversees as a manager, in cycles still under way. */
  team(user: AuthUser): Promise<TeamReviewItem[]> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      if (!viewer.employeeId) return [];
      const managers = [
        viewer.employeeId,
        ...(await reportsBelow(tx, viewer.employeeId, todayIn())),
      ];
      const rows = await tx
        .select({ review: reviews, cycle: reviewCycles })
        .from(reviews)
        .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
        .where(
          and(
            inArray(reviews.managerEmployeeId, managers),
            inArray(reviewCycles.status, ['active', 'calibration', 'released']),
          ),
        )
        .orderBy(desc(reviewCycles.periodStart));
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.review.id);
      const proposed = await tx
        .select({ reviewId: peerFeedback.reviewId, n: count() })
        .from(peerFeedback)
        .where(and(inArray(peerFeedback.reviewId, ids), eq(peerFeedback.status, 'proposed')))
        .groupBy(peerFeedback.reviewId);
      const refs = await employeeRefs(
        tx,
        rows.map((r) => r.review.employeeId),
      );
      return rows
        .map(({ review: r, cycle: c }) => ({
          id: r.id,
          cycle: { id: c.id, name: c.name, status: c.status },
          employee: refs.get(r.employeeId)!,
          status: r.status,
          direct: r.managerEmployeeId === viewer.employeeId,
          dueOn: dueOf(c, r),
          proposedRating: asRating(r.proposedRating),
          finalRating: isReleased(r) ? asRating(r.finalRating) : null,
          peersToApprove: proposed.find((p) => p.reviewId === r.id)?.n ?? 0,
          acknowledgedAt: iso(r.acknowledgedAt),
          employeeAgrees: r.employeeAgrees,
        }))
        .toSorted(
          (a, b) =>
            Number(b.direct) - Number(a.direct) ||
            a.employee.fullName.localeCompare(b.employee.fullName),
        );
    });
  }

  /**
   * What waits for the login, for the navigation and the landing page: their self review, the
   * reviews they write, peer feedback to give or approve, their released review to acknowledge,
   * goals to agree and probation reviews due; with their goals and their reviews by cycle.
   */
  me(user: AuthUser): Promise<PerformanceMe> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const items = [...(await this.myTasks(tx, viewer)), ...(await this.hrTasks(tx, viewer))];
      const me = viewer.employeeId;
      const [reports] = me
        ? await tx
            .select({ n: count() })
            .from(jobAssignments)
            .where(and(eq(jobAssignments.managerId, me), inForceOn(todayIn())))
        : [];
      const [writes] = me
        ? await tx.select({ n: count() }).from(reviews).where(eq(reviews.managerEmployeeId, me))
        : [];
      return {
        tasks: items.length,
        items,
        manage: viewer.manage,
        manager: (reports?.n ?? 0) > 0 || (writes?.n ?? 0) > 0,
        goals: await this.myGoals(tx, me),
        reviews: me ? await this.myReviews(tx, me) : [],
      };
    });
  }

  private async myTasks(tx: Tx, viewer: Viewer): Promise<PerformanceTask[]> {
    const me = viewer.employeeId;
    if (!me) return [];
    const live = inArray(reviewCycles.status, [...LIVE_CYCLES]);
    const own = await tx
      .select({ review: reviews, cycle: reviewCycles })
      .from(reviews)
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(
        and(
          eq(reviews.employeeId, me),
          or(
            and(eq(reviews.status, 'self'), eq(reviewCycles.status, 'active')),
            eq(reviews.status, 'released'),
          ),
        ),
      );
    const toWrite = await tx
      .select({ review: reviews, cycle: reviewCycles })
      .from(reviews)
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(and(eq(reviews.managerEmployeeId, me), eq(reviews.status, 'manager'), live));
    const toAnswer = await tx
      .select({ peer: peerFeedback, review: reviews, cycle: reviewCycles })
      .from(peerFeedback)
      .innerJoin(reviews, eq(reviews.id, peerFeedback.reviewId))
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(
        and(
          eq(peerFeedback.peerEmployeeId, me),
          eq(peerFeedback.status, 'approved'),
          notInArray(reviews.status, ['released', 'acknowledged']),
          live,
        ),
      );
    const toApprove = await tx
      .select({
        reviewId: reviews.id,
        employeeId: reviews.employeeId,
        cycle: reviewCycles,
        n: count(),
      })
      .from(peerFeedback)
      .innerJoin(reviews, eq(reviews.id, peerFeedback.reviewId))
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(
        and(
          eq(reviews.managerEmployeeId, me),
          eq(peerFeedback.status, 'proposed'),
          eq(reviewCycles.status, 'active'),
        ),
      )
      .groupBy(reviews.id, reviews.employeeId, reviewCycles.id);
    // Goals of the login's direct reports still waiting for agreement.
    const reports = tx
      .select({ id: jobAssignments.employeeId })
      .from(jobAssignments)
      .where(and(eq(jobAssignments.managerId, me), inForceOn(todayIn())));
    // As the goals module counts them: drafts outside a cycle, or in one still open.
    const goalsToAgree = await tx
      .select({ employeeId: goals.employeeId, n: count() })
      .from(goals)
      .leftJoin(reviewCycles, eq(reviewCycles.id, goals.cycleId))
      .where(
        and(
          eq(goals.status, 'draft'),
          inArray(goals.employeeId, reports),
          or(isNull(goals.cycleId), inArray(reviewCycles.status, ['draft', 'active'])),
        ),
      )
      .groupBy(goals.employeeId);
    const probationDue = await probationReviewsDueFor(tx, me);
    const probation = probationDue.length
      ? await tx
          .select({
            id: probationReviews.id,
            employeeId: probationReviews.employeeId,
            probationEndsOn: probationReviews.probationEndsOn,
            createdAt: probationReviews.createdAt,
          })
          .from(probationReviews)
          .where(inArray(probationReviews.id, probationDue))
      : [];

    const refs = await employeeRefs(tx, [
      ...toWrite.map((r) => r.review.employeeId),
      ...toAnswer.map((r) => r.review.employeeId),
      ...toApprove.map((r) => r.employeeId),
      ...goalsToAgree.map((g) => g.employeeId),
      ...probation.map((p) => p.employeeId),
    ]);
    const ref = (id: string | null) => (id ? (refs.get(id) ?? null) : null);
    return [
      ...own.map(({ review: r, cycle: c }): PerformanceTask => ({
        kind: r.status === 'self' ? 'self_review' : 'acknowledge',
        id: r.id,
        person: null,
        cycle: c.name,
        dueOn: r.status === 'self' ? c.selfDueOn : null,
        count: 1,
        link: `/workspace/performance/reviews/${r.id}`,
      })),
      ...toWrite.map(({ review: r, cycle: c }): PerformanceTask => ({
        kind: 'manager_review',
        id: r.id,
        person: ref(r.employeeId),
        cycle: c.name,
        dueOn: c.managerDueOn,
        count: 1,
        link: `/workspace/performance/reviews/${r.id}`,
      })),
      ...toAnswer.map(({ peer: p, review: r, cycle: c }): PerformanceTask => ({
        kind: 'peer_answer',
        id: p.id,
        person: ref(r.employeeId),
        cycle: c.name,
        dueOn: c.peerDueOn,
        count: 1,
        link: `/workspace/performance/peers/${p.id}`,
      })),
      ...toApprove.map((a): PerformanceTask => ({
        kind: 'peer_approve',
        id: a.reviewId,
        person: ref(a.employeeId),
        cycle: a.cycle.name,
        dueOn: a.cycle.peerDueOn,
        count: a.n,
        link: '/workspace/performance/peers',
      })),
      ...goalsToAgree.map((g): PerformanceTask => ({
        kind: 'goals_agree',
        id: g.employeeId!,
        person: ref(g.employeeId),
        cycle: null,
        dueOn: null,
        count: g.n,
        link: '/workspace/performance/goals',
      })),
      ...probation.map((p): PerformanceTask => ({
        kind: 'probation_review',
        id: p.id,
        person: ref(p.employeeId),
        cycle: null,
        dueOn: reviewDueOn(p.probationEndsOn, todayIn('Asia/Dhaka', p.createdAt)),
        count: 1,
        link: `/workspace/performance/probation/${p.id}`,
      })),
    ].toSorted((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'));
  }

  /** Reviews without a manager wait for HR: one task per cycle. */
  private async hrTasks(tx: Tx, viewer: Viewer): Promise<PerformanceTask[]> {
    if (!viewer.manage) return [];
    const rows = await tx
      .select({ cycle: reviewCycles, n: count() })
      .from(reviews)
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(
        and(
          isNull(reviews.managerEmployeeId),
          eq(reviews.status, 'manager'),
          inArray(reviewCycles.status, [...LIVE_CYCLES]),
          viewer.employeeId ? ne(reviews.employeeId, viewer.employeeId) : undefined,
          await entityScope(tx, viewer.user, reviews.employeeId),
        ),
      )
      .groupBy(reviewCycles.id);
    return rows.map(({ cycle: c, n }) => ({
      kind: 'manager_review',
      id: c.id,
      person: null,
      cycle: c.name,
      dueOn: c.managerDueOn,
      count: n,
      link: `/workspace/performance/cycles/${c.id}?status=manager`,
    }));
  }

  private async myGoals(tx: Tx, me: string | null): Promise<PerformanceMe['goals']> {
    const empty = { total: 0, draft: 0, agreed: 0, completed: 0, progress: null };
    if (!me) return empty;
    const rows = await tx
      .select({ status: goals.status, progress: goals.progress })
      .from(goals)
      .leftJoin(reviewCycles, eq(reviewCycles.id, goals.cycleId))
      .where(
        and(
          eq(goals.employeeId, me),
          ne(goals.status, 'dropped'),
          or(isNull(goals.cycleId), ne(reviewCycles.status, 'closed')),
        ),
      );
    if (rows.length === 0) return empty;
    return {
      total: rows.length,
      draft: rows.filter((g) => g.status === 'draft').length,
      agreed: rows.filter((g) => g.status === 'agreed').length,
      completed: rows.filter((g) => g.status === 'completed').length,
      progress: Math.round(rows.reduce((sum, g) => sum + g.progress, 0) / rows.length),
    };
  }

  private async myReviews(tx: Tx, me: string): Promise<MyReviewItem[]> {
    const rows = await tx
      .select({ review: reviews, cycle: reviewCycles })
      .from(reviews)
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(eq(reviews.employeeId, me))
      .orderBy(desc(reviewCycles.periodStart), asc(reviewCycles.name));
    return rows.map(({ review: r, cycle: c }) => ({
      id: r.id,
      cycle: {
        id: c.id,
        name: c.name,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        status: c.status,
      },
      status: r.status,
      finalRating: isReleased(r) ? asRating(r.finalRating) : null,
      releasedAt: iso(r.releasedAt),
      acknowledgedAt: iso(r.acknowledgedAt),
    }));
  }
}

/**
 * The review as the login may see it. The person sees their self review, and the rest only
 * once released: never the proposed rating, the recommendations or the calibration note, and
 * of peer feedback only the answers together, without names or ids.
 */
export async function detailOf(
  tx: Tx,
  viewer: Viewer,
  access: ReviewAccess,
): Promise<ReviewDetail> {
  const { review: r, cycle, role } = access;
  const person = role === 'person';
  const released = isReleased(r);
  const goalList = await reviewGoals(tx, r);
  const refs = await employeeRefs(tx, [r.employeeId, r.managerEmployeeId]);
  const jobs = await jobsOf(tx, [r.employeeId]);
  const job = jobs.get(r.employeeId);
  const writeManager = writesManagerPart(access);
  const peerStep =
    cycle.peerReview &&
    cycle.status === 'active' &&
    (r.status === 'self' || r.status === 'manager');
  const peers = await tx
    .select()
    .from(peerFeedback)
    .where(eq(peerFeedback.reviewId, r.id))
    .orderBy(asc(peerFeedback.createdAt));
  const peerRefs =
    person && released
      ? new Map()
      : await employeeRefs(
          tx,
          peers.map((p) => p.peerEmployeeId),
        );
  const [calibrator] =
    !person && r.calibratedByUserId
      ? await tx
          .select({ name: tenantUsers.name })
          .from(tenantUsers)
          .where(eq(tenantUsers.id, r.calibratedByUserId))
      : [];
  const calibrate =
    !person &&
    viewer.manage &&
    cycle.status === 'calibration' &&
    !released &&
    (role === 'hr' || (await inScope(tx, viewer.user, r.employeeId)));

  const can = {
    writeSelf: person && r.status === 'self' && cycle.status === 'active',
    writeManager:
      writeManager && r.status === 'manager' && LIVE_CYCLES.includes(cycle.status as 'active'),
    proposePeers: peerStep && (person || writeManager),
    approvePeers: peerStep && writeManager,
    acknowledge: person && r.status === 'released',
    calibrate,
  };

  return {
    id: r.id,
    cycle: { ...cycleSummary(cycle), competencies: cycle.competencies },
    employee: {
      ...refs.get(r.employeeId)!,
      designation: job?.designation ?? null,
      legalEntity: job?.legalEntity?.name ?? null,
    },
    manager: r.managerEmployeeId ? (refs.get(r.managerEmployeeId) ?? null) : null,
    status: r.status,
    role,
    can,
    goals: goalList,
    self:
      person || r.selfSubmittedAt
        ? { answers: r.selfAnswers, submittedAt: iso(r.selfSubmittedAt) }
        : null,
    managerReview: person
      ? released
        ? {
            answers: r.managerAnswers,
            submittedAt: iso(r.managerSubmittedAt),
            proposedRating: null,
            recommendations: null,
          }
        : null
      : {
          answers: r.managerAnswers,
          submittedAt: iso(r.managerSubmittedAt),
          proposedRating: asRating(r.proposedRating),
          recommendations: await recommendationsView(tx, r.recommendations),
        },
    goalScore: !person || released ? r.goalScore : null,
    finalRating: !person || released ? asRating(r.finalRating) : null,
    calibration: person
      ? null
      : { note: r.calibrationNote, by: calibrator?.name ?? null, at: iso(r.calibratedAt) },
    releasedAt: iso(r.releasedAt),
    acknowledgement: r.acknowledgedAt
      ? { at: r.acknowledgedAt.toISOString(), comment: r.employeeComment, agrees: r.employeeAgrees }
      : null,
    peers: person
      ? null
      : peers.map((p) => ({
          id: p.id,
          peer: peerRefs.get(p.peerEmployeeId)!,
          status: p.status,
          answers: p.answers as Partial<Record<PeerQuestion, string>> | null,
          rating: asRating(p.rating),
          submittedAt: iso(p.submittedAt),
        })),
    // Never whether a named peer has answered: that would tell who wrote what.
    peerProposals:
      person && !released
        ? peers
            .filter((p) => p.proposedByUserId === viewer.userId)
            .map((p) => ({
              id: p.id,
              peer: peerRefs.get(p.peerEmployeeId)!,
              status: p.status === 'submitted' ? 'approved' : p.status,
            }))
        : null,
    peerSummary:
      person && released && cycle.peerReview
        ? peerSummary(
            peers
              .filter((p) => p.status === 'submitted')
              .map((p) => ({
                answers: p.answers as Partial<Record<PeerQuestion, string>> | null,
                rating: p.rating,
              })),
          )
        : null,
    promotionChoices: can.writeManager
      ? await tx
          .select({ id: designations.id, name: designations.name })
          .from(designations)
          .where(eq(designations.isActive, true))
          .orderBy(asc(designations.name))
      : [],
  };
}
