import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import { bdMobileSchema, type Address } from './hr-schemas.js';
import { EMPLOYMENT_TYPES, type EmploymentType } from './hr.js';
import type { Ref } from './hr-types.js';
import type { ApprovalStepKind } from './leave.js';
import type { ApprovalStepView } from './leave-types.js';
import type { Money } from './payroll.js';
import { moneySchema } from './payroll-schemas.js';
import {
  DEFAULT_CANDIDATE_RETENTION_MONTHS,
  DEFAULT_SCORECARD_CRITERIA,
  OPENING_REASONS,
  OPENING_STATUSES,
  type ApplicationStage,
  type OpeningReason,
  type OpeningStatus,
} from './recruitment.js';
import { withoutDefaults } from './zod-helpers.js';

// Phase 4 M1 recruitment: openings, their approval and job posts, the workspace's recruitment
// settings, and the public careers page.

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z.iso.date();

// ── Openings ─────────────────────────────────────────────────────────────────

/** What each interviewer rates: up to 12 short criteria. */
export const scorecardCriteriaSchema = z
  .array(z.string().trim().min(2).max(80))
  .min(1, 'Add at least one criterion')
  .max(12, 'Use at most 12 criteria')
  .refine((list) => new Set(list.map((c) => c.toLowerCase())).size === list.length, {
    message: 'Each criterion once',
  });

const openingFields = {
  legalEntityId: z.uuid(),
  orgUnitId: z.uuid().nullable().optional(),
  locationId: z.uuid().nullable().optional(),
  designationId: z.uuid().nullable().optional(),
  gradeId: z.uuid().nullable().optional(),
  /** Internal title, e.g. "Sewing operators, line 4". */
  title: z.string().trim().min(2).max(160),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  headcount: z.coerce.number().int().min(1).max(1000).default(1),
  reason: z.enum(OPENING_REASONS).default('new_position'),
  /** The person replaced, for a replacement. */
  replacesEmployeeId: z.uuid().nullable().optional(),
  /** Monthly gross pay budgeted for each position. */
  budgetMin: moneySchema.nullable().optional(),
  budgetMax: moneySchema.nullable().optional(),
  /** An active employee with a login; a line manager drafting one names themselves. */
  hiringManagerEmployeeId: z.uuid().nullable().optional(),
  justification: optionalText(2000),
  scorecardCriteria: scorecardCriteriaSchema.default([...DEFAULT_SCORECARD_CRITERIA]),
};

/** What an opening's fields must hold together: a replacement names whom, the budget's order. */
export function openingProblem(o: {
  reason?: OpeningReason;
  replacesEmployeeId?: string | null;
  budgetMin?: string | null;
  budgetMax?: string | null;
}): { path: 'replacesEmployeeId' | 'budgetMax'; message: string } | null {
  if (o.reason === 'replacement' && !o.replacesEmployeeId) {
    return { path: 'replacesEmployeeId', message: 'Choose the person this opening replaces' };
  }
  if (o.budgetMin && o.budgetMax && Number(o.budgetMin) > Number(o.budgetMax)) {
    return { path: 'budgetMax', message: 'The highest pay cannot be below the lowest' };
  }
  return null;
}

export const openingSchema = z.object(openingFields).superRefine((o, ctx) => {
  const problem = openingProblem(o);
  if (problem) ctx.addIssue({ code: 'custom', path: [problem.path], message: problem.message });
});
export type OpeningInput = z.infer<typeof openingSchema>;

/** Fields to change on a draft; the opening that results is checked as a whole. */
export const openingUpdateSchema = z.object(withoutDefaults(openingFields)).partial();
export type OpeningUpdateInput = z.infer<typeof openingUpdateSchema>;

/** A title and a description in at least one language. */
export const postLanguageComplete = (title?: string | null, description?: string | null) =>
  Boolean(title?.trim() && description?.trim());

/** The job post, written once the opening is approved. Descriptions are Markdown. */
export const openingPostSchema = z
  .object({
    postTitleEn: optionalText(160),
    postTitleBn: optionalText(160),
    descriptionEn: optionalText(10_000),
    descriptionBn: optionalText(10_000),
    showSalary: z.boolean().default(false),
    /** Today or later (checked against today in Dhaka). */
    closesOn: isoDate,
  })
  .superRefine((p, ctx) => {
    if (
      !postLanguageComplete(p.postTitleEn, p.descriptionEn) &&
      !postLanguageComplete(p.postTitleBn, p.descriptionBn)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['postTitleEn'],
        message: 'Write a title and a description in English, Bangla or both',
      });
    }
  });
export type OpeningPostInput = z.infer<typeof openingPostSchema>;

export const openingListQuerySchema = z.object({
  status: z.enum(OPENING_STATUSES).optional(),
  legalEntityId: z.uuid().optional(),
});
export type OpeningListQuery = z.infer<typeof openingListQuerySchema>;

/** What the signed-in login may do with an opening now. */
export const OPENING_ACTIONS = [
  'edit',
  'submit',
  'post',
  'publish',
  'close',
  'reopen',
  'cancel',
] as const;
export type OpeningAction = (typeof OPENING_ACTIONS)[number];

