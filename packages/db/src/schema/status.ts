import type {
  BackupRunKind,
  IncidentImpact,
  IncidentKind,
  IncidentStatus,
  StatusComponent,
} from '@gp/shared';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { platformUsers } from './platform.js';

// The status page and operations (Phase 3 M5). Platform tables with no workspace data.

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => timestamptz('created_at').notNull().defaultNow();

/** An incident or a maintenance window, posted by platform staff in English and Bangla. */
export const statusIncidents = pgTable(
  'status_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<IncidentKind>().notNull(),
    titleEn: text('title_en').notNull(),
    titleBn: text('title_bn').notNull(),
    /** Null for maintenance. */
    impact: text('impact').$type<IncidentImpact>(),
    status: text('status').$type<IncidentStatus>().notNull(),
    components: text('components').array().$type<StatusComponent[]>().notNull(),
    /** When it began, or when the maintenance window opens. */
    startsAt: timestamptz('starts_at').notNull().defaultNow(),
    /** The planned end of a maintenance window. */
    endsAt: timestamptz('ends_at'),
    /** Set when it is resolved or completed. */
    resolvedAt: timestamptz('resolved_at'),
    createdBy: uuid('created_by').references(() => platformUsers.id),
    createdAt: createdAt(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('status_incidents_open_idx').on(t.resolvedAt, t.startsAt)],
);

export const statusIncidentUpdates = pgTable(
  'status_incident_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => statusIncidents.id, { onDelete: 'cascade' }),
    status: text('status').$type<IncidentStatus>().notNull(),
    bodyEn: text('body_en').notNull(),
    bodyBn: text('body_bn').notNull(),
    createdBy: uuid('created_by').references(() => platformUsers.id),
    createdAt: createdAt(),
  },
  (t) => [index('status_incident_updates_incident_idx').on(t.incidentId, t.createdAt)],
);

/** One automated check of one component. Kept a week; the days below keep the history. */
export const statusChecks = pgTable(
  'status_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    component: text('component').$type<StatusComponent>().notNull(),
    checkedAt: timestamptz('checked_at').notNull().defaultNow(),
    ok: boolean('ok').notNull(),
    latencyMs: integer('latency_ms'),
    /** Why it failed, for staff; never shown on the public page. */
    detail: text('detail'),
  },
  (t) => [index('status_checks_component_idx').on(t.component, t.checkedAt)],
);

/** A component's checks per day (Dhaka time), for the 90-day history. */
export const statusDays = pgTable(
  'status_days',
  {
    component: text('component').$type<StatusComponent>().notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    checks: integer('checks').notNull().default(0),
    failures: integer('failures').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.component, t.day] })],
);

/**
 * A backup or a restore drill, recorded by infra/scripts/backup.sh and verify-backup.sh as
 * they finish, so the console and the checks can tell when backups stop.
 */
export const backupRuns = pgTable(
  'backup_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<BackupRunKind>().notNull(),
    ok: boolean('ok').notNull(),
    /** The backup's directory name, e.g. 20261027T011500Z. */
    label: text('label'),
    host: text('host'),
    startedAt: timestamptz('started_at').notNull(),
    finishedAt: timestamptz('finished_at').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    /** Counts and checks, e.g. { tenants: 4, documents: 120, missingFiles: 0 }. */
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('backup_runs_kind_idx').on(t.kind, t.finishedAt)],
);
