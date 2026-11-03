import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ANOMALY_VERSION, AnomalyRule, AnomalyStatus } from '@gp/shared';
import { tenants } from './platform.js';
import { tenantUsers } from './tenant.js';

export const anomalyFindings = pgTable(
  'anomaly_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    rule: text('rule').$type<AnomalyRule>().notNull(),
    month: text('month').notNull(),
    scopeKey: text('scope_key').notNull(),
    version: text('version').$type<typeof ANOMALY_VERSION>().notNull(),
    sourceVersion: text('source_version').notNull(),
    sourceRevision: text('source_revision').notNull(),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
    evidenceEnc: text('evidence_enc').notNull(),
    status: text('status').$type<AnomalyStatus>().notNull().default('open'),
    assigneeId: uuid('assignee_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    reasonEnc: text('reason_enc'),
    resolutionRevision: text('resolution_revision'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    unique('anomaly_findings_revision_uq').on(
      t.tenantId,
      t.rule,
      t.scopeKey,
      t.month,
      t.version,
      t.sourceRevision,
    ),
    uniqueIndex('anomaly_findings_current_uq')
      .on(t.tenantId, t.rule, t.scopeKey, t.month)
      .where(sql`${t.supersededAt} is null`),
    index('anomaly_findings_inbox_idx').on(
      t.tenantId,
      t.rule,
      t.scopeKey,
      t.month,
      t.measuredAt,
      t.id,
    ),
    foreignKey({
      name: 'anomaly_findings_assignee_fk',
      columns: [t.tenantId, t.assigneeId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    check(
      'anomaly_findings_rule_ck',
      sql`${t.rule} in ('assignment_coverage','attendance_processing','attendance_movement','payroll_movement')`,
    ),
    check(
      'anomaly_findings_owner_ck',
      sql`(${t.status} = 'open' and ${t.assigneeId} is null) or (${t.status} in ('assigned','acknowledged','dismissed','resolved') and ${t.assigneeId} is not null)`,
    ),
    check(
      'anomaly_findings_reason_ck',
      sql`(${t.status} = 'dismissed') = (${t.reasonEnc} is not null)`,
    ),
    check(
      'anomaly_findings_resolution_ck',
      sql`(${t.status} = 'resolved' and ${t.resolutionRevision} is not null and ${t.resolvedAt} is not null) or (${t.status} <> 'resolved' and ${t.resolutionRevision} is null and ${t.resolvedAt} is null)`,
    ),
  ],
);
