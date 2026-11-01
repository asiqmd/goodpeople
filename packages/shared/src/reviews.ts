// Phase 4 M2 performance: review cycles, reviews, peer feedback and calibration (input schemas
// and views).

import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import type { Ref } from './hr-types.js';
import type {
  Competency,
  CycleStatus,
  GoalKind,
  GoalStatus,
  KpiDirection,
  PeerStatus,
  Rating,
  ReviewStatus,
} from './performance.js';

export const REVIEW_COMMENT_MAX = 2000;
export const REVIEW_OVERALL_MAX = 4000;
export const CALIBRATION_NOTE_MAX = 1000;

/** The two questions every peer answers, besides a rating. */
export const PEER_QUESTIONS = ['strengths', 'improvements'] as const;
export type PeerQuestion = (typeof PEER_QUESTIONS)[number];

/** At most this many peers on one review. */
export const MAX_PEERS = 10;

const rating = z.number().int().min(1).max(5);
const optionalDate = z.iso.date().nullable().optional();
const comment = (max: number) => z.string().trim().max(max).optional();

// ── Settings ─────────────────────────────────────────────────────────────────

export const competencySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Use lower-case letters, digits and _'),
  en: z.string().trim().min(1).max(120),
  bn: z.string().trim().min(1).max(120),
});

const competencyList = z
  .array(competencySchema)
  .min(1, 'Rate at least one competency')
  .max(12)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((c, i) => {
      if (seen.has(c.key)) {
        ctx.addIssue({ code: 'custom', message: 'Each key once', path: [i, 'key'] });
      }
      seen.add(c.key);
    });
  });

const percent = z.number().int().min(0).max(100);

/** The share of final ratings each rating usually gets, in percent, adding up to 100. */
export const ratingGuideSchema = z
  .object({ 1: percent, 2: percent, 3: percent, 4: percent, 5: percent })
  .refine((g) => g[1] + g[2] + g[3] + g[4] + g[5] === 100, 'The shares must add up to 100%');

export const performanceSettingsSchema = z.object({
  competencies: competencyList,
  ratingGuide: ratingGuideSchema,
});
export type PerformanceSettingsInput = z.infer<typeof performanceSettingsSchema>;

export interface PerformanceSettingsView {
  competencies: Competency[];
  ratingGuide: Record<Rating, number>;
  /** null until first saved: the defaults. */
  updatedAt: string | null;
}

// ── Cycles ───────────────────────────────────────────────────────────────────

const stepDates = {
  goalsDueOn: optionalDate,
  selfDueOn: optionalDate,
  peerDueOn: optionalDate,
  managerDueOn: optionalDate,
  calibrationDueOn: optionalDate,
};
type StepDates = { [K in keyof typeof stepDates]?: string | null };

/** Each step after the ones it waits for. */
function stepsInOrder(d: StepDates, ctx: z.RefinementCtx) {
  const after = (later: keyof StepDates, earlier: keyof StepDates) => {
    const a = d[later];
    const b = d[earlier];
    if (a && b && a < b) {
      ctx.addIssue({
        code: 'custom',
        message: 'Must not be before the step it follows',
        path: [later],
      });
    }
  };
  after('selfDueOn', 'goalsDueOn');
  after('managerDueOn', 'selfDueOn');
  after('managerDueOn', 'peerDueOn');
  after('calibrationDueOn', 'managerDueOn');
}

export const cycleSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    /** Empty for every company the login looks after. */
    legalEntityIds: z.array(z.uuid()).max(50).default([]),
    joinedOnOrBefore: optionalDate,
    selfReview: z.boolean().default(true),
    peerReview: z.boolean().default(false),
    /** Copied from the settings when not given. */
    competencies: competencyList.optional(),
    ...stepDates,
  })
  .superRefine((c, ctx) => {
    if (c.periodEnd < c.periodStart) {
      ctx.addIssue({ code: 'custom', message: 'Ends before it starts', path: ['periodEnd'] });
    }
    stepsInOrder(c, ctx);
  });
export type CycleInput = z.infer<typeof cycleSchema>;

/** A launched cycle's name and step dates, which may still move. */
export const cycleDatesSchema = z
  .object({ name: z.string().trim().min(2).max(120), ...stepDates })
  .superRefine(stepsInOrder);
