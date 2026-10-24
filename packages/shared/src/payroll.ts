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
  'PAID_DAYS',
  'PERIOD_DAYS',
  'WORKED_DAYS',
  'ABSENT_DAYS',
  'UNPAID_LEAVE_DAYS',
  'OT_HOURS',
  'SERVICE_YEARS',
  'SERVICE_MONTHS',
] as const;

/** Money as the API sends it: a decimal string with at most two places, e.g. "12500.00". */
export type Money = string;
