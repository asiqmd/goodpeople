import { eq, inArray } from 'drizzle-orm';
import type { Tx } from './client.js';
import { CIPHER_FIELDS, type FieldCipher } from './field-cipher.js';
import {
  approvalSteps,
  employeeLoans,
  employeePay,
  employees,
  payGroups,
  payrollSettings,
  pfEntries,
  pfMembers,
  salaryStructures,
  taxDeclarations,
  taxOpenings,
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

/** One investment in a seeded declaration. */
const item = (kind: string, declared: string, verified: string | null) => ({
  kind,
  declared,
  verified,
  note: null,
  documentId: null,
});

/**
 * Phase 2 M3 for "My Group": a provident fund for the permanent workers (7% each way, with
 * opening balances from the old fund), tax figures from July to September for the staff who
 * pay tax (the workspace went live in October), one verified and one waiting investment
 * declaration, and an advance waiting for the finance officer. Does nothing a second time.
 */
export async function seedGroupBenefits(tx: Tx, ctx: { tenantId: string; cipher: FieldCipher }) {
  const { tenantId, cipher } = ctx;
  if ((await tx.select({ id: pfMembers.employeeId }).from(pfMembers).limit(1)).length) return;
  const seal = (field: (typeof CIPHER_FIELDS)[keyof typeof CIPHER_FIELDS], value: unknown) =>
    cipher.encrypt(JSON.stringify(value), { tenantId, field });
  const people = new Map(
    (await tx.select().from(employees)).map((e) => [e.employeeCode, e] as const),
  );
  const id = (code: string) => people.get(code)!.id;
  const [admin] = await tx
    .select({ id: tenantUsers.id })
    .from(tenantUsers)
    .where(eq(tenantUsers.role, 'tenant_admin'));

  await tx
    .update(payrollSettings)
    .set({ pfEnabled: true, pfEmployeeRate: '7', pfEmployerRate: '7' })
    .where(eq(payrollSettings.tenantId, tenantId));
  const workers = ['MG-0004', 'MG-0005', 'MG-0006', 'MG-0007', 'MG-0008'];
  await tx
    .insert(pfMembers)
    .values(workers.map((code) => ({ tenantId, employeeId: id(code), joinedOn: '2026-01-01' })));
  // Brought from the old fund: January to September at 7% of each one's basic.
  const basic: Record<string, number> = {
    'MG-0004': 9_367,
    'MG-0005': 8_500,
    'MG-0006': 7_567,
    'MG-0007': 6_700,
    'MG-0008': 7_700,
  };
  await tx.insert(pfEntries).values(
    workers.flatMap((code) =>
      (['own', 'employer'] as const).map((account) => ({
        tenantId,
        employeeId: id(code),
        date: '2026-09-30',
        kind: 'opening' as const,
        account,
        amountEnc: seal(CIPHER_FIELDS.pfEntries, String(Math.round(basic[code]! * 0.07) * 9)),
        note: 'Balance from the previous fund',
      })),
    ),
  );

  // July to September from the old payroll, for the year's tax.
  await tx.insert(taxOpenings).values([
    {
      tenantId,
      employeeId: id('MG-0001'),
      fiscalYear: '2026-27',
      amountsEnc: seal(CIPHER_FIELDS.taxOpenings, {
        salary: '285000.00',
        tax: '9750.00',
        pf: '0.00',
      }),
    },
    {
      tenantId,
      employeeId: id('MG-0003'),
      fiscalYear: '2026-27',
      amountsEnc: seal(CIPHER_FIELDS.taxOpenings, {
        salary: '375000.00',
        tax: '18750.00',
        pf: '0.00',
      }),
    },
  ]);
  await tx.insert(taxDeclarations).values([
    {
      tenantId,
      employeeId: id('MG-0001'),
      fiscalYear: '2026-27',
      status: 'verified',
      itemsEnc: seal(CIPHER_FIELDS.taxDeclarations, [
        item('dps', '120000.00', '120000.00'),
        item('life_insurance', '60000.00', '50000.00'),
      ]),
      submittedAt: new Date('2026-08-10T04:00:00Z'),
      verifiedBy: admin?.id ?? null,
      verifiedAt: new Date('2026-08-20T04:00:00Z'),
    },
    {
      tenantId,
      employeeId: id('MG-0003'),
      fiscalYear: '2026-27',
      status: 'submitted',
      itemsEnc: seal(CIPHER_FIELDS.taxDeclarations, [
        item('savings_certificate', '300000.00', null),
        item('zakat', '25000.00', null),
      ]),
      submittedAt: new Date('2026-10-12T04:00:00Z'),
    },
  ]);

  // An Eid advance for Rahima, waiting for the finance officer.
  const [advance] = await tx
    .insert(employeeLoans)
    .values({
      tenantId,
      employeeId: id('MG-0005'),
      kind: 'advance',
      amountsEnc: seal(CIPHER_FIELDS.loanAmounts, { principal: '6000.00', installment: '2000.00' }),
      startMonth: '2026-11',
      reason: 'Advance for a family wedding',
      requestedBy: admin?.id ?? null,
    })
    .returning({ id: employeeLoans.id });
  await tx.insert(approvalSteps).values({
    tenantId,
    subjectType: 'loan',
    subjectId: advance!.id,
    stepNo: 1,
    kind: 'payroll',
    status: 'pending',
  });
}
