// Recruitment (Phase 4 M1): openings approved against a budget, the careers page, candidates
// and their applications through a pipeline, interviews with scorecards, and offers accepted
// online. Each area's input schemas and views live in openings.ts, applications.ts and
// offers.ts.

/**
 * - `draft`, `pending_approval`, `rejected`: before HR may post it.
 * - `approved`: may be posted; `open`: on the careers page.
 * - `closed` (by hand or on its closing date), `filled` (every position hired), `cancelled`.
 */
export const OPENING_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'open',
  'closed',
  'filled',
  'cancelled',
] as const;
export type OpeningStatus = (typeof OPENING_STATUSES)[number];

export const OPENING_REASONS = ['new_position', 'replacement'] as const;
export type OpeningReason = (typeof OPENING_REASONS)[number];

/** In order; `rejected` and `withdrawn` can follow any stage before `hired`. */
export const APPLICATION_STAGES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/** Stages after which an application is over. */
export const isClosedStage = (stage: ApplicationStage) =>
  stage === 'hired' || stage === 'rejected' || stage === 'withdrawn';

export const CANDIDATE_SOURCES = [
  'careers_page',
  'referral',
  'walk_in',
  'agency',
  'bdjobs',
  'linkedin',
  'other',
] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const INTERVIEW_KINDS = ['in_person', 'phone', 'video'] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

export const INTERVIEW_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const RECOMMENDATIONS = ['strong_no', 'no', 'yes', 'strong_yes'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

/** What an opening's scorecard asks unless HR sets its own criteria. */
export const DEFAULT_SCORECARD_CRITERIA = [
  'Skills for the job',
  'Experience',
  'Communication',
  'Attitude and teamwork',
] as const;

/**
 * - `draft`; `pending_approval` when above the opening's budget; `approved`.
 * - `sent`: the candidate has the link; `accepted`, `declined`, `expired`, `withdrawn`.
 */
export const OFFER_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'sent',
  'accepted',
  'declined',
  'expired',
  'withdrawn',
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** How long a candidate's data is kept after their last application closed, by default. */
export const DEFAULT_CANDIDATE_RETENTION_MONTHS = 12;

/** CVs: PDF or Word, checked by their bytes. */
export const CV_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const CV_MAX_BYTES = 5 * 1024 * 1024;
