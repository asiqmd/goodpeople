import type { ApprovalStepView } from './leave-types.js';
import type { EmployeeRef } from './attendance-types.js';
import type { LineProblem } from './formula.js';
import type { Religion } from './hr.js';
import type {
  DeclarationStatus,
  IncrementBasis,
  InvestmentKind,
  LoanKind,
  LoanStatus,
  Money,
  PayBasis,
  PayBatchStatus,
  PfAccount,
  PfEntryKind,
  PayCalculation,
  PayChangeStatus,
  PayComponentKind,
  PayFrequency,
  RunKind,
  RunProblemCode,
  RunStatus,
  TaxArea,
  TaxTreatment,
} from './payroll.js';

/** After `afterYears` completed years a leaver keeps `percent` of the employer's contributions. */
export interface PfVestingStep {
  afterYears: number;
  percent: number;
}

/** Who a festival bonus run pays and how much. */
export interface BonusRule {
  /** e.g. "Eid-ul-Fitr 2027". */
  festival: string;
  festivalBn: string | null;
  /** People of these religions; people with no religion recorded follow `unrecorded`. */
  religions: Religion[];
  unrecorded: boolean;
  /** Employed on this day (usually the festival's eve) to be paid. */
  cutOff: string;
  /** Of one month's basic on the cut-off day. */
  percentOfBasic: number;
  /** Months of continuous service by the cut-off; less gets nothing. */
  minServiceMonths: number;
}

export interface PayComponentView {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  kind: PayComponentKind;
  calculation: PayCalculation;
  taxTreatment: TaxTreatment;
  inGross: boolean;
  inOvertimeBase: boolean;
  prorate: boolean;
  sortOrder: number;
  isActive: boolean;
  /** From the country pack; HR can change but not delete it. */
  isSystem: boolean;
  /** Run components worked out in each run; null means entered per person. */
  runFormula: string | null;
}

export interface StructureLineView {
  component: string;
  formula: string;
}

export interface SalaryStructureView {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  basis: PayBasis;
  lines: StructureLineView[];
  wageBoard: string | null;
  isActive: boolean;
  isSystem: boolean;
  /** People whose current pay uses it. */
  inUse: number;
}

export interface StructurePreview {
  /** Each line's amount; empty when there are problems. */
  values: Record<string, Money>;
  /** The lines counted in gross, added up. */
  gross: Money | null;
  problems: LineProblem[];
}

export interface PayGroupView {
  id: string;
  code: string;
  name: string;
  frequency: PayFrequency;
  isDefault: boolean;
  isActive: boolean;
  members: number;
}

export interface PayrollSettingsView {
  makerChecker: boolean;
  /** People who may approve pay; with one or none, maker-checker cannot work. */
  approvers: number;
  autoTax: boolean;
  taxArea: TaxArea;
  pfEnabled: boolean;
  pfEmployeeRate: string;
  pfEmployerRate: string;
  pfRecognised: boolean;
  pfVesting: PfVestingStep[];
  /** The workspace has enough permanent workers that the law requires a fund. */
  pfRequired: { required: boolean; permanentWorkers: number; threshold: number | null };
}

/** A minimum wage table from the country pack, e.g. the 2023 RMG wage board. */
export interface WageBoardView {
  id: string;
  name: string;
  sector: string;
  effectiveFrom: string;
  reference: string;
  status: 'verified' | 'needs_review';
  note: string | null;
  grades: {
    grade: string;
    name: string;
    gross: Money;
    basic: Money;
    components: Record<string, Money>;
  }[];
}

export interface PayLineView {
  code: string;
  name: string;
  nameBn: string | null;
  kind: PayComponentKind;
  amount: Money;
  inGross: boolean;
}

/** How a salary compares with the minimum wage of its grade. */
export interface MinimumWageCheck {
  board: string;
  grade: string;
  minimumGross: Money;
  minimumBasic: Money;
  meets: boolean;
}

/** One effective-dated pay record (or a proposed one). */
export interface PayRecordView {
  id: string;
  employee: EmployeeRef;
  effectiveFrom: string;
  /** The day before the next approved record started; null while current. */
  effectiveTo: string | null;
  status: PayChangeStatus;
  structure: { id: string; code: string; name: string; basis: PayBasis };
  payGroup: { id: string; code: string; name: string };
  amount: Money;
  fixed: Record<string, Money>;
  wageGrade: string | null;
  lines: PayLineView[];
  gross: Money;
  minimumWage: MinimumWageCheck | null;
  reason: string;
  requestedBy: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  steps: ApprovalStepView[];
}

