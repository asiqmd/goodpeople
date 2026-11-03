import { Inject, Injectable, NotFoundException, HttpException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  apiClients,
  apiClientCredentials,
  apiClientGrants,
  webhookSubscriptions,
  webhookDeliveries,
  integrationEvents,
  jobLeases,
  jobAssignments,
  tenantUsers,
  legalEntities,
  provisioningEvents,
  type Database,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  todayIn,
  type ApiClientInput,
  type WebhookInput,
  type IntegrationsOverview,
  type TenantWithAccess,
  type ApiScope,
} from '@gp/shared';
import { and, eq, isNull, gt, desc, sql, lte } from 'drizzle-orm';
import { DB, FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { currentTenantId } from '../../common/request-context.js';
import type { AuthUser } from '../../common/auth-user.js';
import { identityAdmin, identityEvent } from '../identity/identity.service.js';
import { policyOf } from '../../common/authority.js';
import { ownerCompanies, digest, resolveService } from './authority.js';
import { clientIdentifier, integrationError } from './public-auth.js';
export const eventScope = (type: string): ApiScope =>
  type === 'attendance.day.finalized' ? 'attendance:read' : 'employees:read';
@Injectable()
export class IntegrationsAdmin {
  constructor(
    private tenantDb: TenantDb,
    @Inject(DB) private db: Database,
    @Inject(FIELD_CIPHER) private cipher: FieldCipher,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) {}
  private feature(tenant: TenantWithAccess) {
    if (tenant.access.accessState !== 'full' || !tenant.access.features.includes('api_access'))
      integrationError(
        403,
        'api_access_required',
        'Full API access is required to grant new integration authority',
      );
  }
  async overview(actor: AuthUser): Promise<IntegrationsOverview> {
    identityAdmin(actor, false);
    return this.tenantDb.run(async (tx) => {
      const clients = await tx.select().from(apiClients).orderBy(desc(apiClients.createdAt));
      const credentials = await tx.select().from(apiClientCredentials);
      const grants = await tx.select().from(apiClientGrants);
      const subscriptions = await tx.select().from(webhookSubscriptions);
      const deliveries = await tx
        .select({
          id: webhookDeliveries.id,
          subscriptionId: webhookDeliveries.subscriptionId,
          eventId: webhookDeliveries.eventId,
          type: integrationEvents.type,
          state: webhookDeliveries.state,
          attempts: webhookDeliveries.attempts,
          nextAttemptAt: webhookDeliveries.nextAttemptAt,
          lastStatus: webhookDeliveries.lastStatus,
          error: webhookDeliveries.lastError,
        })
        .from(webhookDeliveries)
        .innerJoin(integrationEvents, eq(integrationEvents.id, webhookDeliveries.eventId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(100);
      const [queue] = await tx
        .select({
          pending: sql<number>`count(*) filter(where ${webhookDeliveries.state} in ('pending','leased'))::int`,
          dead: sql<number>`count(*) filter(where ${webhookDeliveries.state}='dead')::int`,
          oldestAt: sql<
            string | null
          >`min(${webhookDeliveries.createdAt}) filter(where ${webhookDeliveries.state} in ('pending','leased'))`,
        })
        .from(webhookDeliveries);
      const [outbox] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(integrationEvents)
        .where(
          and(isNull(integrationEvents.fannedAt), gt(integrationEvents.expiresAt, new Date())),
        );
      const [worker] = await tx
        .select({
          heartbeatAt: sql<string | null>`max(${jobLeases.heartbeatAt})`,
          failures: sql<number>`count(*) filter(where ${jobLeases.ok}=false)::int`,
        })
        .from(jobLeases)
        .where(
          sql`${jobLeases.key} like ${'%:' + currentTenantId()} or ${jobLeases.key} in ('billing','support','status')`,
        );
      const events = await tx
        .select({
          id: provisioningEvents.id,
          action: provisioningEvents.action,
          actorId: provisioningEvents.actorId,
          createdAt: provisioningEvents.createdAt,
        })
        .from(provisioningEvents)
        .where(sql`${provisioningEvents.action} like 'integration.%'`)
        .orderBy(desc(provisioningEvents.createdAt))
        .limit(100);
      return {
        endpoints: {
          token: new URL('/oauth/token', this.config.API_ORIGIN).href,
          api: new URL('/public/v1', this.config.API_ORIGIN).href,
          openapi: new URL('/public/v1/openapi.json', this.config.API_ORIGIN).href,
        },
        clients: clients.map((c) => {
          const grant = grants.find((g) => g.clientId === c.id);
          return {
            id: c.id,
            clientId: clientIdentifier(c.tenantId, c.id),
            name: c.name,
            ownerId: c.ownerId,
            expiresAt: c.expiresAt.toISOString(),
            revoked: !!c.revokedAt,
            expired: c.expiresAt.getTime() <= Date.now(),
            daysRemaining: Math.max(
              1,
              Math.min(365, Math.ceil((c.expiresAt.getTime() - Date.now()) / 86400000)),
            ),
            reviewRequired: c.reviewRequired,
            version: c.version,
            scopes: c.scopes,
            fields: c.fields,
            scope: grant?.scope ?? 'none',
            companyIds: grant?.companyIds ?? [],
            credentials: credentials
              .filter((k) => k.clientId === c.id)
              .map((k) => ({
                id: k.id,
                expiresAt: k.expiresAt.toISOString(),
                revoked: !!k.revokedAt,
              })),
          };
        }),
        subscriptions: subscriptions.map((s) => ({
          id: s.id,
          clientId: s.clientId,
          name: s.name,
          url: s.url,
          events: s.events,
          enabled: s.enabled,
          failureCount: s.failureCount,
          keyId: s.keyId,
          pendingKeyId: s.pendingKeyId,
        })),
        deliveries: deliveries.map((d) => ({ ...d, nextAttemptAt: d.nextAttemptAt.toISOString() })),
        queue: {
          pending: queue?.pending ?? 0,
          dead: queue?.dead ?? 0,
          oldestAt: queue?.oldestAt ?? null,
          outboxPending: outbox?.n ?? 0,
        },
        worker: {
          heartbeatAt: worker?.heartbeatAt ?? null,
          stale: !worker?.heartbeatAt || Date.now() - Date.parse(worker.heartbeatAt) > 120000,
          failures: worker?.failures ?? 0,
        },
        companies: await tx
          .select({ id: legalEntities.id, name: legalEntities.name })
          .from(legalEntities),
        owners: await tx
          .select({ id: tenantUsers.id, name: tenantUsers.name })
          .from(tenantUsers)
          .where(and(isNull(tenantUsers.disabledAt), eq(tenantUsers.provisionDisabled, false))),
        events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      };
    });
  }
  private async ceiling(tx: Tx, input: ApiClientInput) {
    const [owner] = await tx
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.id, input.ownerId))
      .for('share');
    if (!owner || owner.disabledAt || owner.provisionDisabled || owner.role === 'support')
      integrationError(400, 'invalid_owner', 'Choose an active accountable workspace owner');
    if (new Set(input.companyIds).size !== input.companyIds.length)
      integrationError(400, 'duplicate_company', 'Choose each company once');
    const ceiling = await ownerCompanies(tx, owner, input.scopes);
    if (input.companyIds.some((c) => !ceiling.includes(c)))
      integrationError(
        403,
        'delegation_ceiling',
        'The owner cannot delegate these companies and scopes',
      );
    if (input.scope === 'all') {
      const policy = await policyOf(tx, owner);
      if (
        policy.custom
          ? input.scopes.some(
              (s) =>
                !policy.grants.some(
                  (g) =>
                    g.scope === 'all' &&
                    g.relationship === 'all' &&
                    g.permissions.includes(
                      s === 'attendance:read' ? 'attendance.manage' : 'employees.read',
                    ),
                ),
            )
          : owner.scopeMode !== 'all' || !ceiling.length
      )
        integrationError(
          403,
          'delegation_ceiling',
          'All-company delegation requires authority for future companies',
        );
    }
  }
  async saveClient(actor: AuthUser, tenant: TenantWithAccess, input: ApiClientInput, id?: string) {
    identityAdmin(actor);
    this.feature(tenant);
    return this.tenantDb.run(async (tx) => {
      // Serialize tenant administrative quotas, including concurrent client creation.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${'api-clients:' + currentTenantId()},0))`,
      );
      await this.ceiling(tx, input);
      if (!id) {
        const [n] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(apiClients)
          .where(isNull(apiClients.revokedAt));
        if (n!.n >= 20)
          integrationError(409, 'client_limit', 'Revoke an unused client before creating another');
      }
      const [before] = id
        ? await tx.select().from(apiClients).where(eq(apiClients.id, id)).for('update')
        : [];
      if (id && (!before || before.revokedAt)) throw new NotFoundException('Client not found');
      if (before && input.version !== before.version)
        integrationError(409, 'stale_version', 'Reload the client before changing it');
      const values = {
        name: input.name,
        ownerId: input.ownerId,
        expiresAt: new Date(Date.now() + input.days * 86400000),
        scopes: [...new Set(input.scopes)],
        fields: [...new Set(input.fields)],
        reviewRequired: false,
      };
      const [client] = before
        ? await tx.update(apiClients).set(values).where(eq(apiClients.id, id!)).returning()
        : await tx
            .insert(apiClients)
            .values({ tenantId: currentTenantId(), ...values })
            .returning();
      await tx
        .insert(apiClientGrants)
        .values({
          tenantId: currentTenantId(),
          clientId: client!.id,
          scope: input.scope,
          companyIds: input.companyIds,
        })
        .onConflictDoUpdate({
          target: apiClientGrants.clientId,
          set: { scope: input.scope, companyIds: input.companyIds },
        });
      let secret: string | undefined;
      if (!before) secret = (await this.newCredential(tx, client!.id, client!.expiresAt)).secret;
      await identityEvent(
        tx,
        actor.id,
        'user',
        before ? 'integration.client_updated' : 'integration.client_created',
        client!.id,
        {
          ownerId: input.ownerId,
          scopes: values.scopes,
          fields: values.fields,
          scope: input.scope,
          companyIds: input.companyIds,
        },
      );
      return {
        id: client!.id,
        clientId: clientIdentifier(currentTenantId(), client!.id),
        ...(secret ? { secret } : {}),
      };
    });
  }
  private async newCredential(tx: Tx, clientId: string, expiresAt: Date) {
    const secret = 'gpsec_' + randomBytes(32).toString('base64url');
    const [row] = await tx
      .insert(apiClientCredentials)
      .values({ tenantId: currentTenantId(), clientId, secretHash: digest(secret), expiresAt })
      .returning();
    return { id: row!.id, secret };
  }
  async rotateClient(
    actor: AuthUser,
    tenant: TenantWithAccess,
    id: string,
    overlapSeconds: number,
  ) {
    identityAdmin(actor);
    this.feature(tenant);
    return this.tenantDb.run(async (tx) => {
      const [client] = await tx
        .select()
        .from(apiClients)
        .where(eq(apiClients.id, id))
        .for('update');
      if (!client || client.revokedAt) throw new NotFoundException('Client not found');
      const active = await tx
        .select()
        .from(apiClientCredentials)
        .where(
          and(
            eq(apiClientCredentials.clientId, id),
            isNull(apiClientCredentials.revokedAt),
            gt(apiClientCredentials.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(apiClientCredentials.createdAt));
      if (active.length > 1)
        integrationError(
          409,
          'rotation_in_progress',
          'Revoke the previous credential or wait for its overlap to finish',
        );
      await tx
        .update(apiClientCredentials)
        .set({
          expiresAt: new Date(
            Math.min(client.expiresAt.getTime(), Date.now() + overlapSeconds * 1000),
          ),
        })
        .where(and(eq(apiClientCredentials.clientId, id), isNull(apiClientCredentials.revokedAt)));
      const result = await this.newCredential(tx, id, client.expiresAt);
      await identityEvent(tx, actor.id, 'user', 'integration.client_secret_rotated', id, {
        overlapSeconds,
      });
      return result;
    });
  }
  async revokeClient(actor: AuthUser, id: string) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      const [c] = await tx
        .update(apiClients)
        .set({ revokedAt: new Date() })
        .where(eq(apiClients.id, id))
        .returning();
      if (!c) throw new NotFoundException('Client not found');
      await tx
        .update(webhookSubscriptions)
        .set({ enabled: false })
        .where(eq(webhookSubscriptions.clientId, id));
      await identityEvent(tx, actor.id, 'user', 'integration.client_revoked', id);
      return { revoked: true };
    });
  }
  async revokeCredential(actor: AuthUser, id: string) {
    identityAdmin(actor);
    return this.tenantDb.run(async (tx) => {
      const [c] = await tx
        .update(apiClientCredentials)
        .set({ revokedAt: new Date() })
        .where(eq(apiClientCredentials.id, id))
        .returning();
      if (!c) throw new NotFoundException('Credential not found');
      await identityEvent(tx, actor.id, 'user', 'integration.credential_revoked', id);
      return { revoked: true };
    });
  }
  async createWebhook(actor: AuthUser, tenant: TenantWithAccess, input: WebhookInput) {
    identityAdmin(actor);
    this.feature(tenant);
    await this.validateTarget(input.url);
    return this.tenantDb.run(async (tx) => {
      const [client] = await tx
        .select()
        .from(apiClients)
        .where(eq(apiClients.id, input.clientId))
        .for('share');
      if (
        !client ||
        client.revokedAt ||
        client.reviewRequired ||
        client.expiresAt.getTime() <= Date.now()
      )
        integrationError(400, 'invalid_client', 'Choose an active reviewed client');
      if (input.events.some((e) => !client.scopes.includes(eventScope(e))))
        integrationError(403, 'insufficient_scope', 'The client needs each event’s resource scope');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${'webhook-quota:' + input.clientId},0))`,
      );
      const [n] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.clientId, input.clientId));
      if (n!.n >= 10)
        integrationError(409, 'subscription_limit', 'A client supports at most ten subscriptions');
      const secret = randomBytes(32).toString('base64url'),
        keyId = randomUUID();
      const [subscription] = await tx
        .insert(webhookSubscriptions)
        .values({
          tenantId: currentTenantId(),
          ...input,
          events: [...new Set(input.events)],
          keyId,
          secretEnc: this.cipher.encrypt(secret, {
            tenantId: currentTenantId(),
            field: 'webhook_subscriptions.signing_secret',
          }),
        })
        .returning();
      await identityEvent(tx, actor.id, 'user', 'integration.webhook_created', subscription!.id, {
        clientId: input.clientId,
      });
      return { id: subscription!.id, keyId, secret };
    });
  }
  private async validateTarget(target: string) {
    // Validation uses the same pinned resolver as delivery, without contacting the receiver.
    const { validateWebhookTarget } = await import('./webhook-network.js');
    await validateWebhookTarget(
      target,
      this.config.WEBHOOK_PRIVATE_HOSTS,
      process.env.NODE_ENV === 'test',
    );
  }
  async webhookState(actor: AuthUser, tenant: TenantWithAccess, id: string, enabled: boolean) {
    identityAdmin(actor);
    if (enabled) this.feature(tenant);
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(webhookSubscriptions)
        .set({ enabled, failureCount: enabled ? 0 : undefined })
        .where(eq(webhookSubscriptions.id, id))
        .returning();
      if (!row) throw new NotFoundException('Subscription not found');
      await identityEvent(tx, actor.id, 'user', 'integration.webhook_state', id, { enabled });
      return { enabled };
    });
  }
  async rotateWebhook(actor: AuthUser, tenant: TenantWithAccess, id: string) {
    identityAdmin(actor);
    this.feature(tenant);
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, id))
        .for('update');
      if (!row) throw new NotFoundException('Subscription not found');
      const secret = randomBytes(32).toString('base64url'),
        keyId = randomUUID();
      await tx
        .update(webhookSubscriptions)
        .set({
          pendingKeyId: keyId,
          pendingSecretEnc: this.cipher.encrypt(secret, {
            tenantId: currentTenantId(),
            field: 'webhook_subscriptions.signing_secret',
          }),
        })
        .where(eq(webhookSubscriptions.id, id));
      await identityEvent(tx, actor.id, 'user', 'integration.webhook_key_prepared', id, { keyId });
      return { keyId, secret };
    });
  }
  async activateWebhookKey(actor: AuthUser, tenant: TenantWithAccess, id: string) {
    identityAdmin(actor);
    this.feature(tenant);
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, id))
        .for('update');
      if (!row?.pendingKeyId || !row.pendingSecretEnc)
        integrationError(409, 'no_pending_key', 'Prepare a signing key first');
      await tx
        .update(webhookSubscriptions)
        .set({
          keyId: row.pendingKeyId,
          secretEnc: row.pendingSecretEnc,
          pendingKeyId: null,
          pendingSecretEnc: null,
        })
        .where(eq(webhookSubscriptions.id, id));
      await identityEvent(tx, actor.id, 'user', 'integration.webhook_key_activated', id, {
        keyId: row.pendingKeyId,
      });
      return { activated: true };
    });
  }
  async replay(actor: AuthUser, tenant: TenantWithAccess, id: string, reason: string) {
    identityAdmin(actor);
    this.feature(tenant);
    return this.tenantDb.run(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.id, id));
      if (!candidate) throw new NotFoundException('Delivery not found');
      const [subscription] = await tx
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, candidate.subscriptionId));
      const [event] = await tx
        .select()
        .from(integrationEvents)
        .where(eq(integrationEvents.id, candidate.eventId));
      if (
        !subscription?.enabled ||
        !event ||
        event.expiresAt.getTime() <= Date.now() ||
        event.occurredAt.getTime() < Date.now() - this.config.WEBHOOK_RETENTION_DAYS * 86400000 ||
        !event.companyId ||
        (event.type === 'attendance.day.finalized' &&
          !tenant.access.features.includes('attendance'))
      )
        integrationError(409, 'replay_unavailable', 'Restore current authority before replay');
      const [client] = await tx
        .select()
        .from(apiClients)
        .where(eq(apiClients.id, subscription.clientId));
      const [credential] = await tx
        .select()
        .from(apiClientCredentials)
        .where(
          and(
            eq(apiClientCredentials.clientId, subscription.clientId),
            isNull(apiClientCredentials.revokedAt),
            gt(apiClientCredentials.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!client || !credential)
        integrationError(
          409,
          'replay_unavailable',
          'Restore current client authority before replay',
        );
      let principal;
      try {
        principal = await resolveService(tx, {
          id: client.id,
          tenantId: currentTenantId(),
          credentialId: credential.id,
          version: client.version,
          scopes: [eventScope(event.type)],
        });
      } catch (error) {
        if (error instanceof HttpException && [401, 403].includes(error.getStatus()))
          integrationError(409, 'replay_unavailable', 'The client is outside current authority');
        throw error;
      }
      const [currentSub] = await tx
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, subscription.id))
        .for('share');
      if (!currentSub?.enabled || !principal.companyIds.includes(event.companyId))
        integrationError(409, 'replay_unavailable', 'The event is outside current authority');
      if (event.resourceType === 'employee') {
        const [job] = await tx
          .select({ companyId: jobAssignments.legalEntityId })
          .from(jobAssignments)
          .where(
            and(
              eq(jobAssignments.employeeId, event.resourceId),
              lte(jobAssignments.effectiveFrom, todayIn()),
            ),
          )
          .orderBy(desc(jobAssignments.effectiveFrom), desc(jobAssignments.id))
          .limit(1);
        if (!job || !principal.companyIds.includes(job.companyId))
          integrationError(
            409,
            'replay_unavailable',
            'The employee moved outside current authority',
          );
      }
      const [d] = await tx
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.id, id))
        .for('update');
      if (!d || !['dead', 'suppressed'].includes(d.state))
        integrationError(
          409,
          'replay_unavailable',
          'Only dead or suppressed deliveries can be replayed',
        );
      await tx
        .update(webhookDeliveries)
        .set({
          state: 'pending',
          attempts: 0,
          replays: d.replays + 1,
          nextAttemptAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
        })
        .where(eq(webhookDeliveries.id, id));
      await identityEvent(tx, actor.id, 'user', 'integration.webhook_replayed', id, {
        reason,
        eventId: d.eventId,
      });
      return { queued: true };
    });
  }
}
