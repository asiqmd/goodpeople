import type {
  Competency,
  CycleStatus,
  GoalKind,
  GoalStatus,
  KpiDirection,
  KpiSource,
  PeerStatus,
  PlanStatus,
  ProbationRecommendation,
  ReviewStatus,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { employees, orgUnits } from './hr.js';
import { tenants } from './platform.js';

// Phase 4 M2, performance: goals and their check-ins, review cycles with each person's review
// and peer feedback, improvement plans and probation reviews. Tenant data under row-level
// security (migration 0035).

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const instant = (name: string) => timestamp(name, { withTimezone: true });
const isoDate = (name: string) => date(name, { mode: 'string' });
const rating = (name: string) => integer(name);
const tenantFk = (
  name: string,
  t: { tenantId: AnyPgColumn },
  column: AnyPgColumn,
  target: { tenantId: AnyPgColumn; id: AnyPgColumn },
) =>
  foreignKey({
    name,
    columns: [t.tenantId, column],
    foreignColumns: [target.tenantId, target.id],
  });
const ratingCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} is null or ${column} between 1 and 5`);

/** One row per workspace: the competencies reviews rate, and the ratings guide. */
export const performanceSettings = pgTable('performance_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  competencies: jsonb('competencies').$type<Competency[]>().notNull(),
  /** Rating (1–5) → the share of final ratings usually given it, in percent. */
  ratingGuide: jsonb('rating_guide').$type<Record<string, number>>().notNull(),
  updatedAt: updatedAt(),
});

export const reviewCycles = pgTable(
  'review_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    periodStart: isoDate('period_start').notNull(),
    periodEnd: isoDate('period_end').notNull(),
    /** Companies in the cycle; empty for every company. */
    legalEntityIds: uuid('legal_entity_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Only people who joined on or before this date (a cycle's newcomers are left out). */
    joinedOnOrBefore: isoDate('joined_on_or_before'),
    selfReview: boolean('self_review').notNull().default(true),
    peerReview: boolean('peer_review').notNull().default(false),
    /** The competencies rated, copied when the cycle is created. */
    competencies: jsonb('competencies').$type<Competency[]>().notNull(),
    goalsDueOn: isoDate('goals_due_on'),
    selfDueOn: isoDate('self_due_on'),
    peerDueOn: isoDate('peer_due_on'),
    managerDueOn: isoDate('manager_due_on'),
    calibrationDueOn: isoDate('calibration_due_on'),
    status: text('status').$type<CycleStatus>().notNull().default('draft'),
    launchedAt: instant('launched_at'),
    releasedAt: instant('released_at'),
    closedAt: instant('closed_at'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('review_cycles_tenant_id_uq').on(t.tenantId, t.id),
    index('review_cycles_status_idx').on(t.tenantId, t.status),
    check('review_cycles_period_ck', sql`${t.periodEnd} >= ${t.periodStart}`),
  ],
);

/** A person's goal (or a unit's, which people align theirs with), with how it is measured. */
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id'),
    orgUnitId: uuid('org_unit_id'),
    cycleId: uuid('cycle_id'),
    /** The unit's (or the manager's) goal this one serves. */
    parentGoalId: uuid('parent_goal_id'),
    title: text('title').notNull(),
    description: text('description'),
    kind: text('kind').$type<GoalKind>().notNull(),
    /** An objective's key results, each done or not. */
    keyResults: jsonb('key_results')
      .$type<{ text: string; done: boolean }[]>()
      .notNull()
      .default([]),
    // A KPI's measure.
    measureUnit: text('measure_unit'),
    target: numeric('target', { precision: 14, scale: 2 }),
    direction: text('direction').$type<KpiDirection>(),
    source: text('source').$type<KpiSource>().notNull().default('manual'),
    currentValue: numeric('current_value', { precision: 14, scale: 2 }),
    /** 0–100, from the key results, the measure, or as last updated. */
    progress: integer('progress').notNull().default(0),
    /** Percent of the person's goals for the cycle. */
    weight: numeric('weight', { precision: 5, scale: 2 }),
    startsOn: isoDate('starts_on'),
    dueOn: isoDate('due_on'),
    status: text('status').$type<GoalStatus>().notNull().default('draft'),
    agreedAt: instant('agreed_at'),
    agreedByUserId: uuid('agreed_by_user_id'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('goals_tenant_id_uq').on(t.tenantId, t.id),
    index('goals_employee_idx').on(t.tenantId, t.employeeId, t.cycleId),
    index('goals_unit_idx').on(t.tenantId, t.orgUnitId),
    tenantFk('goals_employee_fk', t, t.employeeId, employees),
    tenantFk('goals_unit_fk', t, t.orgUnitId, orgUnits),
    tenantFk('goals_cycle_fk', t, t.cycleId, reviewCycles),
    tenantFk('goals_parent_fk', t, t.parentGoalId, { tenantId: t.tenantId, id: t.id }),
    check('goals_owner_ck', sql`${t.employeeId} is not null or ${t.orgUnitId} is not null`),
    check('goals_progress_ck', sql`${t.progress} between 0 and 100`),
    check('goals_weight_ck', sql`${t.weight} is null or ${t.weight} between 0 and 100`),
  ],
);

export const goalCheckins = pgTable(
  'goal_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    goalId: uuid('goal_id').notNull(),
    progress: integer('progress'),
    value: numeric('value', { precision: 14, scale: 2 }),
    note: text('note'),
    authorUserId: uuid('author_user_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('goal_checkins_goal_idx').on(t.tenantId, t.goalId, t.createdAt),
    tenantFk('goal_checkins_goal_fk', t, t.goalId, goals),
  ],
);

export interface ReviewAnswers {
  /** Goal id → rating and comment. */
  goals: Record<string, { rating: number; comment?: string }>;
  /** Competency key → rating and comment. */
  competencies: Record<string, { rating: number; comment?: string }>;
  overall?: string;
}

export interface ReviewRecommendations {
  increment: boolean;
  promotionDesignationId: string | null;
  plan: boolean;
}

/** One person's review in a cycle, from self review to their acknowledgement. */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    cycleId: uuid('cycle_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    /** Their manager when the cycle was launched, who writes the review. */
    managerEmployeeId: uuid('manager_employee_id'),
    status: text('status').$type<ReviewStatus>().notNull(),
    selfAnswers: jsonb('self_answers').$type<ReviewAnswers>(),
    selfSubmittedAt: instant('self_submitted_at'),
    managerAnswers: jsonb('manager_answers').$type<ReviewAnswers>(),
    managerSubmittedAt: instant('manager_submitted_at'),
    /** The goals' weighted rating, 1.00–5.00, from the manager's ratings. */
    goalScore: numeric('goal_score', { precision: 3, scale: 2 }),
    proposedRating: rating('proposed_rating'),
    recommendations: jsonb('recommendations').$type<ReviewRecommendations>(),
    finalRating: rating('final_rating'),
    /** Why calibration changed the proposed rating. */
    calibrationNote: text('calibration_note'),
    calibratedByUserId: uuid('calibrated_by_user_id'),
    calibratedAt: instant('calibrated_at'),
    releasedAt: instant('released_at'),
    acknowledgedAt: instant('acknowledged_at'),
    employeeComment: text('employee_comment'),
    /** Whether the person agreed with the review when acknowledging it. */
    employeeAgrees: boolean('employee_agrees'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('reviews_tenant_id_uq').on(t.tenantId, t.id),
    unique('reviews_cycle_employee_uq').on(t.cycleId, t.employeeId),
    index('reviews_manager_idx').on(t.tenantId, t.managerEmployeeId, t.status),
    tenantFk('reviews_cycle_fk', t, t.cycleId, reviewCycles),
    tenantFk('reviews_employee_fk', t, t.employeeId, employees),
    tenantFk('reviews_manager_fk', t, t.managerEmployeeId, employees),
    ratingCheck('reviews_proposed_ck', t.proposedRating),
    ratingCheck('reviews_final_ck', t.finalRating),
  ],
);

/** A peer asked for feedback on a review, and what they wrote. */
export const peerFeedback = pgTable(
  'peer_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    reviewId: uuid('review_id').notNull(),
    peerEmployeeId: uuid('peer_employee_id').notNull(),
    status: text('status').$type<PeerStatus>().notNull().default('proposed'),
    proposedByUserId: uuid('proposed_by_user_id'),
    /** Question key → answer text. */
    answers: jsonb('answers').$type<Record<string, string>>(),
    rating: rating('rating'),
    submittedAt: instant('submitted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('peer_feedback_review_peer_uq').on(t.reviewId, t.peerEmployeeId),
    index('peer_feedback_peer_idx').on(t.tenantId, t.peerEmployeeId, t.status),
    tenantFk('peer_feedback_review_fk', t, t.reviewId, reviews),
    tenantFk('peer_feedback_peer_fk', t, t.peerEmployeeId, employees),
    ratingCheck('peer_feedback_rating_ck', t.rating),
  ],
);

/** A plan for someone to improve, with its measures, support, check-ins and outcome. */
export const improvementPlans = pgTable(
  'improvement_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    managerEmployeeId: uuid('manager_employee_id'),
    /** The review that recommended it, if one did. */
    reviewId: uuid('review_id'),
    reason: text('reason').notNull(),
    startsOn: isoDate('starts_on').notNull(),
    endsOn: isoDate('ends_on').notNull(),
    objectives: jsonb('objectives').$type<{ text: string; measure: string }[]>().notNull(),
    support: text('support'),
    status: text('status').$type<PlanStatus>().notNull().default('draft'),
    outcomeNote: text('outcome_note'),
    decidedAt: instant('decided_at'),
    acknowledgedAt: instant('acknowledged_at'),
    employeeComment: text('employee_comment'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('improvement_plans_tenant_id_uq').on(t.tenantId, t.id),
    index('improvement_plans_employee_idx').on(t.tenantId, t.employeeId),
    tenantFk('improvement_plans_employee_fk', t, t.employeeId, employees),
    tenantFk('improvement_plans_manager_fk', t, t.managerEmployeeId, employees),
    tenantFk('improvement_plans_review_fk', t, t.reviewId, reviews),
    check('improvement_plans_period_ck', sql`${t.endsOn} > ${t.startsOn}`),
  ],
);

export const planCheckins = pgTable(
  'plan_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    planId: uuid('plan_id').notNull(),
    heldOn: isoDate('held_on').notNull(),
    note: text('note').notNull(),
    authorUserId: uuid('author_user_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('plan_checkins_plan_idx').on(t.tenantId, t.planId),
    tenantFk('plan_checkins_plan_fk', t, t.planId, improvementPlans),
  ],
);

/** The manager's review before a probation ends (Labour Act s.4), and what HR did with it. */
export const probationReviews = pgTable(
  'probation_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    managerEmployeeId: uuid('manager_employee_id'),
    /** The probation end this review is for (a probation extended gets another). */
    probationEndsOn: isoDate('probation_ends_on').notNull(),
    /** Competency key → 1–5. */
    ratings: jsonb('ratings').$type<Record<string, number>>(),
    recommendation: text('recommendation').$type<ProbationRecommendation>(),
    comment: text('comment'),
    submittedAt: instant('submitted_at'),
    /** When HR confirmed, extended or ended the probation after it. */
    actedAt: instant('acted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('probation_reviews_employee_end_uq').on(t.employeeId, t.probationEndsOn),
    index('probation_reviews_manager_idx').on(t.tenantId, t.managerEmployeeId),
    tenantFk('probation_reviews_employee_fk', t, t.employeeId, employees),
    tenantFk('probation_reviews_manager_fk', t, t.managerEmployeeId, employees),
  ],
);
