import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { InsightDefinition, INSIGHT_VERSION, InsightJob } from '@gp/shared';
import { tenants, authSessions } from './platform.js';
import { tenantUsers } from './tenant.js';

export const savedInsights = pgTable(
  'saved_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').notNull(),
    definition: jsonb('definition').$type<InsightDefinition>().notNull(),
    version: text('version').$type<typeof INSIGHT_VERSION>().notNull(),
  },
  (t) => [
    unique('saved_insights_tenant_owner_id_uq').on(t.tenantId, t.ownerId, t.id),
    unique('saved_insights_definition_uq').on(t.tenantId, t.ownerId, t.version, t.definition),
    foreignKey({
      name: 'saved_insights_owner_fk',
      columns: [t.tenantId, t.ownerId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }).onDelete('cascade'),
  ],
);

export const insightJobs = pgTable(
  'insight_jobs',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    ownerId: uuid('owner_id').notNull(),
    reportId: uuid('report_id').notNull(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => authSessions.id, { onDelete: 'cascade' }),
    authRevision: integer('auth_revision').notNull(),
    scopeRevision: text('scope_revision').notNull(),
    status: text('status')
      .$type<Exclude<InsightJob['status'], 'expired'>>()
      .notNull()
      .default('queued'),
    ciphertext: text('ciphertext'),
    resultRevision: text('result_revision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('insight_jobs_request_uq').on(t.tenantId, t.ownerId, t.id),
    index('insight_jobs_queue_idx').on(t.tenantId, t.status, t.createdAt),
    index('insight_jobs_expiry_idx').on(t.tenantId, t.expiresAt),
    foreignKey({
      name: 'insight_jobs_report_fk',
      columns: [t.tenantId, t.ownerId, t.reportId],
      foreignColumns: [savedInsights.tenantId, savedInsights.ownerId, savedInsights.id],
    }).onDelete('cascade'),
    check('insight_jobs_status_ck', sql`${t.status} in ('queued','ready','cancelled','failed')`),
    check(
      'insight_jobs_ciphertext_ck',
      sql`(${t.status} = 'ready' and ${t.ciphertext} is not null and ${t.resultRevision} is not null) or (${t.status} <> 'ready' and ${t.ciphertext} is null and ${t.resultRevision} is null)`,
    ),
  ],
);
