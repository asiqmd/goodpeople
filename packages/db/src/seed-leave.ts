import { and, eq, inArray } from 'drizzle-orm';
import type { Tx } from './client.js';
import {
  approvalSteps,
  employees,
  leaveLedger,
  leaveRequests,
  leaveTypes,
  locations,
  tenantUsers,
} from './schema/index.js';

/** A line supervisor with a login, so manager approvals can be tried. */
export const SEED_MANAGER_EMAIL = 'shirin@my-group.test';

interface SeedRequest {
  employee: string;
  type: string;
  start: string;
  end: string;
  days: number;
  reason: string;
  /** Approval chain as seeded: who decides each step and how it stands. */
  steps: {
    kind: 'manager' | 'hr';
    approver?: string;
    status: 'approved' | 'pending' | 'skipped';
  }[];
}

const REQUESTS: SeedRequest[] = [
  {
    employee: 'MG-0005',
    type: 'CL',
    start: '2026-09-14',
    end: '2026-09-15',
    days: 2,
    reason: 'Visiting family in the village',
    steps: [{ kind: 'manager', approver: 'MG-0004', status: 'approved' }],
  },
  {
    employee: 'MG-0006',
    type: 'SL',
    start: '2026-11-02',
    end: '2026-11-03',
    days: 2,
    reason: 'Fever',
    steps: [{ kind: 'manager', approver: 'MG-0004', status: 'pending' }],
  },
  {
    employee: 'MG-0007',
    type: 'CL',
    start: '2026-11-10',
    end: '2026-11-10',
    days: 1,
    reason: 'Bank work',
    steps: [{ kind: 'manager', approver: 'MG-0004', status: 'pending' }],
  },
  {
    // Her manager (Farhan) has no login, so the manager step is skipped and HR decides.
    employee: 'MG-0002',
    type: 'AL',
    start: '2026-12-20',
    end: '2026-12-24',
    days: 5,
    reason: 'Year-end trip to Cox’s Bazar',
    steps: [
      { kind: 'manager', approver: 'MG-0001', status: 'skipped' },
      { kind: 'hr', status: 'pending' },
    ],
  },
];

/** Leave data for the internal "My Group" tenant. Runs after seedGroupHr. */
export async function seedGroupLeave(tx: Tx, ctx: { tenantId: string; passwordHash: string }) {
  const { tenantId } = ctx;
  // The head office works Sunday to Thursday; factories close on Friday only.
  await tx
    .update(locations)
    .set({ weeklyOffDays: [5, 6] })
    .where(eq(locations.code, 'HO'));

  const staff = new Map(
    (await tx.select({ id: employees.id, code: employees.employeeCode }).from(employees)).map(
      (e) => [e.code, e.id],
    ),
  );
  const [shirinUser] = await tx
    .insert(tenantUsers)
    .values({
      tenantId,
      email: SEED_MANAGER_EMAIL,
      name: 'Shirin Akter',
      passwordHash: ctx.passwordHash,
      role: 'employee',
    })
    .returning({ id: tenantUsers.id });
  await tx
    .update(employees)
    .set({ userId: shirinUser!.id })
    .where(eq(employees.employeeCode, 'MG-0004'));

  const types = new Map(
    (
      await tx
        .select({ id: leaveTypes.id, code: leaveTypes.code })
        .from(leaveTypes)
        .where(inArray(leaveTypes.code, ['CL', 'SL', 'AL']))
    ).map((t) => [t.code, t.id]),
  );
  const users = new Map(
    (
      await tx
        .select({ employeeId: employees.id, userId: employees.userId })
        .from(employees)
        .where(
          and(
            inArray(
              employees.employeeCode,
              REQUESTS.map((r) => r.employee),
            ),
          ),
        )
    ).map((u) => [u.employeeId, u.userId]),
  );

  for (const r of REQUESTS) {
    const employeeId = staff.get(r.employee)!;
    const approved = r.steps.every((s) => s.status !== 'pending');
    const [request] = await tx
      .insert(leaveRequests)
      .values({
        tenantId,
        employeeId,
        leaveTypeId: types.get(r.type)!,
        startDate: r.start,
        endDate: r.end,
        days: r.days,
        reason: r.reason,
        status: approved ? 'approved' : 'pending',
        appliedBy: users.get(employeeId) ?? shirinUser!.id,
        decidedAt: approved ? new Date(`${r.start}T03:00:00Z`) : null,
      })
      .returning({ id: leaveRequests.id });
    await tx.insert(approvalSteps).values(
      r.steps.map((s, i) => ({
        tenantId,
        subjectType: 'leave_request',
        subjectId: request!.id,
        stepNo: i + 1,
        kind: s.kind,
        approverEmployeeId: s.approver ? staff.get(s.approver)! : null,
        status: s.status,
        decidedByUserId: s.status === 'approved' ? shirinUser!.id : null,
        decidedAt: s.status === 'approved' ? new Date(`${r.start}T03:00:00Z`) : null,
      })),
    );
    if (approved) {
      await tx.insert(leaveLedger).values({
        tenantId,
        employeeId,
        leaveTypeId: types.get(r.type)!,
        leaveYear: Number(r.start.slice(0, 4)),
        kind: 'taken',
        days: -r.days,
        requestId: request!.id,
      });
    }
  }
}
