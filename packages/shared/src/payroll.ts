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

/**
 * How salary tax treats a component (Income Tax Act 2023). An earning that is taxable counts
 * in salary income; a deduction that is taxable reduces it (absence, leave without pay),
 * while other deductions (tax, provident fund, loan repayments) do not.
 */
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
  'LATE_DAYS',
  'LEAVE_DAYS',
] as const;

/**
 * What a run formula (overtime, absence) may use besides component codes, each worked out
 * per person and period. GROSS and OT_BASE are the full monthly amounts; WORKER is 1 for
 * workers and 0 for staff, from the job at the end of the period.
 */
export const RUN_VARIABLES = RESERVED_PAY_NAMES;
export type RunVariable = (typeof RUN_VARIABLES)[number];

/**
 * regular: a month's pay; adjustment: corrects a locked month; bonus: a festival bonus;
 * settlement: a leaver's final dues; wppf: the workers' share of the participation fund.
 */
export const RUN_KINDS = ['regular', 'adjustment', 'bonus', 'settlement', 'wppf'] as const;
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
  'tin_missing',
  'loan_not_recovered',
  'tax_rules_missing',
] as const;
export type RunProblemCode = (typeof RUN_PROBLEM_CODES)[number];

// ── Salary tax (Phase 2 M3) ──────────────────────────────────────────────────

/** Minimum tax differs by where the taxpayer lives (Income Tax Act 2023). */
export const TAX_AREAS = ['dhaka_chattogram_city', 'other_city', 'elsewhere'] as const;
export type TaxArea = (typeof TAX_AREAS)[number];

/** What an employee declares for the investment rebate. */
export const INVESTMENT_KINDS = [
  'savings_certificate',
  'dps',
  'life_insurance',
  'provident_fund_other',
  'superannuation',
  'universal_pension',
  'listed_shares',
  'mutual_fund',
  'zakat',
  'donation',
  'other',
] as const;
export type InvestmentKind = (typeof INVESTMENT_KINDS)[number];

/** draft: being filled in; submitted: with payroll; verified: payroll checked the proofs. */
export const DECLARATION_STATUSES = ['draft', 'submitted', 'verified'] as const;
export type DeclarationStatus = (typeof DECLARATION_STATUSES)[number];

/** The Bangladesh fiscal year a date falls in, e.g. 2026-10-25 → "2026-27" (July to June). */
export function fiscalYearOf(date: string): string {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 7 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** First and last day of a fiscal year such as "2026-27". */
export function fiscalYearBounds(fiscalYear: string): { start: string; end: string } {
  const start = Number(fiscalYear.slice(0, 4));
  return { start: `${start}-07-01`, end: `${start + 1}-06-30` };
}

// ── Provident fund, loans and increments (Phase 2 M3) ─────────────────────────

/**
 * A provident fund member's ledger: contributions from runs, interest, loans out and back,
 * and what is paid out or forfeited on leaving. Each entry is in the member's own account
 * or the employer's.
 */
export const PF_ENTRY_KINDS = [
  'opening',
  'contribution',
  'interest',
  'loan_out',
  'loan_repaid',
  'withdrawal',
  'forfeited',
] as const;
export type PfEntryKind = (typeof PF_ENTRY_KINDS)[number];
export const PF_ACCOUNTS = ['own', 'employer'] as const;
export type PfAccount = (typeof PF_ACCOUNTS)[number];

/** advance: recovered as ADVANCE; loan: a company loan (LOAN); pf_loan: from the fund (PF_LOAN). */
export const LOAN_KINDS = ['advance', 'loan', 'pf_loan'] as const;
export type LoanKind = (typeof LOAN_KINDS)[number];
export const LOAN_COMPONENT: Record<LoanKind, string> = {
  advance: 'ADVANCE',
  loan: 'LOAN',
  pf_loan: 'PF_LOAN',
};

export const LOAN_STATUSES = ['pending', 'active', 'closed', 'rejected', 'cancelled'] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** A batch of pay changes decided together, such as the annual increment. */
export const PAY_BATCH_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type PayBatchStatus = (typeof PAY_BATCH_STATUSES)[number];

/** An increment as a percentage of basic (the RMG wage board's way) or of gross. */
export const INCREMENT_BASES = ['basic', 'gross'] as const;
export type IncrementBasis = (typeof INCREMENT_BASES)[number];

/** Money as the API sends it: a decimal string with at most two places, e.g. "12500.00". */
export type Money = string;

// ── Disbursement and accounts (Phase 2 M4) ───────────────────────────────────

/** The ledger accounts a run's journal posts to besides each component's own. */
export interface GlAccounts {
  /** Earnings and employer costs without an account of their own. */
  salaryExpense: string;
  netPayable: string;
  taxPayable: string;
  pfPayable: string;
  loansReceivable: string;
  gratuityExpense: string;
  gratuityProvision: string;
  /** The participation fund owed to workers, settled by their payouts. */
  wppfPayable: string;
}

export const DEFAULT_GL_ACCOUNTS: GlAccounts = {
  salaryExpense: '5100',
  netPayable: '2100',
  taxPayable: '2110',
  pfPayable: '2120',
  loansReceivable: '1410',
  gratuityExpense: '5150',
  gratuityProvision: '2200',
  wppfPayable: '2300',
};
