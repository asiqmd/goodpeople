import type {
  ApplicationStage,
  CandidateSource,
  EmploymentType,
  InterviewKind,
  InterviewStatus,
  OfferStatus,
  OpeningReason,
  OpeningStatus,
  Recommendation,
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
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { designations, employees, grades, locations, orgUnits } from './hr.js';
import { tenants } from './platform.js';
import { legalEntities } from './tenant.js';

// Phase 4 M1, recruitment: openings approved against a budget and posted on the careers page,
// candidates and their applications through the pipeline, interviews with scorecards, and
// offers accepted online. Tenant data under row-level security (migration 0033).

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const instant = (name: string) => timestamp(name, { withTimezone: true });
const isoDate = (name: string) => date(name, { mode: 'string' });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
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

/** One row per workspace: the careers page and how long candidates' data is kept. */
export const recruitmentSettings = pgTable('recruitment_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  careersEnabled: boolean('careers_enabled').notNull().default(false),
  introEn: text('intro_en'),
  introBn: text('intro_bn'),
  /** Months a candidate's data is kept after their last application closed. */
  retentionMonths: integer('retention_months').notNull().default(12),
  /** Where candidates write about their data; the workspace's own address. */
  privacyEmail: text('privacy_email'),
  updatedAt: updatedAt(),
});

/** A position to fill, approved against a budget, and its job post once published. */
export const jobOpenings = pgTable(
  'job_openings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    legalEntityId: uuid('legal_entity_id').notNull(),
    orgUnitId: uuid('org_unit_id'),
    locationId: uuid('location_id'),
    designationId: uuid('designation_id'),
    gradeId: uuid('grade_id'),
    /** Internal title, e.g. "Sewing operator, line 4". */
    title: text('title').notNull(),
    employmentType: text('employment_type').$type<EmploymentType>().notNull(),
    headcount: integer('headcount').notNull().default(1),
    reason: text('reason').$type<OpeningReason>().notNull().default('new_position'),
    replacesEmployeeId: uuid('replaces_employee_id'),
    /** Monthly gross pay budgeted for each position. */
    budgetMin: money('budget_min'),
    budgetMax: money('budget_max'),
    justification: text('justification'),
    hiringManagerEmployeeId: uuid('hiring_manager_employee_id'),
    status: text('status').$type<OpeningStatus>().notNull().default('draft'),
    // The job post, written once the opening is approved.
    postTitleEn: text('post_title_en'),
    postTitleBn: text('post_title_bn'),
    /** Markdown subset, as the help centre renders it. */
    descriptionEn: text('description_en'),
    descriptionBn: text('description_bn'),
    showSalary: boolean('show_salary').notNull().default(false),
    closesOn: isoDate('closes_on'),
    publishedAt: instant('published_at'),
    closedAt: instant('closed_at'),
    /** What each interviewer rates, 1 to 5. */
    scorecardCriteria: jsonb('scorecard_criteria').$type<string[]>().notNull().default([]),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('job_openings_tenant_id_uq').on(t.tenantId, t.id),
    index('job_openings_status_idx').on(t.tenantId, t.status),
    tenantFk('job_openings_entity_fk', t, t.legalEntityId, legalEntities),
    tenantFk('job_openings_unit_fk', t, t.orgUnitId, orgUnits),
    tenantFk('job_openings_location_fk', t, t.locationId, locations),
    tenantFk('job_openings_designation_fk', t, t.designationId, designations),
    tenantFk('job_openings_grade_fk', t, t.gradeId, grades),
    tenantFk('job_openings_replaces_fk', t, t.replacesEmployeeId, employees),
    tenantFk('job_openings_manager_fk', t, t.hiringManagerEmployeeId, employees),
    check('job_openings_headcount_ck', sql`${t.headcount} between 1 and 1000`),
    check(
      'job_openings_budget_ck',
      sql`${t.budgetMin} is null or ${t.budgetMax} is null or ${t.budgetMin} <= ${t.budgetMax}`,
    ),
  ],
);

/**
 * A person who applied or was added, found again by email or mobile. Erasing a candidate
 * blanks the person and deletes the CV but keeps the applications' counts and stages.
 */
export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    fullName: text('full_name').notNull(),
    /** Lower-cased. */
    email: text('email'),
    /** E.164, e.g. +8801712345678. */
    phone: text('phone'),
    source: text('source').$type<CandidateSource>().notNull(),
    /** The language they applied in, which emails to them use. */
    language: text('language').$type<'en' | 'bn'>().notNull().default('en'),
    referredByEmployeeId: uuid('referred_by_employee_id'),
    // The latest CV, encrypted in the document store like other documents.
    cvStorageKey: text('cv_storage_key'),
    cvFileName: text('cv_file_name'),
    cvContentType: text('cv_content_type'),
    cvSizeBytes: integer('cv_size_bytes'),
    /** Consent to process the application, given when applying (or recorded by HR). */
    consentAt: instant('consent_at'),
    /** Agreed to be kept for other jobs after this one. */
    talentPool: boolean('talent_pool').notNull().default(false),
    notes: text('notes'),
    erasedAt: instant('erased_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('candidates_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('candidates_email_uq')
      .on(t.tenantId, t.email)
      .where(sql`${t.email} is not null and ${t.erasedAt} is null`),
    index('candidates_phone_idx').on(t.tenantId, t.phone),
    tenantFk('candidates_referrer_fk', t, t.referredByEmployeeId, employees),
  ],
);

