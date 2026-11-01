import { Injectable } from '@nestjs/common';
import {
  designations,
  employees,
  goals,
  jobAssignments,
  reviewCycles,
  reviews,
  type Tx,
} from '@gp/db';
import type {
  OutcomeCycle,
  OutcomeRow,
  OutcomesView,
  PerformanceRecord,
  RecordCycleRef,
  RecordGoal,
  RecordReview,
  ReviewStatus,
} from '@gp/shared';
import { todayIn } from '@gp/shared';
import { and, asc, count, desc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { selectAssignments } from '../employees/employee.queries.js';
import { employeeRefs, managesPerson, notFound, pickJob, viewerOf } from './access.js';
import { outcomesCsv, outcomesFileName } from './outcomes.js';
import { PlansService } from './plans.service.js';
import { ProbationReviewsService } from './probation-reviews.service.js';

/** A review people can read: released, and maybe acknowledged. A released review never changes. */
const RELEASED: ReviewStatus[] = ['released', 'acknowledged'];
const released = () => and(inArray(reviews.status, RELEASED), isNotNull(reviews.finalRating));

const cycleRef = (c: typeof reviewCycles.$inferSelect): RecordCycleRef => ({
  id: c.id,
  name: c.name,
  periodStart: c.periodStart,
  periodEnd: c.periodEnd,
  status: c.status,
});

/**
 * A person's performance record (goals and reviews by cycle, improvement plans, probation
 * reviews), and a cycle's outcomes for M3's increment round: its released reviews' final
 * ratings and recommendations.
 */
@Injectable()
export class PerformanceRecordService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly plans: PlansService,
    private readonly probation: ProbationReviewsService,
  ) {}

  /**
   * For HR within their companies and the person's managers: everything. For the person: their
   * goals, their released reviews and their plans once started; never probation reviews.
   */
  record(user: AuthUser, employeeId: string): Promise<PerformanceRecord> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const refs = await employeeRefs(tx, [employeeId]);
      const employee = refs.get(employeeId);
      const self = viewer.employeeId === employeeId;
      if (!employee || (!self && !(await managesPerson(tx, viewer, employeeId, todayIn())))) {
        throw notFound('employee');
      }
      return {
        employee,
        self,
        goals: await this.goalsOf(tx, employeeId),
        reviews: await this.reviewsOf(tx, employeeId, self),
        plans: await this.plans.forEmployee(tx, viewer, employeeId),
        probationReviews: self ? [] : await this.probation.forEmployee(tx, employeeId),
      };
    });
  }

  /** Cycles with released reviews in the login's companies, newest first. */
  outcomeCycles(user: AuthUser): Promise<OutcomeCycle[]> {
    return this.tenantDb.run(async (tx) => {
      const scope = await entityScope(tx, user, reviews.employeeId);
      const rows = await tx
        .select({ cycle: reviewCycles, released: count(reviews.id) })
        .from(reviewCycles)
        .innerJoin(reviews, eq(reviews.cycleId, reviewCycles.id))
        .where(and(released(), scope))
        .groupBy(reviewCycles.id)
        .orderBy(desc(reviewCycles.periodEnd));
      return rows.map((r) => ({ ...cycleRef(r.cycle), released: r.released }));
    });
  }

  outcomes(user: AuthUser, cycleId: string): Promise<OutcomesView> {
    return this.tenantDb.run((tx) => this.outcomesIn(tx, user, cycleId));
  }

  async outcomesFile(user: AuthUser, cycleId: string): Promise<{ fileName: string; text: string }> {
    const view = await this.outcomes(user, cycleId);
    return { fileName: outcomesFileName(view.cycle.name), text: outcomesCsv(view.rows) };
  }

  /** One row per released review of the cycle, for people in the login's companies. */
  private async outcomesIn(tx: Tx, user: AuthUser, cycleId: string): Promise<OutcomesView> {
    const [cycle] = await tx.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId));
    if (!cycle) throw notFound('review cycle');
    const scope: SQL | undefined = await entityScope(tx, user, reviews.employeeId);
    const rows = await tx
      .select({ review: reviews, e: employees })
      .from(reviews)
      .innerJoin(employees, eq(employees.id, reviews.employeeId))
      .where(and(eq(reviews.cycleId, cycleId), released(), scope))
      .orderBy(asc(employees.employeeCode));
    const ids = rows.map((r) => r.e.id);
    const history = ids.length
      ? await selectAssignments(tx, inArray(jobAssignments.employeeId, ids))
      : [];
    const promotions = [
      ...new Set(rows.flatMap((r) => r.review.recommendations?.promotionDesignationId ?? [])),
    ];
    const names = promotions.length
      ? await tx
          .select({ id: designations.id, name: designations.name })
          .from(designations)
          .where(inArray(designations.id, promotions))
      : [];
    const today = todayIn();
    return {
      cycle: cycleRef(cycle),
      rows: rows.map(({ review, e }): OutcomeRow => {
        const job = pickJob(
          history.filter((h) => h.a.employeeId === e.id),
          today,
        );
        const to = review.recommendations?.promotionDesignationId;
        return {
          reviewId: review.id,
          employee: {
            id: e.id,
            employeeCode: e.employeeCode,
            fullName: e.fullName,
            fullNameBn: e.fullNameBn,
          },
          company: job?.legalEntity ?? { id: '', name: '' },
          orgUnit: job?.orgUnit ?? null,
          designation: job?.designation ?? null,
          grade: job?.grade ?? null,
          finalRating: review.finalRating!,
          goalScore: review.goalScore,
          recommendations: {
            increment: review.recommendations?.increment ?? false,
            promotionDesignation: to ? (names.find((n) => n.id === to) ?? null) : null,
            plan: review.recommendations?.plan ?? false,
          },
          releasedAt: (review.releasedAt ?? cycle.releasedAt ?? review.updatedAt).toISOString(),
          acknowledgedAt: review.acknowledgedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  private async goalsOf(tx: Tx, employeeId: string): Promise<PerformanceRecord['goals']> {
    const rows = await tx
      .select({ goal: goals, cycle: reviewCycles })
      .from(goals)
      .leftJoin(reviewCycles, eq(reviewCycles.id, goals.cycleId))
      .where(eq(goals.employeeId, employeeId))
      .orderBy(desc(reviewCycles.periodStart), asc(goals.dueOn), asc(goals.createdAt));
    const groups: PerformanceRecord['goals'] = [];
    for (const { goal, cycle } of rows) {
      let group = groups.find((g) => (g.cycle?.id ?? null) === (cycle?.id ?? null));
      if (!group) groups.push((group = { cycle: cycle ? cycleRef(cycle) : null, goals: [] }));
      const item: RecordGoal = {
        id: goal.id,
        title: goal.title,
        kind: goal.kind,
        status: goal.status,
        weight: goal.weight,
        progress: goal.progress,
        dueOn: goal.dueOn,
      };
      group.goals.push(item);
    }
    // Goals outside a cycle last.
    return groups.toSorted((a, b) => Number(a.cycle === null) - Number(b.cycle === null));
  }

  /** Every review for HR and managers, with the final rating once released; the person's released ones. */
  private async reviewsOf(tx: Tx, employeeId: string, self: boolean): Promise<RecordReview[]> {
    const rows = await tx
      .select({ review: reviews, cycle: reviewCycles })
      .from(reviews)
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(and(eq(reviews.employeeId, employeeId), self ? released() : undefined))
      .orderBy(desc(reviewCycles.periodEnd));
    return rows.map(({ review, cycle }) => {
      const readable = RELEASED.includes(review.status);
      return {
        id: review.id,
        cycle: cycleRef(cycle),
        status: review.status,
        finalRating: readable ? review.finalRating : null,
        goalScore: readable ? review.goalScore : null,
        releasedAt: readable
          ? ((review.releasedAt ?? cycle.releasedAt)?.toISOString() ?? null)
          : null,
        acknowledgedAt: review.acknowledgedAt?.toISOString() ?? null,
        employeeAgrees: readable ? review.employeeAgrees : null,
      };
    });
  }
}
