import { applicationEvents, applications, type Tx } from '@gp/db';
import type { ApplicationStage } from '@gp/shared';
import { eq, sql } from 'drizzle-orm';
import { currentTenantId } from '../../common/request-context.js';

// The application's history: every stage move, note, email and interview change, with who.

/** The clock, not the transaction's start: rows written by one change keep their order. */
export const clock = sql<Date>`clock_timestamp()`;

export type EventKind = 'stage' | 'note' | 'email' | 'interview';

/**
 * An event; an `interview` or `email` event's note is a code the web translates (scheduled,
 * rescheduled, cancelled, completed, scorecard; rejection).
 */
export async function addEvent(
  tx: Tx,
  applicationId: string,
  kind: EventKind,
  note: string | null,
  actorUserId: string | null,
) {
  await tx.insert(applicationEvents).values({
    tenantId: currentTenantId(),
    applicationId,
    kind,
    note,
    actorUserId,
    createdAt: clock,
  });
}

/** Moves an application and records the move; a reason goes with rejecting or withdrawing. */
export async function moveStage(
  tx: Tx,
  application: { id: string; stage: ApplicationStage },
  to: ApplicationStage,
  options: { reason?: string | null; actorUserId: string | null },
) {
  const now = new Date();
  const closing = to === 'rejected' || to === 'withdrawn';
  await tx
    .update(applications)
    .set({
      stage: to,
      stageChangedAt: now,
      rejectionReason: closing ? (options.reason ?? null) : null,
      updatedAt: now,
    })
    .where(eq(applications.id, application.id));
  await tx.insert(applicationEvents).values({
    tenantId: currentTenantId(),
    applicationId: application.id,
    kind: 'stage',
    fromStage: application.stage,
    toStage: to,
    note: options.reason ?? null,
    actorUserId: options.actorUserId,
    createdAt: clock,
  });
}
