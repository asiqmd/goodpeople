import {
  applicationEvents,
  applications,
  candidates,
  interviewPanel,
  interviews,
  tenantAuditLog,
  type Tx,
} from '@gp/db';
import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { currentTenantId } from '../../common/request-context.js';

// Erasing a candidate (Personal Data Protection Ordinance 2025: data kept only with consent
// and for the time stated, and erased on request): the person is blanked and their CV deleted,
// while the applications, stages and ratings stay so the workspace's numbers still add up.

export const ERASED_NAME = 'Erased candidate';

/** Whether the candidate was hired from any application: such a person is never erased. */
export async function wasHired(tx: Tx, candidateId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.candidateId, candidateId),
        or(eq(applications.stage, 'hired'), isNotNull(applications.employeeId)),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Blanks the candidate, their cover notes, HR's notes on them and interviewers' written
 * feedback (ratings stay), and records it. Returns the CV's storage key, for the caller to
 * delete from the store once the transaction has committed.
 */
export async function eraseCandidate(
  tx: Tx,
  candidateId: string,
  options: { actorUserId: string | null; reason: 'request' | 'retention' },
): Promise<string | null> {
  const [candidate] = await tx
    .select({ cvStorageKey: candidates.cvStorageKey })
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  const now = new Date();
  await tx
    .update(candidates)
    .set({
      fullName: ERASED_NAME,
      email: null,
      phone: null,
      notes: null,
      referredByEmployeeId: null,
      cvStorageKey: null,
      cvFileName: null,
      cvContentType: null,
      cvSizeBytes: null,
      talentPool: false,
      erasedAt: now,
      updatedAt: now,
    })
    .where(eq(candidates.id, candidateId));
  const theirs = tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.candidateId, candidateId));
  await tx
    .update(applications)
    .set({ coverNote: null, updatedAt: now })
    .where(eq(applications.candidateId, candidateId));
  await tx
    .update(applicationEvents)
    .set({ note: null })
    .where(
      and(inArray(applicationEvents.applicationId, theirs), eq(applicationEvents.kind, 'note')),
    );
  await tx
    .update(interviewPanel)
    .set({ feedback: null })
    .where(
      inArray(
        interviewPanel.interviewId,
        tx
          .select({ id: interviews.id })
          .from(interviews)
          .where(inArray(interviews.applicationId, theirs)),
      ),
    );
  // Written directly: the retention job has no login to record as the one who erased.
  await tx.insert(tenantAuditLog).values({
    tenantId: currentTenantId(),
    actorUserId: options.actorUserId,
    action: 'candidate.erase',
    entityType: 'candidate',
    entityId: candidateId,
    after: { reason: options.reason },
  });
  return candidate?.cvStorageKey ?? null;
}
