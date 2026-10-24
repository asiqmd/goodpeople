import { approvalSteps, employees, tenantUsers, type Tx } from '@gp/db';
import type { ApprovalStepView, ApprovalSubject } from '@gp/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const approver = alias(employees, 'approver');

/** The approval steps of these subjects, in order, with who decides and who decided. */
export async function loadSteps(
  tx: Tx,
  subjectType: ApprovalSubject,
  subjectIds: string[],
): Promise<Map<string, ApprovalStepView[]>> {
  const out = new Map<string, ApprovalStepView[]>();
  if (subjectIds.length === 0) return out;
  const rows = await tx
    .select({
      s: approvalSteps,
      approver: { id: approver.id, fullName: approver.fullName },
      decidedBy: tenantUsers.name,
    })
    .from(approvalSteps)
    .leftJoin(approver, eq(approver.id, approvalSteps.approverEmployeeId))
    .leftJoin(tenantUsers, eq(tenantUsers.id, approvalSteps.decidedByUserId))
    .where(
      and(eq(approvalSteps.subjectType, subjectType), inArray(approvalSteps.subjectId, subjectIds)),
    )
    .orderBy(asc(approvalSteps.stepNo));
  for (const { s, approver: a, decidedBy } of rows) {
    const list = out.get(s.subjectId) ?? [];
    list.push({
      id: s.id,
      stepNo: s.stepNo,
      kind: s.kind,
      // A left join with no match gives an object of nulls.
      approver: a?.id ? a : null,
      status: s.status,
      decidedBy,
      decidedAt: s.decidedAt?.toISOString() ?? null,
      comment: s.comment,
    });
    out.set(s.subjectId, list);
  }
  return out;
}
