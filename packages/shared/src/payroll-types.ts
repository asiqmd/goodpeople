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
