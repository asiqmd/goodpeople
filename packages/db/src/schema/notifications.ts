import {
  DELIVERY_CHANNELS,
  DELIVERY_STATUSES,
  DEVICE_PLATFORMS,
  NOTIFICATION_EVENTS,
  type DeliveryChannel,
  type NotificationEvent,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { employees } from './hr.js';
import { tenants } from './platform.js';
import { tenantUsers, userLanguage } from './tenant.js';

export const notificationEvent = pgEnum('notification_event', NOTIFICATION_EVENTS);
export const deliveryChannel = pgEnum('delivery_channel', DELIVERY_CHANNELS);
export const deliveryStatus = pgEnum('delivery_status', DELIVERY_STATUSES);
export const devicePlatform = pgEnum('device_platform', DEVICE_PLATFORMS);

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const instant = (name: string) => timestamp(name, { withTimezone: true });

/**
 * What one person was told, in their language. A login sees it in the app's inbox; someone
 * without a login (only an employee record) is reached by email or SMS only.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: uuid('user_id'),
    employeeId: uuid('employee_id'),
    event: notificationEvent('event').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** A path in the web app, e.g. /workspace/approvals. */
    link: text('link'),
    data: jsonb('data').$type<Record<string, string>>().notNull().default({}),
    /** Daily reminders carry one so each person is told once per document, probation, day. */
    dedupeKey: text('dedupe_key'),
    readAt: instant('read_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('notifications_tenant_id_uq').on(t.tenantId, t.id),
    index('notifications_inbox_idx').on(t.tenantId, t.userId, t.createdAt),
    uniqueIndex('notifications_dedupe_uq')
      .on(t.tenantId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    check(
      'notifications_recipient_ck',
      sql`${t.userId} is not null or ${t.employeeId} is not null`,
    ),
    foreignKey({
      name: 'notifications_user_fk',
      columns: [t.tenantId, t.userId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'notifications_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
  ],
);

/**
 * One message on one channel (the outbox). Written in the same transaction as the change it
 * reports, then sent by the dispatcher, which retries failures with backoff.
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** Null for a sign-in code, which is not kept in anyone's inbox. */
    notificationId: uuid('notification_id'),
    event: notificationEvent('event').notNull(),
    channel: deliveryChannel('channel').notNull(),
    /** An email address, an E.164 number, or for push the login whose devices are notified. */
    recipient: text('recipient').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    status: deliveryStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: instant('next_attempt_at').notNull().defaultNow(),
    lastError: text('last_error'),
    providerRef: text('provider_ref'),
    /** SMS segments charged, counted against the plan's monthly credits. */
    segments: integer('segments').notNull().default(0),
    createdAt: createdAt(),
    sentAt: instant('sent_at'),
  },
  (t) => [
    index('notification_deliveries_queue_idx')
      .on(t.tenantId, t.nextAttemptAt)
      .where(sql`${t.status} = 'queued'`),
    index('notification_deliveries_created_idx').on(t.tenantId, t.createdAt),
    foreignKey({
      name: 'notification_deliveries_notification_fk',
      columns: [t.tenantId, t.notificationId],
      foreignColumns: [notifications.tenantId, notifications.id],
    }).onDelete('cascade'),
  ],
);

/** A workspace's own wording for an event; without a row the built-in text is used. */
export const notificationTemplates = pgTable(
  'notification_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    event: notificationEvent('event').notNull(),
    language: userLanguage('language').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    sms: text('sms').notNull(),
    updatedBy: uuid('updated_by'),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('notification_templates_event_uq').on(t.tenantId, t.event, t.language)],
);

/** Which channels a workspace uses; without a row the defaults apply. */
export const notificationSettings = pgTable('notification_settings', {
  tenantId: tenantId().primaryKey(),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  smsEnabled: boolean('sms_enabled').notNull().default(false),
  pushEnabled: boolean('push_enabled').notNull().default(true),
  channels: jsonb('channels')
    .$type<Partial<Record<NotificationEvent, DeliveryChannel[]>>>()
    .notNull()
    .default({}),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** A phone or browser that receives push notifications for a login. */
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull(),
    platform: devicePlatform('platform').notNull(),
    token: text('token').notNull(),
    createdAt: createdAt(),
    lastSeenAt: instant('last_seen_at').notNull().defaultNow(),
  },
  (t) => [
    unique('device_tokens_token_uq').on(t.tenantId, t.token),
    index('device_tokens_user_idx').on(t.tenantId, t.userId),
    foreignKey({
      name: 'device_tokens_user_fk',
      columns: [t.tenantId, t.userId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }).onDelete('cascade'),
  ],
);

/**
 * A sign-in code sent by SMS. Only its hash is kept; it expires in minutes, allows a few wrong
 * guesses and works once. The rows also count recent requests per number for rate limiting.
 */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: instant('expires_at').notNull(),
    consumedAt: instant('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('otp_challenges_phone_idx').on(t.tenantId, t.phone, t.createdAt),
    foreignKey({
      name: 'otp_challenges_user_fk',
      columns: [t.tenantId, t.userId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }).onDelete('cascade'),
  ],
);
