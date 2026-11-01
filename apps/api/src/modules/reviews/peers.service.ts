import { Injectable } from '@nestjs/common';
import { employees, jobAssignments, peerFeedback, reviewCycles, reviews, type Tx } from '@gp/db';
import {
  todayIn,
  type EmployeeRef,
  type PeerAnswerInput,
  type PeerInbox,
  type PeerQuestion,
  type PeerRequestView,
  type ReviewDetail,
} from '@gp/shared';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
} from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { inForceOn } from '../employees/employee.queries.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  employeeRefSelect,
  notFound,
  reviewFor,
  viewerOf,
  writesManagerPart,
  type CycleRow,
  type ReviewAccess,
  type Viewer,
} from './access.js';
import { peerAnswerTask, peerApprovalTask } from './notices.js';
import { detailOf } from './reviews.service.js';
import { asRating, employeeRefs, iso } from './views.js';

type PeerRow = typeof peerFeedback.$inferSelect;

/** Peers are named while the review is still with the person or their manager. */
function mustTakePeers(access: ReviewAccess) {
  const { cycle, review } = access;
  if (!cycle.peerReview) throw conflict('no_peer_review', 'This cycle has no peer feedback');
  if (cycle.status !== 'active' || (review.status !== 'self' && review.status !== 'manager')) {
    throw conflict('peer_step_closed', 'Peers can no longer be named for this review');
  }
}

/** A peer answers until the review is released. */
const answerOpen = (cycle: CycleRow, review: { status: string }, peer: PeerRow) =>
  peer.status === 'approved' &&
  (cycle.status === 'active' || cycle.status === 'calibration') &&
  review.status !== 'released' &&
  review.status !== 'acknowledged';

/** The person's company today, which their peers are chosen from. */
async function companyOf(tx: Tx, employeeId: string): Promise<string | null> {
  const [job] = await tx
    .select({ legalEntityId: jobAssignments.legalEntityId })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.employeeId, employeeId), inForceOn(todayIn())));
  return job?.legalEntityId ?? null;
}

/**
 * Peer feedback: the person or their manager names peers, the manager approves them, and each
 * approved peer answers two questions and gives a rating. Peers see only what they write.
 */