export interface EmployeePayView {
  /** In force today. */
  current: PayRecordView | null;
  /** Waiting for a second person. */
  pending: PayRecordView[];
  /** Everything, newest first. */
  history: PayRecordView[];
}

/** A pay change worked out before it is proposed. */
export interface PayPreview {
  lines: PayLineView[];
  gross: Money;
  minimumWage: MinimumWageCheck | null;
  problems: LineProblem[];
}

/** A pay change in the approvals inbox, beside the pay it would replace. */
export interface CompensationApprovalItem {
  subjectType: 'compensation';
  stepId: string;
  kind: 'payroll';
  change: PayRecordView;
  previous: PayRecordView | null;
}

// ── Payroll runs ─────────────────────────────────────────────────────────────

export interface RunProblem {
  code: RunProblemCode;
  severity: 'error' | 'warning';
  message: string;
  /** How many days, for problems about days (missing punches, days not processed). */
  count?: number;
}

export interface RunTotals {
  earnings: Money;
  deductions: Money;
  net: Money;
  employerCost: Money;
}

export interface PayrollRunView {
  id: string;
  kind: RunKind;
  /** The locked run an adjustment corrects. */
  parentRunId: string | null;
  /** A festival bonus run's festival and rules. */
  bonus: BonusRule | null;
  payGroup: { id: string; code: string; name: string };
  periodStart: string;
  periodEnd: string;
  /** The Labour Act's deadline (s.123): before the expiry of the seventh working day after. */
  paymentDue: string;
  paymentDate: string;
  status: RunStatus;
  headcount: number;
  totals: RunTotals | null;
  errors: number;
  warnings: number;
  /** People whose net moved by 10% or more since last month, or who are new or gone. */
  flagged: number;
  createdBy: string | null;
  submittedBy: string | null;
  decidedBy: string | null;
  computedAt: string | null;
  lockedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  steps: ApprovalStepView[];
}

/** What a run worked out from attendance and leave for one person. */
export interface RunVariables {
  periodDays: number;
  employedDays: number;
  paidDays: number;
  workedDays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  otHours: number;
}

/** How a month's salary tax was worked out: the year projected, then spread over what is left. */
export interface RunTaxWorking {
  /** The year's salary income, projected: paid so far, this month, and the months to come. */
  salary: number;
  exemption: number;
  taxableIncome: number;
  threshold: number;
  grossTax: number;
  investment: number;
  rebate: number;
  minimumTax: number;
  /** The year's tax. */
  tax: number;
  /** Deducted earlier in the year. */
  deductedBefore: Money;
  /** This month and the months after it in the year. */
  monthsLeft: number;
  thisMonth: Money;
}

export interface PayrollRunItemView {
  id: string;
  employee: EmployeeRef & { designation: string | null; orgUnit: string | null };
  status: 'ok' | 'error';
  problems: RunProblem[];
  lines: PayLineView[];
  earnings: Money;
  deductions: Money;
  net: Money;
  employerCost: Money;
  variables: RunVariables;
  /** Amounts entered for this person in this run, by component. */
  inputs: Record<string, Money>;
  /** Salary income this period, for tax. */
  taxable: Money;
  tax: RunTaxWorking | null;
  previousNet: Money | null;
  variance: 'new' | 'up' | 'down' | 'same' | null;
  /** Change in net since last month, in percent, when there was a last month. */
  variancePercent: number | null;
  flagged: boolean;
}

export interface PayrollRunItemPage {
  items: PayrollRunItemView[];
  /** People matching the filter, across all pages. */
  total: number;
  page: number;
  size: number;
}

/** A published payslip, as the employee sees it in their list. */
export interface PayslipSummary {
  itemId: string;
  runId: string;
  kind: RunKind;
  /** A bonus payslip's festival; null for other runs. */
  festival: string | null;
  festivalBn: string | null;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  net: Money;
  publishedAt: string;
}

