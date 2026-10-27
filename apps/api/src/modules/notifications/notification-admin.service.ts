import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { notificationDeliveries, notificationSettings, notificationTemplates } from '@gp/db';
import {
  DEFAULT_EVENT_CHANNELS,
  isFixedEvent,
  NOTIFICATION_EVENTS,
  USER_LANGUAGES,
  type DeliveryStatus,
  type DeliveryView,
  type NotificationEvent,
  type NotificationSettingsInput,
  type NotificationSettingsView,
  type NotificationTemplateInput,
  type NotificationTemplateView,
  type TenantWithAccess,
  type UserLanguage,
} from '@gp/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { DEFAULT_TEMPLATES, TEMPLATE_PLACEHOLDERS } from './default-templates.js';
import { channelSettingsOf } from './notifications.service.js';
import { NotificationDispatcher, smsUsedThisMonth } from './notification-dispatcher.service.js';
import {
  EMAIL_SENDER,
  PUSH_SENDER,
  SMS_SENDER,
  type EmailMessage,
  type PushMessage,
  type Sender,
  type SmsMessage,
} from './senders.js';

/** The end of an address or number only, enough to tell deliveries apart. */
export function maskRecipient(channel: string, recipient: string): string {
  if (channel === 'email') {
    const [name = '', domain = ''] = recipient.split('@');
    return `${name.slice(0, 2)}•••@${domain}`;
  }
  if (channel === 'sms') return `•••${recipient.slice(-4)}`;
  return 'Signed-in devices';
}

const toDeliveryView = (d: typeof notificationDeliveries.$inferSelect): DeliveryView => ({
  id: d.id,
  event: d.event,
  channel: d.channel,
  recipient: maskRecipient(d.channel, d.recipient),
  subject: d.subject,
  status: d.status,
  attempts: d.attempts,
  lastError: d.lastError,
  createdAt: d.createdAt.toISOString(),
  sentAt: d.sentAt?.toISOString() ?? null,
});

