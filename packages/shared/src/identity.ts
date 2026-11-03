import { z } from 'zod';
import { PERMISSIONS, type Permission } from './permissions.js';

export const ACCESS_FIELDS = ['identity', 'bank', 'contacts', 'pay'] as const;
export type AccessField = (typeof ACCESS_FIELDS)[number];
export type FieldActions = { read: boolean; write: boolean; export: boolean };
export type FieldPolicy = Record<AccessField, FieldActions>;
export const emptyFieldPolicy = (): FieldPolicy =>
  Object.fromEntries(
    ACCESS_FIELDS.map((key) => [key, { read: false, write: false, export: false }]),
  ) as FieldPolicy;
export interface AuthorityGrant {
  id: string;
  roleId: string;
  name: string;
  permissions: Permission[];
  deniedPermissions: Permission[];
  fields: FieldPolicy;
  scope: 'none' | 'selected' | 'all';
  companyIds: string[];
  relationship: 'all' | 'own' | 'direct_reports';
  source: 'local' | 'scim';
}
export interface AccessPolicy {
  custom: boolean;
  grants: AuthorityGrant[];
  companies?: string[];
}
export interface AccessRoleView {
  id: string;
  name: string;
  permissions: Permission[];
  deniedPermissions: Permission[];
  fields: FieldPolicy;
  version: number;
}
export const fieldPolicySchema = z.object(
  Object.fromEntries(
    ACCESS_FIELDS.map((f) => [
      f,
      z.object({ read: z.boolean(), write: z.boolean(), export: z.boolean() }),
    ]),
  ) as Record<
    AccessField,
    z.ZodObject<{ read: z.ZodBoolean; write: z.ZodBoolean; export: z.ZodBoolean }>
  >,
);
export const accessRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
    deniedPermissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).default([]),
    fields: fieldPolicySchema,
    version: z.number().int().positive().optional(),
  })
  .strict();
export type AccessRoleInput = z.infer<typeof accessRoleSchema>;
export const accessAssignmentSchema = z
  .object({
    roleId: z.uuid(),
    scope: z.enum(['none', 'selected', 'all']),
    companyIds: z.array(z.uuid()).max(200).default([]),
    relationship: z.enum(['all', 'own', 'direct_reports']).default('all'),
  })
  .strict()
  .refine((v) => (v.scope === 'selected' ? v.companyIds.length > 0 : v.companyIds.length === 0), {
    message: 'Selected scope requires companies; other scopes have no company list',
  });
export type AccessAssignmentInput = z.infer<typeof accessAssignmentSchema>;
export const identityConnectionSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    issuer: z.url().max(2000),
    clientId: z.string().trim().min(1).max(500),
    clientSecret: z.string().min(1).max(4000).optional(),
    enabled: z.boolean().default(true),
    provisioningClaim: z.enum(['sub', 'oid']).default('sub'),
  })
  .strict();
export type IdentityConnectionInput = z.infer<typeof identityConnectionSchema>;
export interface IdentityConnectionView {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  enabled: boolean;
  provisioningClaim: 'sub' | 'oid';
  enforced: boolean;
  testedBy: string | null;
  secondTestBy: string | null;
  testedAt: string | null;
  hasSecret: boolean;
}
export interface IdentityOverview {
  endpoints: { callbackUrl: string; scimUrl: string };
  groups: { id: string; displayName: string; mappings: { id: string; roleId: string }[] }[];
  provisioned: { id: string; userId: string; deleted: boolean }[];
  roles: AccessRoleView[];
  connections: IdentityConnectionView[];
  users: {
    id: string;
    name: string;
    email: string | null;
    role: string;
    disabled: boolean;
    emergencyLocal: boolean;
    mfaEnabled: boolean;
    accessMode: string;
    grants: AuthorityGrant[];
  }[];
  companies: { id: string; name: string }[];
  credentials: {
    id: string;
    connectionId: string;
    name: string;
    expiresAt: string;
    revoked: boolean;
  }[];
  events: {
    id: string;
    action: string;
    actorId: string;
    actorKind: string;
    resourceId: string | null;
    createdAt: string;
  }[];
}

/** Pure resource-bound permission evaluation, shared by the server and preview UI. */
export function grantMatches(g: AuthorityGrant, companyId?: string): boolean {
  return (
    g.scope !== 'none' && (!companyId || g.scope === 'all' || g.companyIds.includes(companyId))
  );
}
export function policyCan(
  policy: AccessPolicy,
  permission: Permission,
  companyId?: string,
): boolean {
  const grants = policy.grants.filter((g) => grantMatches(g, companyId));
  if (companyId)
    return (
      !grants.some((g) => g.deniedPermissions.includes(permission)) &&
      grants.some((g) => g.permissions.includes(permission))
    );
  if (grants.some((g) => g.scope === 'all' && g.deniedPermissions.includes(permission)))
    return false;
  return grants.some(
    (g) =>
      g.permissions.includes(permission) &&
      (g.scope === 'all' || g.companyIds.some((id) => policyCan(policy, permission, id))),
  );
}
export function policyField(
  policy: AccessPolicy,
  field: AccessField,
  action: keyof FieldActions,
): boolean {
  const grants = policy.grants.filter((g) => g.scope !== 'none');
  return grants.length > 0 && grants.every((g) => g.fields[field]?.[action] === true);
}
