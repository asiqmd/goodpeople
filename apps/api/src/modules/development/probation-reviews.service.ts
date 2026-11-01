import { Injectable } from '@nestjs/common';
import { employees, jobAssignments, probationReviews, separations, type Tx } from '@gp/db';
import {
  todayIn,
  type ProbationListQuery,
  type ProbationRecommendation,
  type ProbationReviewListItem,
  type ProbationReviewSubmitInput,
  type ProbationReviewView,
} from '@gp/shared';
import { and, eq, inArray, isNull, ne, notExists, or, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { inScope } from '../access-scopes/employee-scope.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { inForceOn } from '../employees/employee.queries.js';
import {
  localDate,
  NotificationsService,
  type Recipient,
} from '../notifications/notifications.service.js';
import {
  competenciesOf,
  employeeRefs,
  jobOn,
  notFound,
  performanceManagersOf,
  viewerOf,
  type Viewer,
} from './access.js';
import {
  actedOn,
  probationEndOf,
  ratingsProblem,
  reviewDueOn,
  reviewWanted,
  stateOf,
} from './probation.js';

type ReviewRow = typeof probationReviews.$inferSelect;

const RECOMMENDATION: Record<ProbationRecommendation, Record<'en' | 'bn', string>> = {
  confirm: { en: 'confirming', bn: 'স্থায়ী করার' },
  extend: { en: 'extending', bn: 'বাড়ানোর' },
  end: { en: 'ending', bn: 'শেষ করার' },
};

const nameOf = (e: { fullName: string; fullNameBn: string | null }) => ({
  en: e.fullName,
  bn: e.fullNameBn ?? e.fullName,
});

/** The day an instant falls on in Dhaka. */
const dhakaDay = (at: Date) => todayIn('Asia/Dhaka', at);

/**
 * Which of these reviews HR has acted on since, by the record: the person confirmed, their
 * probation's end changed, or their employment ended, through whichever page. Reads only; the
 * daily job stores what it finds as `actedAt`.
 */
async function actedOnSince(tx: Tx, rows: ReviewRow[], today: string): Promise<Set<string>> {
  const open = rows.filter((r) => !r.actedAt);
  if (open.length === 0) return new Set();
  const ids = [...new Set(open.map((r) => r.employeeId))];
  const people = await tx
    .select({ e: employees, job: jobAssignments })
    .from(employees)
    .leftJoin(jobAssignments, and(eq(jobAssignments.employeeId, employees.id), inForceOn(today)))
    .where(inArray(employees.id, ids));
  const left = await tx
    .select({ employeeId: separations.employeeId, createdAt: separations.createdAt })
    .from(separations)
    .where(
      and(
        inArray(separations.employeeId, ids),
        inArray(separations.status, ['approved', 'completed']),
      ),
    );
  const acted = open.filter((review) => {
    const person = people.find((p) => p.e.id === review.employeeId);
    if (!person) return false;
    const { e, job } = person;
    return actedOn(review.probationEndsOn, {
      status: e.status,
      confirmedOn: e.confirmedOn,
      employmentType: job?.employmentType ?? null,
      endsOn: probationEndOf(e, job?.workerCategory ?? 'worker'),
      separated: left.some((s) => s.employeeId === e.id && s.createdAt > review.createdAt),
    });
  });
  return new Set(acted.map((r) => r.id));
}

/**
 * Probation reviews: asked of the person's manager (or HR, without one) three weeks before the
 * probation ends, written by them, and read by HR, who acts through the person's probation as
 * before. A recommendation never acts by itself.
 */
@Injectable()
export class ProbationReviewsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** HR's reviews within their companies and the manager's own; never the viewer's own. */
  list(user: AuthUser, query: ProbationListQuery): Promise<ProbationReviewListItem[]> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const visible = await this.visibleTo(tx, viewer);
      if (!visible) return [];
      const rows = await tx.select().from(probationReviews).where(visible);
      return (await this.items(tx, rows))
        .filter((r) => !query.state || r.state === query.state)
        .toSorted((a, b) => a.probationEndsOn.localeCompare(b.probationEndsOn));
    });
  }

  get(user: AuthUser, id: string): Promise<ProbationReviewView> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { review, manage } = await this.reviewFor(tx, viewer, id);
      return this.view(tx, review, manage);
    });
  }

  /** The manager's (or HR's) review, once; HR who look after the company are told. */
  submit(
    user: AuthUser,
    id: string,
    input: ProbationReviewSubmitInput,
  ): Promise<ProbationReviewView> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { review, manage } = await this.reviewFor(tx, viewer, id, { lock: true });
      if (review.actedAt || (await actedOnSince(tx, [review], todayIn())).has(review.id)) {
        throw conflict('probation_review_closed', 'HR has already acted on this probation');
      }
      if (review.submittedAt) {
        throw conflict('probation_review_submitted', 'This probation review is already in');
      }
      const problem = ratingsProblem(await competenciesOf(tx), input.ratings);
      if (problem) throw badRequest('probation_ratings', problem);
      const [saved] = await tx
        .update(probationReviews)
        .set({
          ratings: input.ratings,
          recommendation: input.recommendation,
          comment: input.comment ?? null,
          submittedAt: new Date(),
        })
        .where(eq(probationReviews.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'probation_review.submit',
        entityType: 'probation_review',
        entityId: id,
        after: { ...input, employeeId: review.employeeId },
      });
      await this.tellHr(tx, saved!, viewer);
      return this.view(tx, saved!, manage);
    });
  }

  /**
   * Asks for a review of each probation ending within three weeks that has none for its end
   * date: of the person's manager, or of HR when there is none. A probation extended gets a
   * review for its new end. Returns how many were asked for.
   */
  askDue(now = new Date()): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      await this.settle(tx, now);
      const today = todayIn('Asia/Dhaka', now);
      const people = await tx
        .select({ e: employees, job: jobAssignments })
        .from(employees)
        .innerJoin(
          jobAssignments,
          and(eq(jobAssignments.employeeId, employees.id), inForceOn(today)),
        )
        .where(
          and(
            eq(employees.status, 'active'),
            isNull(employees.confirmedOn),
            eq(jobAssignments.employmentType, 'probationer'),
            // Someone already leaving has nothing to confirm.
            notExists(
              tx
                .select({ id: separations.id })
                .from(separations)
                .where(
                  and(
                    eq(separations.employeeId, employees.id),
                    inArray(separations.status, ['pending', 'approved']),
                  ),
                ),
            ),
          ),
        );
      let asked = 0;
      for (const { e, job } of people) {
        const endsOn = probationEndOf(e, job.workerCategory);
        if (!reviewWanted(endsOn, today)) continue;
        const [review] = await tx
          .insert(probationReviews)
          .values({
            tenantId: currentTenantId(),
            employeeId: e.id,
            managerEmployeeId: job.managerId,
            probationEndsOn: endsOn,
          })
          .onConflictDoNothing({
            target: [probationReviews.employeeId, probationReviews.probationEndsOn],
          })
          .returning();
        if (!review) continue;
        asked++;
        const recipients: Recipient[] = job.managerId
          ? [{ employeeId: job.managerId }]
          : await performanceManagersOf(tx, job.legalEntityId);
        const name = nameOf(e);
        const ends = localDate(endsOn);
        await this.notifications.notify(tx, {
          event: 'performance.task',
          recipients,
          values: {
            'task.title': {
              en: `Probation review for ${name.en}`,
              bn: `${name.bn}-এর শিক্ষানবিশকাল মূল্যায়ন`,
            },
            'task.detail': {
              en: `${name.en}'s probation ends on ${ends.en}. Rate their work and recommend whether to confirm, extend or end it.`,
              bn: `${name.bn}-এর শিক্ষানবিশকাল শেষ হবে ${ends.bn}। তাঁর কাজের রেটিং দিন এবং স্থায়ী করা, মেয়াদ বাড়ানো বা শেষ করার সুপারিশ করুন।`,
            },
            'task.due': localDate(reviewDueOn(endsOn, today)),
          },
          link: `/workspace/performance/probation/${review.id}`,
          dedupeKey: `performance.probation:${review.id}`,
          data: { probationReviewId: review.id, employeeId: e.id },
        });
      }
      return asked;
    });
  }

  /**
   * Stores `actedAt` on the reviews HR has acted on since (reads show it at once, without
   * writing). Runs with the daily job, so `actedAt` is the day Good People recorded it.
   */
  private async settle(tx: Tx, now: Date): Promise<number> {
    const open = await tx.select().from(probationReviews).where(isNull(probationReviews.actedAt));
    const acted = await actedOnSince(tx, open, todayIn('Asia/Dhaka', now));
    if (acted.size === 0) return 0;
    await tx
      .update(probationReviews)
      .set({ actedAt: now })
      .where(inArray(probationReviews.id, [...acted]));
    return acted.size;
  }

  /** The person's reviews, for their record (never for the person themselves). */
  async forEmployee(tx: Tx, employeeId: string): Promise<ProbationReviewListItem[]> {
    const rows = await tx
      .select()
      .from(probationReviews)
      .where(eq(probationReviews.employeeId, employeeId));
    return (await this.items(tx, rows)).toSorted((a, b) =>
      b.probationEndsOn.localeCompare(a.probationEndsOn),
    );
  }

  /** Reviews the viewer may read, as a condition; null when none. */
  private async visibleTo(tx: Tx, viewer: Viewer): Promise<SQL | null> {
    const notOwn = viewer.employeeId
      ? ne(probationReviews.employeeId, viewer.employeeId)
      : undefined;
    const conditions: (SQL | undefined)[] = [];
    if (viewer.manage) {
      conditions.push(
        and(notOwn, await entityScope(tx, viewer.user, probationReviews.employeeId)) ?? sql`true`,
      );
    }
    if (viewer.employeeId) {
      conditions.push(and(eq(probationReviews.managerEmployeeId, viewer.employeeId), notOwn));
    }
    return conditions.length ? or(...conditions)! : null;
  }

  /** The review for its manager or HR; not found for anyone else, the person included. */
  private async reviewFor(
    tx: Tx,
    viewer: Viewer,
    id: string,
    options: { lock?: boolean } = {},
  ): Promise<{ review: ReviewRow; manage: boolean }> {
    const query = tx.select().from(probationReviews).where(eq(probationReviews.id, id));
    const [review] = options.lock ? await query.for('update') : await query;
    if (!review || review.employeeId === viewer.employeeId) throw notFound('probation review');
    const manage = viewer.manage && (await inScope(tx, viewer.user, review.employeeId));
    const manager = !!viewer.employeeId && review.managerEmployeeId === viewer.employeeId;
    if (!manage && !manager) throw notFound('probation review');
    return { review, manage };
  }

  private async items(tx: Tx, rows: ReviewRow[]): Promise<ProbationReviewListItem[]> {
    const refs = await employeeRefs(
      tx,
      rows.flatMap((r) => [r.employeeId, r.managerEmployeeId]),
    );
    const acted = await actedOnSince(tx, rows, todayIn());
    return rows.map((r) => ({
      id: r.id,
      employee: refs.get(r.employeeId)!,
      manager: r.managerEmployeeId ? (refs.get(r.managerEmployeeId) ?? null) : null,
      probationEndsOn: r.probationEndsOn,
      dueOn: reviewDueOn(r.probationEndsOn, dhakaDay(r.createdAt)),
      state: stateOf({ submittedAt: r.submittedAt, acted: !!r.actedAt || acted.has(r.id) }),
      recommendation: r.recommendation,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      actedAt: r.actedAt?.toISOString() ?? null,
    }));
  }

  private async view(tx: Tx, review: ReviewRow, manage: boolean): Promise<ProbationReviewView> {
    const [item] = await this.items(tx, [review]);
    const today = todayIn();
    const [person] = await tx.select().from(employees).where(eq(employees.id, review.employeeId));
    const job = await jobOn(tx, review.employeeId, today);
    return {
      ...item!,
      joinedOn: person!.joinedOn,
      legalEntity: job?.legalEntity.name ?? null,
      designation: job?.designation?.name ?? null,
      orgUnit: job?.orgUnit?.name ?? null,
      currentProbationEndsOn: person!.confirmedOn
        ? null
        : probationEndOf(person!, job?.a.workerCategory ?? 'worker'),
      confirmedOn: person!.confirmedOn,
      competencies: await competenciesOf(tx),
      ratings: review.ratings,
      comment: review.comment,
      canSubmit: item!.state === 'due',
      manage,
    };
  }

  /** HR who look after the person's company hear the recommendation, to act on before the end. */
  private async tellHr(tx: Tx, review: ReviewRow, viewer: Viewer) {
    const today = todayIn();
    const job = await jobOn(tx, review.employeeId, today);
    if (!job) return;
    const refs = await employeeRefs(tx, [review.employeeId, viewer.employeeId]);
    const person = nameOf(refs.get(review.employeeId)!);
    const by = viewer.employeeId ? nameOf(refs.get(viewer.employeeId)!) : { en: 'HR', bn: 'এইচআর' };
    const what = RECOMMENDATION[review.recommendation!];
    const ends = localDate(review.probationEndsOn);
    await this.notifications.notify(tx, {
      event: 'performance.task',
      recipients: (await performanceManagersOf(tx, job.legalEntity.id)).filter(
        (r) => r.userId !== viewer.user.id,
      ),
      values: {
        'task.title': {
          en: `Probation review in for ${person.en}`,
          bn: `${person.bn}-এর শিক্ষানবিশকাল মূল্যায়ন জমা হয়েছে`,
        },
        'task.detail': {
          en: `${by.en} recommends ${what.en} ${person.en}'s probation, which ends on ${ends.en}. Act on it from their probation.`,
          bn: `${by.bn} ${person.bn}-এর শিক্ষানবিশকাল ${what.bn} সুপারিশ করেছেন; এটি শেষ হবে ${ends.bn}। তাঁর শিক্ষানবিশকাল থেকে ব্যবস্থা নিন।`,
        },
        'task.due': localDate(review.probationEndsOn < today ? today : review.probationEndsOn),
      },
      link: `/workspace/performance/probation/${review.id}`,
      dedupeKey: `performance.probation_submitted:${review.id}`,
      data: { probationReviewId: review.id, employeeId: review.employeeId },
    });
  }
}

/** Probation reviews waiting for this manager, for the navigation's count. */
export async function probationReviewsDueFor(tx: Tx, employeeId: string): Promise<string[]> {
  const rows = await tx
    .select()
    .from(probationReviews)
    .where(
      and(
        eq(probationReviews.managerEmployeeId, employeeId),
        isNull(probationReviews.submittedAt),
        isNull(probationReviews.actedAt),
      ),
    );
  const acted = await actedOnSince(tx, rows, todayIn());
  return rows.filter((r) => !acted.has(r.id)).map((r) => r.id);
}
