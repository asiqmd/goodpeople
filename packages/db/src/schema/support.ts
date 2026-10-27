import type { TicketCategory, TicketPriority, TicketStatus } from '@gp/shared';
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { platformUsers, tenants } from './platform.js';

// Support (Phase 3 M5). Platform tables like `invoices`: they are about a workspace but Good
// People's support staff work them, so they have no row-level security, and the support module
// filters every workspace-facing read by the signed-in workspace. They copy the names they show
// (the person who wrote, the workspace login that granted access) so the console never has to
// read inside a workspace.

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => timestamptz('created_at').notNull().defaultNow();

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Shown as GP-1001. */
    number: integer('number').notNull().unique().generatedAlwaysAsIdentity({ startWith: 1001 }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** The workspace login that opened it (tenant_users.id, across the workspace boundary). */
    openedByUserId: uuid('opened_by_user_id').notNull(),
    openedByName: text('opened_by_name').notNull(),
    openedByEmail: text('opened_by_email'),
    category: text('category').$type<TicketCategory>().notNull(),
    priority: text('priority').$type<TicketPriority>().notNull().default('normal'),
    status: text('status').$type<TicketStatus>().notNull().default('open'),
    subject: text('subject').notNull(),
    /** The error reference the person pasted, and the page they were on. */
    requestId: text('request_id'),
    pagePath: text('page_path'),
    assigneeId: uuid('assignee_id').references(() => platformUsers.id, { onDelete: 'set null' }),
    /** From the plan and priority when it was opened, counted in support hours. */
    firstResponseDueAt: timestamptz('first_response_due_at').notNull(),
    firstRespondedAt: timestamptz('first_responded_at'),
    lastCustomerMessageAt: timestamptz('last_customer_message_at'),
    lastSupportMessageAt: timestamptz('last_support_message_at'),
    resolvedAt: timestamptz('resolved_at'),
    closedAt: timestamptz('closed_at'),
    createdAt: createdAt(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('support_tickets_tenant_idx').on(t.tenantId, t.createdAt),
    index('support_tickets_queue_idx').on(t.status, t.firstResponseDueAt),
    index('support_tickets_assignee_idx').on(t.assigneeId),
  ],
);

export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    author: text('author').$type<'customer' | 'support'>().notNull(),
    /** A tenant_users id for the customer, a platform_users id for support. */
    authorId: uuid('author_id').notNull(),
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    /** Support's internal note: never shown to or sent to the workspace. */
    internal: boolean('internal').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('support_messages_ticket_idx').on(t.ticketId, t.createdAt)],
);

/** A file with a message, kept encrypted in the document store like the workspace's own. */
export const supportAttachments = pgTable(
  'support_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => supportMessages.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('support_attachments_message_idx').on(t.messageId)],
);

/**
 * A workspace's consent for Good People support to look inside it, read-only, until `endsAt`
 * or until it is revoked. Any support staff member may use it; each use is a session below.
 */
export const supportAccessGrants = pgTable(
  'support_access_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ticketId: uuid('ticket_id').references(() => supportTickets.id, { onDelete: 'set null' }),
    grantedByUserId: uuid('granted_by_user_id').notNull(),
    grantedByName: text('granted_by_name').notNull(),
    note: text('note'),
    startsAt: timestamptz('starts_at').notNull().defaultNow(),
    endsAt: timestamptz('ends_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    revokedByUserId: uuid('revoked_by_user_id'),
    createdAt: createdAt(),
  },
  (t) => [index('support_access_grants_tenant_idx').on(t.tenantId, t.endsAt)],
);

/** One support person's use of a grant: the read-only login it signed in as, and when. */
export const supportAccessSessions = pgTable(
  'support_access_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    grantId: uuid('grant_id')
      .notNull()
      .references(() => supportAccessGrants.id, { onDelete: 'cascade' }),
    platformUserId: uuid('platform_user_id')
      .notNull()
      .references(() => platformUsers.id),
    platformUserName: text('platform_user_name').notNull(),
    /** The workspace's `support` login (tenant_users.id) the session acts as. */
    tenantUserId: uuid('tenant_user_id').notNull(),
    /** The refresh-token session it was issued (auth_sessions.id), revoked with the grant. */
    authSessionId: uuid('auth_session_id'),
    startedAt: timestamptz('started_at').notNull().defaultNow(),
    endedAt: timestamptz('ended_at'),
  },
  (t) => [index('support_access_sessions_grant_idx').on(t.grantId)],
);
