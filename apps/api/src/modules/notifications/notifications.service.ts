import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  deviceTokens,
  employees,
  notificationDeliveries,
  notifications,
  notificationSettings,
  notificationTemplates,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  DEFAULT_EVENT_CHANNELS,
  OTP_TTL_MINUTES,
  ROLE_PERMISSIONS,
  smsSegments,
  TENANT_ROLES,
  type DeliveryChannel,
  type NotificationEvent,
  type NotificationInbox,
  type NotificationView,
  type Permission,
  type UserLanguage,
} from '@gp/shared';
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { DEFAULT_TEMPLATES, type TemplateText } from './default-templates.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { SMS_SENDER, type Sender, type SmsMessage } from './senders.js';

/** A value in each language, or one for both (a name, a number). */
export type Localized = string | Record<UserLanguage, string>;

/** A login, an employee, or both; an employee's own login is found from their record. */
export interface Recipient {
  userId?: string | null;
  employeeId?: string | null;
}

export interface NotifyInput {
  event: Exclude<NotificationEvent, 'auth.otp'>;
  recipients: Recipient[];
  values: Record<string, Localized>;
  /** A path in the web app. */
  link?: string;
  /** Each recipient is told once per key (the recipient is added to it). */
  dedupeKey?: string;
  /** Values for one person, by employee id, on top of `values` (e.g. their own net pay). */
  perRecipient?: ReadonlyMap<string, Record<string, Localized>>;
  data?: Record<string, string>;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+(?:\.[a-zA-Z0-9_]+)+)\s*\}\}/g;

/** Fills {{placeholders}}; one without a value becomes empty. */
export function fill(text: string, values: Record<string, Localized>, language: UserLanguage) {
  return text.replace(PLACEHOLDER, (_, key: string) => {
    const value = values[key];
    return value === undefined ? '' : typeof value === 'string' ? value : value[language];
  });
}

export const localDate = (iso: string): Record<UserLanguage, string> => {
  const date = new Date(`${iso}T00:00:00Z`);
  const format = (locale: string) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  return { en: format('en-GB'), bn: format('bn-BD') };
};

export interface ChannelSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  channels: Partial<Record<NotificationEvent, DeliveryChannel[]>>;
}

export async function channelSettingsOf(tx: Tx): Promise<ChannelSettings> {
  const [row] = await tx.select().from(notificationSettings);
  return row ?? { emailEnabled: true, smsEnabled: false, pushEnabled: true, channels: {} };
}

/** The channels an event goes to in this workspace, after its master switches. */
export function channelsFor(
  settings: ChannelSettings,
  event: NotificationEvent,
): DeliveryChannel[] {
  const chosen = settings.channels[event] ?? DEFAULT_EVENT_CHANNELS[event];
  return chosen.filter(
    (c) =>
      (c === 'email' && settings.emailEnabled) ||
      (c === 'sms' && settings.smsEnabled) ||
      (c === 'push' && settings.pushEnabled),
  );
}

/** The workspace's wording for an event, falling back to the built-in text. */
export async function templatesFor(
  tx: Tx,
  event: NotificationEvent,
): Promise<Record<UserLanguage, TemplateText>> {
  const custom = await tx
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.event, event));
  const pick = (language: UserLanguage) => {
    const row = custom.find((t) => t.language === language);
    return row
      ? { title: row.title, body: row.body, sms: row.sms }
      : DEFAULT_TEMPLATES[event][language];
  };
  return { en: pick('en'), bn: pick('bn') };
}

/** Active logins whose role has the permission, e.g. everyone who handles documents. */
export async function usersWith(tx: Tx, permission: Permission): Promise<Recipient[]> {
  const roles = TENANT_ROLES.filter((r) => ROLE_PERMISSIONS[r].includes(permission));
  const rows = await tx
    .select({ id: tenantUsers.id })
    .from(tenantUsers)
    .where(and(inArray(tenantUsers.role, roles), isNull(tenantUsers.disabledAt)));
  return rows.map((r) => ({ userId: r.id }));
}

