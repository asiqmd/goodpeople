import { Inject, Injectable, HttpException } from '@nestjs/common';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import {
  apiClients,
  apiClientCredentials,
  webhookSubscriptions,
  webhookDeliveries,
  integrationEvents,
  runAsTenant,
  jobAssignments,
  type Database,
  type Tx,
  type FieldCipher,
} from '@gp/db';
import { and, asc, eq, gt, inArray, isNull, lte, or, sql, lt } from 'drizzle-orm';
import { todayIn } from '@gp/shared';
import { DB, FIELD_CIPHER } from '../../db/db.module.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { currentTenantId } from '../../common/request-context.js';
import { PublicAuth } from './public-auth.js';
import { resolveService } from './authority.js';
import { eventScope } from './admin.service.js';
import { postWebhook } from './webhook-network.js';
export const webhookSignature = (
  secret: string,
  keyId: string,
  stamp: string,
  eventId: string,
  deliveryId: string,
  body: string,
) =>
  'v1=' +
  createHmac('sha256', secret)
    .update(`v1.${keyId}.${stamp}.${eventId}.${deliveryId}.${body}`)
    .digest('hex');
@Injectable()
export class WebhookWorker {
  constructor(
    @Inject(DB) private db: Database,
    @Inject(FIELD_CIPHER) private cipher: FieldCipher,
    @Inject(APP_CONFIG) private config: AppConfig,
    private auth: PublicAuth,
  ) {}
  async runTenant() {
    const tenantId = currentTenantId();
    await this.cleanup(tenantId);
    let available = true;
    try {
      await this.auth.access(tenantId);
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() !== 403) throw error;
      available = false;
    }
    if (available) await this.fanout(tenantId);
    const token = randomUUID();
    const claims = await runAsTenant(this.db, tenantId, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({ state: 'leased', leaseToken: token, leaseUntil: new Date(Date.now() + 30000) })
        .where(
          inArray(
            webhookDeliveries.id,
            tx
              .select({ id: webhookDeliveries.id })
              .from(webhookDeliveries)
              .where(
                and(
                  lte(webhookDeliveries.nextAttemptAt, new Date()),
                  or(
                    eq(webhookDeliveries.state, 'pending'),
                    and(
                      eq(webhookDeliveries.state, 'leased'),
                      lte(webhookDeliveries.leaseUntil, new Date()),
                    ),
                  ),
                ),
              )
              .orderBy(asc(webhookDeliveries.nextAttemptAt))
              .limit(25)
              .for('update', { skipLocked: true }),
          ),
        )
        .returning(),
    );
    for (const delivery of claims) {
      if (!available) {
        await this.suppress(tenantId, delivery.id, token);
        continue;
      }
      await this.deliver(tenantId, delivery.id, token);
    }
    return claims.length;
  }
  private async eligible(
    tx: Tx,
    subscription: typeof webhookSubscriptions.$inferSelect,
    event: typeof integrationEvents.$inferSelect,
  ) {
    const [client] = await tx
      .select()
      .from(apiClients)
      .where(eq(apiClients.id, subscription.clientId));
    if (!client) return false;
    const [credential] = await tx
      .select()
      .from(apiClientCredentials)
      .where(
        and(
          eq(apiClientCredentials.clientId, client.id),
          isNull(apiClientCredentials.revokedAt),
          gt(apiClientCredentials.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!credential) return false;
    const scope = eventScope(event.type);
    if (
      !subscription.events.includes(event.type) ||
      !client.scopes.includes(scope) ||
      event.expiresAt.getTime() <= Date.now() ||
      event.occurredAt.getTime() < Date.now() - this.config.WEBHOOK_RETENTION_DAYS * 86400000
    )
      return false;
    const p = await resolveService(tx, {
      id: client.id,
      tenantId: client.tenantId,
      credentialId: credential.id,
      version: client.version,
      scopes: [scope],
    });
    if (!event.companyId || !p.companyIds.includes(event.companyId)) return false;
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
        .orderBy(sql`${jobAssignments.effectiveFrom} desc`, sql`${jobAssignments.id} desc`)
        .limit(1);
      if (!job || !p.companyIds.includes(job.companyId)) return false;
    }
    return true;
  }
  private async fanout(tenantId: string) {
    const access = await this.auth.access(tenantId);
    return runAsTenant(this.db, tenantId, async (tx) => {
      const events = await tx
        .select()
        .from(integrationEvents)
        .where(and(isNull(integrationEvents.fannedAt), gt(integrationEvents.expiresAt, new Date())))
        .orderBy(asc(integrationEvents.occurredAt))
        .limit(50)
        .for('update', { skipLocked: true });
      const subscriptions = await tx
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.enabled, true));
      const [queued] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(webhookDeliveries)
        .where(inArray(webhookDeliveries.state, ['pending', 'leased']));
      let room = this.config.WEBHOOK_QUEUE_LIMIT - queued!.n;
      for (const event of events) {
        if (
          event.type === 'attendance.day.finalized' &&
          !access.access.features.includes('attendance')
        ) {
          await tx
            .update(integrationEvents)
            .set({ fannedAt: new Date() })
            .where(eq(integrationEvents.id, event.id));
          continue;
        }
        let complete = true;
        for (const sub of subscriptions) {
          if (sub.createdAt > event.occurredAt || !sub.events.includes(event.type)) continue;
          const [already] = await tx
            .select({ id: webhookDeliveries.id })
            .from(webhookDeliveries)
            .where(
              and(
                eq(webhookDeliveries.subscriptionId, sub.id),
                eq(webhookDeliveries.eventId, event.id),
              ),
            );
          if (already) continue;
          let allowed = false;
          try {
            allowed = await this.eligible(tx, sub, event);
          } catch (error) {
            if (!(error instanceof HttpException) || ![401, 403].includes(error.getStatus()))
              throw error;
            allowed = false;
          }
          if (!allowed) continue;
          if (room <= 0) {
            complete = false;
            break;
          }
          await tx
            .insert(webhookDeliveries)
            .values({ tenantId, subscriptionId: sub.id, eventId: event.id })
            .onConflictDoNothing();
          room--;
        }
        if (complete)
          await tx
            .update(integrationEvents)
            .set({ fannedAt: new Date() })
            .where(eq(integrationEvents.id, event.id));
        else break;
      }
    });
  }
  private async suppress(tenantId: string, id: string, token: string) {
    await runAsTenant(this.db, tenantId, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({
          state: 'suppressed',
          lastError: 'authority_unavailable',
          leaseUntil: null,
          leaseToken: null,
        })
        .where(and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.leaseToken, token))),
    );
  }
  private async deliver(tenantId: string, id: string, token: string) {
    try {
      const access = await this.auth.access(tenantId);
      await runAsTenant(this.db, tenantId, async (tx) => {
        await tx.execute(sql`set local idle_in_transaction_session_timeout='10s'`);
        const [candidate] = await tx
          .select()
          .from(webhookDeliveries)
          .where(eq(webhookDeliveries.id, id));
        if (!candidate) return;
        const [event] = await tx
          .select()
          .from(integrationEvents)
          .where(eq(integrationEvents.id, candidate.eventId));
        const [preview] = await tx
          .select()
          .from(webhookSubscriptions)
          .where(eq(webhookSubscriptions.id, candidate.subscriptionId));
        if (
          !event ||
          !preview ||
          (event.type === 'attendance.day.finalized' &&
            !access.access.features.includes('attendance')) ||
          !(await this.eligible(tx, preview, event))
        )
          throw new HttpException('Authority unavailable', 403);
        const [subscription] = await tx
          .select()
          .from(webhookSubscriptions)
          .where(eq(webhookSubscriptions.id, preview.id))
          .for('share');
        const [delivery] = await tx
          .select()
          .from(webhookDeliveries)
          .where(eq(webhookDeliveries.id, id))
          .for('update');
        if (
          !subscription?.enabled ||
          !delivery ||
          delivery.state !== 'leased' ||
          delivery.leaseToken !== token ||
          !delivery.leaseUntil ||
          delivery.leaseUntil.getTime() <= Date.now()
        )
          return;
        // Locks on current owner/client/subscription remain held until the bounded POST ends.
        const secret = this.cipher.decrypt(subscription.secretEnc, {
          tenantId,
          field: 'webhook_subscriptions.signing_secret',
        });
        const stamp = String(Math.floor(Date.now() / 1000));
        let status: number | null = null,
          error: string | null = null;
        try {
          status = await postWebhook(
            subscription.url,
            this.config.WEBHOOK_PRIVATE_HOSTS,
            event.body,
            {
              'content-type': 'application/json',
              'user-agent': 'GoodPeople-Webhooks/1',
              'GP-Event-ID': event.id,
              'GP-Delivery-ID': delivery.id,
              'GP-Subscription-ID': subscription.id,
              'GP-Key-ID': subscription.keyId,
              'GP-Timestamp': stamp,
              'GP-Signature': webhookSignature(
                secret,
                subscription.keyId,
                stamp,
                event.id,
                delivery.id,
                event.body,
              ),
            },
            process.env.NODE_ENV === 'test',
          );
          if (status < 200 || status >= 300) error = 'receiver_status';
        } catch {
          error = 'target_unavailable';
        }
        const attempts = delivery.attempts + 1,
          sent = !error,
          dead = !sent && (attempts >= this.config.WEBHOOK_MAX_ATTEMPTS || status === 410),
          failures = sent ? 0 : subscription.failureCount + 1;
        const seconds = Math.min(3600, 30 * 2 ** (attempts - 1));
        await tx
          .update(webhookDeliveries)
          .set({
            state: sent ? 'sent' : dead ? 'dead' : 'pending',
            attempts,
            lastStatus: status,
            lastError: error,
            lastAttemptAt: new Date(),
            sentAt: sent ? new Date() : null,
            nextAttemptAt: new Date(
              Date.now() + (seconds + randomInt(Math.max(1, Math.ceil(seconds * 0.2)))) * 1000,
            ),
            leaseToken: null,
            leaseUntil: null,
          })
          .where(and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.leaseToken, token)));
        await tx
          .update(webhookSubscriptions)
          .set({
            failureCount: failures,
            ...(dead || failures >= this.config.WEBHOOK_MAX_ATTEMPTS ? { enabled: false } : {}),
          })
          .where(eq(webhookSubscriptions.id, subscription.id));
      });
    } catch (error) {
      if (!(error instanceof HttpException) || ![401, 403].includes(error.getStatus())) throw error;
      await this.suppress(tenantId, id, token);
    }
  }
  private cleanup(tenantId: string) {
    return runAsTenant(this.db, tenantId, async (tx) => {
      const cutoff = new Date(Date.now() - this.config.WEBHOOK_RETENTION_DAYS * 86400000);
      const expired = tx
        .select({ id: integrationEvents.id })
        .from(integrationEvents)
        .where(
          or(
            lte(integrationEvents.expiresAt, new Date()),
            lt(integrationEvents.occurredAt, cutoff),
          ),
        );
      await tx.delete(webhookDeliveries).where(inArray(webhookDeliveries.eventId, expired));
      await tx
        .delete(integrationEvents)
        .where(
          or(
            lte(integrationEvents.expiresAt, new Date()),
            lt(integrationEvents.occurredAt, cutoff),
          ),
        );
    });
  }
}