/** A candidate's application to one opening, moving through the stages. */
export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    openingId: uuid('opening_id').notNull(),
    candidateId: uuid('candidate_id').notNull(),
    stage: text('stage').$type<ApplicationStage>().notNull().default('applied'),
    stageChangedAt: instant('stage_changed_at').notNull().defaultNow(),
    rejectionReason: text('rejection_reason'),
    source: text('source').$type<CandidateSource>().notNull(),
    coverNote: text('cover_note'),
    /** Set when the candidate was hired. */
    employeeId: uuid('employee_id'),
    appliedAt: instant('applied_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('applications_tenant_id_uq').on(t.tenantId, t.id),
    unique('applications_opening_candidate_uq').on(t.openingId, t.candidateId),
    index('applications_opening_idx').on(t.tenantId, t.openingId, t.stage),
    tenantFk('applications_opening_fk', t, t.openingId, jobOpenings),
    tenantFk('applications_candidate_fk', t, t.candidateId, candidates),
    tenantFk('applications_employee_fk', t, t.employeeId, employees),
  ],
);

/** What happened to an application: stage moves, notes, emails; who and when. */
export const applicationEvents = pgTable(
  'application_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    applicationId: uuid('application_id').notNull(),
    kind: text('kind').$type<'stage' | 'note' | 'email' | 'interview' | 'offer'>().notNull(),
    fromStage: text('from_stage').$type<ApplicationStage>(),
    toStage: text('to_stage').$type<ApplicationStage>(),
    note: text('note'),
    /** Null for the candidate's own actions (applying, accepting). */
    actorUserId: uuid('actor_user_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('application_events_application_idx').on(t.tenantId, t.applicationId, t.createdAt),
    tenantFk('application_events_application_fk', t, t.applicationId, applications),
  ],
);

export const interviews = pgTable(
  'interviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    applicationId: uuid('application_id').notNull(),
    kind: text('kind').$type<InterviewKind>().notNull(),
    startsAt: instant('starts_at').notNull(),
    endsAt: instant('ends_at').notNull(),
    /** A place for in-person interviews, or a note for phone. */
    location: text('location'),
    meetingUrl: text('meeting_url'),
    status: text('status').$type<InterviewStatus>().notNull().default('scheduled'),
    /** The calendar invitation's UID and SEQUENCE (RFC 5545), so updates replace it. */
    icsUid: text('ics_uid').notNull(),
    icsSequence: integer('ics_sequence').notNull().default(0),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('interviews_tenant_id_uq').on(t.tenantId, t.id),
    index('interviews_application_idx').on(t.tenantId, t.applicationId),
    tenantFk('interviews_application_fk', t, t.applicationId, applications),
    check('interviews_time_ck', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/** An interviewer on an interview, and the scorecard they submit. */
export const interviewPanel = pgTable(
  'interview_panel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    interviewId: uuid('interview_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    /** Criterion → 1 to 5. */
    ratings: jsonb('ratings').$type<Record<string, number>>(),
    recommendation: text('recommendation').$type<Recommendation>(),
    feedback: text('feedback'),
    submittedAt: instant('submitted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('interview_panel_member_uq').on(t.interviewId, t.employeeId),
    index('interview_panel_employee_idx').on(t.tenantId, t.employeeId),
    tenantFk('interview_panel_interview_fk', t, t.interviewId, interviews),
    tenantFk('interview_panel_employee_fk', t, t.employeeId, employees),
  ],
);

/** An offer of a job to a candidate, its letter, and the candidate's answer. */
export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    applicationId: uuid('application_id').notNull(),
    status: text('status').$type<OfferStatus>().notNull().default('draft'),
    legalEntityId: uuid('legal_entity_id').notNull(),
    orgUnitId: uuid('org_unit_id'),
    locationId: uuid('location_id'),
    designationId: uuid('designation_id'),
    gradeId: uuid('grade_id'),
    employmentType: text('employment_type').$type<EmploymentType>().notNull(),
    joiningOn: isoDate('joining_on').notNull(),
    monthlyGross: money('monthly_gross').notNull(),
    probationMonths: integer('probation_months'),
    expiresOn: isoDate('expires_on').notNull(),
    language: text('language').$type<'en' | 'bn'>().notNull().default('en'),
    /** Anything else the letter says (benefits, conditions), as HR wrote it. */
    terms: text('terms'),
    /** The candidate's link: only its hash is kept. */
    tokenHash: text('token_hash'),
    sentAt: instant('sent_at'),
    decidedAt: instant('decided_at'),
    /** The name the candidate typed to accept, and where from. */
    acceptedName: text('accepted_name'),
    acceptedIp: text('accepted_ip'),
    declineReason: text('decline_reason'),
    /** The letter as accepted, stored encrypted, and the SHA-256 of its bytes. */
    letterStorageKey: text('letter_storage_key'),
    letterSha256: text('letter_sha256'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('offers_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('offers_token_uq').on(t.tokenHash),
    index('offers_application_idx').on(t.tenantId, t.applicationId),
    tenantFk('offers_application_fk', t, t.applicationId, applications),
    tenantFk('offers_entity_fk', t, t.legalEntityId, legalEntities),
    tenantFk('offers_unit_fk', t, t.orgUnitId, orgUnits),
    tenantFk('offers_location_fk', t, t.locationId, locations),
    tenantFk('offers_designation_fk', t, t.designationId, designations),
    tenantFk('offers_grade_fk', t, t.gradeId, grades),
  ],
);