export type CycleDatesInput = z.infer<typeof cycleDatesSchema>;

/** Moving to calibration; the note is required while manager reviews are missing. */
export const cycleCalibrateSchema = z.object({
  note: z.string().trim().max(CALIBRATION_NOTE_MAX).optional(),
});
export type CycleCalibrateInput = z.infer<typeof cycleCalibrateSchema>;

export const cyclePersonSchema = z.object({ employeeId: z.uuid() });
export type CyclePersonInput = z.infer<typeof cyclePersonSchema>;

export const cycleReviewsQuerySchema = z.object({
  status: z.enum(['self', 'manager', 'calibration', 'released', 'acknowledged']).optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type CycleReviewsQuery = z.infer<typeof cycleReviewsQuerySchema>;

export const calibrationQuerySchema = z.object({
  legalEntityId: z.uuid().optional(),
  orgUnitId: z.uuid().optional(),
  managerEmployeeId: z.uuid().optional(),
});
export type CalibrationQuery = z.infer<typeof calibrationQuerySchema>;

export interface CycleSummary {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: CycleStatus;
  selfReview: boolean;
  peerReview: boolean;
  goalsDueOn: string | null;
  selfDueOn: string | null;
  peerDueOn: string | null;
  managerDueOn: string | null;
  calibrationDueOn: string | null;
}

export interface CycleListItem extends CycleSummary {
  /** Empty: every company. */
  legalEntities: Ref[];
  reviews: number;
  /** Reviews released or acknowledged. */
  released: number;
  createdAt: string;
}

export interface CycleProgress {
  total: number;
  byStatus: Record<ReviewStatus, number>;
  /** Steps past their date: self reviews, peer answers, manager reviews. */
  overdue: { self: number; peer: number; manager: number };
  /** Reviews without a manager, which HR writes. */
  noManager: number;
  withFinalRating: number;
  peers: Record<PeerStatus, number>;
}

export interface CycleDetail extends CycleSummary {
  legalEntityIds: string[];
  legalEntities: Ref[];
  joinedOnOrBefore: string | null;
  competencies: Competency[];
  launchedAt: string | null;
  releasedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  /** May the login launch, move, release and close it (every company in it is theirs). */
  canChange: boolean;
  progress: CycleProgress;
}

export interface CycleReviewItem {
  id: string;
  employee: EmployeeRef;
  manager: EmployeeRef | null;
  status: ReviewStatus;
  proposedRating: Rating | null;
  finalRating: Rating | null;
  selfSubmittedAt: string | null;
  managerSubmittedAt: string | null;
  acknowledgedAt: string | null;
  employeeAgrees: boolean | null;
  /** The step it waits on is past its date. */
  overdue: boolean;
}

/** Launching, or adding people later: how many reviews were created. */
export interface CycleLaunchResult {
  created: number;
  cycle: CycleDetail;
}

// ── Reviews ──────────────────────────────────────────────────────────────────

const answer = z.object({ rating, comment: comment(REVIEW_COMMENT_MAX) });

/** Ratings and comments for each goal (by id) and competency (by key), and an overall comment. */
export const reviewAnswersSchema = z.object({
  goals: z.record(z.uuid(), answer).default({}),
  competencies: z.record(z.string().max(40), answer).default({}),
  overall: comment(REVIEW_OVERALL_MAX),
});
export type ReviewAnswersInput = z.infer<typeof reviewAnswersSchema>;

/** A self review; `submit` sends it to the manager, after which it cannot change. */
export const selfReviewSchema = z.object({
  answers: reviewAnswersSchema,
  submit: z.boolean().default(false),
});
export type SelfReviewInput = z.infer<typeof selfReviewSchema>;

export const recommendationsSchema = z.object({
  increment: z.boolean().default(false),
  promotionDesignationId: z.uuid().nullable().default(null),
  plan: z.boolean().default(false),
});

export const managerReviewSchema = z.object({
  answers: reviewAnswersSchema,
  proposedRating: rating.nullable().optional(),
  recommendations: recommendationsSchema.optional(),
  submit: z.boolean().default(false),
});
export type ManagerReviewInput = z.infer<typeof managerReviewSchema>;

/** HR's final rating; a change from the proposed one needs the reason. */
export const finalRatingSchema = z.object({
  finalRating: rating,
  note: z.string().trim().max(CALIBRATION_NOTE_MAX).optional(),
});
export type FinalRatingInput = z.infer<typeof finalRatingSchema>;

export const acknowledgeSchema = z.object({
  agrees: z.boolean(),
  comment: comment(REVIEW_COMMENT_MAX),
});
export type AcknowledgeInput = z.infer<typeof acknowledgeSchema>;

export interface ReviewAnswersView {
  goals: Record<string, { rating: number; comment?: string }>;
  competencies: Record<string, { rating: number; comment?: string }>;
  overall?: string;
}

export interface ReviewGoal {
  id: string;
  title: string;
  description: string | null;
  kind: GoalKind;
  status: GoalStatus;
  /** Percent; null when the goals carry no weights (they count equally). */
  weight: string | null;
  progress: number;
  dueOn: string | null;
  measureUnit: string | null;
  target: string | null;
  currentValue: string | null;
  direction: KpiDirection | null;
  keyResults: { text: string; done: boolean }[];
}

export interface ReviewRecommendationsView {
  increment: boolean;
  promotion: Ref | null;
  plan: boolean;
}

/** How the login stands to a review. */
export type ReviewRole = 'person' | 'manager' | 'hr';

export interface PeerFeedbackItem {
  id: string;
  peer: EmployeeRef;
  status: PeerStatus;
  answers: Partial<Record<PeerQuestion, string>> | null;
  rating: Rating | null;
  submittedAt: string | null;
}

/** A peer the person named, before release: never whether they have answered. */
export interface PeerProposal {
  id: string;
  peer: EmployeeRef;
  status: 'proposed' | 'approved' | 'declined';
}

/**
 * Peer feedback as the person sees it after release: the answers together, in no order that
 * ties them to anyone, and the average rating; nothing at all from fewer than MIN_PEERS_SHOWN.
 */
export interface PeerSummary {
  shown: boolean;
  answers: Record<PeerQuestion, string[]>;
  averageRating: number | null;
}

export interface ReviewDetail {
  id: string;
  cycle: CycleSummary & { competencies: Competency[] };
  employee: EmployeeRef & { designation: string | null; legalEntity: string | null };
  manager: EmployeeRef | null;
  status: ReviewStatus;
  role: ReviewRole;
  can: {
    writeSelf: boolean;
    writeManager: boolean;
    proposePeers: boolean;
    approvePeers: boolean;
    acknowledge: boolean;
    calibrate: boolean;
  };
  goals: ReviewGoal[];
  /** null while hidden from the login (the manager sees it once submitted). */
  self: { answers: ReviewAnswersView | null; submittedAt: string | null } | null;
  /** null while hidden from the login (the person sees it once released). */
  managerReview: {
    answers: ReviewAnswersView | null;
    submittedAt: string | null;
    proposedRating: Rating | null;
    recommendations: ReviewRecommendationsView | null;
  } | null;
  goalScore: string | null;
  finalRating: Rating | null;
  calibration: { note: string | null; by: string | null; at: string | null } | null;
  releasedAt: string | null;
  acknowledgement: { at: string; comment: string | null; agrees: boolean | null } | null;
  /** The manager's and HR's view, with names. */
  peers: PeerFeedbackItem[] | null;
  /** The person's, before release: the peers they named. */
  peerProposals: PeerProposal[] | null;
  /** The person's, after release. */
  peerSummary: PeerSummary | null;
  /** Designations a promotion can be recommended to, for whoever writes the manager's part. */
  promotionChoices: Ref[];
}

export interface TeamReviewItem {
  id: string;
  cycle: { id: string; name: string; status: CycleStatus };
  employee: EmployeeRef;
  status: ReviewStatus;
  /** Their own manager's review, not one further down. */
  direct: boolean;
  /** The date of the step it waits on. */
  dueOn: string | null;
  proposedRating: Rating | null;
  finalRating: Rating | null;
  peersToApprove: number;
  acknowledgedAt: string | null;
  employeeAgrees: boolean | null;
}

// ── Peers ────────────────────────────────────────────────────────────────────

export const peerProposeSchema = z.object({
  employeeIds: z.array(z.uuid()).min(1).max(MAX_PEERS),
});
export type PeerProposeInput = z.infer<typeof peerProposeSchema>;

export const peerDecisionSchema = z.object({ approve: z.boolean() });
export type PeerDecisionInput = z.infer<typeof peerDecisionSchema>;

const peerAnswer = z.string().trim().min(1, 'Write a few words').max(REVIEW_COMMENT_MAX);

export const peerAnswerSchema = z.object({
  answers: z.object({ strengths: peerAnswer, improvements: peerAnswer }),
  rating,
});
export type PeerAnswerInput = z.infer<typeof peerAnswerSchema>;

export const peerChoicesQuerySchema = z.object({ search: z.string().trim().max(80).optional() });
export type PeerChoicesQuery = z.infer<typeof peerChoicesQuerySchema>;

/** A request for the login's feedback on someone. */
export interface PeerRequestView {
  id: string;
  person: EmployeeRef;
  cycle: { id: string; name: string };
  status: PeerStatus;
  dueOn: string | null;
  /** Still open for an answer. */
  open: boolean;
  answers: Partial<Record<PeerQuestion, string>> | null;
  rating: Rating | null;
  submittedAt: string | null;
}

/** A peer someone named, waiting for the manager's yes or no. */
export interface PeerApprovalItem {
  id: string;
  reviewId: string;
  person: EmployeeRef;
  peer: EmployeeRef;
  cycle: { id: string; name: string };
  proposedAt: string;
}

export interface PeerInbox {
  toAnswer: PeerRequestView[];
  toApprove: PeerApprovalItem[];
}

// ── Calibration ──────────────────────────────────────────────────────────────

export interface DistributionRow {
  rating: Rating;
  count: number;
  /** Of the ratings given, to one decimal. */
  percent: number;
  /** The workspace's guide. */
  guidePercent: number;
}

export interface CalibrationRow {
  reviewId: string;
  employee: EmployeeRef;
  legalEntity: Ref | null;
  orgUnit: Ref | null;
  designation: string | null;
  manager: EmployeeRef | null;
  status: ReviewStatus;
  goalScore: string | null;
  proposedRating: Rating | null;
  finalRating: Rating | null;
  recommendations: ReviewRecommendationsView | null;
  calibrationNote: string | null;
  calibratedBy: string | null;
  calibratedAt: string | null;
}

export interface CalibrationView {
  cycle: CycleSummary;
  /** Final ratings can be set: the cycle is in calibration. */
  canChange: boolean;
  guide: Record<Rating, number>;
  /** What the people shown can be narrowed by. */
  filters: { legalEntities: Ref[]; orgUnits: Ref[]; managers: EmployeeRef[] };
  people: CalibrationRow[];
  distribution: { proposed: DistributionRow[]; final: DistributionRow[] };
  missing: { managerReviews: number; finalRatings: number };
}

// ── The login's performance page ─────────────────────────────────────────────

export const PERFORMANCE_TASK_KINDS = [
  'self_review',
  'manager_review',
  'peer_answer',
  'peer_approve',
  'acknowledge',
  'goals_agree',
  'probation_review',
] as const;
export type PerformanceTaskKind = (typeof PERFORMANCE_TASK_KINDS)[number];

export interface PerformanceTask {
  kind: PerformanceTaskKind;
  id: string;
  /** Whom it is about; null for the login's own review. */
  person: EmployeeRef | null;
  cycle: string | null;
  dueOn: string | null;
  /** Goals to agree, peers to approve; 1 otherwise. */
  count: number;
  link: string;
}

export interface MyReviewItem {
  id: string;
  cycle: { id: string; name: string; periodStart: string; periodEnd: string; status: CycleStatus };
  status: ReviewStatus;
  /** Once released. */
  finalRating: Rating | null;
  releasedAt: string | null;
  acknowledgedAt: string | null;
}

/** For the navigation and the landing page: what waits for this login. */
export interface PerformanceMe {
  /** Self reviews, manager reviews, peer feedback, goals to agree and probation reviews due. */
  tasks: number;
  items: PerformanceTask[];
  /** May manage cycles and calibration. */
  manage: boolean;
  /** Has a team: direct reports, or reviews to write. */
  manager: boolean;
  goals: {
    total: number;
    draft: number;
    agreed: number;
    completed: number;
    progress: number | null;
  };
  reviews: MyReviewItem[];
}
