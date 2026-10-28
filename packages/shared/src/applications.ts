import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import { bdMobileSchema } from './hr-schemas.js';
import type { Ref } from './hr-types.js';
import {
  INTERVIEW_KINDS,
  RECOMMENDATIONS,
  type ApplicationStage,
  type CandidateSource,
  type InterviewKind,
  type InterviewStatus,
  type OpeningStatus,
  type Recommendation,
} from './recruitment.js';

// Phase 4 M1 recruitment: candidates, their applications through the pipeline, interviews
// with calendar invitations, and scorecards.

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const email = z.email('Use an email address like name@example.com').max(200);

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

/** Stages an application is still being considered in. */
export const OPEN_APPLICATION_STAGES = ['applied', 'screening', 'interview', 'offer'] as const;

/** Where people move applications; `hired` is set only by hiring from an accepted offer. */
export const MOVABLE_STAGES = [...OPEN_APPLICATION_STAGES, 'rejected', 'withdrawn'] as const;
export type MovableStage = (typeof MOVABLE_STAGES)[number];

/** Openings whose positions are no longer being filled. */
export const ENDED_OPENING_STATUSES = ['closed', 'filled', 'cancelled'] as const;

// ── Inputs ───────────────────────────────────────────────────────────────────

export const stageMoveSchema = z
  .object({
    stage: z.enum(MOVABLE_STAGES),
    /** Required when rejecting or withdrawing. */
    reason: z.string().trim().min(3).max(500).optional(),
    /** Tells a rejected candidate by email, in their language. */
    emailCandidate: z.boolean().default(false),
  })
  .refine((m) => (m.stage !== 'rejected' && m.stage !== 'withdrawn') || !!m.reason, {
    message: 'Give a reason',
    path: ['reason'],
  });
export type StageMoveInput = z.infer<typeof stageMoveSchema>;

export const applicationNoteSchema = z.object({ note: z.string().trim().min(1).max(2000) });
export type ApplicationNoteInput = z.infer<typeof applicationNoteSchema>;

export const candidateListQuerySchema = z.object({
  /** Name, email or mobile number. */
  search: z.string().trim().max(100).optional(),
  talentPool: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  openingId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;

export const candidateUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: email.nullable(),
    phone: bdMobileSchema.nullable(),
    notes: optionalText(4000),
    talentPool: z.boolean(),
    language: z.enum(['en', 'bn']),
  })
  .partial();
export type CandidateUpdateInput = z.infer<typeof candidateUpdateSchema>;

/** Sources HR adds people from by hand; the careers page adds its own. */
export const HAND_SOURCES = [
  'referral',
  'walk_in',
  'agency',
  'bdjobs',
  'linkedin',
  'other',
] as const satisfies readonly CandidateSource[];

/** Adding a person to an opening by hand (multipart; the CV is the file `cv`). */
export const candidateAddSchema = z
  .object({
    openingId: z.uuid(),
    fullName: z.string().trim().min(2).max(120),
    email: z.preprocess((v) => (v === '' ? undefined : v), email.optional()),
    phone: z.preprocess((v) => (v === '' ? undefined : v), bdMobileSchema.optional()),
    source: z.enum(HAND_SOURCES),
    referredByEmployeeId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
    /** HR records that the person agreed to their data being kept for this application. */
    consent: formBoolean.pipe(
      z.literal(true, { error: 'Record that the candidate agreed to us keeping their data' }),
    ),
    talentPool: formBoolean.optional(),
    language: z.enum(['en', 'bn']).default('en'),
    coverNote: optionalText(3000),
    notes: optionalText(4000),
  })
  .superRefine((c, ctx) => {
    if (!c.email && !c.phone) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Give an email or a mobile number',
      });
    }
    if (c.referredByEmployeeId && c.source !== 'referral') {
      ctx.addIssue({
        code: 'custom',
        path: ['referredByEmployeeId'],
        message: 'Only a referral has a referring employee',
      });
    }
  });
