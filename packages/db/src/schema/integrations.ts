import type { ApiScope, PublicField, IntegrationEventType } from '@gp/shared';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  foreignKey,
  unique,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.js';
import { tenantUsers } from './tenant.js';
const at = (n: string) => timestamp(n, { withTimezone: true });
const tid = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const fk = (
  name: string,
  t: { tenantId: AnyPgColumn },
  c: AnyPgColumn,
  to: { tenantId: AnyPgColumn; id: AnyPgColumn },
) => foreignKey({ name, columns: [t.tenantId, c], foreignColumns: [to.tenantId, to.id] });
export const apiClients = pgTable(
  'api_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tid(),
    name: text('name').notNull(),
    ownerId: uuid('owner_id').notNull(),
    expiresAt: at('expires_at').notNull(),
    revokedAt: at('revoked_at'),
    reviewRequired: boolean('review_required').notNull().default(false),
    version: integer('version').notNull().default(1),
    scopes: text('scopes').array().$type<ApiScope[]>().notNull(),
    fields: text('fields').array().$type<PublicField[]>().notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('api_client_tenant_id_uq').on(t.tenantId, t.id),
    fk('api_client_owner_fk', t, t.ownerId, tenantUsers),
  ],
);
export const apiClientCredentials = pgTable(
  'api_client_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tid(),
    clientId: uuid('client_id').notNull(),
    secretHash: text('secret_hash').notNull(),
    expiresAt: at('expires_at').notNull(),
    revokedAt: at('revoked_at'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('api_credential_tenant_id_uq').on(t.tenantId, t.id),
    fk('api_credential_client_fk', t, t.clientId, apiClients),
    index('api_credential_client_idx').on(t.clientId),
  ],
);
export const apiClientGrants = pgTable(
  'api_client_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tid(),
    clientId: uuid('client_id').notNull(),
    scope: text('scope').$type<'none' | 'selected' | 'all'>().notNull(),
    companyIds: uuid('company_ids').array().notNull(),
  },
  (t) => [
    unique('api_grant_client_uq').on(t.clientId),
    fk('api_grant_client_fk', t, t.clientId, apiClients),
  ],
);
export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tid(),
    clientId: uuid('client_id').notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    events: text('events').array().$type<IntegrationEventType[]>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    failureCount: integer('failure_count').notNull().default(0),
    keyId: uuid('key_id').notNull(),
    secretEnc: text('secret_enc').notNull(),
    pendingKeyId: uuid('pending_key_id'),
    pendingSecretEnc: text('pending_secret_enc'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('webhook_subscription_tenant_id_uq').on(t.tenantId, t.id),
    fk('webhook_subscription_client_fk', t, t.clientId, apiClients),
  ],
);
export const integrationEvents = pgTable(
  'integration_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tid(),
    type: text('type').$type<IntegrationEventType>().notNull(),
    resourceId: uuid('resource_id').notNull(),
    resourceType: text('resource_type').notNull(),
    companyId: uuid('company_id'),
    body: text('body').notNull(),
    dedupKey: text('dedup_key').notNull(),
    occurredAt: at('occurred_at').notNull().defaultNow(),
    fannedAt: at('fanned_at'),
    expiresAt: at('expires_at').notNull(),
  },
  (t) => [
    unique('integration_event_tenant_id_uq').on(t.tenantId, t.id),
    unique('integration_event_dedup_uq').on(t.tenantId, t.dedupKey),
    index('integration_event_pending_idx').on(t.fannedAt, t.occurredAt),
  ],
);
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tid(),
    subscriptionId: uuid('subscription_id').notNull(),
    eventId: uuid('event_id').notNull(),
    state: text('state')
      .$type<'pending' | 'leased' | 'sent' | 'dead' | 'suppressed'>()
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    leaseToken: uuid('lease_token'),
    leaseUntil: at('lease_until'),
    nextAttemptAt: at('next_attempt_at').notNull().defaultNow(),
    lastStatus: integer('last_status'),
    lastError: text('last_error'),
    lastAttemptAt: at('last_attempt_at'),
    sentAt: at('sent_at'),
    replays: integer('replays').notNull().default(0),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('webhook_delivery_event_uq').on(t.subscriptionId, t.eventId),
    fk('webhook_delivery_subscription_fk', t, t.subscriptionId, webhookSubscriptions),
    fk('webhook_delivery_event_fk', t, t.eventId, integrationEvents),
    index('webhook_delivery_due_idx').on(t.state, t.nextAttemptAt),
  ],
);
/** Installation-level worker authority, never exposed to customer tokens. */
export const jobLeases = pgTable('job_leases', {
  key: text('key').primaryKey(),
  owner: uuid('owner'),
  leaseUntil: at('lease_until'),
  heartbeatAt: at('heartbeat_at'),
  startedAt: at('started_at'),
  finishedAt: at('finished_at'),
  completedSlot: at('completed_slot'),
  ok: boolean('ok'),
  lastError: text('last_error'),
});
