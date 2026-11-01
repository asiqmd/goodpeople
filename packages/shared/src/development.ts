// Phase 4 M2 performance: improvement plans, probation reviews, a person's performance record and
// the outcomes M3's increment round reads (input schemas and views).

import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import type { Ref } from './hr-types.js';
import {
  PLAN_STATUSES,
  PROBATION_RECOMMENDATIONS,
  type Competency,
  type CycleStatus,
  type GoalKind,
  type GoalStatus,
  type PlanStatus,
  type ProbationRecommendation,
  type ReviewStatus,
} from './performance.js';

// ── Improvement plans ────────────────────────────────────────────────────────

/** The lengths offered, in days; any end after the start is allowed. */
export const PLAN_LENGTHS = [30, 60, 90] as const;

/** A plan under way. A person has at most one open plan (a draft or one under way). */
export const RUNNING_PLAN_STATUSES = [
  'active',
  'extended',
] as const satisfies readonly PlanStatus[];
export const OPEN_PLAN_STATUSES = [
  'draft',
  ...RUNNING_PLAN_STATUSES,
] as const satisfies readonly PlanStatus[];

/** How a plan under way is closed. */
export const PLAN_OUTCOMES = [
  'successful',
  'not_met',
  'cancelled',
] as const satisfies readonly PlanStatus[];
export type PlanOutcome = (typeof PLAN_OUTCOMES)[number];

export const PLAN_TEXT_MAX = 2000;
export const PLAN_OBJECTIVES_MAX = 10;

/**
 * What every plan says about the law, on its page and wherever it is printed. A plan records
 * concerns and the help given; it never ends anyone's employment by itself.
 *
 * For the labour lawyer to confirm: Bangladesh Labour Act 2006, ss.23–24 (dismissal for
 * misconduct: a show-cause notice in writing, at least seven days to answer, an inquiry) and
 * s.26 (other termination, with notice or pay instead).
 */
export const PLAN_LAW_NOTE = {
  en:
    'This plan records concerns about performance and the support given. It never ends anyone’s ' +
    'employment by itself, and closing it as not met changes nothing in the job. Dismissal for ' +
    'misconduct follows the Bangladesh Labour Act 2006, sections 23 and 24: a written show-cause ' +
    'notice with at least seven days to answer, and an inquiry. Any other termination follows ' +
    'section 26, with the notice it requires or pay instead.',
  bn:
    'এই পরিকল্পনায় কাজের মান নিয়ে উদ্বেগ এবং দেওয়া সহায়তার কথা লেখা থাকে। এটি নিজে থেকে কারও ' +
    'চাকরি শেষ করে না, আর লক্ষ্য পূরণ হয়নি বলে বন্ধ করলেও চাকরিতে কোনো পরিবর্তন হয় না। অসদাচরণের ' +
    'জন্য বরখাস্ত বাংলাদেশ শ্রম আইন ২০০৬-এর ধারা ২৩ ও ২৪-এর পদ্ধতি মেনে হয়: লিখিত কারণ দর্শানোর ' +
    'নোটিশ, উত্তর দেওয়ার জন্য অন্তত সাত দিন, এবং তদন্ত। অন্য যেকোনো অবসান ধারা ২৬ মেনে, প্রয়োজনীয় ' +
    'নোটিশ বা তার বদলে মজুরি দিয়ে হয়।',
} as const;

const planObjectiveSchema = z.object({
  text: z.string().trim().min(3).max(500),
  /** How it is measured. */
  measure: z.string().trim().min(2).max(500),
});

const planFieldsSchema = z.object({
  reason: z.string().trim().min(10).max(PLAN_TEXT_MAX),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  objectives: z.array(planObjectiveSchema).min(1).max(PLAN_OBJECTIVES_MAX),
  support: z.string().trim().max(PLAN_TEXT_MAX).nullable().optional(),
  /** The review that recommended it: a review of this person. */
  reviewId: z.uuid().nullable().optional(),
});

