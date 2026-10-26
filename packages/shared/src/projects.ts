import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import type { Money } from './payroll.js';
import { moneySchema } from './payroll-schemas.js';

// Projects and donor grants (Phase 3 M4, the NGO pack): what donors fund, the FD-6 approval
// of the NGO Affairs Bureau, how each person's salary is split across projects, and the
// timesheets that show the work actually done (donors charge salaries on actual effort).

export const PROJECT_STATUSES = ['active', 'closed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Programme work, or administration: a foreign-funded project may spend at most 20% of its
 * approved expenditure on administration (Foreign Donations Act 2016, s.6).
 */
export const PROJECT_COST_KINDS = ['programme', 'admin'] as const;
export type ProjectCostKind = (typeof PROJECT_COST_KINDS)[number];

export const TIMESHEET_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

/** Where a month's split of salary came from: an approved timesheet, or the plan. */
export const ALLOCATION_BASES = ['timesheet', 'planned'] as const;
export type AllocationBasis = (typeof ALLOCATION_BASES)[number];

// ── Inputs ───────────────────────────────────────────────────────────────────

const isoDate = z.iso.date();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Donor and project codes: up to 30 letters, digits, dots, dashes or _, kept in capitals. */
export const projectCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine(
    (v) => /^[A-Z0-9][A-Z0-9._-]{0,29}$/.test(v),
    'Use up to 30 letters, digits, dots, dashes or _',
  );

export const donorSchema = z.object({
  code: projectCodeSchema,
  name: z.string().trim().min(2).max(160),
  /** Where the money comes from, as an ISO country code (GB, US, BD). */
  country: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z]{2}$/.test(v), 'Use a two-letter country code like GB')
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});
export type DonorInput = z.infer<typeof donorSchema>;

export const donorUpdateSchema = donorSchema.partial();
export type DonorUpdateInput = z.infer<typeof donorUpdateSchema>;

const budgetSchema = moneySchema.nullable().optional();

const projectFields = {
  legalEntityId: z.uuid(),
  code: projectCodeSchema,
  name: z.string().trim().min(2).max(160),
  nameBn: optionalText(160),
  /** None: the organisation's own (core) funds. */
  donorId: z.uuid().nullable().optional(),
  grantReference: optionalText(80),
  fd6ApprovalNo: optionalText(80),
  fd6ApprovedOn: isoDate.nullable().optional(),
  startsOn: isoDate,
  endsOn: isoDate.nullable().optional(),
  approvedBudget: budgetSchema,
  staffBudget: budgetSchema,
  note: optionalText(1000),
};

/** What a project's fields must hold together: its period, and the staff part of the budget. */
export function projectProblem(p: {
  startsOn?: string;
  endsOn?: string | null;
  approvedBudget?: string | null;
  staffBudget?: string | null;
}): { path: 'endsOn' | 'staffBudget'; message: string } | null {
  if (p.startsOn && p.endsOn && p.endsOn < p.startsOn) {
    return { path: 'endsOn', message: 'The project cannot end before it starts' };
  }
  if (p.approvedBudget && p.staffBudget && Number(p.staffBudget) > Number(p.approvedBudget)) {
    return { path: 'staffBudget', message: 'The staff budget is part of the approved budget' };
  }
  return null;
}

export const projectSchema = z.object(projectFields).superRefine((p, ctx) => {
  const problem = projectProblem(p);
  if (problem) ctx.addIssue({ code: 'custom', path: [problem.path], message: problem.message });
});
export type ProjectInput = z.infer<typeof projectSchema>;

/** Fields to change; the project that results is checked as a whole. */
export const projectUpdateSchema = z.object(projectFields).partial();
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

