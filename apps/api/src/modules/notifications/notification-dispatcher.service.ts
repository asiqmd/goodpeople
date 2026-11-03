import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { tenantUsers, deviceTokens, notificationDeliveries, notifications, type Tx } from '@gp/db';
import { smsSegments, type DeliveryStatus } from '@gp/shared';
import { and, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm';
import { currentTenantId, runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import {
  EMAIL_SENDER,
  PermanentSendError,
  PUSH_SENDER,
  SMS_SENDER,
  type EmailMessage,
  type PushMessage,
  type Sender,
  type SmsMessage,
} from './senders.js';

const BATCH = 50;
const MAX_ATTEMPTS = 5;
/** A claimed delivery is not picked up again for this long, in case a send hangs or we crash. */
const LEASE_MINUTES = 5;

type Delivery = typeof notificationDeliveries.$inferSelect;
type Outcome = {
  status: DeliveryStatus;
  error?: string;
  providerRef?: string;
  segments?: number;
};

/** The start of this calendar month in Dhaka, as an instant. */
export function monthStart(now = new Date()): Date {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' })
    .format(now)
    .split('-');
  return new Date(`${year}-${month}-01T00:00:00+06:00`);
}

/** SMS segments this workspace has been charged for this month. */
export async function smsUsedThisMonth(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ n: sum(notificationDeliveries.segments) })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.channel, 'sms'),
        eq(notificationDeliveries.status, 'sent'),
        gte(notificationDeliveries.createdAt, monthStart()),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Sends queued deliveries. Each is claimed with a short lease, sent outside the transaction,
 * then marked sent, retried later with backoff (1, 2, 4, 8 minutes), or failed for good.
 */