@Injectable()
export class PeersService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Colleagues who could give feedback: active, with a login, in the person's company, and
   * neither the person, their manager nor already named.
   */
  choices(user: AuthUser, reviewId: string, search?: string): Promise<EmployeeRef[]> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await reviewFor(tx, viewer, reviewId);
      if (access.role !== 'person' && !writesManagerPart(access)) return [];
      const company = await companyOf(tx, access.review.employeeId);
      if (!company) return [];
      const named = tx
        .select({ id: peerFeedback.peerEmployeeId })
        .from(peerFeedback)
        .where(eq(peerFeedback.reviewId, reviewId));
      const pattern = search ? `%${search.replace(/[%_\\]/g, '\\$&')}%` : null;
      return tx
        .selectDistinct(employeeRefSelect)
        .from(employees)
        .innerJoin(
          jobAssignments,
          and(eq(jobAssignments.employeeId, employees.id), inForceOn(todayIn())),
        )
        .where(
          and(
            eq(jobAssignments.legalEntityId, company),
            eq(employees.status, 'active'),
            isNotNull(employees.userId),
            notInArray(
              employees.id,
              [access.review.employeeId, access.review.managerEmployeeId].filter(
                (id): id is string => !!id,
              ),
            ),
            notInArray(employees.id, named),
            pattern
              ? or(ilike(employees.fullName, pattern), ilike(employees.employeeCode, pattern))
              : undefined,
          ),
        )
        .orderBy(asc(employees.fullName))
        .limit(20);
    });
  }

  /**
   * Names peers. The person's names wait for the manager's approval; the manager's are
   * approved at once, and the peers asked.
   */
  propose(user: AuthUser, reviewId: string, employeeIds: string[]): Promise<ReviewDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await reviewFor(tx, viewer, reviewId, { lock: true });
      const manager = writesManagerPart(access);
      if (access.role !== 'person' && !manager) {
        throw forbidden('not_your_part', 'Only the person or their manager names peers');
      }
      mustTakePeers(access);
      const { review, cycle } = access;
      const ids = [...new Set(employeeIds)];
      if (ids.includes(review.employeeId) || ids.includes(review.managerEmployeeId ?? '')) {
        throw badRequest('peer_not_allowed', 'The person and their manager cannot be peers');
      }
      const company = await companyOf(tx, review.employeeId);
      const eligible = await tx
        .selectDistinct({ id: employees.id })
        .from(employees)
        .innerJoin(
          jobAssignments,
          and(eq(jobAssignments.employeeId, employees.id), inForceOn(todayIn())),
        )
        .where(
          and(
            inArray(employees.id, ids),
            eq(employees.status, 'active'),
            isNotNull(employees.userId),
            company ? eq(jobAssignments.legalEntityId, company) : undefined,
          ),
        );
      if (eligible.length !== ids.length) {
        throw badRequest(
          'peer_not_allowed',
          'Peers are colleagues in the same company with a login',
        );
      }
      const created = await tx
        .insert(peerFeedback)
        .values(
          ids.map((peerEmployeeId) => ({
            tenantId: review.tenantId,
            reviewId,
            peerEmployeeId,
            status: manager ? ('approved' as const) : ('proposed' as const),
            proposedByUserId: user.id,
          })),
        )
        .onConflictDoNothing({ target: [peerFeedback.reviewId, peerFeedback.peerEmployeeId] })
        .returning();
      const person = (await employeeRefs(tx, [review.employeeId])).get(review.employeeId)!;
      const due = cycle.peerDueOn ?? cycle.managerDueOn!;
      if (manager) {
        for (const peer of created) await this.askPeer(tx, cycle, person, peer);
      } else if (created.length && review.managerEmployeeId) {
        await this.notifications.notify(tx, {
          event: 'performance.task',
          recipients: [{ employeeId: review.managerEmployeeId }],
          values: peerApprovalTask(cycle.name, person, due),
          link: '/workspace/performance/peers',
          data: { cycleId: cycle.id, reviewId },
        });
      }
      return detailOf(tx, viewer, access);
    });
  }

  /** The manager approves a named peer, who is then asked, or declines them. */
  decide(user: AuthUser, peerId: string, approve: boolean): Promise<ReviewDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const peer = await this.peerRow(tx, peerId);
      if (!peer) throw notFound('peer request');
      const access = await reviewFor(tx, viewer, peer.reviewId, { lock: true });
      if (!writesManagerPart(access)) {
        if (access.role === 'person') throw notFound('peer request');
        throw forbidden('not_your_part', "Only the person's manager approves peers");
      }
      mustTakePeers(access);
      if (peer.status !== 'proposed') {
        throw conflict('peer_decided', 'This peer has already been approved or declined');
      }
      const [row] = await tx
        .update(peerFeedback)
        .set({ status: approve ? 'approved' : 'declined' })
        .where(eq(peerFeedback.id, peerId))
        .returning();
      if (approve) {
        const person = (await employeeRefs(tx, [access.review.employeeId])).get(
          access.review.employeeId,
        )!;
        await this.askPeer(tx, access.cycle, person, row!);
      }
      return detailOf(tx, viewer, access);
    });
  }

  /** Feedback the login is asked for, and peers waiting for the login's approval. */
  inbox(user: AuthUser): Promise<PeerInbox> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const me = viewer.employeeId;
      const asked = me
        ? await tx
            .select({ peer: peerFeedback, review: reviews, cycle: reviewCycles })
            .from(peerFeedback)
            .innerJoin(reviews, eq(reviews.id, peerFeedback.reviewId))
            .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
            .where(
              and(
                eq(peerFeedback.peerEmployeeId, me),
                inArray(peerFeedback.status, ['approved', 'submitted']),
                ne(reviewCycles.status, 'closed'),
              ),
            )
            .orderBy(desc(reviewCycles.periodStart), asc(peerFeedback.createdAt))
        : [];
      const toApprove = await this.waitingApproval(tx, viewer);
      const refs = await employeeRefs(tx, [
        ...asked.map((a) => a.review.employeeId),
        ...toApprove.flatMap((p) => [p.review.employeeId, p.peer.peerEmployeeId]),
      ]);
      return {
        toAnswer: asked.map((a) => this.requestView(a.peer, a.review, a.cycle, refs)),
        toApprove: toApprove.map(({ peer, review, cycle }) => ({
          id: peer.id,
          reviewId: review.id,
          person: refs.get(review.employeeId)!,
          peer: refs.get(peer.peerEmployeeId)!,
          cycle: { id: cycle.id, name: cycle.name },
          proposedAt: peer.createdAt.toISOString(),
        })),
      };
    });
  }

  /** One request for the login's feedback; nobody but the peer sees it here. */
  request(user: AuthUser, peerId: string): Promise<PeerRequestView> {
    return this.tenantDb.run(async (tx) => {
      const { peer, review, cycle } = await this.mine(tx, user, peerId);
      return this.requestView(peer, review, cycle, await employeeRefs(tx, [review.employeeId]));
    });
  }

  answer(user: AuthUser, peerId: string, input: PeerAnswerInput): Promise<PeerRequestView> {
    return this.tenantDb.run(async (tx) => {
      const { peer, review, cycle } = await this.mine(tx, user, peerId, { lock: true });
      if (peer.status === 'submitted') {
        throw conflict('peer_answered', 'You have already given your feedback');
      }
      if (!answerOpen(cycle, review, peer)) {
        throw conflict('peer_step_closed', 'This feedback can no longer be given');
      }
      const [row] = await tx
        .update(peerFeedback)
        .set({
          answers: input.answers,
          rating: input.rating,
          status: 'submitted',
          submittedAt: new Date(),
        })
        .where(eq(peerFeedback.id, peerId))
        .returning();
      return this.requestView(row!, review, cycle, await employeeRefs(tx, [review.employeeId]));
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async peerRow(tx: Tx, id: string): Promise<PeerRow | undefined> {
    const [row] = await tx.select().from(peerFeedback).where(eq(peerFeedback.id, id));
    return row;
  }

  /** The login's own request; not found for anyone else, the person and manager included. */
  private async mine(tx: Tx, user: AuthUser, peerId: string, options: { lock?: boolean } = {}) {
    const viewer = await viewerOf(tx, user);
    const query = tx
      .select({ peer: peerFeedback, review: reviews, cycle: reviewCycles })
      .from(peerFeedback)
      .innerJoin(reviews, eq(reviews.id, peerFeedback.reviewId))
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(eq(peerFeedback.id, peerId));
    const [row] = options.lock ? await query.for('update', { of: peerFeedback }) : await query;
    if (
      !row ||
      !viewer.employeeId ||
      row.peer.peerEmployeeId !== viewer.employeeId ||
      row.peer.status === 'proposed' ||
      row.peer.status === 'declined'
    ) {
      throw notFound('peer request');
    }
    return row;
  }

  /** Named peers waiting for the login: as the review's manager, or as HR where there is none. */
  private async waitingApproval(tx: Tx, viewer: Viewer) {
    const mine = viewer.employeeId ? eq(reviews.managerEmployeeId, viewer.employeeId) : undefined;
    const hr = viewer.manage
      ? and(
          isNull(reviews.managerEmployeeId),
          await entityScope(tx, viewer.user, reviews.employeeId),
        )
      : undefined;
    if (!mine && !hr) return [];
    return tx
      .select({ peer: peerFeedback, review: reviews, cycle: reviewCycles })
      .from(peerFeedback)
      .innerJoin(reviews, eq(reviews.id, peerFeedback.reviewId))
      .innerJoin(reviewCycles, eq(reviewCycles.id, reviews.cycleId))
      .where(
        and(
          eq(peerFeedback.status, 'proposed'),
          eq(reviewCycles.status, 'active'),
          inArray(reviews.status, ['self', 'manager']),
          viewer.employeeId ? ne(reviews.employeeId, viewer.employeeId) : undefined,
          or(mine, hr),
        ),
      )
      .orderBy(asc(peerFeedback.createdAt));
  }

  private requestView(
    peer: PeerRow,
    review: typeof reviews.$inferSelect,
    cycle: CycleRow,
    refs: Map<string, EmployeeRef>,
  ): PeerRequestView {
    return {
      id: peer.id,
      person: refs.get(review.employeeId)!,
      cycle: { id: cycle.id, name: cycle.name },
      status: peer.status,
      dueOn: cycle.peerDueOn,
      open: answerOpen(cycle, review, peer),
      answers: peer.answers as Partial<Record<PeerQuestion, string>> | null,
      rating: asRating(peer.rating),
      submittedAt: iso(peer.submittedAt),
    };
  }

  private askPeer(tx: Tx, cycle: CycleRow, person: EmployeeRef, peer: PeerRow) {
    return this.notifications.notify(tx, {
      event: 'performance.task',
      recipients: [{ employeeId: peer.peerEmployeeId }],
      values: peerAnswerTask(cycle.name, person, cycle.peerDueOn ?? cycle.managerDueOn!),
      link: `/workspace/performance/peers/${peer.id}`,
      dedupeKey: `review.peer:${peer.id}`,
      data: { cycleId: cycle.id },
    });
  }
}
