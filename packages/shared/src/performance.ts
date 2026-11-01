// Performance (Phase 4 M2): goals and KPIs, review cycles with self, peer and manager reviews,
// calibration, improvement plans and probation reviews. Each area's input schemas and views live
// in goals.ts, reviews.ts and development.ts.

/** An objective has key results; a KPI has a measure and a target. */
export const GOAL_KINDS = ['objective', 'kpi'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

/** `draft` until the manager agrees it; then `agreed`; finally `completed` or `dropped`. */
export const GOAL_STATUSES = ['draft', 'agreed', 'completed', 'dropped'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/**
 * Where a KPI's value comes from: typed in, or read from the records — the share of working
 * days attended (processed attendance), or output against target (daily production, RMG pack).
 */
export const KPI_SOURCES = ['manual', 'attendance_rate', 'production_target'] as const;
export type KpiSource = (typeof KPI_SOURCES)[number];

export const KPI_DIRECTIONS = ['higher', 'lower'] as const;
export type KpiDirection = (typeof KPI_DIRECTIONS)[number];

/** Every rating in a review is 1 (well below) to 5 (well above expectations). */
export const RATINGS = [1, 2, 3, 4, 5] as const;
export type Rating = (typeof RATINGS)[number];

/**
 * - `draft`: being set up; `active`: launched, reviews under way.
 * - `calibration`: manager reviews in, HR settling final ratings.
 * - `released`: people can read their reviews; `closed`: done.
 */
export const CYCLE_STATUSES = ['draft', 'active', 'calibration', 'released', 'closed'] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

/** Where one person's review is. Without self reviews it starts at `manager`. */
export const REVIEW_STATUSES = [
  'self',
  'manager',
  'calibration',
  'released',
  'acknowledged',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const PEER_STATUSES = ['proposed', 'approved', 'declined', 'submitted'] as const;
export type PeerStatus = (typeof PEER_STATUSES)[number];

/** Peer feedback is shown to the person only together, and only from at least this many. */
export const MIN_PEERS_SHOWN = 3;

export const PLAN_STATUSES = [
  'draft',
  'active',
  'extended',
  'successful',
  'not_met',
  'cancelled',
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PROBATION_RECOMMENDATIONS = ['confirm', 'extend', 'end'] as const;
export type ProbationRecommendation = (typeof PROBATION_RECOMMENDATIONS)[number];

export interface Competency {
  key: string;
  en: string;
  bn: string;
}

/** What reviews rate besides goals, unless the workspace or a cycle sets its own. */
export const DEFAULT_COMPETENCIES: readonly Competency[] = [
  { key: 'job_knowledge', en: 'Job knowledge and skill', bn: 'কাজের জ্ঞান ও দক্ষতা' },
  { key: 'quality', en: 'Quality of work', bn: 'কাজের মান' },
  { key: 'teamwork', en: 'Teamwork and communication', bn: 'দলগত কাজ ও যোগাযোগ' },
  { key: 'reliability', en: 'Reliability and attendance', bn: 'নির্ভরযোগ্যতা ও উপস্থিতি' },
  { key: 'safety', en: 'Safety and compliance', bn: 'নিরাপত্তা ও নিয়ম মানা' },
];

/** A guide to how final ratings usually spread, in percent; never enforced as a quota. */
export const DEFAULT_RATING_GUIDE: Readonly<Record<Rating, number>> = {
  1: 5,
  2: 15,
  3: 50,
  4: 20,
  5: 10,
};
