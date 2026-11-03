import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  identityConnections,
  runAsTenant,
  scimCredentials,
  scimGroups,
  scimMemberships,
  scimMembershipRemovals,
  scimUsers,
  tenantUsers,
  type Database,
  type Tx,
} from '@gp/db';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { runInTenantContext } from '../../common/request-context.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { DB } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { identityEvent, refreshGroupGrants, tokenHash } from './identity.service.js';

const CORE = 'urn:ietf:params:scim:schemas:core:2.0:';
const API = 'urn:ietf:params:scim:api:messages:2.0:';
export const scimError = (status: number, detail: string, scimType?: string) =>
  new HttpException(
    { schemas: [`${API}Error`], status: String(status), detail, ...(scimType ? { scimType } : {}) },
    status,
  );
export interface ScimActor {
  tenantId: string;
  credentialId: string;
  connectionId: string;
  hash: string;
}
const uuid = z.uuid();
const userInput = z
  .object({
    schemas: z.array(z.string()).optional(),
    id: z.string().optional(),
    meta: z.unknown().optional(),
    userName: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    externalId: z.string().trim().min(1).max(500).optional(),
    displayName: z.string().trim().min(1).max(200).optional(),
    name: z
      .object({
        formatted: z.string().max(200).optional(),
        givenName: z.string().max(100).optional(),
        familyName: z.string().max(100).optional(),
      })
      .optional(),
    active: z.boolean().default(false),
    emails: z
      .array(
        z.object({
          value: z.email(),
          type: z.string().optional(),
          primary: z.boolean().optional(),
        }),
      )
      .max(10)
      .optional(),
    phoneNumbers: z
      .array(
        z.object({
          value: z.string().regex(/^\+[1-9]\d{6,14}$/),
          type: z.string().optional(),
          primary: z.boolean().optional(),
        }),
      )
      .max(5)
      .optional(),
  })
  .strict();
const member = z.object({
  value: z.uuid(),
  display: z.string().optional(),
  $ref: z.string().optional(),
});
const groupInput = z
  .object({
    schemas: z.array(z.string()).optional(),
    id: z.string().optional(),
    meta: z.unknown().optional(),
    displayName: z.string().trim().min(1).max(200),
    externalId: z.string().trim().min(1).max(500).optional(),
    members: z.array(member).max(1000).default([]),
  })
  .strict();
const patch = z
  .object({
    schemas: z.array(z.string()).optional(),
    Operations: z
      .array(
        z.object({
          op: z.string(),
          path: z.string().max(500).optional(),
          value: z.unknown().optional(),
        }),
      )
      .min(1)
      .max(100),
  })
  .strict();
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success)
    throw scimError(400, 'Unsupported or invalid resource attributes', 'invalidValue');
  return result.data;
};
const etag = (version: number) => `W/"${version}"`;
export const scimVersion = (resource: { meta?: { version?: string } }) => resource.meta?.version;

const attribute = (name: string, type = 'string', extra: Record<string, unknown> = {}) => ({
  name,
  type,
  multiValued: false,
  required: false,
  caseExact: false,
  mutability: 'readWrite',
  returned: 'default',
  uniqueness: 'none',
  ...extra,
});

