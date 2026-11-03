import { z } from 'zod';
import { MAX_FORMULA_LENGTH } from './formula.js';
import {
  COMPONENT_CODE,
  COST_DIMENSIONS,
  PAY_BASES,
  PAY_CALCULATIONS,
  PAY_COMPONENT_KINDS,
  PAY_FREQUENCIES,
  INCREMENT_BASES,
  INVESTMENT_KINDS,
  LOAN_KINDS,
  RESERVED_PAY_NAMES,
  TAX_AREAS,
  PF_ACCOUNTS,
  TAX_TREATMENTS,
} from './payroll.js';
import { RELIGIONS } from './hr.js';
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
  /** Run components: a formula over run variables and monthly amounts; empty means entered. */
  runFormula: formula.nullable().optional(),
  /** The ledger account in the journal; the settings' default when empty. */
  glAccount: z.string().trim().max(30).nullable().optional(),
};

export const payComponentSchema = z.object({ code: componentCodeSchema, ...componentFields });
export type PayComponentInput = z.infer<typeof payComponentSchema>;

/** The code is fixed once formulas may use it. */
export const payComponentUpdateSchema = z.object(withoutDefaults(componentFields)).partial();
export type PayComponentUpdateInput = z.infer<typeof payComponentUpdateSchema>;

// ── Structures ───────────────────────────────────────────────────────────────

export const structureLineSchema = z.object({ component: componentCodeSchema, formula });

const structureFields = {
  currency: z.enum(['BDT', 'AED', 'SAR']).default('BDT'),
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
  currency: z.enum(['BDT', 'AED', 'SAR']).default('BDT'),
  legalEntityId: z.uuid().optional(),
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

const percent = z
  .string()
  .trim()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, 'A percentage such as 7 or 8.5')
  .refine((v) => Number(v) <= 30, 'At most 30%');

