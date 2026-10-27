import {
  BILLING_MODES,
  COUNTRY_PACKS,
  INDUSTRY_TEMPLATES,
  PLAN_CODES,
  PLATFORM_ROLES,
  SUBSCRIPTION_STATUSES,
  TENANT_STATUSES,
  type FeatureKey,
  type Limits,
} from '@gp/shared';
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Platform tables hold no tenant data and have no row-level security.
// Only the platform-admin, auth and entitlements modules read them.

export const billingMode = pgEnum('billing_mode', BILLING_MODES);
export const tenantStatus = pgEnum('tenant_status', TENANT_STATUSES);
export const subscriptionStatus = pgEnum('subscription_status', SUBSCRIPTION_STATUSES);
export const platformRole = pgEnum('platform_role', PLATFORM_ROLES);
export const planCode = pgEnum('plan_code', PLAN_CODES);
export const countryPack = pgEnum('country_pack', COUNTRY_PACKS);
export const industryTemplate = pgEnum('industry_template', INDUSTRY_TEMPLATES);
export const grantKind = pgEnum('grant_kind', ['feature', 'limit']);
export const sessionSubject = pgEnum('session_subject', ['platform', 'tenant']);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => timestamptz('created_at').notNull().defaultNow();

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: planCode('code').notNull().unique(),
  name: text('name').notNull(),
  features: text('features').array().$type<FeatureKey[]>().notNull(),
  limits: jsonb('limits').$type<Limits>().notNull(),
  createdAt: createdAt(),
});

export const platformUsers = pgTable('platform_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: platformRole('role').notNull(),
  mfaSecretEnc: text('mfa_secret_enc'),
  mfaEnabledAt: timestamptz('mfa_enabled_at'),
  mfaRecoveryCodes: text('mfa_recovery_codes').array().notNull().default([]),
  lastSignInAt: timestamptz('last_sign_in_at'),
  createdAt: createdAt(),
});

/** A reseller who brings and looks after workspaces, billed for them in one invoice a month. */
export const partners = pgTable('partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  address: text('address').notNull(),
  bin: text('bin'),
  /** Off our price for their workspaces. */
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
  createdAt: createdAt(),
});

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  countryPack: countryPack('country_pack').notNull().default('BD'),
  industryTemplate: industryTemplate('industry_template').notNull(),
  status: tenantStatus('status').notNull().default('active'),
  billingMode: billingMode('billing_mode').notNull(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  /** Trial end, complimentary/partner expiry or licence expiry. Ignored for internal and paid. */
  accessExpiresAt: timestamptz('access_expires_at'),
  /** Admin-set limits that replace the plan's, e.g. an employee cap on a sponsored tenant. */
  limitOverrides: jsonb('limit_overrides').$type<Partial<Limits>>().notNull().default({}),
  bypassReason: text('bypass_reason'),
  /** For `partner` workspaces: who is billed for them. */
  partnerId: uuid('partner_id').references(() => partners.id),
  grantedBy: uuid('granted_by').references(() => platformUsers.id),
  /** The terms (shared TERMS_VERSION) its owner accepted at sign-up, when and by whom. */
  termsVersion: text('terms_version'),
  termsAcceptedAt: timestamptz('terms_accepted_at'),
  termsAcceptedBy: text('terms_accepted_by'),
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** Only `paid` tenants have one. Billing webhooks write here and nowhere else. */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalRef: text('external_ref'),
  status: subscriptionStatus('status').notNull(),
  currentPeriodEnd: timestamptz('current_period_end').notNull(),
  graceDays: integer('grace_days').notNull().default(7),
  seats: integer('seats'),
  /** When our own billing began: the first month is charged from here. */
  startedOn: date('started_on', { mode: 'string' }),
  /** Cancelled at a month's end: the last invoice is for that month. */
  cancelAt: date('cancel_at', { mode: 'string' }),
  /** Who the invoices are addressed to: { name, address, bin }. */
  buyer: jsonb('buyer').$type<{ name: string; address: string; bin: string | null }>(),
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** Time-boxed additions on top of a plan: a module, or a higher limit (`value` null = unlimited). */
export const entitlementGrants = pgTable(
  'entitlement_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: grantKind('kind').notNull(),
    key: text('key').notNull(),
    value: integer('value'),
    startsAt: timestamptz('starts_at').notNull().defaultNow(),
    endsAt: timestamptz('ends_at'),
    reason: text('reason').notNull(),
    grantedBy: uuid('granted_by').references(() => platformUsers.id),
    approvedBy: uuid('approved_by').references(() => platformUsers.id),
    createdAt: createdAt(),
  },
  (t) => [index('entitlement_grants_tenant_idx').on(t.tenantId)],
);

/** Append-only: a trigger rejects UPDATE and DELETE. */
export const platformAuditLog = pgTable(
  'platform_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => platformUsers.id),
    action: text('action').notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    reason: text('reason'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: createdAt(),
  },
  (t) => [
    index('platform_audit_log_tenant_idx').on(t.tenantId),
    index('platform_audit_log_created_idx').on(t.createdAt),
  ],
);

/** Refresh-token sessions for both platform and tenant users; tokens are stored hashed. */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectKind: sessionSubject('subject_kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    replacedBy: uuid('replaced_by'),
    createdAt: createdAt(),
  },
  (t) => [index('auth_sessions_subject_idx').on(t.subjectKind, t.subjectId)],
);

/**
 * A self-serve sign-up: who started it and the emailed code (only its hash). It becomes a trial
 * workspace once the code is entered. Platform-level, like tenants: there is no workspace yet.
 */
export const signups = pgTable(
  'signups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Lower-cased. */
    email: text('email').notNull(),
    company: text('company').notNull(),
    industryTemplate: industryTemplate('industry_template').notNull(),
    language: text('language').$type<'en' | 'bn'>().notNull().default('en'),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamptz('expires_at').notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    /** The network it came from, for rate limits and abuse reports. */
    ip: text('ip'),
    /** The terms version accepted when it was started. */
    termsVersion: text('terms_version'),
    termsAcceptedAt: timestamptz('terms_accepted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('signups_email_idx').on(t.email, t.createdAt),
    index('signups_created_idx').on(t.createdAt),
  ],
);
