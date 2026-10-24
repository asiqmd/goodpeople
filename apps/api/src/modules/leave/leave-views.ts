import { employees, leaveRequests, leaveTypes, type Tx } from '@gp/db';
import type { LeaveRequestView } from '@gp/shared';
import { desc, eq, type SQL } from 'drizzle-orm';
import { loadSteps } from '../approvals/approval-views.js';

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

  const steps = await loadSteps(
    tx,
    'leave_request',
    rows.map((r) => r.r.id),
  );

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
    steps: steps.get(r.id) ?? [],
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }));
}
