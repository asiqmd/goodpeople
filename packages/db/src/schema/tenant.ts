import { TENANT_ROLES } from '@gp/shared';
import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './platform.js';

// Every table in this file carries tenant_id and is isolated by row-level security
// (see migrations/0001_rls.sql). Query them only inside runAsTenant().

export const tenantRole = pgEnum('tenant_role', TENANT_ROLES);

export const tenantUsers = pgTable(
  'tenant_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: tenantRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('tenant_users_tenant_email_uq').on(t.tenantId, t.email)],
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
    tin: text('tin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('legal_entities_tenant_idx').on(t.tenantId)],
);

/** Tables protected by the tenant_isolation policy. Tests assert this list matches the database. */
export const RLS_TABLES = ['tenant_users', 'legal_entities'] as const;