export const payrollSettingsSchema = z
  .object({
    /** A second person approves pay changes and payroll runs. */
    makerChecker: z.boolean(),
    /** Runs work out salary tax each month. */
    autoTax: z.boolean(),
    taxArea: z.enum(TAX_AREAS),
    pfEnabled: z.boolean(),
    pfEmployeeRate: percent,
    pfEmployerRate: percent,
    pfRecognised: z.boolean(),
    glAccounts: z.object({
      salaryExpense: z.string().trim().min(1).max(30),
      netPayable: z.string().trim().min(1).max(30),
      taxPayable: z.string().trim().min(1).max(30),
      pfPayable: z.string().trim().min(1).max(30),
      loansReceivable: z.string().trim().min(1).max(30),
      gratuityExpense: z.string().trim().min(1).max(30),
      gratuityProvision: z.string().trim().min(1).max(30),
      wppfPayable: z.string().trim().min(1).max(30),
    }),
    gratuityEnabled: z.boolean(),
    pfVesting: z
      .array(
        z.object({
          afterYears: z.number().int().min(0).max(40),
          percent: z.number().min(0).max(100),
        }),
      )
      .min(1)
      .max(10)
      .refine(
        (steps) => steps.every((s, i) => i === 0 || s.afterYears > steps[i - 1]!.afterYears),
        'List the years in increasing order',
      ),
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

// ── Payroll runs ─────────────────────────────────────────────────────────────

export const runCreateSchema = z.object({
  payGroupId: id,
  /** The month paid, e.g. 2026-10. */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10'),
  /** When wages will be paid; by default the last day the Labour Act allows. */
  paymentDate: isoDate.optional(),
});
export type RunCreateInput = z.infer<typeof runCreateSchema>;

/** An amount entered for one person in one run, for a run component without a formula. */
export const runInputSchema = z.object({
  employeeId: id,
  component: componentCodeSchema,
  amount: moneySchema,
  note: z.string().trim().max(200).optional(),
});
export type RunInputInput = z.infer<typeof runInputSchema>;

export const runInputRemoveSchema = runInputSchema.pick({ employeeId: true, component: true });

/** People to correct in a locked run; everyone in it when left out. */
export const adjustmentCreateSchema = z.object({
  employeeIds: z.array(id).min(1).max(5000).optional(),
});
export type AdjustmentCreateInput = z.infer<typeof adjustmentCreateSchema>;

export const payslipLanguageSchema = z.object({ language: z.enum(['en', 'bn']).default('en') });

export const RUN_ITEM_FILTERS = ['all', 'problems', 'errors', 'flagged'] as const;

/** A page of a run's people: everyone, those with problems or errors, or those flagged. */
export const runItemsQuerySchema = z.object({
  show: z.enum(RUN_ITEM_FILTERS).default('all'),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(500).default(50),
});
export type RunItemsQuery = z.infer<typeof runItemsQuerySchema>;

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-11');
const positive = moneySchema.refine((v) => Number(v) > 0, 'Enter more than zero');
const fiscalYear = z.string().regex(/^\d{4}-\d{2}$/, 'Use a fiscal year like 2026-27');

// ── Loans and advances ───────────────────────────────────────────────────────

export const loanCreateSchema = z
  .object({
    employeeId: id,
    kind: z.enum(LOAN_KINDS),
    principal: positive,
    installment: positive,
    /** The first month it is recovered. */
    startMonth: month,
    reason: z.string().trim().min(3).max(300),
  })
  .refine((v) => Number(v.installment) <= Number(v.principal), {
    path: ['installment'],
    message: 'The installment cannot be more than the amount',
  });
export type LoanCreateInput = z.infer<typeof loanCreateSchema>;

/** Money paid back outside a run, such as cash on leaving. */
export const loanRepaySchema = z.object({
  amount: positive,
  date: isoDate,
  note: z.string().trim().max(200).optional(),
});
export type LoanRepayInput = z.infer<typeof loanRepaySchema>;

// ── Increments ───────────────────────────────────────────────────────────────

export const payBatchSchema = z.object({
  effectiveFrom: isoDate,
  basis: z.enum(INCREMENT_BASES),
  percent: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, 'A percentage such as 5 or 7.5')
    .refine((v) => Number(v) > 0, 'Enter more than zero'),
  /** Only people who have worked this many months by the date (12 for an annual increment). */
  minServiceMonths: z.number().int().min(0).max(120).default(12),
  /** Only these pay groups; all when left out. */
  payGroupIds: z.array(id).max(50).optional(),
  /** Only people paid on these structures (the RMG structure, say); all when left out. */
  structureIds: z.array(id).max(50).optional(),
  reason: z.string().trim().min(3).max(300),
});
export type PayBatchInput = z.infer<typeof payBatchSchema>;

// ── Provident fund ───────────────────────────────────────────────────────────

/** Some people by id, or everyone active and permanent (the Labour Act's members). */
export const pfJoinSchema = z
  .object({
    employeeIds: z.array(id).min(1).max(20000).optional(),
    everyone: z.boolean().optional(),
    joinedOn: isoDate,
  })
  .refine((v) => v.everyone || v.employeeIds?.length, {
    path: ['employeeIds'],
    message: 'Choose people, or everyone',
  });
export type PfJoinInput = z.infer<typeof pfJoinSchema>;

export const pfLeaveSchema = z.object({ leftOn: isoDate });

/** An opening balance brought from the old fund, or a manual correction. */
export const pfEntrySchema = z.object({
  date: isoDate,
  kind: z.enum(['opening', 'withdrawal']),
  account: z.enum(PF_ACCOUNTS),
  amount: positive,
  note: z.string().trim().max(200).optional(),
});
export type PfEntryInput = z.infer<typeof pfEntrySchema>;

/** The trustees' yearly interest, credited on each member's balance on a date. */
export const pfInterestSchema = z.object({
  date: isoDate,
  percent: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, 'A percentage such as 9 or 10.5'),
  note: z.string().trim().max(200).optional(),
});
export type PfInterestInput = z.infer<typeof pfInterestSchema>;

// ── Salary tax ───────────────────────────────────────────────────────────────

export const taxProfileSchema = z.object({
  disabled: z.boolean(),
  freedomFighter: z.boolean(),
  disabledDependants: z.number().int().min(0).max(10),
  area: z.enum(TAX_AREAS).nullable(),
});
export type TaxProfileInput = z.infer<typeof taxProfileSchema>;

export const declarationItemSchema = z.object({
  kind: z.enum(INVESTMENT_KINDS),
  declared: moneySchema,
  note: z.string().trim().max(200).nullable().optional(),
  documentId: id.nullable().optional(),
});