const endsAfterStart = (plan: { startsOn: string; endsOn: string }, ctx: z.RefinementCtx) => {
  if (plan.endsOn <= plan.startsOn) {
    ctx.addIssue({
      code: 'custom',
      message: 'The plan must end after it starts',
      path: ['endsOn'],
    });
  }
};

export const planCreateSchema = planFieldsSchema
  .extend({ employeeId: z.uuid() })
  .superRefine(endsAfterStart);
export type PlanCreateInput = z.infer<typeof planCreateSchema>;

/** A draft's whole content again (the form sends it all). */
export const planUpdateSchema = planFieldsSchema.superRefine(endsAfterStart);
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

export const planCheckinSchema = z.object({
  heldOn: z.iso.date(),
  note: z.string().trim().min(3).max(PLAN_TEXT_MAX),
});
export type PlanCheckinInput = z.infer<typeof planCheckinSchema>;

export const planExtendSchema = z.object({
  endsOn: z.iso.date(),
  reason: z.string().trim().min(3).max(1000),
});
export type PlanExtendInput = z.infer<typeof planExtendSchema>;

export const planCloseSchema = z.object({
  outcome: z.enum(PLAN_OUTCOMES),
  note: z.string().trim().min(3).max(PLAN_TEXT_MAX),
});
export type PlanCloseInput = z.infer<typeof planCloseSchema>;

/** The person has read it; the comment is theirs, agreeing or not. */
export const planAcknowledgeSchema = z.object({
  comment: z.string().trim().max(PLAN_TEXT_MAX).optional(),
});
export type PlanAcknowledgeInput = z.infer<typeof planAcknowledgeSchema>;

export const planListQuerySchema = z.object({
  status: z.enum(PLAN_STATUSES).optional(),
  employeeId: z.uuid().optional(),
});
export type PlanListQuery = z.infer<typeof planListQuerySchema>;

export const planPeopleQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
});
export type PlanPeopleQuery = z.infer<typeof planPeopleQuerySchema>;

// ── Probation reviews ────────────────────────────────────────────────────────

/** A probation review is asked for this many days before the probation ends. */
export const PROBATION_REVIEW_LEAD_DAYS = 21;
/** And is due this many days before the end, leaving HR time to act. */
export const PROBATION_REVIEW_DUE_DAYS = 7;

/**
 * - `due`: waiting for the manager's review.
 * - `submitted`: the review is in, for HR to act on.
 * - `acted`: HR has confirmed, extended or ended the probation since (with or without it).
 */
export const PROBATION_REVIEW_STATES = ['due', 'submitted', 'acted'] as const;
export type ProbationReviewState = (typeof PROBATION_REVIEW_STATES)[number];

export const probationReviewSubmitSchema = z
  .object({
    /** Competency key → 1–5, for every competency rated. */
    ratings: z.record(z.string().min(1).max(60), z.number().int().min(1).max(5)),
    recommendation: z.enum(PROBATION_RECOMMENDATIONS),
    comment: z.string().trim().max(PLAN_TEXT_MAX).optional(),
  })
  .superRefine((r, ctx) => {
    // Extending or ending a probation needs the reason on record.
    if (r.recommendation !== 'confirm' && !r.comment) {
      ctx.addIssue({
        code: 'custom',
        message: 'Say why the probation should be extended or ended',
        path: ['comment'],
      });
    }
  });
export type ProbationReviewSubmitInput = z.infer<typeof probationReviewSubmitSchema>;

export const probationListQuerySchema = z.object({
  state: z.enum(PROBATION_REVIEW_STATES).optional(),
});
export type ProbationListQuery = z.infer<typeof probationListQuerySchema>;

// ── Outcomes for M3 ──────────────────────────────────────────────────────────

export const outcomesQuerySchema = z.object({
  cycleId: z.uuid(),
  format: z.enum(['json', 'csv']).default('json'),
});
export type OutcomesQuery = z.infer<typeof outcomesQuerySchema>;

// ── Views ────────────────────────────────────────────────────────────────────

export interface PlanObjective {
  text: string;
  measure: string;
}

export interface PlanCheckinView {
  id: string;
  heldOn: string;
  note: string;
  author: string | null;
  createdAt: string;
}