@Injectable()
export class NotificationDispatcher implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly running = new Map<string, Promise<number>>();

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly entitlements: EntitlementsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_SENDER) private readonly email: Sender<EmailMessage>,
    @Inject(SMS_SENDER) private readonly sms: Sender<SmsMessage>,
    @Inject(PUSH_SENDER) private readonly push: Sender<PushMessage>,
  ) {}

  /**
   * Sends a workspace's new messages shortly, after the transaction that queued them has
   * committed. Anything missed is picked up by the regular sweep.
   */
  kick(tenantId: string): void {
    void tenantId; /* The durable worker sweep drains committed outbox rows. */
  }

  /** One run at a time per workspace. */
  runFor(tenantId: string): Promise<number> {
    const current = this.running.get(tenantId);
    if (current) return current;
    const run = runInTenantContext(tenantId, () => this.runTenant()).finally(() =>
      this.running.delete(tenantId),
    );
    this.running.set(tenantId, run);
    return run;
  }

  async onApplicationShutdown() {
    for (const timer of this.pending.values()) clearTimeout(timer);
    await Promise.allSettled(this.running.values());
  }

  /** Sends what is due in the current workspace. Returns how many were handled. */
  async runTenant(): Promise<number> {
    const claimed = await this.tenantDb.run((tx) =>
      tx
        .update(notificationDeliveries)
        .set({
          attempts: sql`${notificationDeliveries.attempts} + 1`,
          nextAttemptAt: sql`now() + make_interval(mins => ${LEASE_MINUTES})`,
        })
        .where(
          inArray(
            notificationDeliveries.id,
            tx
              .select({ id: notificationDeliveries.id })
              .from(notificationDeliveries)
              .where(
                and(
                  eq(notificationDeliveries.status, 'queued'),
                  lte(notificationDeliveries.nextAttemptAt, sql`now()`),
                ),
              )
              .orderBy(notificationDeliveries.nextAttemptAt)
              .limit(BATCH)
              .for('update', { skipLocked: true }),
          ),
        )
        .returning(),
    );
    if (claimed.length === 0) return 0;

    const access = await this.entitlements.forTenant(currentTenantId());
    const smsLimit = access?.access.limits.sms_credits_monthly ?? null;
    let smsUsed = claimed.some((d) => d.channel === 'sms')
      ? await this.tenantDb.run(smsUsedThisMonth)
      : 0;

    for (const delivery of claimed) {
      const sender =
        delivery.channel === 'email'
          ? this.email
          : delivery.channel === 'sms'
            ? this.sms
            : this.push;
      if (sender.driver === 'disabled') {
        await this.tenantDb.run((tx) =>
          this.record(tx, delivery, { status: 'skipped', error: 'channel_disabled' }),
        );
        continue;
      }
      let outcome: Outcome;
      try {
        if (delivery.notificationId) {
          const recipient = await this.tenantDb.run(async (tx) => {
            const [row] = await tx
              .select({ user: tenantUsers })
              .from(notifications)
              .innerJoin(tenantUsers, eq(tenantUsers.id, notifications.userId))
              .where(eq(notifications.id, delivery.notificationId!));
            return row?.user;
          });
          if (recipient?.disabledAt || recipient?.provisionDisabled) {
            await this.tenantDb.run((tx) =>
              this.record(tx, delivery, { status: 'skipped', error: 'Recipient access ended' }),
            );
            continue;
          }
          if (recipient?.accessMode === 'custom') {
            delivery.subject = recipient.language === 'bn' ? 'গুড পিপল' : 'Good People';
            delivery.body =
              recipient.language === 'bn'
                ? 'আপনার জন্য একটি নতুন বার্তা আছে। বিস্তারিত দেখতে অ্যাপ খুলুন।'
                : 'You have an update. Open Good People to see the details.';
          }
        }
        if (delivery.channel === 'sms') {
          const segments = smsSegments(delivery.body);
          if (smsLimit !== null && smsUsed + segments > smsLimit) {
            outcome = { status: 'skipped', error: 'The monthly SMS credits are used up' };
          } else {
            await this.tenantDb.run(async () => undefined);
            const sent = await this.sms.send({
              to: delivery.recipient,
              text: delivery.body,
              reference: delivery.id,
            });
            smsUsed += segments;
            outcome = { status: 'sent', providerRef: sent.providerRef, segments };
          }
        } else if (delivery.channel === 'email') {
          await this.tenantDb.run(async () => undefined);
          const sent = await this.email.send({
            to: delivery.recipient,
            subject: delivery.subject ?? '',
            text: delivery.body,
          });
          outcome = { status: 'sent', providerRef: sent.providerRef };
        } else {
          outcome = await this.sendPush(delivery);
        }
      } catch (error) {
        const message = (error as Error).message.slice(0, 500);
        const final = error instanceof PermanentSendError || delivery.attempts >= MAX_ATTEMPTS;
        outcome = { status: final ? 'failed' : 'queued', error: message };
      }
      await this.tenantDb.run((tx) => this.record(tx, delivery, outcome));
    }
    return claimed.length;
  }

  /** Sends to every device of the login; forgets devices the push service no longer knows. */
  private async sendPush(delivery: Delivery): Promise<Outcome> {
    const [tokens, notification] = await this.tenantDb.run(
      async (tx) =>
        [
          await tx.select().from(deviceTokens).where(eq(deviceTokens.userId, delivery.recipient)),
          delivery.notificationId
            ? (
                await tx
                  .select({
                    id: notifications.id,
                    link: notifications.link,
                    event: notifications.event,
                  })
                  .from(notifications)
                  .where(eq(notifications.id, delivery.notificationId))
              )[0]
            : undefined,
        ] as const,
    );
    if (tokens.length === 0) return { status: 'skipped', error: 'No devices registered' };

    const data: Record<string, string> = { event: delivery.event };
    if (notification) data.notificationId = notification.id;
    if (notification?.link) data.link = notification.link;
    const gone: string[] = [];
    let sent = 0;
    let lastError: unknown;
    for (const token of tokens) {
      try {
        await this.tenantDb.run(async () => undefined);
        await this.push.send({
          token: token.token,
          title: delivery.subject ?? '',
          body: delivery.body,
          data,
        });
        sent += 1;
      } catch (error) {
        if (error instanceof PermanentSendError) gone.push(token.id);
        else lastError = error;
      }
    }
    if (gone.length) {
      await this.tenantDb.run((tx) =>
        tx.delete(deviceTokens).where(inArray(deviceTokens.id, gone)),
      );
    }
    if (sent > 0) return { status: 'sent' };
    if (lastError) throw lastError;
    return { status: 'failed', error: 'Every device was unregistered' };
  }

  private async record(tx: Tx, delivery: Delivery, outcome: Outcome) {
    const backoffMinutes = 2 ** (delivery.attempts - 1);
    await tx
      .update(notificationDeliveries)
      .set({
        status: outcome.status,
        lastError: outcome.error ?? null,
        providerRef: outcome.providerRef ?? null,
        segments: outcome.segments ?? 0,
        sentAt: outcome.status === 'sent' ? new Date() : null,
        nextAttemptAt:
          outcome.status === 'queued'
            ? sql`now() + make_interval(mins => ${backoffMinutes})`
            : delivery.nextAttemptAt,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
  }
}
