import type {
  SurveyInput,
  SurveyTotals,
  RecognitionInput,
  HrRequestInput,
  HrRequestView,
  AssetInput,
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
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { employees } from './hr.js';
import { tenants } from './platform.js';
import { legalEntities, tenantUsers } from './tenant.js';
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const instant = (name: string) => timestamp(name, { withTimezone: true });
const day = (name: string) => date(name, { mode: 'string' });
const fk = (
  name: string,
  t: { tenantId: AnyPgColumn },
  column: AnyPgColumn,
  target: { tenantId: AnyPgColumn; id: AnyPgColumn },
) =>
  foreignKey({ name, columns: [t.tenantId, column], foreignColumns: [target.tenantId, target.id] });

export const engagementSurveys = pgTable(
  'engagement_surveys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    title: text('title').notNull(),
    titleBn: text('title_bn').notNull(),
    description: text('description').notNull(),
    descriptionBn: text('description_bn').notNull(),
    questions: jsonb('questions').$type<SurveyInput['questions']>().notNull(),
    threshold: integer('threshold').notNull().default(5),
    closesAt: instant('closes_at').notNull(),
    status: text('status').$type<'draft' | 'open' | 'closed'>().notNull().default('draft'),
    audienceCount: integer('audience_count').notNull().default(0),
    totals: jsonb('totals').$type<SurveyTotals>().notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('engagement_surveys_tenant_id_uq').on(t.tenantId, t.id),
    fk('engagement_surveys_company_fk', t, t.legalEntityId, legalEntities),
    check('engagement_surveys_threshold_ck', sql`${t.threshold} between 5 and 100`),
    check('engagement_surveys_status_ck', sql`${t.status} in ('draft','open','closed')`),
  ],
);

/** Eligibility/participation only. No answers or response timestamps. */
export const surveyParticipants = pgTable(
  'survey_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    surveyId: uuid('survey_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    submitted: boolean('submitted').notNull().default(false),
  },
  (t) => [
    unique('survey_participants_tenant_id_uq').on(t.tenantId, t.id),
    unique('survey_participants_person_uq').on(t.surveyId, t.employeeId),
    fk('survey_participants_survey_fk', t, t.surveyId, engagementSurveys),
    fk('survey_participants_employee_fk', t, t.employeeId, employees),
  ],
);

export const recognitions = pgTable(
  'recognitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    senderId: uuid('sender_id').notNull(),
    recipientId: uuid('recipient_id').notNull(),
    value: text('value').$type<RecognitionInput['value']>().notNull(),
    message: text('message').notNull(),
    hiddenAt: instant('hidden_at'),
    hideReason: text('hide_reason'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('recognitions_tenant_id_uq').on(t.tenantId, t.id),
    fk('recognitions_company_fk', t, t.legalEntityId, legalEntities),
    fk('recognitions_sender_fk', t, t.senderId, employees),
    fk('recognitions_recipient_fk', t, t.recipientId, employees),
    check('recognitions_other_person_ck', sql`${t.senderId} <> ${t.recipientId}`),
    index('recognitions_feed_idx').on(t.tenantId, t.legalEntityId, t.createdAt),
  ],
);

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    title: text('title').notNull(),
    titleBn: text('title_bn').notNull(),
    body: text('body').notNull(),
    bodyBn: text('body_bn').notNull(),
    requiresAcknowledgement: boolean('requires_acknowledgement').notNull().default(false),
    dueOn: day('due_on'),
    expiresOn: day('expires_on'),
    status: text('status').$type<'draft' | 'published' | 'retired'>().notNull().default('draft'),
    retiredAt: instant('retired_at'),
    retireReason: text('retire_reason'),
    createdBy: uuid('created_by').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('announcements_tenant_id_uq').on(t.tenantId, t.id),
    fk('announcements_company_fk', t, t.legalEntityId, legalEntities),
    check('announcements_due_ck', sql`not ${t.requiresAcknowledgement} or ${t.dueOn} is not null`),
    check('announcements_status_ck', sql`${t.status} in ('draft','published','retired')`),
  ],
);
export const announcementReceipts = pgTable(
  'announcement_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    announcementId: uuid('announcement_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    acknowledgedAt: instant('acknowledged_at'),
  },
  (t) => [
    unique('announcement_receipts_tenant_id_uq').on(t.tenantId, t.id),
    unique('announcement_receipts_person_uq').on(t.announcementId, t.employeeId),
    fk('announcement_receipts_notice_fk', t, t.announcementId, announcements),
    fk('announcement_receipts_employee_fk', t, t.employeeId, employees),
  ],
);

export const hrRequests = pgTable(
  'hr_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    contentEnc: text('content_enc').notNull(),
    category: text('category').$type<HrRequestInput['category']>().notNull(),
    priority: text('priority').$type<HrRequestInput['priority']>().notNull(),
    status: text('status').$type<HrRequestView['status']>().notNull().default('open'),
    assigneeId: uuid('assignee_id'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('hr_requests_tenant_id_uq').on(t.tenantId, t.id),
    fk('hr_requests_company_fk', t, t.legalEntityId, legalEntities),
    fk('hr_requests_employee_fk', t, t.employeeId, employees),
    fk('hr_requests_assignee_fk', t, t.assigneeId, tenantUsers),
    check('hr_requests_status_ck', sql`${t.status} in ('open','in_progress','resolved','closed')`),
    index('hr_requests_queue_idx').on(t.tenantId, t.legalEntityId, t.status),
  ],
);
export const hrRequestMessages = pgTable(
  'hr_request_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    requestId: uuid('request_id').notNull(),
    authorId: uuid('author_id').notNull(),
    authorName: text('author_name').notNull(),
    bodyEnc: text('body_enc').notNull(),
    internal: boolean('internal').notNull().default(false),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('hr_request_messages_tenant_id_uq').on(t.tenantId, t.id),
    fk('hr_request_messages_request_fk', t, t.requestId, hrRequests),
    fk('hr_request_messages_author_fk', t, t.authorId, tenantUsers),
  ],
);
export const companyAssets = pgTable(
  'company_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    tag: text('tag').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn').notNull(),
    kind: text('kind').$type<AssetInput['kind']>().notNull(),
    serialNumber: text('serial_number').notNull().default(''),
    retiredAt: instant('retired_at'),
    retireReason: text('retire_reason'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('company_assets_tenant_id_uq').on(t.tenantId, t.id),
    unique('company_assets_tag_uq').on(t.tenantId, t.tag),
    fk('company_assets_company_fk', t, t.legalEntityId, legalEntities),
  ],
);
export const assetIssues = pgTable(
  'asset_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    assetId: uuid('asset_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    issuedOn: day('issued_on').notNull(),
    dueOn: day('due_on'),
    issueCondition: text('issue_condition').notNull(),
    acknowledgedAt: instant('acknowledged_at'),
    returnedOn: day('returned_on'),
    returnCondition: text('return_condition'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('asset_issues_tenant_id_uq').on(t.tenantId, t.id),
    fk('asset_issues_asset_fk', t, t.assetId, companyAssets),
    fk('asset_issues_employee_fk', t, t.employeeId, employees),
    uniqueIndex('asset_issues_outstanding_uq')
      .on(t.assetId)
      .where(sql`${t.returnedOn} is null`),
    check(
      'asset_issues_dates_ck',
      sql`(${t.dueOn} is null or ${t.dueOn} >= ${t.issuedOn}) and (${t.returnedOn} is null or ${t.returnedOn} >= ${t.issuedOn})`,
    ),
  ],
);
