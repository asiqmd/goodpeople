// Payroll vocabulary shared by the API, the web app and the country packs.

/** earning and deduction appear on payslips; employer_cost (employer PF) and info do not change net pay. */
export const PAY_COMPONENT_KINDS = ['earning', 'deduction', 'employer_cost', 'info'] as const;
export type PayComponentKind = (typeof PAY_COMPONENT_KINDS)[number];

/**
 * structure: worked out by the employee's salary structure (basic, house rent);
 * fixed: an amount set on the employee's pay (special allowance);
 * run: entered or worked out in each payroll run (overtime, absence, tax).
 */
export const PAY_CALCULATIONS = ['structure', 'fixed', 'run'] as const;
export type PayCalculation = (typeof PAY_CALCULATIONS)[number];

/** How salary tax treats a component (Income Tax Act 2023); used from Phase 2 M3. */
export const TAX_TREATMENTS = ['taxable', 'exempt', 'partly_exempt'] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export const PAY_FREQUENCIES = ['monthly', 'weekly'] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

/** What HR enters for a structure: the gross, which the structure splits, or the basic. */
export const PAY_BASES = ['gross', 'basic'] as const;
export type PayBasis = (typeof PAY_BASES)[number];

/** A pay change is pending until a second person decides it (maker-checker). */
export const PAY_CHANGE_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'superseded',
] as const;
export type PayChangeStatus = (typeof PAY_CHANGE_STATUSES)[number];

/** Upper case letters, digits and underscores, starting with a letter: usable in formulas. */
export const COMPONENT_CODE = /^[A-Z][A-Z0-9_]{1,29}$/;

/**
 * Names formulas get from outside the structure, now or with payroll runs (M2), so no
 * component may be called by them.
 */
export const RESERVED_PAY_NAMES = [
  'GROSS',
  'OT_BASE',
  'PAID_DAYS',
  'PERIOD_DAYS',
  'EMPLOYED_DAYS',
  'WORKED_DAYS',
  'ABSENT_DAYS',
  'UNPAID_LEAVE_DAYS',
  'OT_HOURS',
  'SERVICE_YEARS',
  'SERVICE_MONTHS',
  'WORKER',
] as const;

/**
 * What a run formula (overtime, absence) may use besides component codes, each worked out
 * per person and period. GROSS and OT_BASE are the full monthly amounts; WORKER is 1 for
 * workers and 0 for staff, from the job at the end of the period.
 */
export const RUN_VARIABLES = RESERVED_PAY_NAMES;
export type RunVariable = (typeof RUN_VARIABLES)[number];

export const RUN_KINDS = ['regular', 'adjustment'] as const;
export type RunKind = (typeof RUN_KINDS)[number];

/**
 * draft: created, or inputs changed since it was computed; computed: results to review;
 * pending: waiting for the second person; locked: final, never changed again.
 */
export const RUN_STATUSES = ['draft', 'computed', 'pending', 'locked', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Why a person's pay in a run needs a look; errors keep the run from being submitted. */
export const RUN_PROBLEM_CODES = [
  'no_pay',
  'negative_net',
  'missing_punches',
  'not_processed',
  'no_attendance',
  'period_not_over',
  'absence_over_limit',
  'pay_starts_late',
  'formula_failed',
] as const;
export type RunProblemCode = (typeof RUN_PROBLEM_CODES)[number];

/** Money as the API sends it: a decimal string with at most two places, e.g. "12500.00". */
export type Money = string;