/** An extension, from the audit log. */
export interface PlanExtensionView {
  from: string;
  to: string;
  reason: string | null;
  by: string | null;
  at: string;
}

export interface PlanListItem {
  id: string;
  employee: EmployeeRef;
  manager: EmployeeRef | null;
  status: PlanStatus;
  startsOn: string;
  endsOn: string;
  acknowledgedAt: string | null;
  decidedAt: string | null;
  /** The viewer's own plan. */
  mine: boolean;
}

export interface PlanView extends PlanListItem {
  designation: string | null;
  orgUnit: string | null;
  review: { id: string; cycleId: string; cycleName: string } | null;
  reason: string;
  objectives: PlanObjective[];
  support: string | null;
  outcomeNote: string | null;
  employeeComment: string | null;
  checkins: PlanCheckinView[];
  extensions: PlanExtensionView[];
  createdBy: string | null;
  createdAt: string;
  /** The manager or HR runs it; the person reads and acknowledges it. */
  role: 'manage' | 'person';
  can: {
    edit: boolean;
    start: boolean;
    delete: boolean;
    checkin: boolean;
    extend: boolean;
    close: boolean;
    acknowledge: boolean;
  };
}

export interface ProbationReviewListItem {
  id: string;
  employee: EmployeeRef;
  manager: EmployeeRef | null;
  /** The probation end this review is for. */
  probationEndsOn: string;
  /** Seven days before the end, or today when the review was asked for later. */
  dueOn: string;
  state: ProbationReviewState;
  recommendation: ProbationRecommendation | null;
  submittedAt: string | null;
  /** When the daily job recorded HR's action; `state` is `acted` as soon as HR acts. */
  actedAt: string | null;
}

export interface ProbationReviewView extends ProbationReviewListItem {
  joinedOn: string;
  legalEntity: string | null;
  designation: string | null;
  orgUnit: string | null;
  /** The probation end in force now: later than the review's once extended. */
  currentProbationEndsOn: string | null;
  confirmedOn: string | null;
  competencies: Competency[];
  ratings: Record<string, number> | null;
  comment: string | null;
  /** The viewer may write the review: its manager, or HR. */
  canSubmit: boolean;
  /** The viewer is HR, who acts on the person's probation. */
  manage: boolean;
}

export interface RecordGoal {
  id: string;
  title: string;
  kind: GoalKind;
  status: GoalStatus;
  weight: string | null;
  progress: number;
  dueOn: string | null;
}

export interface RecordCycleRef {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: CycleStatus;
}

export interface RecordReview {
  id: string;
  cycle: RecordCycleRef;
  status: ReviewStatus;
  /** Once released. */
  finalRating: number | null;
  goalScore: string | null;
  releasedAt: string | null;
  acknowledgedAt: string | null;
  employeeAgrees: boolean | null;
}

/** A person's performance over time: goals and reviews by cycle, plans and probation reviews. */
export interface PerformanceRecord {
  employee: EmployeeRef;
  /** The person's own record: released reviews and plans under way or closed only. */
  self: boolean;
  /** By cycle, newest first; goals outside a cycle last. */
  goals: { cycle: RecordCycleRef | null; goals: RecordGoal[] }[];
  reviews: RecordReview[];
  plans: PlanListItem[];
  /** Never shown to the person. */
  probationReviews: ProbationReviewListItem[];
}

/** One released review, as M3's increment round reads it. */
export interface OutcomeRow {
  reviewId: string;
  employee: EmployeeRef;
  company: Ref;
  orgUnit: Ref | null;
  designation: Ref | null;
  grade: Ref | null;
  finalRating: number;
  goalScore: string | null;
  recommendations: {
    increment: boolean;
    promotionDesignation: Ref | null;
    plan: boolean;
  };
  releasedAt: string;
  acknowledgedAt: string | null;
}

export interface OutcomesView {
  cycle: RecordCycleRef;
  rows: OutcomeRow[];
}

/** A cycle whose reviews are released, to choose outcomes from. */
export interface OutcomeCycle extends RecordCycleRef {
  released: number;
}
