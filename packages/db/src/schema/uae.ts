import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  jsonb,
  unique,
  foreignKey,
  integer,
} from 'drizzle-orm/pg-core';
import type { UaeEmployerInput } from '@gp/shared';
import { tenants } from './platform.js';
import { legalEntities } from './tenant.js';
import { employees } from './hr.js';
const id = () => uuid('id').primaryKey().defaultRandom();
const tenant = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id);
const company = () => uuid('legal_entity_id').notNull();
const at = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const uaeEmployerCoverage = pgTable(
  'uae_employer_coverage',
  {
    id: id(),
    tenantId: tenant(),
    legalEntityId: company(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    effectiveTo: date('effective_to', { mode: 'string' }),
    definition: jsonb('definition').$type<UaeEmployerInput>().notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: at(),
  },
  (t) => [
    unique('uae_employer_tenant_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
  ],
);
export const uaeWorkerCoverage = pgTable(
  'uae_worker_coverage',
  {
    id: id(),
    tenantId: tenant(),
    legalEntityId: company(),
    employeeId: uuid('employee_id').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    effectiveTo: date('effective_to', { mode: 'string' }),
    definitionEnc: text('definition_enc').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: at(),
  },
  (t) => [
    unique('uae_worker_tenant_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
  ],
);
export const uaePilotRuns = pgTable(
  'uae_pilot_runs',
  {
    id: id(),
    tenantId: tenant(),
    legalEntityId: company(),
    kind: text('kind').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    mode: text('mode').notNull().default('preview'),
    currency: text('currency').notNull().default('AED'),
    manifestHash: text('manifest_hash').notNull(),
    contextHash: text('context_hash').notNull(),
    calculationHash: text('calculation_hash').notNull(),
    payloadEnc: text('payload_enc').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: at(),
  },
  (t) => [
    unique('uae_pilot_tenant_company_uq').on(t.tenantId, t.legalEntityId, t.id),
    foreignKey({
      columns: [t.tenantId, t.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
  ],
);
export const uaePilotComparisons = pgTable(
  'uae_pilot_comparisons',
  {
    id: id(),
    sequence: integer('sequence').notNull(),
    tenantId: tenant(),
    legalEntityId: company(),
    runId: uuid('run_id').notNull(),
    evidenceKind: text('evidence_kind').notNull(),
    outcome: text('outcome').notNull(),
    payloadEnc: text('payload_enc').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: at(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.legalEntityId, t.runId],
      foreignColumns: [uaePilotRuns.tenantId, uaePilotRuns.legalEntityId, uaePilotRuns.id],
    }),
  ],
);
export const uaeQualificationEvidence = pgTable(
  'uae_qualification_evidence',
  {
    id: id(),
    tenantId: tenant(),
    legalEntityId: company(),
    kind: text('kind').notNull(),
    manifestHash: text('manifest_hash').notNull(),
    payloadEnc: text('payload_enc').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: at(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
  ],
);
export const uaeWpsBatches = pgTable(
  'uae_wps_batches',
  {
    id: id(),
    tenantId: tenant(),
    legalEntityId: company(),
    runId: uuid('run_id').notNull(),
    mode: text('mode').notNull().default('synthetic'),
    adapterVersion: text('adapter_version').notNull(),
    fileHash: text('file_hash').notNull(),
    payloadEnc: text('payload_enc').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: at(),
  },
  (t) => [
    unique('uae_wps_tenant_company_uq').on(t.tenantId, t.legalEntityId, t.id),
    foreignKey({
      columns: [t.tenantId, t.legalEntityId, t.runId],
      foreignColumns: [uaePilotRuns.tenantId, uaePilotRuns.legalEntityId, uaePilotRuns.id],
    }),
  ],
);
export const uaeWpsEvents = pgTable(
  'uae_wps_events',
  {
    id: id(),
    sequence: integer('sequence').notNull(),
    tenantId: tenant(),
    legalEntityId: company(),
    batchId: uuid('batch_id').notNull(),
    eventId: text('event_id').notNull(),
    kind: text('kind').notNull(),
    payloadHash: text('payload_hash').notNull(),
    payloadEnc: text('payload_enc').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: at(),
  },
  (t) => [
    unique('uae_wps_event_uq').on(t.tenantId, t.eventId),
    foreignKey({
      columns: [t.tenantId, t.legalEntityId, t.batchId],
      foreignColumns: [uaeWpsBatches.tenantId, uaeWpsBatches.legalEntityId, uaeWpsBatches.id],
    }),
  ],
);
