import type { ApprovalStepView } from './leave-types.js';
import type { EmployeeRef } from './attendance-types.js';
import type { LineProblem } from './formula.js';
import type {
  Money,
  PayBasis,
  PayCalculation,
  PayChangeStatus,
  PayComponentKind,
  PayFrequency,
  RunKind,
  RunProblemCode,
  RunStatus,
  TaxTreatment,
} from './payroll.js';

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
