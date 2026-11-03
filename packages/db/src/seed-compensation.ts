import {
  DEFAULT_INCREMENT_MATRIX,
  Decimal,
  evaluateLines,
  money,
  positionInRange,
  type CompensationAmounts,
} from '@gp/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Tx } from './client.js';
import { CIPHER_FIELDS, type FieldCipher } from './field-cipher.js';
import {
  compensationLines,
  compensationRounds,
  employeePay,
  employees,
  grades,
  jobAssignments,
  legalEntities,
  payComponents,
  reviewCycles,
  reviews,
  salaryStructures,
  tenantUsers,
} from './schema/index.js';

/** A draft demonstration only; no approvals or pay changes are created by seeding. */
export async function seedGroupCompensation(
  tx: Tx,
  ctx: { tenantId: string; cipher: FieldCipher },
) {
  const name = 'Annual increment planning 2026 — demo';
  if (
    (
      await tx
        .select({ id: compensationRounds.id })
        .from(compensationRounds)
        .where(eq(compensationRounds.name, name))
    ).length
  )
    return;
  const [company] = await tx.select().from(legalEntities).where(eq(legalEntities.code, 'MGT'));
  const [cycle] = await tx
    .select()
    .from(reviewCycles)
    .where(eq(reviewCycles.name, 'Annual review 2025-26'));
  const [admin] = await tx.select().from(tenantUsers).where(eq(tenantUsers.role, 'tenant_admin'));
  if (!company || !cycle || !admin) return;
  const on = '2026-12-01';
  const ranges = (await tx.select().from(grades)).map((g) => ({
    gradeId: g.id,
    minimum: g.code.startsWith('W') ? '10000' : '30000',
    maximum: g.code.startsWith('W') ? '30000' : '100000',
  }));
  const candidates = await tx
    .select({ review: reviews, employee: employees })
    .from(reviews)
    .innerJoin(employees, eq(employees.id, reviews.employeeId))
    .where(
      and(
        eq(reviews.cycleId, cycle.id),
        inArray(reviews.status, ['released', 'acknowledged']),
        eq(employees.status, 'active'),
      ),
    );
  const components = await tx.select().from(payComponents);
  const records = [];
  for (const { review, employee } of candidates) {
    const [job] = await tx
      .select()
      .from(jobAssignments)
      .where(
        and(
          eq(jobAssignments.employeeId, employee.id),
          eq(jobAssignments.legalEntityId, company.id),
        ),
      )
      .orderBy(desc(jobAssignments.effectiveFrom));
    const own = await tx
      .select()
      .from(employeePay)
      .where(
        and(
          eq(employeePay.employeeId, employee.id),
          inArray(employeePay.status, ['approved', 'pending']),
        ),
      )
      .orderBy(desc(employeePay.effectiveFrom));
    const pay = own.find((p) => p.status === 'approved');
    if (
      !job ||
      !pay ||
      own.some((p) => p.status === 'pending') ||
      pay.effectiveFrom > on ||
      !review.finalRating
    )
      continue;
    const [structure] = await tx
      .select()
      .from(salaryStructures)
      .where(eq(salaryStructures.id, pay.structureId));
    const amounts = JSON.parse(
      ctx.cipher.decrypt(pay.amountsEnc, {
        tenantId: ctx.tenantId,
        field: CIPHER_FIELDS.payAmounts,
      }),
    ) as { amount: string; fixed: Record<string, string> };
    if (!structure || structure.basis !== 'gross' || Object.keys(amounts.fixed).length) continue;
    const calculate = (amount: string) => {
      const result = evaluateLines(
        structure.lines.map((l) => ({ code: l.component, formula: l.formula })),
        { GROSS: amount },
      );
      const gross = Object.entries(result.values)
        .filter(([code]) => components.find((c) => c.code === code)?.inGross)
        .reduce((sum, [, v]) => sum.plus(v), new Decimal(0));
      return {
        basic: money(result.values.BASIC ?? '0'),
        gross: money(gross),
        valid: !result.problems.length && gross.equals(amount),
      };
    };
    const before = calculate(amounts.amount);
    if (!before.valid) continue;
    const range = ranges.find((r) => r.gradeId === job.gradeId);
    if (!range) continue;
    const band = positionInRange(before.gross, range.minimum, range.maximum);
    const percent =
      DEFAULT_INCREMENT_MATRIX[String(review.finalRating) as keyof typeof DEFAULT_INCREMENT_MATRIX][
        band
      ];
    const amountAfter = money(
      new Decimal(before.gross).times(new Decimal(percent).dividedBy(100).plus(1)).ceil(),
    );
    const after = calculate(amountAfter);
    if (!after.valid) continue;
    const snapshot: CompensationAmounts = {
      ...amounts,
      grossBefore: before.gross,
      basicBefore: before.basic,
      suggestedPercent: percent,
      percent,
      amountAfter,
      grossAfter: after.gross,
      basicAfter: after.basic,
      minimumBasic: before.basic,
      band,
    };
    records.push({
      tenantId: ctx.tenantId,
      employeeId: employee.id,
      orgUnitId: job.orgUnitId,
      jobId: job.id,
      sourcePayId: pay.id,
      reviewId: review.id,
      rating: review.finalRating,
      incrementRecommended: review.recommendations?.increment ?? false,
      amountsEnc: ctx.cipher.encrypt(JSON.stringify(snapshot), {
        tenantId: ctx.tenantId,
        field: CIPHER_FIELDS.compensationAmounts,
      }),
    });
  }
  if (!records.length) return;
  const [round] = await tx
    .insert(compensationRounds)
    .values({
      tenantId: ctx.tenantId,
      name,
      legalEntityId: company.id,
      cycleId: cycle.id,
      effectiveFrom: on,
      matrix: DEFAULT_INCREMENT_MATRIX,
      ranges,
      budgets: [{ orgUnitId: null, monthlyAmount: '15000' }],
      createdBy: admin.id,
    })
    .returning();
  await tx.insert(compensationLines).values(records.map((r) => ({ ...r, roundId: round!.id })));
}