export type CandidateAddInput = z.infer<typeof candidateAddSchema>;

export const interviewSchema = z
  .object({
    kind: z.enum(INTERVIEW_KINDS),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    /** The place for in-person interviews, or a note for phone ones. */
    location: optionalText(300),
    meetingUrl: z
      .url({ protocol: /^https?$/ })
      .max(500)
      .nullable()
      .optional(),
    /** Employees with logins. */
    interviewerIds: z
      .array(z.uuid())
      .min(1, 'Choose at least one interviewer')
      .max(10, 'Choose at most 10 interviewers')
      .refine((ids) => new Set(ids).size === ids.length, 'Each interviewer once'),
    notes: optionalText(2000),
  })
  .superRefine((i, ctx) => {
    const start = Date.parse(i.startsAt);
    const end = Date.parse(i.endsAt);
    if (end <= start) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End after it starts' });
    } else if (end - start > 12 * 3_600_000) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Keep it within 12 hours' });
    }
    if (i.kind === 'video' && !i.meetingUrl) {
      ctx.addIssue({ code: 'custom', path: ['meetingUrl'], message: 'Give the meeting link' });
    }
    if (i.kind === 'in_person' && !i.location) {
      ctx.addIssue({ code: 'custom', path: ['location'], message: 'Give the place' });
    }
  });
export type InterviewInput = z.infer<typeof interviewSchema>;

export const interviewCancelSchema = z.object({ reason: optionalText(500) });
export type InterviewCancelInput = z.infer<typeof interviewCancelSchema>;

export const interviewerQuerySchema = z.object({ search: z.string().trim().max(100).optional() });
export type InterviewerQuery = z.infer<typeof interviewerQuerySchema>;

/** A rating from 1 to 5 for each of the opening's criteria, a recommendation and notes. */
export const scorecardSchema = z.object({
  ratings: z.record(z.string().trim().min(1).max(80), z.number().int().min(1).max(5)),
  recommendation: z.enum(RECOMMENDATIONS),
  feedback: optionalText(4000),
});
export type ScorecardInput = z.infer<typeof scorecardSchema>;

// ── Views ────────────────────────────────────────────────────────────────────

/** What the signed-in login has to do with recruitment, for the navigation. */
export interface RecruitmentMe {
  manage: boolean;
  /** Hiring manager of an opening still being filled. */
  hiringManager: boolean;
  /** Interviews they are on that need them: still to come, or over without their scorecard. */
  interviews: number;
}

/** An opening as the pipeline, an application and an interview show it. */
export interface PipelineOpening {
  id: string;
  title: string;
  postTitleEn: string | null;
  postTitleBn: string | null;
  status: OpeningStatus;
  legalEntity: Ref;
  hiringManager: EmployeeRef | null;
  scorecardCriteria: string[];
}

export interface PipelineCard {
  id: string;
  candidate: { id: string; fullName: string; erased: boolean };
  stage: ApplicationStage;
  source: CandidateSource;
  appliedAt: string;
  stageChangedAt: string;
  rejectionReason: string | null;
  /** Interviews not cancelled. */
  interviews: number;
  /** The mean of every submitted rating, to one decimal; null before any scorecard. */
  averageRating: number | null;
  /** Where the signed-in login may move it now. */
  moves: MovableStage[];
}

export interface PipelineView {
  opening: PipelineOpening;
  /** Every stage in order, with its applications, latest moved first. */
  columns: { stage: ApplicationStage; applications: PipelineCard[] }[];
  /** May add candidates and reopen rejected ones. */
  manage: boolean;
}