/** HR's side of notifications: which channels, what wording, and what was sent. */
@Injectable()
export class NotificationAdminService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly dispatcher: NotificationDispatcher,
    @Inject(EMAIL_SENDER) private readonly email: Sender<EmailMessage>,
    @Inject(SMS_SENDER) private readonly sms: Sender<SmsMessage>,
    @Inject(PUSH_SENDER) private readonly push: Sender<PushMessage>,
  ) {}

  settings(tenant: TenantWithAccess): Promise<NotificationSettingsView> {
    return this.tenantDb.run(async (tx) => {
      const settings = await channelSettingsOf(tx);
      const channels = Object.fromEntries(
        NOTIFICATION_EVENTS.map((e) => [
          e,
          [...(settings.channels[e] ?? DEFAULT_EVENT_CHANNELS[e])],
        ]),
      ) as NotificationSettingsView['channels'];
      return {
        emailEnabled: settings.emailEnabled,
        smsEnabled: settings.smsEnabled,
        pushEnabled: settings.pushEnabled,
        channels,
        smsUsedThisMonth: await smsUsedThisMonth(tx),
        smsLimit: tenant.access.limits.sms_credits_monthly,
        drivers: { email: this.email.driver, sms: this.sms.driver, push: this.push.driver },
      };
    });
  }

  async updateSettings(
    actor: AuthUser,
    tenant: TenantWithAccess,
    input: NotificationSettingsInput,
  ): Promise<NotificationSettingsView> {
    await this.tenantDb.run(async (tx) => {
      const before = await channelSettingsOf(tx);
      const after = {
        emailEnabled: input.emailEnabled ?? before.emailEnabled,
        smsEnabled: input.smsEnabled ?? before.smsEnabled,
        pushEnabled: input.pushEnabled ?? before.pushEnabled,
        channels: { ...before.channels, ...input.channels },
      };
      await tx
        .insert(notificationSettings)
        .values({ tenantId: currentTenantId(), ...after })
        .onConflictDoUpdate({
          target: notificationSettings.tenantId,
          set: { ...after, updatedAt: new Date() },
        });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'notifications.settings',
        entityType: 'notification_settings',
        entityId: null,
        before,
        after,
      });
    });
    return this.settings(tenant);
  }

  templates(): Promise<NotificationTemplateView[]> {
    return this.tenantDb.run(async (tx) => {
      const custom = await tx.select().from(notificationTemplates);
      return NOTIFICATION_EVENTS.flatMap((event) =>
        USER_LANGUAGES.map((language) => {
          const row = custom.find((t) => t.event === event && t.language === language);
          const text = row ?? DEFAULT_TEMPLATES[event][language];
          return {
            event,
            language,
            title: text.title,
            body: text.body,
            sms: text.sms,
            customized: !!row,
            placeholders: TEMPLATE_PLACEHOLDERS[event],
          };
        }),
      );
    });
  }

  async updateTemplate(
    actor: AuthUser,
    event: NotificationEvent,
    language: UserLanguage,
    input: NotificationTemplateInput,
  ): Promise<NotificationTemplateView> {
    if (isFixedEvent(event)) {
      throw badRequest(
        'template_fixed',
        event === 'auth.otp'
          ? 'The sign-in code message cannot be changed'
          : 'The salary account notice cannot be changed',
      );
    }
    await this.tenantDb.run(async (tx) => {
      const [current] = await tx
        .select()
        .from(notificationTemplates)
        .where(
          and(eq(notificationTemplates.event, event), eq(notificationTemplates.language, language)),
        );
      const text = { ...(current ?? DEFAULT_TEMPLATES[event][language]), ...input };
      const values = { title: text.title, body: text.body, sms: text.sms, updatedBy: actor.id };
      await tx
        .insert(notificationTemplates)
        .values({ tenantId: currentTenantId(), event, language, ...values })
        .onConflictDoUpdate({
          target: [
            notificationTemplates.tenantId,
            notificationTemplates.event,
            notificationTemplates.language,
          ],
          set: { ...values, updatedAt: new Date() },
        });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'notifications.template',
        entityType: 'notification_template',
        entityId: null,
        after: { event, language, ...input },
      });
    });
    return (await this.templates()).find((t) => t.event === event && t.language === language)!;
  }

  async resetTemplate(actor: AuthUser, event: NotificationEvent, language: UserLanguage) {
    await this.tenantDb.run(async (tx) => {
      await tx
        .delete(notificationTemplates)
        .where(
          and(eq(notificationTemplates.event, event), eq(notificationTemplates.language, language)),
        );
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'notifications.template.reset',
        entityType: 'notification_template',
        entityId: null,
        after: { event, language },
      });
    });
  }

  deliveries(status?: DeliveryStatus): Promise<DeliveryView[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select()
        .from(notificationDeliveries)
        .where(status ? eq(notificationDeliveries.status, status) : undefined)
        .orderBy(desc(notificationDeliveries.createdAt))
        .limit(200);
      return rows.map(toDeliveryView);
    });
  }

  /** Sends a failed or skipped message again. */
  async retry(actor: AuthUser, id: string): Promise<DeliveryView> {
    const row = await this.tenantDb.run(async (tx) => {
      const [current] = await tx
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.id, id));
      if (!current) throw new NotFoundException('Delivery not found');
      if (current.event === 'auth.otp') {
        throw badRequest('cannot_retry', 'Sign-in codes are not sent again; ask for a new one');
      }
      if (current.status !== 'failed' && current.status !== 'skipped') {
        throw badRequest('cannot_retry', 'Only failed or skipped messages can be sent again');
      }
      const [updated] = await tx
        .update(notificationDeliveries)
        .set({ status: 'queued', attempts: 0, nextAttemptAt: new Date(), lastError: null })
        .where(eq(notificationDeliveries.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'notifications.retry',
        entityType: 'notification_delivery',
        entityId: id,
      });
      return updated!;
    });
    this.dispatcher.kick(currentTenantId());
    return toDeliveryView(row);
  }
}
