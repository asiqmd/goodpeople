import type { EmployeeRef } from './attendance-types.js';
import type { EmploymentType } from './hr.js';
import type { ApprovalStepView } from './leave-types.js';
import type {
  DocumentCategory,
  DocumentSource,
  ImportStatus,
  LetterLanguage,
  SeparationStatus,
  SeparationType,
} from './lifecycle.js';

export interface DocumentView {
  id: string;
  employee: EmployeeRef;
  category: DocumentCategory;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  source: DocumentSource;
  refNo: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  visibleToEmployee: boolean;
  uploadedBy: string | null;
  createdAt: string;
}

export interface SeparationView {
  id: string;
  employee: EmployeeRef;
  type: SeparationType;
  status: SeparationStatus;
  noticeDate: string;
  lastWorkingDay: string;
  reason: string;
  /** What the Labour Act asks for this kind of separation; null when it asks for none. */
  noticeDaysRequired: number | null;
  /** Days short of that notice; wages in lieu may apply (settled by payroll). */
  noticeShortfallDays: number;
  initiatedBy: 'employee' | 'hr';
  steps: ApprovalStepView[];
  createdAt: string;
  decidedAt: string | null;
  completedAt: string | null;
}

export interface ProbationItem {
  employee: EmployeeRef;
  employmentType: EmploymentType;
  joinedOn: string;
  probationEndsOn: string;
  /** The latest the Act lets probation run, with the skilled-worker extension. */
  latestEnd: string;
  /** Probation is over without a decision: under s.4 the worker is deemed permanent. */
  deemedPermanent: boolean;
}

export interface LifecycleOverview {
  probations: ProbationItem[];
  separations: SeparationView[];
  retirements: { employee: EmployeeRef; dateOfBirth: string; retiresOn: string }[];
  expiringDocuments: DocumentView[];
}

export interface LetterTemplateView {
  id: string;
  code: string;
  language: LetterLanguage;
  name: string;
  subject: string;
  body: string;
  isActive: boolean;
  /** Whether the text differs from the country pack's default. */
  customized: boolean;
  /** extra.* placeholders HR fills in when generating. */
  extraFields: string[];
  updatedAt: string;
}

export interface LetterPreview {
  html: string;
  /** Placeholders with no value; the letter cannot be issued until these are filled. */
  missing: string[];
}

export interface ImportRowReport {
  row: number;
  employeeCode: string | null;
  fullName: string | null;
  errors: { column: string; message: string }[];
}

export interface ImportBatchView {
  id: string;
  fileName: string;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  /** Rows with problems, and every row once committed. */
  rows: ImportRowReport[];
  imported: number | null;
  createdAt: string;
  committedAt: string | null;
}

export interface SeparationApprovalItem {
  subjectType: 'separation';
  stepId: string;
  kind: 'manager' | 'hr';
  separation: SeparationView;
}
