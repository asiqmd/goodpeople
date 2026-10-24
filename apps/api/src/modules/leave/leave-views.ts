import { approvalSteps, employees, leaveRequests, leaveTypes, tenantUsers, type Tx } from '@gp/db';
import type { LeaveRequestView } from '@gp/shared';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const approver = alias(employees, 'approver');

/** Leave requests with their employee, type and approval steps, newest first. */
export async function loadRequests(tx: Tx, where: SQL | undefined): Promise<LeaveRequestView[]> {
  const rows = await tx
    .select({
      r: leaveRequests,
      employee: {
        id: employees.id,
        fullName: employees.fullName,
        employeeCode: employees.employeeCode,
      },
      leaveType: {
        id: leaveTypes.id,
        code: leaveTypes.code,
        name: leaveTypes.name,
        nameBn: leaveTypes.nameBn,
      },
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(where)
    .orderBy(desc(leaveRequests.startDate), desc(leaveRequests.createdAt));
  if (rows.length === 0) return [];

  const steps = await tx
    .select({
      s: approvalSteps,
      approver: { id: approver.id, fullName: approver.fullName },
      decidedBy: tenantUsers.name,
    })
    .from(approvalSteps)
    .leftJoin(approver, eq(approver.id, approvalSteps.approverEmployeeId))
    .leftJoin(tenantUsers, eq(tenantUsers.id, approvalSteps.decidedByUserId))
    .where(
      and(
        eq(approvalSteps.subjectType, 'leave_request'),
        inArray(
          approvalSteps.subjectId,
          rows.map((r) => r.r.id),
        ),
      ),
    )
    .orderBy(asc(approvalSteps.stepNo));

  return rows.map(({ r, employee, leaveType }) => ({
    id: r.id,
    employee,
    leaveType,
    startDate: r.startDate,
    endDate: r.endDate,
    halfDay: r.halfDay,
    days: r.days,
    reason: r.reason,
    status: r.status,
    needsDocument: r.needsDocument,
    steps: steps
      .filter((s) => s.s.subjectId === r.id)
      .map(({ s, approver: a, decidedBy }) => ({
        id: s.id,
        stepNo: s.stepNo,
        kind: s.kind,
        approver: a,
        status: s.status,
        decidedBy,
        decidedAt: s.decidedAt?.toISOString() ?? null,
        comment: s.comment,
      })),
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }));
}