export const taxDeclarationSchema = z.object({
  items: z.array(declarationItemSchema).max(30),
  /** Send it to payroll; otherwise kept as a draft. */
  submit: z.boolean().default(false),
});
export type TaxDeclarationInput = z.infer<typeof taxDeclarationSchema>;

/** Payroll's check: what it accepts of each item, in the same order. */
export const declarationVerifySchema = z.object({
  verified: z.array(moneySchema).max(30),
});
export type DeclarationVerifyInput = z.infer<typeof declarationVerifySchema>;

export const taxOpeningSchema = z.object({
  fiscalYear,
  salary: moneySchema,
  tax: moneySchema,
  pf: moneySchema.default('0'),
});
export type TaxOpeningInput = z.infer<typeof taxOpeningSchema>;

export const taxDepositSchema = z.object({
  challanNo: z.string().trim().min(3).max(60),
  depositedOn: isoDate,
  amount: moneySchema,
});
export type TaxDepositInput = z.infer<typeof taxDepositSchema>;

export const fiscalYearQuerySchema = z.object({ fiscalYear: fiscalYear.optional() });

// ── Bonus runs ───────────────────────────────────────────────────────────────

export const bonusRunSchema = z.object({
  payGroupId: id,
  festival: z.string().trim().min(3).max(80),
  festivalBn: z.string().trim().max(80).nullable().optional(),
  religions: z.array(z.enum(RELIGIONS)).min(1),
  unrecorded: z.boolean().default(false),
  cutOff: isoDate,
  paymentDate: isoDate.optional(),
  percentOfBasic: z.number().min(1).max(100).default(100),
  minServiceMonths: z.number().int().min(0).max(60).default(12),
});
export type BonusRunInput = z.infer<typeof bonusRunSchema>;

// ── Disbursement ─────────────────────────────────────────────────────────────

export const runPaidSchema = z.object({ paidOn: isoDate });
export type RunPaidInput = z.infer<typeof runPaidSchema>;

export const settlementCreateSchema = z.object({ separationId: id });
export type SettlementCreateInput = z.infer<typeof settlementCreateSchema>;

// ── Gratuity and the participation fund ──────────────────────────────────────

export const gratuityQuerySchema = z.object({
  asOf: isoDate,
  page: z.coerce.number().int().min(1).default(1),
});
export type GratuityQuery = z.infer<typeof gratuityQuerySchema>;

export const wppfYearSchema = z
  .object({
    accountingYear: z
      .string()
      .trim()
      .regex(/^\d{4}(-\d{2})?$/, 'Use a year like 2025-26'),
    yearStart: isoDate,
    yearEnd: isoDate,
    netProfit: positive,
    minServiceMonths: z.number().int().min(0).max(12).optional(),
  })
  .refine((v) => v.yearEnd > v.yearStart, {
    path: ['yearEnd'],
    message: 'The year ends after it starts',
  });
export type WppfYearInput = z.infer<typeof wppfYearSchema>;

export const wppfRunSchema = z.object({ payGroupId: id, paymentDate: isoDate });
export type WppfRunInput = z.infer<typeof wppfRunSchema>;

// ── Parallel runs ────────────────────────────────────────────────────────────

export const reconciliationCompareSchema = z.object({
  employeeCode: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200).optional(),
  columns: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(200)),
});
export type ReconciliationCompareInput = z.infer<typeof reconciliationCompareSchema>;

// ── Reports ──────────────────────────────────────────────────────────────────

export const costSummaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10'),
  by: z.enum(COST_DIMENSIONS).default('unit'),
});
export type CostSummaryQuery = z.infer<typeof costSummaryQuerySchema>;

export const costTrendQuerySchema = z.object({
  to: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10'),
  months: z.coerce.number().int().min(1).max(36).default(12),
});
export type CostTrendQuery = z.infer<typeof costTrendQuerySchema>;

export const registerQuerySchema = z.object({
  format: z.enum(['csv', 'pdf']).default('csv'),
  language: z.enum(['en', 'bn']).default('en'),
});
export type RegisterQuery = z.infer<typeof registerQuerySchema>;

export const fiscalYearRequiredSchema = z.object({ fiscalYear });

export const taxQuarterQuerySchema = z.object({
  fiscalYear,
  quarter: z.coerce
    .number()
    .pipe(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])),
});
export type TaxQuarterQuery = z.infer<typeof taxQuarterQuerySchema>;
