import type { FieldPolicy, Permission } from '@gp/shared';
import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.js';
import { tenantUsers } from './tenant.js';
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const at = (name: string) => timestamp(name, { withTimezone: true });
const fk = (
  name: string,
  t: { tenantId: AnyPgColumn },
  c: AnyPgColumn,
  target: { tenantId: AnyPgColumn; id: AnyPgColumn },
) => foreignKey({ name, columns: [t.tenantId, c], foreignColumns: [target.tenantId, target.id] });
export const accessRoles = pgTable(
  'access_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    permissions: text('permissions').array().$type<Permission[]>().notNull(),
    deniedPermissions: text('denied_permissions')
      .array()
      .$type<Permission[]>()
      .notNull()
      .default([]),
    fields: jsonb('fields').$type<FieldPolicy>().notNull(),
    version: integer('version').notNull().default(1),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('access_roles_tenant_id_uq').on(t.tenantId, t.id),
    unique('access_roles_name_uq').on(t.tenantId, t.name),
  ],
);
export const accessAssignments = pgTable(
  'access_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull(),
    roleId: uuid('role_id').notNull(),
    scope: text('scope').$type<'none' | 'selected' | 'all'>().notNull(),
    companyIds: uuid('company_ids').array().notNull().default([]),
    relationship: text('relationship')
      .$type<'all' | 'own' | 'direct_reports'>()
      .notNull()
      .default('all'),
    source: text('source').$type<'local' | 'scim'>().notNull().default('local'),
    sourceId: uuid('source_id'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('access_assignments_tenant_id_uq').on(t.tenantId, t.id),
    fk('access_assignment_user_fk', t, t.userId, tenantUsers),
    fk('access_assignment_role_fk', t, t.roleId, accessRoles),
  ],
);
export const identityConnections = pgTable(
  'identity_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    issuer: text('issuer').notNull(),
    clientId: text('client_id').notNull(),
    clientSecretEnc: text('client_secret_enc').notNull(),
    provisioningClaim: text('provisioning_claim').$type<'sub' | 'oid'>().notNull().default('sub'),
    enabled: boolean('enabled').notNull().default(true),
    enforced: boolean('enforced').notNull().default(false),
    testedBy: uuid('tested_by'),
    secondTestBy: uuid('second_test_by'),
    testedAt: at('tested_at'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('identity_connections_tenant_id_uq').on(t.tenantId, t.id),
    unique('identity_connections_issuer_uq').on(t.tenantId, t.issuer),
    fk('identity_test_user_fk', t, t.testedBy, tenantUsers),
    fk('identity_second_test_user_fk', t, t.secondTestBy, tenantUsers),
  ],
);
export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    connectionId: uuid('connection_id').notNull(),
    userId: uuid('user_id').notNull(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('external_identities_subject_uq').on(t.tenantId, t.connectionId, t.issuer, t.subject),
    unique('external_identities_user_uq').on(t.tenantId, t.connectionId, t.userId),
    fk('external_identity_user_fk', t, t.userId, tenantUsers),
    fk('external_identity_connection_fk', t, t.connectionId, identityConnections),
  ],
);
export const scimCredentials = pgTable(
  'scim_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    connectionId: uuid('connection_id').notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: at('expires_at').notNull(),
    revokedAt: at('revoked_at'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('scim_credentials_tenant_id_uq').on(t.tenantId, t.id),
    fk('scim_credential_connection_fk', t, t.connectionId, identityConnections),
  ],
);
export const scimUsers = pgTable(
  'scim_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    connectionId: uuid('connection_id').notNull(),
    userId: uuid('user_id').notNull(),
    externalId: text('external_id'),
    active: boolean('active').notNull().default(false),
    version: integer('version').notNull().default(1),
    deletedAt: at('deleted_at'),
    createdAt: at('created_at').notNull().defaultNow(),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    unique('scim_users_tenant_id_uq').on(t.tenantId, t.id),
    unique('scim_users_external_uq').on(t.tenantId, t.connectionId, t.externalId),
    unique('scim_users_user_uq').on(t.tenantId, t.connectionId, t.userId),
    fk('scim_user_connection_fk', t, t.connectionId, identityConnections),
    fk('scim_user_login_fk', t, t.userId, tenantUsers),
  ],
);
export const scimGroups = pgTable(
  'scim_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    connectionId: uuid('connection_id').notNull(),
    displayName: text('display_name').notNull(),
    externalId: text('external_id'),
    version: integer('version').notNull().default(1),
    deletedAt: at('deleted_at'),
    createdAt: at('created_at').notNull().defaultNow(),
    requireMembershipVersion: boolean('require_membership_version').notNull().default(false),
  },
  (t) => [
    unique('scim_groups_tenant_id_uq').on(t.tenantId, t.id),
    unique('scim_groups_external_uq').on(t.tenantId, t.connectionId, t.externalId),
    fk('scim_group_connection_fk', t, t.connectionId, identityConnections),
  ],
);
export const scimMemberships = pgTable(
  'scim_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    groupId: uuid('group_id').notNull(),
    scimUserId: uuid('scim_user_id').notNull(),
  },
  (t) => [
    unique('scim_memberships_uq').on(t.tenantId, t.groupId, t.scimUserId),
    fk('scim_membership_group_fk', t, t.groupId, scimGroups),
    fk('scim_membership_user_fk', t, t.scimUserId, scimUsers),
  ],
);
export const scimMembershipRemovals = pgTable(
  'scim_membership_removals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    groupId: uuid('group_id').notNull(),
    scimUserId: uuid('scim_user_id').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('scim_membership_removal_uq').on(t.tenantId, t.groupId, t.scimUserId),
    fk('scim_membership_removal_group_fk', t, t.groupId, scimGroups),
    fk('scim_membership_removal_user_fk', t, t.scimUserId, scimUsers),
  ],
);
export const scimGroupMappings = pgTable(
  'scim_group_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    groupId: uuid('group_id').notNull(),
    roleId: uuid('role_id').notNull(),
    scope: text('scope').$type<'none' | 'selected' | 'all'>().notNull(),
    companyIds: uuid('company_ids').array().notNull().default([]),
    relationship: text('relationship')
      .$type<'all' | 'own' | 'direct_reports'>()
      .notNull()
      .default('all'),
  },
  (t) => [
    unique('scim_group_mapping_uq').on(t.tenantId, t.groupId, t.roleId),
    fk('scim_group_mapping_group_fk', t, t.groupId, scimGroups),
    fk('scim_group_mapping_role_fk', t, t.roleId, accessRoles),
  ],
);
export const provisioningEvents = pgTable('provisioning_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  actorId: uuid('actor_id').notNull(),
  actorKind: text('actor_kind').$type<'user' | 'scim'>().notNull(),
  action: text('action').notNull(),
  resourceId: uuid('resource_id'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: at('created_at').notNull().defaultNow(),
});