/** A payroll run in the approvals inbox. */
export interface PayrollRunApprovalItem {
  subjectType: 'payroll_run';
  stepId: string;
  kind: 'payroll';
  run: PayrollRunView;
  previousTotals: RunTotals | null;
}

// ── Loans and advances (M3) ──────────────────────────────────────────────────

export interface LoanRepaymentView {
  date: string;
  amount: Money;
  /** The run it was recovered in; null when paid in directly. */
  runId: string | null;
  note: string | null;
}

export interface LoanView {
  id: string;
  employee: EmployeeRef;
  kind: LoanKind;
  status: LoanStatus;
  principal: Money;
  installment: Money;
  repaid: Money;
  outstanding: Money;
  /** The first month recovered, e.g. "2026-11". */
  startMonth: string;
  reason: string;
  requestedBy: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  closedAt: string | null;
  repayments: LoanRepaymentView[];
  steps: ApprovalStepView[];
}

export interface LoanApprovalItem {
  subjectType: 'loan';
  stepId: string;
  kind: 'payroll';
  loan: LoanView;
}

// ── Pay batches: the annual increment (M3) ───────────────────────────────────

/** One person in an increment: their pay before and after. */
export interface PayBatchLine {
  employee: EmployeeRef;
  structure: string;
  wageGrade: string | null;
  basicBefore: Money;
  basicAfter: Money;
  grossBefore: Money;
  grossAfter: Money;
}

export interface PayBatchPreview {
  lines: PayBatchLine[];
  /** People left out and why: a change already waiting, pay from after the date, no pay. */
  skipped: {
    employee: EmployeeRef;
    reason: 'pending_change' | 'later_pay' | 'no_pay' | 'not_eligible';
  }[];
  grossBefore: Money;
  grossAfter: Money;
}

export interface PayBatchView {
  id: string;
  effectiveFrom: string;
  basis: IncrementBasis;
  percent: string;
  status: PayBatchStatus;
  people: number;
  reason: string;
  requestedBy: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  steps: ApprovalStepView[];
}

export interface PayBatchApprovalItem {
  subjectType: 'pay_batch';
  stepId: string;
  kind: 'payroll';
  batch: PayBatchView;
  /** The first people in it, before and after, and the totals. */
  preview: PayBatchPreview;
}

// ── Provident fund (M3) ──────────────────────────────────────────────────────

export interface PfEntryView {
  id: string;
  date: string;
  kind: PfEntryKind;
  account: PfAccount;
  amount: Money;
  runId: string | null;
  note: string | null;
}

export interface PfBalance {
  own: Money;
  employer: Money;
  total: Money;
  /** What a leaver would take today: their own account and the vested share of the employer's. */
  vestedPercent: number;
  payable: Money;
}

export interface PfMemberView {
  employee: EmployeeRef;
  joinedOn: string;
  leftOn: string | null;
  balance: PfBalance;
}

export interface PfStatement extends PfMemberView {
  entries: PfEntryView[];
}

// ── Salary tax (M3) ──────────────────────────────────────────────────────────

export interface TaxProfileView {
  disabled: boolean;
  freedomFighter: boolean;
  disabledDependants: number;
  area: TaxArea | null;
}

export interface DeclarationItemView {
  kind: InvestmentKind;
  declared: Money;
  verified: Money | null;
  note: string | null;
  documentId: string | null;
}

export interface TaxDeclarationView {
  id: string | null;
  employee: EmployeeRef;
  fiscalYear: string;
  status: DeclarationStatus | null;
  items: DeclarationItemView[];
  declared: Money;
  verified: Money | null;
  submittedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

/** A year's salary, tax and investments for one person, month by month: the certificate's data. */
export interface TaxYearView {
  fiscalYear: string;
  employee: EmployeeRef & { tin: string | null };
  profile: TaxProfileView;
  /** Each locked run of the year that paid them: a month, an adjustment or a bonus. */
  months: {
    /** The run's first day. */
    month: string;
    periodEnd: string;
    runId: string;
    kind: RunKind;
    salary: Money;
    tax: Money;
    challanNo: string | null;
    depositedOn: string | null;
  }[];
  opening: { salary: Money; tax: Money; pf: Money } | null;
  salary: Money;
  tax: Money;
  /** The year projected from the latest run, if one worked tax out. */
  latest: RunTaxWorking | null;
  declaration: TaxDeclarationView;
}