/** Applications to an opening at each stage. */
export type OpeningStageCounts = Record<ApplicationStage, number>;

export interface OpeningListItem {
  id: string;
  title: string;
  postTitleEn: string | null;
  postTitleBn: string | null;
  status: OpeningStatus;
  legalEntity: Ref;
  location: Ref | null;
  designation: Ref | null;
  employmentType: EmploymentType;
  headcount: number;
  hiringManager: EmployeeRef | null;
  closesOn: string | null;
  publishedAt: string | null;
  createdAt: string;
  counts: OpeningStageCounts;
  /** Every application, whatever its stage. */
  applications: number;
}

export interface OpeningView {
  id: string;
  status: OpeningStatus;
  title: string;
  legalEntity: Ref;
  orgUnit: Ref | null;
  location: Ref | null;
  designation: Ref | null;
  grade: Ref | null;
  employmentType: EmploymentType;
  headcount: number;
  reason: OpeningReason;
  replaces: EmployeeRef | null;
  budgetMin: Money | null;
  budgetMax: Money | null;
  justification: string | null;
  hiringManager: EmployeeRef | null;
  scorecardCriteria: string[];
  postTitleEn: string | null;
  postTitleBn: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  showSalary: boolean;
  closesOn: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  /** Every round of approval, oldest first; earlier rounds have step numbers below 1. */
  steps: ApprovalStepView[];
  counts: OpeningStageCounts;
  applications: number;
}

/** An opening with what the signed-in login may do with it. */
export interface OpeningDetail extends OpeningView {
  actions: OpeningAction[];
}

export interface JobOpeningApprovalItem {
  subjectType: 'job_opening';
  stepId: string;
  kind: ApprovalStepKind;
  opening: OpeningView;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export const recruitmentSettingsSchema = z.object({
  careersEnabled: z.boolean(),
  introEn: optionalText(4000),
  introBn: optionalText(4000),
  /** Months a candidate's data is kept after their last application closed. */
  retentionMonths: z.coerce
    .number()
    .int()
    .min(1, 'Keep data for at least a month')
    .max(60, 'Keep data for at most 60 months')
    .default(DEFAULT_CANDIDATE_RETENTION_MONTHS),
  /** Where candidates write about their data. */
  privacyEmail: z.email().max(200).nullable().optional(),
});
export type RecruitmentSettingsInput = z.infer<typeof recruitmentSettingsSchema>;

export interface RecruitmentSettingsView {
  careersEnabled: boolean;
  introEn: string | null;
  introBn: string | null;
  retentionMonths: number;
  privacyEmail: string | null;
  /** null until first saved. */
  updatedAt: string | null;
}

// ── The careers page (public) ────────────────────────────────────────────────

export interface CareersWorkspace {
  name: string;
  slug: string;
}

/** Monthly gross, shown only when the workspace chose to. */
export interface CareersSalary {
  min: Money | null;
  max: Money | null;
}

export interface CareersJobSummary {
  id: string;
  titleEn: string | null;
  titleBn: string | null;
  company: string;
  location: string | null;
  employmentType: EmploymentType;
  closesOn: string;
  publishedAt: string | null;
  salary: CareersSalary | null;
}

export interface CareersPageView {
  workspace: CareersWorkspace;
  introEn: string | null;
  introBn: string | null;
  jobs: CareersJobSummary[];
}

export interface CareersJobView extends CareersJobSummary {
  closed: false;
  workspace: CareersWorkspace;
  descriptionEn: string | null;
  descriptionBn: string | null;
  locationAddress: Address | null;
  /** What the consent says: how long an application is kept and whom to ask. */
  retentionMonths: number;
  privacyEmail: string | null;
}

/** A job that was posted and is no longer taking applications. */
export interface CareersClosedJob {
  closed: true;
  workspace: CareersWorkspace;
  titleEn: string | null;
  titleBn: string | null;
}

export type CareersJob = CareersJobView | CareersClosedJob;

/** A multipart form sends booleans as text; a ticked box sends "on" or "true". */
const formBoolean = z.preprocess(
  (v) =>
    v === true || v === 'true' || v === 'on' || v === '1'
      ? true
      : v === undefined || v === '' || v === 'false' || v === '0'
        ? false
        : v,
  z.boolean(),
);

/** Applying from the careers page; the CV comes as the multipart file `cv`. */
export const careersApplySchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.email('Enter your email address').max(200),
  /** Typed as people write it: spaces and dashes are dropped. */
  phone: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(bdMobileSchema),
  coverNote: optionalText(3000),
  consent: formBoolean.pipe(
    z.literal(true, { error: 'Agree to how your application is used to apply' }),
  ),
  /** Kept for other jobs until consent is withdrawn. */
  talentPool: formBoolean.optional(),
  language: z.enum(['en', 'bn']).default('en'),
  /** Left empty by people; filled by simple bots. */
  website: z.string().max(200).optional(),
});
export type CareersApplyInput = z.infer<typeof careersApplySchema>;

export interface CareersApplied {
  received: true;
}