@Injectable()
export class ScimService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly entitlements: EntitlementsService,
    private readonly limiter: RateLimiter,
  ) {}
  async actor(authorization: string | undefined): Promise<ScimActor> {
    const raw = authorization?.match(
      /^Bearer (gpscim\.v1\.[a-f0-9-]{36}\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43})$/,
    )?.[1];
    if (!raw) throw scimError(401, 'Invalid provisioning credential');
    const parts = raw.split('.');
    const tenantId = parts[2]!,
      credentialId = parts[3]!;
    if (!uuid.safeParse(tenantId).success || !uuid.safeParse(credentialId).success)
      throw scimError(401, 'Invalid provisioning credential');
    await this.limiter.hit(`scim:${tenantId}:${credentialId}`, 600, 60_000);
    const hash = tokenHash(raw);
    const credential = await runAsTenant(this.db, tenantId, async (tx) => {
      const [c] = await tx
        .select()
        .from(scimCredentials)
        .where(and(eq(scimCredentials.id, credentialId), eq(scimCredentials.tokenHash, hash)));
      return c;
    });
    if (!credential || credential.revokedAt || credential.expiresAt.getTime() <= Date.now())
      throw scimError(401, 'Invalid provisioning credential');
    return { tenantId, credentialId, connectionId: credential.connectionId, hash };
  }
  async run<T>(
    actor: ScimActor,
    write: boolean,
    reducing: boolean,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    const tenant = await this.entitlements.forTenant(actor.tenantId);
    if (!tenant || tenant.access.accessState === 'suspended')
      throw scimError(403, 'Workspace unavailable');
    if (
      write &&
      !reducing &&
      (tenant.access.accessState !== 'full' || !tenant.access.features.includes('sso'))
    )
      throw scimError(403, 'Provisioning is read-only');
    return runInTenantContext(actor.tenantId, () =>
      runAsTenant(this.db, actor.tenantId, async (tx) => {
        const [c] = await tx
          .select()
          .from(scimCredentials)
          .where(
            and(
              eq(scimCredentials.id, actor.credentialId),
              eq(scimCredentials.tokenHash, actor.hash),
            ),
          )
          .for('share');
        if (
          !c ||
          c.revokedAt ||
          c.expiresAt.getTime() <= Date.now() ||
          c.connectionId !== actor.connectionId
        )
          throw scimError(401, 'Invalid provisioning credential');
        const [connection] = await tx
          .select()
          .from(identityConnections)
          .where(eq(identityConnections.id, actor.connectionId))
          .for('share');
        if (!connection || (!connection.enabled && write && !reducing))
          throw scimError(403, 'Connection is disabled');
        return fn(tx);
      }),
    );
  }
  discovery(resourceName: string) {
    if (resourceName === 'ServiceProviderConfig')
      return {
        schemas: [`${CORE}ServiceProviderConfig`],
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: true },
        authenticationSchemes: [
          {
            type: 'oauthbearertoken',
            name: 'Tenant provisioning credential',
            description: 'Tenant and connection-bound bearer token',
            primary: true,
          },
        ],
      };
    const resources = ['User', 'Group'].map((type) => ({
      schemas: [`${CORE}ResourceType`],
      id: type,
      name: type,
      endpoint: `/${type}s`,
      schema: `${CORE}${type}`,
      schemaExtensions: [],
    }));
    if (resourceName === 'ResourceTypes')
      return {
        schemas: [`${API}ListResponse`],
        totalResults: 2,
        Resources: resources,
        startIndex: 1,
        itemsPerPage: 2,
      };

    const contact = ['value', 'type'].map((name) => attribute(name));
    contact.push(attribute('primary', 'boolean'));
    const schemas = [
      {
        id: `${CORE}User`,
        name: 'User',
        attributes: [
          attribute('userName', 'string', {
            required: true,
            uniqueness: 'server',
            description: 'Email-shaped login identifier',
          }),
          attribute('externalId', 'string', { mutability: 'immutable' }),
          attribute('displayName'),
          attribute('active', 'boolean'),
          attribute('name', 'complex', {
            subAttributes: ['formatted', 'givenName', 'familyName'].map((name) => attribute(name)),
          }),
          ...['emails', 'phoneNumbers'].map((name) =>
            attribute(name, 'complex', { multiValued: true, subAttributes: contact }),
          ),
        ],
      },
      {
        id: `${CORE}Group`,
        name: 'Group',
        attributes: [
          attribute('displayName', 'string', { required: true }),
          attribute('externalId', 'string', { mutability: 'immutable' }),
          attribute('members', 'complex', {
            multiValued: true,
            subAttributes: [
              attribute('value', 'string', { required: true }),
              attribute('display', 'string', { mutability: 'readOnly' }),
            ],
          }),
        ],
      },
    ];
    return {
      schemas: [`${API}ListResponse`],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
      Resources: schemas.map((schema) => ({ ...schema, schemas: [`${CORE}Schema`] })),
    };
  }

  async list(actor: ScimActor, type: 'Users' | 'Groups', query: Record<string, unknown>) {
    if (query.sortBy || query.sortOrder)
      throw scimError(400, 'Sorting is not supported', 'invalidValue');
    const start = Number(query.startIndex ?? 1),
      size = Number(query.count ?? 100);
    if (
      !Number.isSafeInteger(start) ||
      start < 1 ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > 200
    )
      throw scimError(400, 'Invalid pagination', 'invalidValue');
    return this.run(actor, false, false, async (tx) => {
      const table = type === 'Users' ? scimUsers : scimGroups;
      let filter: ReturnType<typeof eq> | undefined;
      if (query.filter) {
        const match = String(query.filter).match(
          /^(userName|externalId|displayName)\s+eq\s+("(?:\\.|[^"\\])*")$/,
        );
        if (!match)
          throw scimError(
            400,
            'Only userName, externalId or displayName eq filters are supported',
            'invalidFilter',
          );
        let value: string;
        try {
          value = JSON.parse(match[2]!);
        } catch {
          throw scimError(400, 'Invalid filter', 'invalidFilter');
        }
        if (value.length > 500) throw scimError(400, 'Invalid filter', 'invalidFilter');
        if (match[1] === 'externalId') filter = eq(table.externalId, value);
        else if (type === 'Users' && match[1] === 'userName')
          filter = eq(tenantUsers.email, value.toLowerCase());
        else if (type === 'Groups' && match[1] === 'displayName')
          filter = eq(scimGroups.displayName, value);
        else throw scimError(400, 'Filter does not apply to this resource', 'invalidFilter');
      }
      const where = and(
        eq(table.connectionId, actor.connectionId),
        isNull(table.deletedAt),
        filter,
      );
      if (type === 'Users') {
        const rows = await tx
          .select({ resource: scimUsers, user: tenantUsers })
          .from(scimUsers)
          .innerJoin(tenantUsers, eq(tenantUsers.id, scimUsers.userId))
          .where(where)
          .orderBy(asc(scimUsers.id))
          .limit(size)
          .offset(start - 1);
        const [total] = await tx
          .select({ n: count() })
          .from(scimUsers)
          .innerJoin(tenantUsers, eq(tenantUsers.id, scimUsers.userId))
          .where(where);
        return {
          schemas: [`${API}ListResponse`],
          totalResults: total!.n,
          startIndex: start,
          itemsPerPage: rows.length,
          Resources: rows.map((r) => this.userView(r.resource, r.user)),
        };
      }
      const rows = await tx
        .select()
        .from(scimGroups)
        .where(where)
        .orderBy(asc(scimGroups.id))
        .limit(size)
        .offset(start - 1);
      const [total] = await tx.select({ n: count() }).from(scimGroups).where(where);
      return {
        schemas: [`${API}ListResponse`],
        totalResults: total!.n,
        startIndex: start,
        itemsPerPage: rows.length,
        Resources: await Promise.all(rows.map((g) => this.groupView(tx, g))),
      };
    });
  }
  async get(actor: ScimActor, type: 'Users' | 'Groups', id: string) {
    return this.run(actor, false, false, async (tx) =>
      type === 'Users'
        ? this.readUser(tx, actor, id)
        : this.groupView(tx, await this.group(tx, actor, id)),
    );
  }
  async create(actor: ScimActor, type: 'Users' | 'Groups', body: unknown) {
    return this.run(actor, true, false, async (tx) => {
      if (type === 'Users') {
        const input = parse(userInput, body);
        const [existing] = await tx
          .select({ id: tenantUsers.id })
          .from(tenantUsers)
          .where(eq(tenantUsers.email, input.userName));
        if (existing)
          throw scimError(
            409,
            'A login already uses that userName; use an explicit account-link process',
            'uniqueness',
          );
        if (input.externalId) {
          const previous = await tx
            .select({ id: scimUsers.id })
            .from(scimUsers)
            .where(
              and(
                eq(scimUsers.connectionId, actor.connectionId),
                eq(scimUsers.externalId, input.externalId),
              ),
            );
          if (previous.length)
            throw scimError(
              409,
              'externalId already exists, including a retained tombstone',
              'uniqueness',
            );
        }
        const [user] = await tx
          .insert(tenantUsers)
          .values({
            tenantId: actor.tenantId,
            name: this.display(input),
            email: input.userName,
            phone: input.phoneNumbers?.find((p) => p.primary)?.value ?? null,
            role: 'employee',
            passwordHash: null,
            scopeMode: 'none',
            accessMode: 'custom',
            provisionDisabled: !input.active,
          })
          .returning();
        const [resource] = await tx
          .insert(scimUsers)
          .values({
            tenantId: actor.tenantId,
            connectionId: actor.connectionId,
            userId: user!.id,
            externalId: input.externalId ?? null,
            active: input.active,
            attributes: this.attributes(input),
          })
          .returning();
        await identityEvent(tx, actor.credentialId, 'scim', 'scim.user_created', resource!.id, {
          active: input.active,
          linkTaskUserId: user!.id,
        });
        return this.userView(resource!, user!);
      }
      const input = parse(groupInput, body);
      const [group] = await tx
        .insert(scimGroups)
        .values({
          tenantId: actor.tenantId,
          connectionId: actor.connectionId,
          displayName: input.displayName,
          externalId: input.externalId ?? null,
        })
        .returning();
      await this.members(
        tx,
        actor,
        group!.id,
        input.members.map((m) => m.value),
      );
      await identityEvent(tx, actor.credentialId, 'scim', 'scim.group_created', group!.id);
      return this.groupView(tx, group!);
    });
  }
  async change(
    actor: ScimActor,
    type: 'Users' | 'Groups',
    id: string,
    body: unknown,
    match: string | undefined,
    partial: boolean,
  ) {
    // Only an exact active=false patch can bypass commercial read-only restrictions.
    const reducing =
      type === 'Users' ? this.isDeactivation(body, partial) : this.isGroupReduction(body, partial);
    return this.run(actor, true, reducing, async (tx) => {
      if (type === 'Users') {
        const row = await this.user(tx, actor, id, true);
        this.match(row.resource.version, match, true);
        const current = this.userView(row.resource, row.user);
        const merged = partial ? this.userPatch(current, body) : body;
        const input = parse(userInput, merged);
        if (input.id && input.id !== row.resource.id)
          throw scimError(400, 'id is immutable', 'mutability');
        if (input.active && !row.resource.active && !match)
          throw scimError(428, 'Reactivation requires the current If-Match version');
        if (input.externalId !== undefined && input.externalId !== row.resource.externalId)
          throw scimError(400, 'externalId is immutable', 'mutability');
        if (row.user.emergencyLocal || row.user.role !== 'employee')
          throw scimError(403, 'Protected local account');
        const attrs = reducing
          ? {}
          : {
              email: input.userName,
              name: this.display(input),
              phone: input.phoneNumbers?.find((p) => p.primary)?.value ?? null,
            };
        const [user] = await tx
          .update(tenantUsers)
          .set({
            ...attrs,
            provisionDisabled: !input.active,
            authRevision: row.user.authRevision + 1,
          })
          .where(eq(tenantUsers.id, row.user.id))
          .returning();
        const [resource] = await tx
          .update(scimUsers)
          .set({
            active: input.active,
            version: row.resource.version + 1,
            ...(!reducing ? { attributes: this.attributes(input) } : {}),
          })
          .where(eq(scimUsers.id, id))
          .returning();
        await identityEvent(
          tx,
          actor.credentialId,
          'scim',
          input.active ? 'scim.user_updated' : 'scim.user_deactivated',
          id,
          { version: resource!.version },
        );
        return this.userView(resource!, user!);
      }
      const group = await this.group(tx, actor, id, true);
      this.match(group.version, match, true);
      const current = await this.groupView(tx, group);
      const mutation = partial
        ? this.groupPatch(current, body)
        : { resource: body, removedIds: [], clear: false };
      const input = parse(groupInput, mutation.resource);
      if (input.id && input.id !== group.id) throw scimError(400, 'id is immutable', 'mutability');
      const currentIds = current.members.map((m) => m.value),
        added = input.members.filter((m) => !currentIds.includes(m.value));
      if (!match && group.requireMembershipVersion && added.length)
        throw scimError(
          428,
          'Membership additions after clearing a group require the current If-Match version',
        );
      if (input.externalId !== undefined && input.externalId !== group.externalId)
        throw scimError(400, 'externalId is immutable', 'mutability');
      const [updated] = await tx
        .update(scimGroups)
        .set({
          displayName: input.displayName,
          version: group.version + 1,
          requireMembershipVersion:
            group.requireMembershipVersion ||
            mutation.clear ||
            (!partial && input.members.length === 0),
        })
        .where(eq(scimGroups.id, id))
        .returning();
      await this.members(
        tx,
        actor,
        id,
        input.members.map((m) => m.value),
        !!match,
        mutation.removedIds,
      );
      await refreshGroupGrants(tx, id);
      await identityEvent(tx, actor.credentialId, 'scim', 'scim.group_updated', id, {
        version: updated!.version,
      });
      return this.groupView(tx, updated!);
    });
  }
  async remove(actor: ScimActor, type: 'Users' | 'Groups', id: string) {
    return this.run(actor, true, true, async (tx) => {
      const table = type === 'Users' ? scimUsers : scimGroups;
      const [resource] = await tx
        .select()
        .from(table)
        .where(and(eq(table.id, id), eq(table.connectionId, actor.connectionId)))
        .for('update');
      if (!resource) throw scimError(404, 'Resource not found');
      if (resource.deletedAt) return;
      await tx
        .update(table)
        .set({ deletedAt: new Date(), version: resource.version + 1 })
        .where(eq(table.id, id));
      if (type === 'Users') {
        const row = resource as typeof scimUsers.$inferSelect;
        const [user] = await tx
          .select()
          .from(tenantUsers)
          .where(eq(tenantUsers.id, row.userId))
          .for('update');
        if (user?.emergencyLocal || user?.role !== 'employee')
          throw scimError(403, 'Protected local account');
        await tx
          .update(tenantUsers)
          .set({ provisionDisabled: true })
          .where(eq(tenantUsers.id, row.userId));
        await tx.update(scimUsers).set({ active: false }).where(eq(scimUsers.id, id));
        const memberships = await tx
          .select()
          .from(scimMemberships)
          .where(eq(scimMemberships.scimUserId, id));
        for (const m of memberships)
          await tx
            .insert(scimMembershipRemovals)
            .values({ tenantId: actor.tenantId, groupId: m.groupId, scimUserId: id })
            .onConflictDoNothing();
        await tx.delete(scimMemberships).where(eq(scimMemberships.scimUserId, id));
        for (const m of memberships) await refreshGroupGrants(tx, m.groupId);
      } else {
        await tx.delete(scimMemberships).where(eq(scimMemberships.groupId, id));
        await refreshGroupGrants(tx, id);
      }
      await identityEvent(
        tx,
        actor.credentialId,
        'scim',
        type === 'Users' ? 'scim.user_deleted' : 'scim.group_deleted',
        id,
        { version: resource.version + 1 },
      );
    });
  }
  private match(version: number, match: string | undefined, reducing: boolean) {
    if (match === undefined && !reducing)
      throw scimError(
        428,
        'If-Match is required for updates; read the current resource version first',
      );
    if (match !== undefined && match !== etag(version))
      throw scimError(412, 'Resource changed; read and reconcile before retrying', 'invalidVers');
  }
  private async user(tx: Tx, actor: ScimActor, id: string, lock = false) {
    const query = tx
      .select({ resource: scimUsers, user: tenantUsers })
      .from(scimUsers)
      .innerJoin(tenantUsers, eq(tenantUsers.id, scimUsers.userId))
      .where(
        and(
          eq(scimUsers.id, id),
          eq(scimUsers.connectionId, actor.connectionId),
          isNull(scimUsers.deletedAt),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw scimError(404, 'Resource not found');
    return row;
  }
  private async readUser(tx: Tx, actor: ScimActor, id: string) {
    const row = await this.user(tx, actor, id);
    return this.userView(row.resource, row.user);
  }
  private async group(tx: Tx, actor: ScimActor, id: string, lock = false) {
    const query = tx
      .select()
      .from(scimGroups)
      .where(
        and(
          eq(scimGroups.id, id),
          eq(scimGroups.connectionId, actor.connectionId),
          isNull(scimGroups.deletedAt),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw scimError(404, 'Resource not found');
    return row;
  }
  private userView(r: typeof scimUsers.$inferSelect, u: typeof tenantUsers.$inferSelect) {
    return {
      schemas: [`${CORE}User`],
      name: r.attributes.name ?? { formatted: u.name },
      id: r.id,
      externalId: r.externalId ?? undefined,
      userName: u.email!,
      displayName: u.name,
      active: r.active && !u.provisionDisabled && !u.disabledAt,
      emails:
        r.attributes.emails ?? (u.email ? [{ value: u.email, primary: true, type: 'work' }] : []),
      phoneNumbers:
        r.attributes.phoneNumbers ??
        (u.phone ? [{ value: u.phone, primary: true, type: 'work' }] : []),
      meta: {
        resourceType: 'User',
        created: r.createdAt.toISOString(),
        version: etag(r.version),
        location: `/scim/v2/Users/${r.id}`,
      },
    };
  }
  private async groupView(tx: Tx, r: typeof scimGroups.$inferSelect) {
    return {
      schemas: [`${CORE}Group`],
      id: r.id,
      displayName: r.displayName,
      externalId: r.externalId ?? undefined,
      members: (
        await tx
          .select({ value: scimMemberships.scimUserId })
          .from(scimMemberships)
          .where(eq(scimMemberships.groupId, r.id))
      ).map((m) => ({ ...m, $ref: `/scim/v2/Users/${m.value}` })),
      meta: {
        resourceType: 'Group',
        created: r.createdAt.toISOString(),
        version: etag(r.version),
        location: `/scim/v2/Groups/${r.id}`,
      },
    };
  }
  private display(input: z.infer<typeof userInput>) {
    return (
      input.displayName ??
      input.name?.formatted ??
      ([input.name?.givenName, input.name?.familyName].filter(Boolean).join(' ') || input.userName)
    );
  }
  private attributes(input: z.infer<typeof userInput>) {
    return {
      name: input.name ?? {},
      emails: input.emails ?? [],
      phoneNumbers: input.phoneNumbers ?? [],
    };
  }
  private async members(
    tx: Tx,
    actor: ScimActor,
    groupId: string,
    ids: string[],
    conditional = false,
    explicitRemovals: string[] = [],
  ) {
    const unique = [...new Set(ids)];
    for (const id of unique) await this.user(tx, actor, id);
    const current = (
      await tx
        .select({ id: scimMemberships.scimUserId })
        .from(scimMemberships)
        .where(eq(scimMemberships.groupId, groupId))
    ).map((m) => m.id);
    const added = unique.filter((id) => !current.includes(id)),
      removed = [
        ...new Set([...current.filter((id) => !unique.includes(id)), ...explicitRemovals]),
      ];
    if (added.length && !conditional) {
      const previous = await tx
        .select({ id: scimMembershipRemovals.id })
        .from(scimMembershipRemovals)
        .where(
          and(
            eq(scimMembershipRemovals.groupId, groupId),
            inArray(scimMembershipRemovals.scimUserId, added),
          ),
        )
        .limit(1);
      if (previous.length)
        throw scimError(428, 'Re-adding a removed member requires the current If-Match version');
    }
    if (removed.length) {
      const own = await tx
        .select({ id: scimUsers.id })
        .from(scimUsers)
        .where(and(eq(scimUsers.connectionId, actor.connectionId), inArray(scimUsers.id, removed)));
      if (own.length)
        await tx
          .insert(scimMembershipRemovals)
          .values(own.map((u) => ({ tenantId: actor.tenantId, groupId, scimUserId: u.id })))
          .onConflictDoNothing();
    }
    await tx.delete(scimMemberships).where(eq(scimMemberships.groupId, groupId));
    if (unique.length)
      await tx
        .insert(scimMemberships)
        .values(unique.map((scimUserId) => ({ tenantId: actor.tenantId, groupId, scimUserId })));
  }
  private userPatch(current: ReturnType<ScimService['userView']>, body: unknown) {
    let result: Record<string, unknown> = { ...current };
    delete result.schemas;
    delete result.id;
    delete result.meta;
    for (const op of parse(patch, body).Operations) {
      const kind = op.op.toLowerCase();
      if (!['add', 'replace', 'remove'].includes(kind))
        throw scimError(400, 'Unsupported PATCH operation', 'invalidSyntax');
      if (!op.path) {
        if (!op.value || typeof op.value !== 'object' || Array.isArray(op.value))
          throw scimError(400, 'Object PATCH value required', 'invalidValue');
        if (
          Object.keys(op.value).some(
            (k) =>
              !['active', 'displayName', 'userName', 'name', 'emails', 'phoneNumbers'].includes(k),
          )
        )
          throw scimError(400, 'Unsupported PATCH path', 'invalidPath');
        result = { ...result, ...op.value };
        continue;
      }
      const nested = op.path.match(/^name\.(givenName|familyName|formatted)$/);
      if (nested) {
        const name = { ...(result.name as Record<string, unknown>) };
        if (kind === 'remove') delete name[nested[1]!];
        else name[nested[1]!] = op.value;
        result.name = name;
        continue;
      }
      const contact = op.path.match(
        /^(emails|phoneNumbers)\[type eq "(work|home|mobile)"\](?:\.(value|primary))?$/,
      );
      if (contact) {
        const attr = contact[1]!,
          type = contact[2]!,
          items = [...((result[attr] ?? []) as Record<string, unknown>[])],
          at = items.findIndex((v) => v.type === type);
        if (kind === 'remove') {
          if (at >= 0) items.splice(at, 1);
        } else if (contact[3]) {
          const next = { ...(items[at] ?? { type }), [contact[3]]: op.value };
          if (at >= 0) items[at] = next;
          else items.push(next);
        } else {
          const values = parse(
            z.object({
              value: z.string(),
              primary: z.boolean().optional(),
              type: z.string().optional(),
            }),
            op.value,
          );
          if (at >= 0) items[at] = { ...values, type };
          else items.push({ ...values, type });
        }
        result[attr] = items;
        continue;
      }
      if (
        !['active', 'displayName', 'userName', 'name', 'emails', 'phoneNumbers'].includes(op.path)
      )
        throw scimError(400, 'Unsupported PATCH path', 'invalidPath');
      if (kind === 'remove') {
        if (['active', 'userName'].includes(op.path))
          throw scimError(400, 'Cannot remove a required attribute', 'mutability');
        delete result[op.path];
      } else result[op.path] = op.value;
    }
    return result;
  }
  private groupPatch(current: Awaited<ReturnType<ScimService['groupView']>>, body: unknown) {
    const result: Record<string, unknown> = { ...current };
    delete result.schemas;
    delete result.id;
    delete result.meta;
    let members: z.infer<typeof member>[] = [...current.members];
    const removedIds: string[] = [];
    let clear = false;
    for (const op of parse(patch, body).Operations) {
      const kind = op.op.toLowerCase();
      if (!['add', 'replace', 'remove'].includes(kind))
        throw scimError(400, 'Unsupported PATCH operation', 'invalidSyntax');
      if (op.path === 'displayName' && kind !== 'remove') {
        result.displayName = op.value;
        continue;
      }
      const selected = op.path?.match(/^members\[value eq "([a-f0-9-]{36})"\]$/);
      if (selected && kind === 'remove') {
        removedIds.push(selected[1]!);
        members = members.filter((m) => m.value !== selected[1]);
        continue;
      }
      if (op.path === 'members') {
        if (kind === 'remove') {
          removedIds.push(...members.map((m) => m.value));
          members = [];
          clear = true;
        } else {
          const next = parse(z.array(member).max(1000), op.value);
          if (kind === 'replace' && !next.length) clear = true;
          members = kind === 'replace' ? next : [...members, ...next];
        }
        continue;
      }
      if (!op.path && op.value && typeof op.value === 'object') {
        const values = op.value as Record<string, unknown>;
        if (values.displayName !== undefined) result.displayName = values.displayName;
        if (values.members !== undefined) {
          const next = parse(z.array(member).max(1000), values.members);
          if (kind === 'replace' && !next.length) clear = true;
          members = kind === 'replace' ? next : [...members, ...next];
        }
        if (Object.keys(values).some((k) => !['displayName', 'members'].includes(k)))
          throw scimError(400, 'Unsupported PATCH path', 'invalidPath');
        continue;
      }
      throw scimError(400, 'Unsupported PATCH path', 'invalidPath');
    }
    result.members = members;
    return { resource: result, removedIds, clear };
  }
  private isGroupReduction(body: unknown, partial: boolean) {
    if (!partial) return false;
    const result = patch.safeParse(body);
    return (
      result.success &&
      result.data.Operations.every(
        (op) =>
          op.op.toLowerCase() === 'remove' &&
          (op.path === 'members' || /^members\[value eq "[a-f0-9-]{36}"\]$/.test(op.path ?? '')),
      )
    );
  }
  private isDeactivation(body: unknown, partial: boolean) {
    if (!body || typeof body !== 'object') return false;
    if (!partial) return (body as Record<string, unknown>).active === false;
    const result = patch.safeParse(body);
    if (!result.success) return false;
    return (
      result.data.Operations.length === 1 &&
      ['replace', 'add'].includes(result.data.Operations[0]!.op.toLowerCase()) &&
      ((result.data.Operations[0]!.path === 'active' &&
        result.data.Operations[0]!.value === false) ||
        (!result.data.Operations[0]!.path &&
          JSON.stringify(result.data.Operations[0]!.value) === '{"active":false}'))
    );
  }
}
