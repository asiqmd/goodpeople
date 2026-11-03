import type { PolicyArea } from '@gp/shared';
import {
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.js';
import { legalEntities, tenantUsers } from './tenant.js';

// Phase 3 M4, the group pack: a company's overrides of the group's policy, and the companies
// a shared-service HR login is limited to. Tenant data under row-level security (0028).

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const tenantFk = (
  name: string,
  t: { tenantId: AnyPgColumn },
  column: AnyPgColumn,
  target: { tenantId: AnyPgColumn; id: AnyPgColumn },
) =>
  foreignKey({
    name,
    columns: [t.tenantId, column],
    foreignColumns: [target.tenantId, target.id],
  });

/**
 * What one company does differently from the group: for an area (and, for leave, a leave
 * type), the values it overrides. Anything not given follows the group.
 */
export const entityPolicyOverrides = pgTable(
  'entity_policy_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    legalEntityId: uuid('legal_entity_id').notNull(),
    area: text('area').$type<PolicyArea>().notNull(),
    /** The leave type for `leave_type`; null for the other areas. */
    subjectId: uuid('subject_id'),
    values: jsonb('values').$type<Record<string, unknown>>().notNull(),
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantFk('entity_policy_overrides_entity_fk', t, t.legalEntityId, legalEntities).onDelete(
      'cascade',
    ),
    unique('entity_policy_overrides_uq')
      .on(t.tenantId, t.legalEntityId, t.area, t.subjectId)
      .nullsNotDistinct(),
  ],
);

/**
 * The companies a login may see people of. None: every company, as before. A shared-service
 * HR officer for two of the group's companies has a row for each.
 */
export const userEntityScopes = pgTable(
  'user_entity_scopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantFk('user_entity_scopes_user_fk', t, t.userId, tenantUsers).onDelete('cascade'),
    tenantFk('user_entity_scopes_entity_fk', t, t.legalEntityId, legalEntities).onDelete('cascade'),
    unique('user_entity_scopes_uq').on(t.tenantId, t.userId, t.legalEntityId),
  ],
);