const toView = (n: typeof notifications.$inferSelect): NotificationView => ({
  id: n.id,
  event: n.event,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/**
 * Tells people what happened: an inbox entry for logins, and email, SMS and push messages
 * queued in the same transaction as the change (the outbox), sent by the dispatcher.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly dispatcher: NotificationDispatcher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SMS_SENDER) private readonly sms: Sender<SmsMessage>,
  ) {}

  /** Inside the caller's transaction. Returns how many people were told. */
  async notify(tx: Tx, input: NotifyInput): Promise<number> {
    const people = await this.resolve(tx, input.recipients);
    if (people.length === 0) return 0;
    const channels = channelsFor(await channelSettingsOf(tx), input.event);
    const templates = await templatesFor(tx, input.event);
    const withTokens = new Set(
      channels.includes('push')
        ? (
            await tx
              .selectDistinct({ userId: deviceTokens.userId })
              .from(deviceTokens)
              .where(
                inArray(
                  deviceTokens.userId,
                  people.flatMap((p) => p.userId ?? []),
                ),
              )
          ).map((r) => r.userId)
        : [],
    );

    // Built in memory, then written in batches: a payroll run tells thousands of people.
    const rows = people.map((person) => {
      const values = {
        ...input.values,
        ...(person.employeeId ? input.perRecipient?.get(person.employeeId) : undefined),
      };
      const text = templates[person.language];
      return {
        person,
        values,
        title: fill(text.title, values, person.language),
        body: fill(text.body, values, person.language),
        sms: fill(text.sms, values, person.language),
      };
    });
    let told = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const created = await tx
        .insert(notifications)
        .values(
          batch.map(({ person, title, body }) => ({
            tenantId: currentTenantId(),
            userId: person.userId,
            employeeId: person.employeeId,
            event: input.event,
            title,
            body,
            link: input.link ?? null,
            data: input.data ?? {},
            dedupeKey: input.dedupeKey
              ? `${input.dedupeKey}:${person.userId ?? person.employeeId}`
              : null,
          })),
        )
        .onConflictDoNothing()
        .returning({
          id: notifications.id,
          userId: notifications.userId,
          employeeId: notifications.employeeId,
        });
      told += created.length;

      const deliveries: (typeof notificationDeliveries.$inferInsert)[] = [];
      for (const n of created) {
        const row = batch.find(
          (r) => r.person.userId === n.userId && r.person.employeeId === n.employeeId,
        )!;
        const { person, title, body, sms } = row;
        const base = { tenantId: currentTenantId(), notificationId: n.id, event: input.event };
        if (channels.includes('email') && person.email) {
          const link = input.link ? `\n\n${this.config.WEB_ORIGIN}${input.link}` : '';
          deliveries.push({
            ...base,
            channel: 'email',
            recipient: person.email,
            subject: title,
            body: `${body}${link}`,
          });
        }
        if (channels.includes('sms') && person.phone) {
          deliveries.push({ ...base, channel: 'sms', recipient: person.phone, body: sms });
        }
        if (channels.includes('push') && person.userId && withTokens.has(person.userId)) {
          deliveries.push({
            ...base,
            channel: 'push',
            recipient: person.userId,
            subject: title,
            body,
          });
        }
      }
      if (deliveries.length) await tx.insert(notificationDeliveries).values(deliveries);
    }
    if (told) this.dispatcher.kick(currentTenantId());
    return told;
  }

  /**
   * Sends a sign-in code by SMS straight away (not through the queue: the person is waiting)
   * and records it with the code hidden. Always sent: the workspace's SMS switch and monthly
   * credits do not apply, or people could not sign in. Runs in the workspace's context.
   */
  async sendSignInCode(input: {
    phone: string;
    code: string;
    language: UserLanguage;
    workspaceName: string;
  }): Promise<boolean> {
    const template = DEFAULT_TEMPLATES['auth.otp'][input.language];
    const values = {
      'otp.code': input.code,
      'otp.minutes': String(OTP_TTL_MINUTES),
      'workspace.name': input.workspaceName,
    };
    const text = fill(template.sms, values, input.language);
    const id = randomUUID();
    let outcome: { status: 'sent' | 'failed'; providerRef?: string; error?: string };
    try {
      const sent = await this.sms.send({ to: input.phone, text, reference: id });
      outcome = { status: 'sent', providerRef: sent.providerRef };
    } catch (error) {
      outcome = { status: 'failed', error: (error as Error).message.slice(0, 500) };
    }
    await this.tenantDb.run((tx) =>
      tx.insert(notificationDeliveries).values({
        id,
        tenantId: currentTenantId(),
        event: 'auth.otp',
        channel: 'sms',
        recipient: input.phone,
        body: fill(template.sms, { ...values, 'otp.code': '••••••' }, input.language),
        status: outcome.status,
        attempts: 1,
        providerRef: outcome.providerRef ?? null,
        lastError: outcome.error ?? null,
        segments: outcome.status === 'sent' ? smsSegments(text) : 0,
        sentAt: outcome.status === 'sent' ? new Date() : null,
      }),
    );
    return outcome.status === 'sent';
  }

  inbox(user: AuthUser, unreadOnly = false): Promise<NotificationInbox> {
    return this.tenantDb.run(async (tx) => {
      const mine = eq(notifications.userId, user.id);
      const rows = await tx
        .select()
        .from(notifications)
        .where(unreadOnly ? and(mine, isNull(notifications.readAt)) : mine)
        .orderBy(desc(notifications.createdAt))
        .limit(50);
      const [unread] = await tx
        .select({ n: count() })
        .from(notifications)
        .where(and(mine, isNull(notifications.readAt)));
      return { unread: unread?.n ?? 0, items: rows.map(toView) };
    });
  }

  markRead(user: AuthUser, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
        .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
        .returning({ id: notifications.id });
      if (!row) throw new NotFoundException('Notification not found');
    });
  }

  markAllRead(user: AuthUser): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    });
  }

  /**
   * Each recipient once, with where to reach them. A login's own details come first; someone
   * with only an employee record is reached at their work email, personal email and mobile.
   * Disabled logins are left out.
   */
  private async resolve(tx: Tx, recipients: Recipient[]) {
    const userIds = new Set(recipients.flatMap((r) => r.userId ?? []));
    const employeeIds = [...new Set(recipients.flatMap((r) => r.employeeId ?? []))];
    const staff = employeeIds.length
      ? await tx
          .select({
            id: employees.id,
            userId: employees.userId,
            workEmail: employees.workEmail,
            personalEmail: employees.personalEmail,
            mobilePhone: employees.mobilePhone,
          })
          .from(employees)
          .where(inArray(employees.id, employeeIds))
      : [];
    for (const e of staff) if (e.userId) userIds.add(e.userId);
    const logins = userIds.size
      ? await tx
          .select({
            id: tenantUsers.id,
            email: tenantUsers.email,
            phone: tenantUsers.phone,
            language: tenantUsers.language,
            disabledAt: tenantUsers.disabledAt,
          })
          .from(tenantUsers)
          .where(inArray(tenantUsers.id, [...userIds]))
      : [];

    const people: {
      userId: string | null;
      employeeId: string | null;
      email: string | null;
      phone: string | null;
      language: UserLanguage;
    }[] = [];
    for (const login of logins) {
      if (login.disabledAt) continue;
      const employee = staff.find((e) => e.userId === login.id);
      people.push({
        userId: login.id,
        employeeId: employee?.id ?? null,
        email: login.email ?? employee?.workEmail ?? null,
        phone: login.phone ?? employee?.mobilePhone ?? null,
        language: login.language,
      });
    }
    for (const e of staff) {
      if (e.userId) continue;
      people.push({
        userId: null,
        employeeId: e.id,
        email: e.workEmail ?? e.personalEmail,
        phone: e.mobilePhone,
        language: 'en',
      });
    }
    return people;
  }
}
