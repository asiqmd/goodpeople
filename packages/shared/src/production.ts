import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';

// Piece rates and production incentives (Phase 3 M3, the RMG pack): what each operation pays
// per piece, the daily target above which an incentive is paid, and what each worker made.
// Payroll reads the month's totals as PIECE_EARNINGS, PIECES and PRODUCTION_INCENTIVE.

export const PRODUCTION_SOURCES = ['manual', 'import'] as const;
export type ProductionSource = (typeof PRODUCTION_SOURCES)[number];

/** The most pieces one entry may hold: one worker's day on one operation. */
export const MAX_PRODUCTION_QUANTITY = 100_000;
/** The most rows one import may hold. */
export const MAX_PRODUCTION_IMPORT_ROWS = 20_000;

/** Why an imported row was not saved. */
export const PRODUCTION_IMPORT_PROBLEMS = [
  'employee_unknown',
  'operation_unknown',
  'operation_inactive',
  'date_invalid',
  'date_future',
  'quantity_invalid',
  'not_employed',
  'payroll_locked',
  'duplicate_row',
] as const;
export type ProductionImportProblemCode = (typeof PRODUCTION_IMPORT_PROBLEMS)[number];

export const PRODUCTION_SUMMARY_BY = ['worker', 'line', 'day'] as const;
export type ProductionSummaryBy = (typeof PRODUCTION_SUMMARY_BY)[number];

const isoDate = z.iso.date();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');

/** Taka per piece, as a number or text: zero or more, up to four decimals. */
export const pieceRateSchema = z
  .union([z.number(), z.string().trim()])
  .transform((v) => (typeof v === 'number' ? String(v) : v))
  .refine((v) => /^\d{1,6}(\.\d{1,4})?$/.test(v), 'Enter a rate like 1.25 or 0.0750');

/** Pieces, as a number or text; empty means none. */
export const productionQuantitySchema = z
  .union([z.number(), z.string().trim(), z.null()])
  .transform((v) => (v === null || v === '' ? 0 : Number(v)))
  .pipe(
    z
      .number({ error: 'Enter whole pieces' })
      .int('Enter whole pieces')
      .min(0, 'Enter zero or more pieces')
      .max(MAX_PRODUCTION_QUANTITY, `At most ${MAX_PRODUCTION_QUANTITY} pieces`),
  );

export const operationCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine(
    (v) => /^[A-Z0-9][A-Z0-9._-]{0,29}$/.test(v),
    'Use up to 30 letters, digits, dots, dashes or _',
  );

/** What an operation's rates have to give: a piece rate, or a target with an incentive. */
export function operationRateProblem(op: {
  pieceRate?: string | null;
  dailyTarget?: number | null;
  incentiveRate?: string | null;
}): { path: 'pieceRate' | 'dailyTarget' | 'incentiveRate'; message: string } | null {
  const target = op.dailyTarget != null;
  const incentive = op.incentiveRate != null;
  if (target && !incentive) {
    return { path: 'incentiveRate', message: 'A daily target needs an incentive rate' };
  }
  if (incentive && !target) {
    return { path: 'dailyTarget', message: 'An incentive rate needs a daily target' };
  }
  if (op.pieceRate == null && !target) {
    return { path: 'pieceRate', message: 'Give a piece rate, or a daily target and incentive' };
  }
  return null;
}

const operationFields = {
  code: operationCodeSchema,
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().max(120).nullable().optional(),
  /** The buyer's style or order, when the same operation pays differently by style. */
  style: z.string().trim().max(60).nullable().optional(),
  pieceRate: pieceRateSchema.nullable().optional(),
  dailyTarget: z.coerce.number().int().min(1).max(MAX_PRODUCTION_QUANTITY).nullable().optional(),
  incentiveRate: pieceRateSchema.nullable().optional(),
};

export const productionOperationSchema = z.object(operationFields).superRefine((op, ctx) => {
  const problem = operationRateProblem(op);
  if (problem) ctx.addIssue({ code: 'custom', path: [problem.path], message: problem.message });
});
export type ProductionOperationInput = z.infer<typeof productionOperationSchema>;

