import { z } from 'zod';
import { Decimal } from './formula.js';
import type { EmployeeRef } from './attendance-types.js';
import type { Ref } from './hr-types.js';
import { reasonSchema } from './schemas.js';

export const RANGE_BANDS = ['below_midpoint', 'to_maximum', 'above_maximum'] as const;
export type RangeBand = (typeof RANGE_BANDS)[number];
const cash = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a positive amount in taka');
const percent = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/)
  .refine((s) => Number(s) <= 100);
const matrixRow = z.object({
  below_midpoint: percent,
  to_maximum: percent,
  above_maximum: percent,
});
export const incrementMatrixSchema = z.object({
  '1': matrixRow,
  '2': matrixRow,
  '3': matrixRow,
  '4': matrixRow,
  '5': matrixRow,
});
export type IncrementMatrix = z.infer<typeof incrementMatrixSchema>;
export const DEFAULT_INCREMENT_MATRIX: IncrementMatrix = {
  '1': { below_midpoint: '0', to_maximum: '0', above_maximum: '0' },
  '2': { below_midpoint: '2', to_maximum: '1', above_maximum: '0' },
  '3': { below_midpoint: '6', to_maximum: '4', above_maximum: '2' },
  '4': { below_midpoint: '9', to_maximum: '7', above_maximum: '4' },
  '5': { below_midpoint: '12', to_maximum: '10', above_maximum: '6' },
};
const rangeSchema = z
  .object({ gradeId: z.uuid(), minimum: cash, maximum: cash })
  .refine((r) => new Decimal(r.maximum).greaterThan(r.minimum), 'Maximum must exceed minimum');
export const compensationCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    legalEntityId: z.uuid(),
    effectiveFrom: z.iso.date(),
    cycleId: z.uuid().nullable().default(null),
    rmgAnnual: z.boolean().default(false),
    matrix: incrementMatrixSchema.default(DEFAULT_INCREMENT_MATRIX),
    ranges: z.array(rangeSchema).max(100),
    budgets: z
      .array(z.object({ orgUnitId: z.uuid().nullable(), monthlyAmount: cash }))
      .min(1)
      .max(200),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (!v.cycleId && !v.rmgAnnual) issue('cycleId', 'Choose a released review cycle');
    if (v.budgets.filter((b) => b.orgUnitId === null).length !== 1)
      issue('budgets', 'Set exactly one company budget');
    if (new Set(v.budgets.map((b) => b.orgUnitId)).size !== v.budgets.length)
      issue('budgets', 'Each unit has one budget');
    if (new Set(v.ranges.map((r) => r.gradeId)).size !== v.ranges.length)
      issue('ranges', 'Each grade has one range');
  });
export type CompensationCreateInput = z.infer<typeof compensationCreateSchema>;
export const compensationProposalSchema = z.object({
  percent,
  reason: reasonSchema,
  submit: z.boolean().default(false),
  version: z.number().int().nonnegative(),
});
export type CompensationProposalInput = z.infer<typeof compensationProposalSchema>;
export const compensationBudgetSchema = z.object({
  budgets: compensationCreateSchema.shape.budgets,
});

/** The range midpoint belongs to the middle band; the maximum still belongs to it. */
export function positionInRange(gross: string, minimum: string, maximum: string): RangeBand {
  const amount = new Decimal(gross);
  if (amount.lessThan(new Decimal(minimum).plus(maximum).dividedBy(2))) return 'below_midpoint';
  return amount.lessThanOrEqualTo(maximum) ? 'to_maximum' : 'above_maximum';
}

export interface CompensationAmounts {
  amount: string;
  fixed: Record<string, string>;
  grossBefore: string;
  basicBefore: string;
  suggestedPercent: string;
  percent: string;
  amountAfter: string;
  grossAfter: string;
  basicAfter: string;
  minimumBasic: string;
  band: RangeBand | null;
}
export interface CompensationLineView extends CompensationAmounts {
  id: string;
  employee: EmployeeRef;
  orgUnit: Ref | null;
  grade: Ref | null;
  rating: number | null;
  incrementRecommended: boolean;
  submitted: boolean;
  reason: string | null;
  version: number;
  canEdit: boolean;
  payChangeId: string | null;
  payStatus: string | null;
}
export interface CompensationRoundListItem {
  id: string;
  name: string;
  company: Ref;
  effectiveFrom: string;
  status: 'open' | 'payroll' | 'cancelled';
  people: number;
  submitted: number;
}
export interface CompensationRoundView extends CompensationRoundListItem {
  cycleId: string | null;
  rmgAnnual: boolean;
  manage: boolean;
  lines: CompensationLineView[];
  budgets: { orgUnitId: string | null; monthlyAmount: string; proposed: string; within: boolean }[];
  monthlyIncrease: string;
  skipped: { employee: EmployeeRef; reason: string }[];
}