export interface CandidateCv {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface CandidateListItem {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  source: CandidateSource;
  talentPool: boolean;
  /** The openings they applied to (that the login may see), with the stage reached. */
  applications: { id: string; openingId: string; openingTitle: string; stage: ApplicationStage }[];
  createdAt: string;
  updatedAt: string;
}

export interface CandidateApplicationRow {
  id: string;
  opening: { id: string; title: string; status: OpeningStatus };
  stage: ApplicationStage;
  source: CandidateSource;
  appliedAt: string;
  stageChangedAt: string;
}

export interface CandidateDetail {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  source: CandidateSource;
  language: 'en' | 'bn';
  referredBy: EmployeeRef | null;
  cv: CandidateCv | null;
  consentAt: string | null;
  talentPool: boolean;
  notes: string | null;
  erasedAt: string | null;
  /** Hired from one of their applications: never erased. */
  hired: boolean;
  createdAt: string;
  updatedAt: string;
  applications: CandidateApplicationRow[];
}

export interface CandidateAdded {
  candidateId: string;
  applicationId: string;
  /** False when the person was found again by email or mobile. */
  newCandidate: boolean;
}

/** Contact details read from a CV to fill the add-by-hand form; HR checks them. */
export interface CvContacts {
  fullName: string | null;
  email: string | null;
  /** 01XXXXXXXXX. */
  phone: string | null;
  /** Typed in a legacy Bangla font (Bijoy, SutonnyMJ), which cannot be read reliably. */
  legacyBangla: boolean;
}

export interface ApplicationEventView {
  id: string;
  kind: 'stage' | 'note' | 'email' | 'interview' | 'offer';
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage | null;
  note: string | null;
  /** Null for the candidate's own actions and for the system. */
  actor: { id: string; name: string } | null;
  createdAt: string;
}

export interface ScorecardView {
  ratings: Record<string, number>;
  recommendation: Recommendation;
  feedback: string | null;
  submittedAt: string;
}

export interface PanelMemberView {
  employee: EmployeeRef;
  /** Null until submitted, or while the reader may not see it yet. */
  scorecard: ScorecardView | null;
  submitted: boolean;
}

export interface InterviewView {
  id: string;
  applicationId: string;
  kind: InterviewKind;
  startsAt: string;
  endsAt: string;
  location: string | null;
  meetingUrl: string | null;
  status: InterviewStatus;
  notes: string | null;
  panel: PanelMemberView[];
}

export interface ApplicationDetail {
  id: string;
  stage: ApplicationStage;
  stageChangedAt: string;
  rejectionReason: string | null;
  source: CandidateSource;
  coverNote: string | null;
  appliedAt: string;
  employeeId: string | null;
  candidate: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    language: 'en' | 'bn';
    talentPool: boolean;
    cv: CandidateCv | null;
    erased: boolean;
  };
  opening: PipelineOpening;
  events: ApplicationEventView[];
  interviews: InterviewView[];
  /** Where the signed-in login may move it now. */
  moves: MovableStage[];
  manage: boolean;
}

/** One of the login's interviews, as their list shows it. */
export interface MyInterviewItem {
  id: string;
  kind: InterviewKind;
  startsAt: string;
  endsAt: string;
  location: string | null;
  meetingUrl: string | null;
  status: InterviewStatus;
  candidateName: string;
  opening: { id: string; title: string; postTitleEn: string | null; postTitleBn: string | null };
  submitted: boolean;
}

export interface MyInterviews {
  upcoming: MyInterviewItem[];
  /** Latest first. */
  past: MyInterviewItem[];
}

/** An interview as an interviewer sees it: the candidate, the CV, the note and scorecards. */
export interface MyInterviewDetail extends MyInterviewItem {
  applicationId: string;
  notes: string | null;
  hasCv: boolean;
  coverNote: string | null;
  criteria: string[];
  /** The scorecard may be submitted or changed (until the application closes). */
  scorable: boolean;
  mine: ScorecardView | null;
  /** Other interviewers' scorecards for this application, once the reader submitted theirs. */
  others: { employee: EmployeeRef; scorecard: ScorecardView }[];
  /** Everyone on this interview's panel and whether they submitted (scorecards as above). */
  panel: PanelMemberView[];
}
