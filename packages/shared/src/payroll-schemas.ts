import { z } from 'zod';
import { MAX_FORMULA_LENGTH } from './formula.js';
import {
  COMPONENT_CODE,
  PAY_BASES,
  PAY_CALCULATIONS,
  PAY_COMPONENT_KINDS,
  PAY_FREQUENCIES,
  RESERVED_PAY_NAMES,
  TAX_TREATMENTS,
} from './payroll.js';
import { withoutDefaults } from './zod-helpers.js';

const isoDate = z.iso.date();
const id = z.uuid();
const name = z.string().trim().min(2).max(120);
const nameBn = z.string().trim().max(120).nullable().optional();

/** Money in, as a number or text: up to ten digits and two decimals, never negative. */
export const moneySchema = z
  .union([z.number(), z.string().trim()])
  .transform((v) => (typeof v === 'number' ? String(v) : v))
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), 'Enter an amount like 12500 or 12500.50');

export const componentCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => COMPONENT_CODE.test(v), 'Use capital letters, digits and _, e.g. HOUSE_RENT')
  .refine(
    (v) => !(RESERVED_PAY_NAMES as readonly string[]).includes(v),
    'This name is kept for payroll itself',
  );

const formula = z.string().trim().min(1).max(MAX_FORMULA_LENGTH);

// ── Components ───────────────────────────────────────────────────────────────

const componentFields = {
  name,
  nameBn,
  kind: z.enum(PAY_COMPONENT_KINDS),
  calculation: z.enum(PAY_CALCULATIONS),
  taxTreatment: z.enum(TAX_TREATMENTS).default('taxable'),
  /** Counts towards gross salary. */
  inGross: z.boolean().default(false),
  /** Counts towards the overtime rate (basic and dearness allowance, Labour Act s.108). */
  inOvertimeBase: z.boolean().default(false),
  /** Reduced for days not paid (joining or leaving mid-period, unpaid leave). */
  prorate: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(100),
  isActive: z.boolean().default(true),
};

export const payComponentSchema = z.object({ code: componentCodeSchema, ...componentFields });
export type PayComponentInput = z.infer<typeof payComponentSchema>;

/** The code is fixed once formulas may use it. */
export const payComponentUpdateSchema = z.object(withoutDefaults(componentFields)).partial();
export type PayComponentUpdateInput = z.infer<typeof payComponentUpdateSchema>;

// ── Structures ───────────────────────────────────────────────────────────────

export const structureLineSchema = z.object({ component: componentCodeSchema, formula });

const structureFields = {
  name,
  nameBn,
  basis: z.enum(PAY_BASES),
  lines: z.array(structureLineSchema).min(1).max(30),
  /** The minimum wage table salaries on this structure are checked against. */
  wageBoard: z.string().max(60).nullable().optional(),
  isActive: z.boolean().default(true),
};

export const salaryStructureSchema = z.object({
  code: z.string().trim().min(2).max(30),
  ...structureFields,
});
export type SalaryStructureInput = z.infer<typeof salaryStructureSchema>;

export const salaryStructureUpdateSchema = z.object(withoutDefaults(structureFields)).partial();
export type SalaryStructureUpdateInput = z.infer<typeof salaryStructureUpdateSchema>;

/** Works lines out for an amount without saving them, for the editor's live preview. */
export const structurePreviewSchema = z.object({
  basis: z.enum(PAY_BASES),
  lines: z.array(structureLineSchema).min(1).max(30),
  amount: moneySchema,
});
export type StructurePreviewInput = z.infer<typeof structurePreviewSchema>;

// ── Pay groups and settings ──────────────────────────────────────────────────

const payGroupFields = {
  name,
  frequency: z.enum(PAY_FREQUENCIES),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
};

export const payGroupSchema = z.object({
  code: z.string().trim().min(2).max(30),
  ...payGroupFields,
});
export type PayGroupInput = z.infer<typeof payGroupSchema>;

export const payGroupUpdateSchema = z.object(withoutDefaults(payGroupFields)).partial();
export type PayGroupUpdateInput = z.infer<typeof payGroupUpdateSchema>;

export const payrollSettingsSchema = z
  .object({
    /** A second person approves pay changes (and, from M2, payroll runs). */
    makerChecker: z.boolean(),
  })
  .partial();
export type PayrollSettingsInput = z.infer<typeof payrollSettingsSchema>;

// ── An employee's pay ────────────────────────────────────────────────────────

export const payChangeSchema = z.object({
  effectiveFrom: isoDate,
  structureId: id,
  payGroupId: id,
  /** The gross or the basic, as the structure asks. */
  amount: moneySchema,
  /** Amounts for components calculated as fixed, by code (e.g. SPECIAL). */
  fixed: z.record(componentCodeSchema, moneySchema).default({}),
  /** A grade of the structure's minimum wage table, e.g. G5. */
  wageGrade: z.string().trim().max(20).nullable().optional(),
  reason: z.string().trim().min(3).max(500),
});
export type PayChangeInput = z.infer<typeof payChangeSchema>;

/** Works a pay change out without saving it. */
export const payPreviewSchema = payChangeSchema.omit({ reason: true, effectiveFrom: true }).extend({
  effectiveFrom: isoDate.optional(),
});
export type PayPreviewInput = z.infer<typeof payPreviewSchema>;
