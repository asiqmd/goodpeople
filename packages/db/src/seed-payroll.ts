import { inArray } from 'drizzle-orm';
import type { Tx } from './client.js';
import { CIPHER_FIELDS, type FieldCipher } from './field-cipher.js';
import {
  approvalSteps,
  employeePay,
  employees,
  payGroups,
  salaryStructures,
  tenantUsers,
} from './schema/index.js';

export const SEED_FINANCE_EMAIL = 'finance@my-group.test';

/** Pay history starts with the year, or on joining for people who joined since. */
const PAY_FROM = '2026-01-01';

/** Each employee's pay: workers on the RMG wage board grades, staff on the staff structure. */
const PAY: Record<
  string,
  { structure: 'RMG_WORKER' | 'STAFF'; gross: number; grade?: string; special?: number }
> = {
  'MG-0001': { structure: 'STAFF', gross: 95_000 },
  'MG-0002': { structure: 'STAFF', gross: 48_000 },
  'MG-0003': { structure: 'STAFF', gross: 120_000, special: 5_000 },
  'MG-0004': { structure: 'RMG_WORKER', gross: 16_500, grade: 'G1' },
  'MG-0005': { structure: 'RMG_WORKER', gross: 15_200, grade: 'G2' },
  'MG-0006': { structure: 'RMG_WORKER', gross: 13_800, grade: 'G3' },
  'MG-0007': { structure: 'RMG_WORKER', gross: 12_500, grade: 'G5' },
  'MG-0008': { structure: 'RMG_WORKER', gross: 14_000, grade: 'G3' },
  'MG-0009': { structure: 'STAFF', gross: 42_000 },
  'MG-0010': { structure: 'RMG_WORKER', gross: 12_500, grade: 'G5' },
};

/**
 * Pay for the internal "My Group" tenant: approved pay for everyone, a finance officer who
 * approves changes, and one raise waiting for them in the Approvals inbox. Runs after
 * provisioning and seedGroupHr; does nothing if the workspace already has pay.
 */
export async function seedGroupPayroll(
  tx: Tx,
  ctx: { tenantId: string; cipher: FieldCipher; passwordHash: string },
) {
  const { tenantId, cipher } = ctx;
  if ((await tx.select({ id: employeePay.id }).from(employeePay).limit(1)).length) return;

  const structures = new Map(
    (await tx.select().from(salaryStructures)).map((s) => [s.code, s.id] as const),
  );
  const [group] = await tx
    .select()
    .from(payGroups)
    .where(inArray(payGroups.code, ['MONTHLY']));
  const staff = await tx
    .select()
    .from(employees)
    .where(inArray(employees.employeeCode, Object.keys(PAY)));
  const [admin] = await tx
    .select({ id: tenantUsers.id })
    .from(tenantUsers)
    .where(inArray(tenantUsers.role, ['tenant_admin']));
  const encrypt = (amount: number, fixed: Record<string, string> = {}) =>
    cipher.encrypt(JSON.stringify({ amount: String(amount), fixed }), {
      tenantId,
      field: CIPHER_FIELDS.payAmounts,
    });

  for (const e of staff) {
    const pay = PAY[e.employeeCode]!;
    await tx.insert(employeePay).values({
      tenantId,
      employeeId: e.id,
      effectiveFrom: e.joinedOn > PAY_FROM ? e.joinedOn : PAY_FROM,
      status: 'approved',
      structureId: structures.get(pay.structure)!,
      payGroupId: group!.id,
      amountsEnc: encrypt(pay.gross, pay.special ? { SPECIAL: String(pay.special) } : {}),
      wageGrade: pay.grade ?? null,
      reason: 'Opening pay',
      requestedBy: admin?.id ?? null,
      decidedBy: admin?.id ?? null,
      decidedAt: new Date(`${PAY_FROM}T00:00:00Z`),
    });
  }

  await tx.insert(tenantUsers).values({
    tenantId,
    email: SEED_FINANCE_EMAIL,
    name: 'Kamrul Hasan (Finance)',
    passwordHash: ctx.passwordHash,
    role: 'finance_officer',
  });

  // A raise proposed by the admin, waiting for the finance officer.
  const raised = staff.find((e) => e.employeeCode === 'MG-0006')!;
  const [pending] = await tx
    .insert(employeePay)
    .values({
      tenantId,
      employeeId: raised.id,
      effectiveFrom: '2026-11-01',
      status: 'pending',
      structureId: structures.get('RMG_WORKER')!,
      payGroupId: group!.id,
      amountsEnc: encrypt(14_500),
      wageGrade: 'G2',
      reason: 'Promoted to grade 2 after the skills test',
      requestedBy: admin?.id ?? null,
    })
    .returning({ id: employeePay.id });
  await tx.insert(approvalSteps).values({
    tenantId,
    subjectType: 'compensation',
    subjectId: pending!.id,
    stepNo: 1,
    kind: 'payroll',
    status: 'pending',
  });
}
