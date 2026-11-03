import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  accessAssignments,
  accessRoles,
  authSessions,
  identityConnections,
  legalEntities,
  employees,
  provisioningEvents,
  scimCredentials,
  scimGroupMappings,
  scimGroups,
  scimMemberships,
  scimUsers,
  tenantUsers,
  CIPHER_FIELDS,
  type Database,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  type AccessAssignmentInput,
  type AccessRoleInput,
  type IdentityConnectionInput,
  type IdentityOverview,
  type TenantWithAccess,
} from '@gp/shared';
import { and, asc, gte, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { policyOf } from '../../common/authority.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { currentTenantId } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB, FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { MfaService } from '../auth/mfa.service.js';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const SECURITY_PERMISSIONS = new Set([
  'users.manage',
  'support.manage',
  'billing.manage',
  'imports.run',
]);
const SCIM_PRIVILEGED = new Set([...SECURITY_PERMISSIONS, 'payroll.approve']);
export function identityAdmin(
  user: AuthUser,
  recent = true,
): asserts user is Extract<AuthUser, { kind: 'tenant' }> {
  if (user.kind !== 'tenant' || user.role !== 'tenant_admin' || user.policy?.custom)
    throw forbidden(
      'identity_admin_required',
      'Workspace security requires a workspace administrator',
    );
  if (recent && (!user.mfaAt || Date.now() - user.mfaAt.getTime() > 5 * 60_000))
    throw forbidden(
      'recent_mfa_required',
      'Confirm a code from your authenticator before changing access',
    );
}
export async function identityEvent(
  tx: Tx,
  actorId: string,
  actorKind: 'user' | 'scim',
  action: string,
  resourceId: string | null,
  details: Record<string, unknown> = {},
) {
  await tx
    .insert(provisioningEvents)
    .values({ tenantId: currentTenantId(), actorId, actorKind, action, resourceId, details });
}
export async function refreshGroupGrants(tx: Tx, groupId: string) {
  await tx
    .delete(accessAssignments)
    .where(and(eq(accessAssignments.source, 'scim'), eq(accessAssignments.sourceId, groupId)));
  const [group] = await tx.select().from(scimGroups).where(eq(scimGroups.id, groupId));
  if (!group || group.deletedAt) return;
  const maps = await tx
    .select()
    .from(scimGroupMappings)
    .where(eq(scimGroupMappings.groupId, groupId));
  const members = await tx
    .select({ u: scimUsers })
    .from(scimMemberships)
    .innerJoin(scimUsers, eq(scimUsers.id, scimMemberships.scimUserId))
    .where(and(eq(scimMemberships.groupId, groupId), isNull(scimUsers.deletedAt)));
  for (const { u } of members)
    for (const m of maps)
      await tx.insert(accessAssignments).values({
        tenantId: currentTenantId(),
        userId: u.userId,
        roleId: m.roleId,
        scope: m.scope,
        companyIds: m.companyIds,
        relationship: m.relationship,
        source: 'scim',
        sourceId: groupId,
      });
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly tenantDb: TenantDb,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Database,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    private readonly mfa: MfaService,
    private readonly limiter: RateLimiter,
  ) {}

  async stepUp(actor: AuthUser, code: string) {
    identityAdmin(actor, false);
    await this.limiter.hit(`mfa:${actor.id}`, 5, 15 * 60_000);
    if (!(await this.mfa.check({ kind: 'tenant', id: actor.id, tenantId: actor.tenantId }, code)))
      throw forbidden('mfa_wrong_code', 'That authenticator code does not match');
    await this.tenantDb.run((tx) =>
      tx
        .update(authSessions)
        .set({ mfaAt: new Date() })
        .where(eq(authSessions.id, actor.sessionId!)),
    );
    return { confirmed: true };
  }
  overview(actor: AuthUser): Promise<IdentityOverview> {
    identityAdmin(actor, false);
    return this.tenantDb.run(async (tx) => {
      const users = await tx
        .select()
        .from(tenantUsers)
        .where(ne(tenantUsers.role, 'support'))
        .orderBy(asc(tenantUsers.name));
      const connections = await tx
        .select()
        .from(identityConnections)
        .orderBy(asc(identityConnections.name));
      const credentials = await tx
        .select()
        .from(scimCredentials)
        .orderBy(desc(scimCredentials.createdAt));
      const roles = await tx.select().from(accessRoles).orderBy(asc(accessRoles.name));
      const events = await tx
        .select({
          id: provisioningEvents.id,
          action: provisioningEvents.action,
          actorId: provisioningEvents.actorId,
          actorKind: provisioningEvents.actorKind,
          resourceId: provisioningEvents.resourceId,
          createdAt: provisioningEvents.createdAt,
        })
        .from(provisioningEvents)
        .orderBy(desc(provisioningEvents.createdAt))
        .limit(100);
      const groups = await tx
        .select()
        .from(scimGroups)
        .where(isNull(scimGroups.deletedAt))
        .orderBy(asc(scimGroups.displayName));
      const mappings = await tx
        .select({
          id: scimGroupMappings.id,
          groupId: scimGroupMappings.groupId,
          roleId: scimGroupMappings.roleId,
        })
        .from(scimGroupMappings);
      const provisioned = await tx
        .select({ id: scimUsers.id, userId: scimUsers.userId, deletedAt: scimUsers.deletedAt })
        .from(scimUsers);
      return {
        endpoints: {
          callbackUrl: new URL('/auth/sso/callback', this.config.API_ORIGIN).href,
          scimUrl: new URL('/scim/v2', this.config.API_ORIGIN).href,
        },
        groups: groups.map((g) => ({
          id: g.id,
          displayName: g.displayName,
          mappings: mappings.filter((m) => m.groupId === g.id),
        })),
        provisioned: provisioned.map((p) => ({
          id: p.id,
          userId: p.userId,
          deleted: !!p.deletedAt,
        })),
        roles,
        connections: connections.map((c) => ({
          id: c.id,
          name: c.name,
          issuer: c.issuer,
          clientId: c.clientId,
          enabled: c.enabled,
          enforced: c.enforced,
          provisioningClaim: c.provisioningClaim,
          testedBy: c.testedBy,
          secondTestBy: c.secondTestBy,
          testedAt: c.testedAt?.toISOString() ?? null,
          hasSecret: !!c.clientSecretEnc,
        })),
        users: await Promise.all(
          users.map(async (u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            disabled: !!u.disabledAt || u.provisionDisabled,
            emergencyLocal: u.emergencyLocal,
            mfaEnabled: !!u.mfaEnabledAt,
            accessMode: u.accessMode,
            grants: (await policyOf(tx, u)).grants,
          })),
        ),
        companies: await tx
          .select({ id: legalEntities.id, name: legalEntities.name })
          .from(legalEntities)
          .orderBy(asc(legalEntities.name)),
        credentials: credentials.map((c) => ({
          id: c.id,
          connectionId: c.connectionId,
          name: c.name,
          expiresAt: c.expiresAt.toISOString(),
          revoked: !!c.revokedAt,
        })),
        events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      };
    });
  }
  async saveRole(actor: AuthUser, tenant: TenantWithAccess, input: AccessRoleInput, id?: string) {
    identityAdmin(actor);
    if (input.permissions.some((p) => SECURITY_PERMISSIONS.has(p)))
      throw forbidden(
        'reserved_permission',
        'Workspace security, billing and bulk imports stay with built-in administrators',
      );
    return this.tenantDb.run(async (tx) => {
      const [before] = id
        ? await tx.select().from(accessRoles).where(eq(accessRoles.id, id)).for('update')
        : [];
      if (id && !before) throw new NotFoundException('Role not found');
      if (before && input.version !== before.version)
        throw new ConflictException('This role changed; reload before saving');
      if (
        tenant.access.accessState !== 'full' ||
        !tenant.access.features.includes('custom_roles')
      ) {
        if (
          !before ||
          input.permissions.some((p) => !before.permissions.includes(p)) ||
          before.deniedPermissions.some((p) => !input.deniedPermissions.includes(p)) ||
          Object.keys(input.fields).some((f) =>
            Object.keys(input.fields[f as keyof typeof input.fields]).some(
              (a) =>
                input.fields[f as keyof typeof input.fields][a as 'read' | 'write' | 'export'] &&
                !before.fields[f as keyof typeof input.fields][a as 'read' | 'write' | 'export'],
            ),
          )
        )
          throw forbidden(
            'feature_not_in_plan',
            'Custom role changes that add access require the custom_roles feature',
          );
      }
      const mapped = id
        ? await tx
            .select({ id: scimGroupMappings.id })
            .from(scimGroupMappings)
            .where(eq(scimGroupMappings.roleId, id))
            .limit(1)
        : [];
      if (mapped.length && input.permissions.some((p) => SCIM_PRIVILEGED.has(p)))
        throw forbidden(
          'privileged_scim_mapping',
          'Provisioned groups cannot grant approval or security administration',
        );
      if (
        id &&
        [...input.permissions, ...input.deniedPermissions].some((p) => p.startsWith('payroll.'))
      ) {
        const scoped = await tx
          .select({ id: accessAssignments.id })
          .from(accessAssignments)
          .where(and(eq(accessAssignments.roleId, id), eq(accessAssignments.scope, 'selected')))
          .limit(1);
        const mappedScoped = await tx
          .select({ id: scimGroupMappings.id })
          .from(scimGroupMappings)
          .where(and(eq(scimGroupMappings.roleId, id), eq(scimGroupMappings.scope, 'selected')))
          .limit(1);
        if (scoped.length || mappedScoped.length)
          throw badRequest(
            'company_bound_workflow_required',
            'Remove selected-company assignments before adding workspace-wide payroll permissions',
          );
      }
      const values = {
        name: input.name,
        permissions: [...new Set(input.permissions)],
        deniedPermissions: [...new Set(input.deniedPermissions)],
        fields: input.fields,
      };
      const [role] = before
        ? await tx
            .update(accessRoles)
            .set({ ...values, version: before.version + 1 })
            .where(eq(accessRoles.id, id!))
            .returning()
        : await tx
            .insert(accessRoles)
            .values({ tenantId: currentTenantId(), ...values })
            .returning();
      await identityEvent(
        tx,
        actor.id,
        'user',
        before ? 'role.updated' : 'role.created',
        role!.id,
        {
          beforeVersion: before?.version ?? null,
          version: role!.version,
          permissions: values.permissions,
          deniedPermissions: values.deniedPermissions,
          fields: values.fields,
        },
      );
      return role!;
    });
  }
  async assign(
    actor: AuthUser,
    tenant: TenantWithAccess,
    userId: string,
    input: AccessAssignmentInput,
  ) {
    identityAdmin(actor);
    if (!tenant.access.features.includes('custom_roles'))
      throw forbidden('feature_not_in_plan', 'Custom roles are not enabled');
    return this.tenantDb.run(async (tx) => {
      const [user] = await tx
        .select()
        .from(tenantUsers)
        .where(eq(tenantUsers.id, userId))
        .for('update');
      if (!user) throw new NotFoundException('Login not found');
      if (user.role === 'support' || user.role === 'tenant_admin' || user.emergencyLocal)
        throw forbidden('protected_login', 'Use a built-in administrator for workspace security');
      await this.assignment(tx, input);
      await tx
        .update(tenantUsers)
        .set({ accessMode: 'custom', scopeMode: 'none' })
        .where(eq(tenantUsers.id, userId));
      const [created] = await tx
        .insert(accessAssignments)
        .values({ tenantId: currentTenantId(), userId, ...input })
        .returning();
      await identityEvent(tx, actor.id, 'user', 'assignment.created', created!.id, {
        userId,
        ...input,
      });
      return created!;
    });
  }
  async removeAssignment(actor: AuthUser, id: string) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx
        .select()
        .from(accessAssignments)
        .where(eq(accessAssignments.id, id));
      if (!before) throw new NotFoundException('Assignment not found');
      if (before.source !== 'local')
        throw forbidden(
          'managed_assignment',
          'Remove this grant through its provisioning group mapping',
        );
      await tx.delete(accessAssignments).where(eq(accessAssignments.id, id));
      await identityEvent(tx, actor.id, 'user', 'assignment.revoked', id, {
        userId: before.userId,
      });
      return { revoked: true };
    });
  }
  async template(actor: AuthUser, userId: string) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      const [user] = await tx
        .select()
        .from(tenantUsers)
        .where(eq(tenantUsers.id, userId))
        .for('update');
      if (!user || user.role === 'support') throw new NotFoundException('Login not found');
      const managed = await tx
        .select({ id: scimUsers.id })
        .from(scimUsers)
        .where(eq(scimUsers.userId, userId));
      if (managed.length)
        throw forbidden('managed_login', 'Provisioned logins keep explicit managed grants');
      await tx.delete(accessAssignments).where(eq(accessAssignments.userId, userId));
      await tx
        .update(tenantUsers)
        .set({ accessMode: 'template', scopeMode: 'all' })
        .where(eq(tenantUsers.id, userId));
      await identityEvent(tx, actor.id, 'user', 'assignment.template_restored', userId, {
        template: user.role,
      });
      return { restored: true };
    });
  }
  async emergency(actor: AuthUser, userId: string, enabled: boolean) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      // Serialize recovery changes on all administrator rows, not only the target.
      const admins = await tx
        .select()
        .from(tenantUsers)
        .where(eq(tenantUsers.role, 'tenant_admin'))
        .orderBy(asc(tenantUsers.id))
        .for('update');
      const user = admins.find((u) => u.id === userId);
      if (
        !user ||
        user.disabledAt ||
        user.provisionDisabled ||
        !user.passwordHash ||
        !user.mfaEnabledAt ||
        user.accessMode !== 'template'
      )
        throw forbidden(
          'emergency_requirements',
          'Emergency access needs an active built-in administrator with password and MFA',
        );
      const managed = await tx
        .select({ id: scimUsers.id })
        .from(scimUsers)
        .where(eq(scimUsers.userId, userId));
      if (managed.length)
        throw forbidden('managed_login', 'Emergency administrators cannot be provisioned accounts');
      const enforced = await tx
        .select({ id: identityConnections.id })
        .from(identityConnections)
        .where(eq(identityConnections.enforced, true));
      if (
        !enabled &&
        enforced.length &&
        admins.filter(
          (u) => u.id !== userId && u.emergencyLocal && !u.disabledAt && !!u.mfaEnabledAt,
        ).length < 2
      )
        throw forbidden(
          'recovery_required',
          'Keep two emergency administrators while SSO is enforced',
        );
      await tx
        .update(tenantUsers)
        .set({ emergencyLocal: enabled })
        .where(eq(tenantUsers.id, userId));
      await identityEvent(tx, actor.id, 'user', 'identity.emergency_changed', userId, { enabled });
      return { enabled };
    });
  }
  async saveConnection(
    actor: AuthUser,
    tenant: TenantWithAccess,
    input: IdentityConnectionInput,
    id?: string,
  ) {
    identityAdmin(actor);
    if (!tenant.access.features.includes('sso'))
      throw forbidden('feature_not_in_plan', 'SSO is not enabled');
    const issuer = new URL(input.issuer);
    if (issuer.username || issuer.password || issuer.search || issuer.hash)
      throw badRequest(
        'invalid_issuer',
        'Use the exact issuer URL without credentials, query or fragment',
      );
    return this.tenantDb.run(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${'identity-connection:' + currentTenantId()}, 0))`,
      );
      if (input.enabled) {
        const other = await tx
          .select({ id: identityConnections.id })
          .from(identityConnections)
          .where(
            and(
              eq(identityConnections.enabled, true),
              id ? ne(identityConnections.id, id) : undefined,
            ),
          )
          .limit(1);
        if (other.length)
          throw badRequest(
            'one_identity_provider',
            'Keep one active identity provider; prepare replacement connections disabled',
          );
      }
      const [before] = id
        ? await tx
            .select()
            .from(identityConnections)
            .where(eq(identityConnections.id, id))
            .for('update')
        : [];
      if (id && !before) throw new NotFoundException('Connection not found');
      if (
        before?.enforced &&
        (input.issuer !== before.issuer || input.clientId !== before.clientId || !input.enabled)
      )
        throw forbidden(
          'sso_enforced',
          'Turn off enforcement before changing or disabling the connection',
        );
      if (!before && !input.clientSecret)
        throw badRequest('client_secret_required', 'Enter the OIDC client secret');
      const secret = input.clientSecret
        ? this.cipher.encrypt(input.clientSecret, {
            tenantId: currentTenantId(),
            field: CIPHER_FIELDS.oidcSecret,
          })
        : before!.clientSecretEnc;
      const changed =
        !!input.clientSecret ||
        input.issuer !== before?.issuer ||
        input.clientId !== before?.clientId ||
        input.provisioningClaim !== before?.provisioningClaim;
      const values = {
        name: input.name,
        issuer: input.issuer,
        provisioningClaim: input.provisioningClaim,
        clientId: input.clientId,
        clientSecretEnc: secret,
        enabled: input.enabled,
        ...(changed ? { testedBy: null, secondTestBy: null, testedAt: null } : {}),
      };
      const [connection] = before
        ? await tx
            .update(identityConnections)
            .set(values)
            .where(eq(identityConnections.id, id!))
            .returning()
        : await tx
            .insert(identityConnections)
            .values({ tenantId: currentTenantId(), ...values })
            .returning();
      await identityEvent(
        tx,
        actor.id,
        'user',
        before ? 'identity.connection_updated' : 'identity.connection_created',
        connection!.id,
        { issuer: input.issuer, secretRotated: !!input.clientSecret },
      );
      return { id: connection!.id };
    });
  }
  async enforce(actor: AuthUser, id: string, enabled: boolean) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      const [connection] = await tx
        .select()
        .from(identityConnections)
        .where(eq(identityConnections.id, id))
        .for('update');
      if (!connection) throw new NotFoundException('Connection not found');
      if (enabled) {
        if (
          !connection.enabled ||
          !connection.testedBy ||
          !connection.secondTestBy ||
          !connection.testedAt ||
          Date.now() - connection.testedAt.getTime() > 24 * 60 * 60_000
        )
          throw forbidden(
            'connection_not_tested',
            'Two different administrators must test this connection within 24 hours',
          );
        const emergency = await tx
          .select()
          .from(tenantUsers)
          .where(
            and(
              eq(tenantUsers.role, 'tenant_admin'),
              eq(tenantUsers.emergencyLocal, true),
              isNull(tenantUsers.disabledAt),
              eq(tenantUsers.provisionDisabled, false),
            ),
          )
          .for('update');
        const recovery = await tx
          .select({ actorId: provisioningEvents.actorId })
          .from(provisioningEvents)
          .where(
            and(
              eq(provisioningEvents.action, 'identity.emergency_used'),
              gte(provisioningEvents.createdAt, new Date(Date.now() - 24 * 60 * 60_000)),
            ),
          );
        if (
          emergency.filter(
            (u) =>
              u.mfaEnabledAt &&
              u.passwordHash &&
              u.accessMode === 'template' &&
              recovery.some((e) => e.actorId === u.id),
          ).length < 2
        )
          throw forbidden(
            'recovery_required',
            'Prepare and test two named emergency administrators first',
          );
      }
      await tx
        .update(identityConnections)
        .set({ enforced: enabled })
        .where(eq(identityConnections.id, id));
      await identityEvent(tx, actor.id, 'user', 'identity.enforcement_changed', id, { enabled });
      return { enforced: enabled };
    });
  }
  async credential(
    actor: AuthUser,
    tenant: TenantWithAccess,
    connectionId: string,
    name: string,
    days: number,
  ) {
    identityAdmin(actor);
    if (!tenant.access.features.includes('sso'))
      throw forbidden('feature_not_in_plan', 'Provisioning is not enabled');
    return this.tenantDb.run(async (tx) => {
      const [connection] = await tx
        .select({ id: identityConnections.id })
        .from(identityConnections)
        .where(eq(identityConnections.id, connectionId));
      if (!connection) throw new NotFoundException('Connection not found');
      const id = randomUUID(),
        token = `gpscim.v1.${currentTenantId()}.${id}.${randomBytes(32).toString('base64url')}`;
      await tx.insert(scimCredentials).values({
        id,
        tenantId: currentTenantId(),
        connectionId,
        name,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + days * 86400_000),
      });
      await identityEvent(tx, actor.id, 'user', 'scim.credential_created', id, {
        connectionId,
        days,
      });
      return { id, token };
    });
  }
  async revokeCredential(actor: AuthUser, id: string) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(scimCredentials)
        .set({ revokedAt: new Date() })
        .where(eq(scimCredentials.id, id))
        .returning({ id: scimCredentials.id });
      if (!row) throw new NotFoundException('Credential not found');
      await identityEvent(tx, actor.id, 'user', 'scim.credential_revoked', id);
      return { revoked: true };
    });
  }
  async mapGroup(
    actor: AuthUser,
    tenant: TenantWithAccess,
    groupId: string,
    input: AccessAssignmentInput,
  ) {
    identityAdmin(actor);
    if (!tenant.access.features.includes('sso') || !tenant.access.features.includes('custom_roles'))
      throw forbidden('feature_not_in_plan', 'Provisioning and custom roles are required');
    return this.tenantDb.run(async (tx) => {
      const [group] = await tx
        .select()
        .from(scimGroups)
        .where(and(eq(scimGroups.id, groupId), isNull(scimGroups.deletedAt)))
        .for('update');
      if (!group) throw new NotFoundException('Group not found');
      const role = await this.assignment(tx, input);
      if (role.permissions.some((p) => SCIM_PRIVILEGED.has(p)))
        throw forbidden(
          'privileged_scim_mapping',
          'Provisioned groups cannot grant payroll approval or security administration',
        );
      const [mapping] = await tx
        .insert(scimGroupMappings)
        .values({ tenantId: currentTenantId(), groupId, ...input })
        .onConflictDoUpdate({
          target: [scimGroupMappings.tenantId, scimGroupMappings.groupId, scimGroupMappings.roleId],
          set: input,
        })
        .returning();
      await refreshGroupGrants(tx, groupId);
      await identityEvent(tx, actor.id, 'user', 'scim.group_mapped', groupId, input);
      return mapping!;
    });
  }
  async unmapGroup(actor: AuthUser, id: string) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx
        .delete(scimGroupMappings)
        .where(eq(scimGroupMappings.id, id))
        .returning();
      if (!before) throw new NotFoundException('Mapping not found');
      await refreshGroupGrants(tx, before.groupId);
      await identityEvent(tx, actor.id, 'user', 'scim.group_unmapped', before.groupId);
      return { revoked: true };
    });
  }
  async restoreManaged(actor: AuthUser, id: string) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      const [resource] = await tx
        .select()
        .from(scimUsers)
        .where(eq(scimUsers.id, id))
        .for('update');
      if (!resource?.deletedAt)
        throw new NotFoundException('Deleted provisioning resource not found');
      await tx
        .update(scimUsers)
        .set({ deletedAt: null, active: false, version: resource.version + 1 })
        .where(eq(scimUsers.id, id));
      await tx
        .update(tenantUsers)
        .set({ provisionDisabled: true })
        .where(eq(tenantUsers.id, resource.userId));
      await identityEvent(tx, actor.id, 'user', 'scim.user_restored', id, {
        version: resource.version + 1,
      });
      return { restored: true, version: resource.version + 1 };
    });
  }
  async linkEmployee(actor: AuthUser, userId: string, employeeId: string) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      const [user] = await tx
        .select()
        .from(tenantUsers)
        .where(eq(tenantUsers.id, userId))
        .for('update');
      const [person] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, employeeId))
        .for('update');
      if (!user || user.role === 'support' || !person)
        throw new NotFoundException('Login or employee not found');
      const [linked] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.userId, userId));
      if ((person.userId && person.userId !== userId) || (linked && linked.id !== employeeId))
        throw new ConflictException('This employee or login is already linked');
      await tx.update(employees).set({ userId }).where(eq(employees.id, employeeId));
      await identityEvent(tx, actor.id, 'user', 'identity.employee_linked', userId, { employeeId });
      return { linked: true };
    });
  }
  async assignment(tx: Tx, input: AccessAssignmentInput) {
    const [role] = await tx.select().from(accessRoles).where(eq(accessRoles.id, input.roleId));
    if (!role) throw new NotFoundException('Role not found');
    if (new Set(input.companyIds).size !== input.companyIds.length)
      throw badRequest('duplicate_company', 'Choose each company once');
    const companies = input.companyIds.length
      ? await tx
          .select({ id: legalEntities.id })
          .from(legalEntities)
          .where(inArray(legalEntities.id, input.companyIds))
      : [];
    if (companies.length !== input.companyIds.length)
      throw badRequest('unknown_company', 'Choose companies from this workspace');
    if (
      input.scope === 'selected' &&
      [...role.permissions, ...role.deniedPermissions].some((p) => p.startsWith('payroll.'))
    )
      throw badRequest(
        'company_bound_workflow_required',
        'Historic payroll and workspace-wide financial reports require all-company scope in this release',
      );
    if (
      input.relationship !== 'all' &&
      role.permissions.some(
        (p) => !['employees.read', 'employees.identity', 'analytics.view'].includes(p),
      )
    )
      throw badRequest(
        'unsupported_relationship',
        'This permission needs a company-wide assignment',
      );
    return role;
  }
}