/** A percentage of salary: more than 0, at most 100, two decimals. */
export const allocationPercentSchema = z
  .union([z.number(), z.string().trim()])
  .transform((v) => (typeof v === 'number' ? String(v) : v))
  .refine(
    (v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 100,
    'Enter a share from 0.01 to 100',
  );

export const allocationSchema = z
  .object({
    employeeId: z.uuid(),
    percent: allocationPercentSchema,
    costKind: z.enum(PROJECT_COST_KINDS).default('programme'),
    fromOn: isoDate,
    /** None: to the end of the project. */
    toOn: isoDate.nullable().optional(),
  })
  .refine((a) => !a.toOn || a.toOn >= a.fromOn, {
    path: ['toOn'],
    message: 'The share cannot end before it starts',
  });
export type AllocationInput = z.infer<typeof allocationSchema>;

export const allocationEndSchema = z.object({ toOn: isoDate });
export type AllocationEndInput = z.infer<typeof allocationEndSchema>;

export const allocationListQuerySchema = z.object({ employeeId: z.uuid() });
export type AllocationListQuery = z.infer<typeof allocationListQuerySchema>;

/** The most months one project report covers. */
export const MAX_PROJECT_REPORT_MONTHS = 60;

const monthSpan = (q: { from: string; to: string }) => {
  const [fy, fm] = q.from.split('-').map(Number) as [number, number];
  const [ty, tm] = q.to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
};

export const projectPeriodQuerySchema = z
  .object({ from: month, to: month })
  .refine((q) => q.from <= q.to, { path: ['to'], message: 'The period ends before it starts' })
  .refine((q) => monthSpan(q) <= MAX_PROJECT_REPORT_MONTHS, {
    path: ['from'],
    message: `At most ${MAX_PROJECT_REPORT_MONTHS} months at a time`,
  });
export type ProjectPeriodQuery = z.infer<typeof projectPeriodQuerySchema>;

export const donorReportQuerySchema = z
  .object({
    from: month,
    to: month,
    format: z.enum(['csv', 'pdf']).default('csv'),
    language: z.enum(['en', 'bn']).default('en'),
  })
  .refine((q) => q.from <= q.to, { path: ['to'], message: 'The period ends before it starts' })
  .refine((q) => monthSpan(q) <= MAX_PROJECT_REPORT_MONTHS, {
    path: ['from'],
    message: `At most ${MAX_PROJECT_REPORT_MONTHS} months at a time`,
  });
export type DonorReportQuery = z.infer<typeof donorReportQuerySchema>;

// ── Views ────────────────────────────────────────────────────────────────────

export interface DonorView {
  id: string;
  code: string;
  name: string;
  country: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProjectView {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  legalEntity: { id: string; name: string };
  donor: { id: string; code: string; name: string } | null;
  grantReference: string | null;
  fd6ApprovalNo: string | null;
  fd6ApprovedOn: string | null;
  startsOn: string;
  endsOn: string | null;
  approvedBudget: Money | null;
  staffBudget: Money | null;
  status: ProjectStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A project in the list: who is on it today and what it was charged this month. */
export interface ProjectListItem extends ProjectView {
  /** People with a share in force today. */
  people: number;
  /** Salaries charged this month from locked payroll. */
  monthCost: Money;
}

export interface AllocationView {
  id: string;
  employee: EmployeeRef;
  project: { id: string; code: string; name: string; status: ProjectStatus };
  percent: string;
  costKind: ProjectCostKind;
  fromOn: string;
  toOn: string | null;
  createdAt: string;
}

/** A rule of the Foreign Donations Act applied to a project, with where it comes from. */
export interface ForeignDonationRuleRef {
  reference: { act: string; section: string };
  status: 'verified' | 'needs_review';
}

/** A month of salaries charged to a project. */
export interface ProjectCostMonth {
  month: string;
  people: number;
  /** Full-time equivalents: the people's shares added up. */
  fte: string;
  /** Earnings charged: gross pay, overtime and allowances included. */
  earnings: Money;
  employerCost: Money;
  total: Money;
  programme: Money;
  admin: Money;
  /** People charged on an approved timesheet, and on the plan. */
  basis: Record<AllocationBasis, number>;
  /** Runs of the month for these people not locked yet, so not counted. */
  unlocked: boolean;
}

export interface ProjectCostTotals {
  earnings: Money;
  employerCost: Money;
  total: Money;
  programme: Money;
  admin: Money;
}

export interface ProjectCostReport {
  project: ProjectView;
  from: string;
  to: string;
  months: ProjectCostMonth[];
  total: ProjectCostTotals;
  /** Everything charged from the project's start to the end of the period. */
  cumulative: ProjectCostTotals & {
    staffBudget: Money | null;
    /** Share of the staff budget used, in percent; null without a budget. */
    staffBudgetUsed: number | null;
    overStaffBudget: boolean;
  };
  /**
   * Administration charged so far against the Act's cap on the approved budget (FDVA 2016
   * s.6); a warning when over, never a block. Null without an approved budget.
   */
  adminCap:
    | (ForeignDonationRuleRef & {
        percent: number;
        approvedBudget: Money;
        cap: Money;
        admin: Money;
        /** Administration as a share of the approved budget, in percent. */
        used: number;
        over: boolean;
      })
    | null;
}

/** An approved timesheet of someone on the project, for the donor's file. */
export interface ProjectTimesheetRef {
  id: string;
  employee: EmployeeRef;
  month: string;
  hours: string;
  projectHours: string;
  decidedAt: string | null;
}