/** Fields to change; the rates that result are checked as a whole. */
export const productionOperationUpdateSchema = z.object(operationFields).partial();
export type ProductionOperationUpdateInput = z.infer<typeof productionOperationUpdateSchema>;

export const productionDayQuerySchema = z.object({ date: isoDate, orgUnitId: z.uuid() });
export type ProductionDayQuery = z.infer<typeof productionDayQuerySchema>;

/** One operation's pieces on a day for some workers; zero or empty removes an entry. */
export const productionBatchSchema = z.object({
  date: isoDate,
  operationId: z.uuid(),
  entries: z
    .array(z.object({ employeeId: z.uuid(), quantity: productionQuantitySchema }))
    .min(1)
    .max(2000)
    .refine((list) => new Set(list.map((e) => e.employeeId)).size === list.length, {
      message: 'List each worker once',
    }),
});
export type ProductionBatchInput = z.infer<typeof productionBatchSchema>;

export const productionSummaryQuerySchema = z.object({
  month,
  orgUnitId: z.uuid().optional(),
});
export type ProductionSummaryQuery = z.infer<typeof productionSummaryQuerySchema>;

export const productionSummaryFileSchema = productionSummaryQuerySchema.extend({
  by: z.enum(PRODUCTION_SUMMARY_BY).default('worker'),
});
export type ProductionSummaryFileQuery = z.infer<typeof productionSummaryFileSchema>;

// ── Views ────────────────────────────────────────────────────────────────────

export interface ProductionOperationView {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  style: string | null;
  pieceRate: string | null;
  dailyTarget: number | null;
  incentiveRate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionUnitRef {
  id: string;
  code: string | null;
  name: string;
  nameBn: string | null;
}

export interface ProductionDayWorker {
  employee: EmployeeRef;
  designation: string | null;
  designationBn: string | null;
  /** Their unit (line) on the day. */
  orgUnit: ProductionUnitRef | null;
  /** Their pay for the day is in a locked payroll run, so its entries cannot change. */
  locked: boolean;
  /** Pieces by operation id. */
  quantities: Record<string, number>;
}

/** A line (and the units below it) on a day: who worked there and what they made. */
export interface ProductionDayView {
  date: string;
  orgUnit: ProductionUnitRef;
  /** Active operations, and inactive ones that already have entries on the day. */
  operations: ProductionOperationView[];
  workers: ProductionDayWorker[];
}

export interface ProductionBatchResult {
  saved: number;
  removed: number;
  unchanged: number;
}

export interface ProductionImportProblem {
  /** The row's number in the sheet, counting the heading row. */
  row: number;
  employeeCode: string;
  date: string;
  operationCode: string;
  quantity: string;
  code: ProductionImportProblemCode;
  message: string;
}

export interface ProductionImportResult extends ProductionBatchResult {
  fileName: string;
  rows: number;
  problems: ProductionImportProblem[];
}

export interface ProductionTotals {
  pieces: number;
  /** Pieces at the rates entered with them. */
  pieceEarnings: string;
  /** For pieces above each day's target. */
  incentive: string;
}

export interface ProductionWorkerSummary extends ProductionTotals {
  employee: EmployeeRef;
  /** The line of their latest entry in the month. */
  orgUnit: ProductionUnitRef | null;
  days: number;
  /**
   * Piece earnings per day worked. A piece-rated worker's overtime may be paid at a time rate
   * fixed as nearly as possible to their average earnings (Labour Act s.108(2)).
   */
  averageDaily: string;
}

export interface ProductionLineSummary extends ProductionTotals {
  orgUnit: ProductionUnitRef | null;
  workers: number;
}

export interface ProductionDaySummary extends ProductionTotals {
  date: string;
  workers: number;
}

/**
 * A month's production. Worker figures are payroll's own month totals; lines and days count
 * the entries made in the units asked for.
 */
export interface ProductionSummaryView {
  month: string;
  from: string;
  to: string;
  totals: ProductionTotals;
  workers: ProductionWorkerSummary[];
  lines: ProductionLineSummary[];
  days: ProductionDaySummary[];
}
