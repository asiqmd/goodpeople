import { approvalSteps, employees, jobAssignments, type Tx } from '@gp/db';
import type { ApprovalItem, ApprovalStepKind, ApprovalSubject } from '@gp/shared';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { inForceOn } from '../employees/employee.queries.js';

export type ApprovalStepRow = typeof approvalSteps.$inferSelect;

/**
 * Builds a subject's approval steps from a chain. A manager step goes to the employee's
 * manager on `onDate`; if there is none, or they have no workspace login, it is skipped so the
 * request never sticks. If that leaves no one to decide, an HR step is added rather than
 * approving by accident. Returns false when nobody needs to decide (an empty chain).
 */
export async function createApprovalSteps(
  tx: Tx,
  subject: {
    tenantId: string;
    type: ApprovalSubject;
    id: string;
    employeeId: string;
    onDate: string;
    chain: readonly ApprovalStepKind[];
  },
): Promise<boolean> {
  const [job] = await tx
    .select({ managerId: jobAssignments.managerId })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.employeeId, subject.employeeId), inForceOn(subject.onDate)));
  const manager = job?.managerId
    ? (await tx.select().from(employees).where(eq(employees.id, job.managerId)))[0]
    : undefined;

  let pendingSet = false;
  const steps = subject.chain.map((kind, i) => {
    const reachable =
      kind === 'hr' || (manager?.userId != null && manager.id !== subject.employeeId);
    const status = !reachable ? 'skipped' : pendingSet ? 'waiting' : 'pending';
    if (status === 'pending') pendingSet = true;
    return {
      tenantId: subject.tenantId,
      subjectType: subject.type,
      subjectId: subject.id,
      stepNo: i + 1,
      kind,
      approverEmployeeId: kind === 'manager' ? (manager?.id ?? null) : null,
      status: status as 'skipped' | 'waiting' | 'pending',
    };
  });
  if (steps.length && !pendingSet) {
    steps.push({
      tenantId: subject.tenantId,
      subjectType: subject.type,
      subjectId: subject.id,
      stepNo: steps.length + 1,
      kind: 'hr',
      approverEmployeeId: null,
      status: 'pending',
    });
    pendingSet = true;
  }
  if (steps.length) await tx.insert(approvalSteps).values(steps);
  return pendingSet;
}

/** Closes the steps nobody will decide now: after a rejection, or when a request is cancelled. */
export function cancelOpenSteps(tx: Tx, subjectId: string, statuses: ('pending' | 'waiting')[]) {
  return tx
    .update(approvalSteps)
    .set({ status: 'cancelled' })
    .where(and(eq(approvalSteps.subjectId, subjectId), inArray(approvalSteps.status, statuses)));
}

/** What the approvals inbox needs from each kind of thing that can be approved. */
export interface ApprovalSubjectHandler<View = unknown> {
  /** Prefix for audit actions, e.g. `leave` gives `leave.approve`. */
  readonly auditPrefix: string;
  readonly entityType: ApprovalSubject;
  /** Locks the subject for the decision and says whose request it is. */
  lockSubject(tx: Tx, subjectId: string): Promise<{ employeeId: string } | null>;
  /** A condition on approval_steps.subject_id: the subject is this employee's own request. */
  ownedBy(tx: Tx, employeeId: string): SQL;
  finalize(
    tx: Tx,
    subjectId: string,
    outcome: 'approved' | 'rejected',
    actorUserId: string,
  ): Promise<void>;
  /** Inbox entries for these waiting steps, with a date to sort the combined inbox by. */
  inboxItems(tx: Tx, steps: ApprovalStepRow[]): Promise<{ sortKey: string; item: ApprovalItem }[]>;
  view(subjectId: string): Promise<View>;
}
