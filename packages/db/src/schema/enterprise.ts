import { pgTable, uuid, text, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import type { EnterpriseLicense } from '@gp/shared';
import { tenants } from './platform.js';
export const enterpriseInstallations = pgTable('enterprise_installations', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id),
  mode: text('mode').$type<'self_hosted' | 'dedicated'>().notNull(),
  customerId: text('customer_id').notNull(),
  release: text('release').notNull(),
  recoveryPending: boolean('recovery_pending').notNull().default(false),
  licenseEnvelope: text('license_envelope'),
  acceptedClaims: jsonb('accepted_claims').$type<EnterpriseLicense>(),
  licenseSequence: integer('license_sequence').notNull().default(0),
  lastImportError: text('last_import_error'),
  maxObservedAt: timestamp('max_observed_at', { withTimezone: true }).notNull().defaultNow(),
  clockRollbackAt: timestamp('clock_rollback_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const installationInvitations = pgTable('installation_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  installationId: uuid('installation_id')
    .notNull()
    .references(() => enterpriseInstallations.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
});
export const installationEvents = pgTable('installation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  installationId: uuid('installation_id')
    .notNull()
    .references(() => enterpriseInstallations.id),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  code: text('code'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
/** Control-plane metadata only. A route key is not a caller-supplied connection string. */
export const tenantPlacements = pgTable('tenant_placements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id),
  installationId: uuid('installation_id').notNull().unique(),
  customerId: text('customer_id').notNull(),
  region: text('region').notNull(),
  routeKey: text('route_key').notNull().unique(),
  apiOrigin: text('api_origin').notNull(),
  webOrigin: text('web_origin').notNull(),
  proofPublicKey: text('proof_public_key').notNull(),
  challenge: uuid('challenge').notNull(),
  challengeExpiresAt: timestamp('challenge_expires_at', { withTimezone: true }).notNull(),
  status: text('status')
    .$type<'provisioning' | 'active' | 'disabled'>()
    .notNull()
    .default('provisioning'),
  version: integer('version').notNull().default(1),
  residency: jsonb('residency').$type<Record<string, string>>().notNull().default({}),
  receiptAccepted: boolean('receipt_accepted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
