import { TENANT_ROLES, USER_LANGUAGES, type Address } from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.js';

// Every table in this file and in hr.ts carries tenant_id and is isolated by row-level
// security (migrations 0001 and 0003). Query them only inside runAsTenant().
// Each has a (tenant_id, id) unique key so other tenant tables can reference it with a
// composite foreign key: the database then refuses links to another tenant's rows.

export const tenantRole = pgEnum('tenant_role', TENANT_ROLES);
export const userLanguage = pgEnum('user_language', USER_LANGUAGES);

export const tenantUsers = pgTable(
  'tenant_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** A login has an email, a mobile number (signs in by SMS code) or both. */
    email: text('email'),
    phone: text('phone'),
    name: text('name').notNull(),
    /** Null for a login that only signs in by SMS code. */
    passwordHash: text('password_hash'),
    role: tenantRole('role').notNull(),
    language: userLanguage('language').notNull().default('en'),
    /** Two-step sign-in: the authenticator secret (field-encrypted) and hashed recovery codes. */
    mfaSecretEnc: text('mfa_secret_enc'),
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
    mfaRecoveryCodes: text('mfa_recovery_codes').array().notNull().default([]),
    lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
    /** Set when the person leaves; a disabled login cannot sign in or refresh. */
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('tenant_users_tenant_email_uq').on(t.tenantId, t.email),
    unique('tenant_users_tenant_phone_uq').on(t.tenantId, t.phone),
    check('tenant_users_contact_ck', sql`${t.email} is not null or ${t.phone} is not null`),
    unique('tenant_users_tenant_id_uq').on(t.tenantId, t.id),
  ],
);

/** A company inside a tenant: a group's sister concerns are separate legal entities. */
export const legalEntities = pgTable(
  'legal_entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    code: text('code'),
    /** RJSC registration number. */
    registrationNo: text('registration_no'),
    tin: text('tin'),
    bin: text('bin'),
    address: jsonb('address').$type<Address>(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('legal_entities_tenant_idx').on(t.tenantId),
    unique('legal_entities_tenant_id_uq').on(t.tenantId, t.id),
    unique('legal_entities_tenant_code_uq').on(t.tenantId, t.code),
  ],
);
