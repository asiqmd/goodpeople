import { z } from 'zod';
import type { PlanCode } from './catalog.js';
import type { TokenPair } from './api-types.js';

// Support (Phase 3 M5): tickets a workspace raises with Good People, our replies and internal
// notes, first-response targets by plan, and the read-only access a workspace grants support.

export const TICKET_CATEGORIES = [
  'account',
  'billing',
  'people',
  'attendance',
  'leave',
  'payroll',
  'import',
  'bug',
  'other',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/** Urgent: payroll cannot run, nobody can sign in, or attendance has stopped arriving. */
export const TICKET_PRIORITIES = ['normal', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/**
 * - `open`: waiting on us (new, or the customer replied).
 * - `waiting_on_customer`: we replied and asked something.
 * - `resolved`: we think it is fixed; a customer reply reopens it, else it closes by itself.
 * - `closed`: final; a new problem is a new ticket.
 */
export const TICKET_STATUSES = ['open', 'waiting_on_customer', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** A resolved ticket with no reply closes after this many days. */
export const TICKET_AUTO_CLOSE_DAYS = 7;

/**
 * Our support hours, which the response targets count in: Sunday to Thursday, 9:00 to 18:00 in
 * Dhaka (Bangladesh's working week). Days are JavaScript's getDay(): 0 is Sunday.
 */
export const SUPPORT_HOURS = {
  timeZone: 'Asia/Dhaka',
  days: [0, 1, 2, 3, 4],
  startHour: 9,
  endHour: 18,
} as const;

/** First-response targets in support hours, by plan and priority. */
export const FIRST_RESPONSE_HOURS: Record<PlanCode, Record<TicketPriority, number>> = {
  starter: { normal: 16, urgent: 8 },
  growth: { normal: 8, urgent: 4 },
  business: { normal: 4, urgent: 2 },
  enterprise: { normal: 2, urgent: 1 },
};

/** What a person may attach to a ticket or a reply. */
export const SUPPORT_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SUPPORT_ATTACHMENTS_PER_MESSAGE = 5;

/** The reference an error page shows, which a person pastes into a ticket. */
export const requestIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{6,64}$/, 'The reference looks like 7f3c9a1e…');

const body = z.string().trim().min(1, 'Write a message').max(10_000);

export const createTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES).default('normal'),
  subject: z.string().trim().min(3, 'Write a subject').max(150),
  body: z.string().trim().min(10, 'Describe the problem in a sentence or two').max(10_000),
  requestId: requestIdSchema.optional(),
  /** The page the problem happened on, as a path in the app. */
  pagePath: z.string().trim().max(500).optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const ticketReplySchema = z.object({ body });
export type TicketReplyInput = z.infer<typeof ticketReplySchema>;

/** Support's reply: shown to the workspace, or an internal note it never sees. */
export const supportReplySchema = z.object({
  body,
  internal: z.boolean().default(false),
  /** Where the ticket goes next; a public reply defaults to waiting on the customer. */
  status: z.enum(TICKET_STATUSES).optional(),
});
export type SupportReplyInput = z.infer<typeof supportReplySchema>;

export const updateTicketSchema = z
  .object({
    assigneeId: z.uuid().nullable(),
    category: z.enum(TICKET_CATEGORIES),
    priority: z.enum(TICKET_PRIORITIES),
    status: z.enum(TICKET_STATUSES),
  })
  .partial();
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const ticketListQuerySchema = z.object({
  status: z.enum([...TICKET_STATUSES, 'active']).optional(),
  assignee: z.union([z.literal('me'), z.literal('none'), z.uuid()]).optional(),
  tenantId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
});
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

export interface SupportAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface SupportMessage {
  id: string;
  author: 'customer' | 'support';
  authorName: string;
  body: string;
  /** Support's internal notes; never sent to the workspace. */
  internal: boolean;
  attachments: SupportAttachment[];
  createdAt: string;
}

export interface SupportTicketSummary {
  id: string;
  /** Shown as GP-1001. */
  number: number;
  tenant: { id: string; name: string; slug: string; plan: PlanCode };
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  openedBy: { id: string; name: string; email: string | null };
  assignee: { id: string; name: string } | null;
  firstResponseDueAt: string;
  firstRespondedAt: string | null;
  /** The target passed without a first reply. */
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  requestId: string | null;
  pagePath: string | null;
  messages: SupportMessage[];
  /** Read-only access the workspace has granted for this ticket, if any is running. */
  access: SupportAccessGrantView | null;
}

// ── Support access ───────────────────────────────────────────────────────────

/** The longest a workspace can let support in for at once. */
export const SUPPORT_ACCESS_MAX_DAYS = 7;

export const grantSupportAccessSchema = z.object({
  days: z.coerce.number().int().min(1).max(SUPPORT_ACCESS_MAX_DAYS),
  ticketId: z.uuid().optional(),
  note: z.string().trim().max(500).optional(),
});
export type GrantSupportAccessInput = z.infer<typeof grantSupportAccessSchema>;

export interface SupportAccessGrantView {
  id: string;
  tenantId: string;
  ticketId: string | null;
  ticketNumber: number | null;
  grantedBy: { id: string; name: string };
  note: string | null;
  startsAt: string;
  endsAt: string;
  revokedAt: string | null;
  active: boolean;
  /** Who from support has used it, and when. */
  sessions: { platformUserName: string; startedAt: string }[];
}

export const ticketLabel = (number: number) => `GP-${number}`;

/** Support staff open a workspace under one of its grants. */
export const openSupportSessionSchema = z.object({
  tenantId: z.uuid(),
  grantId: z.uuid(),
});
export type OpenSupportSessionInput = z.infer<typeof openSupportSessionSchema>;

interface WorkspaceRef {
  id: string;
  name: string;
  slug: string;
}

/** A running grant in the console, with the sessions still open on it. */
export interface PlatformSupportGrantView extends SupportAccessGrantView {
  tenant: WorkspaceRef;
  openSessions: { id: string; platformUserName: string; startedAt: string }[];
}

/** The session support opened: tokens for the workspace's read-only login, as a sign-in gives. */
export interface SupportSessionOpened extends TokenPair {
  sessionId: string;
  endsAt: string;
  grant: SupportAccessGrantView;
  tenant: WorkspaceRef;
}

/** The support login's own session, for the banner it sees on every page. */
export interface SupportSessionView {
  id: string;
  platformUserName: string;
  startedAt: string;
  endsAt: string;
  tenantName: string;
}

/** One request support made in a workspace, from its audit log. */
export interface SupportActivityEntry {
  id: string;
  at: string;
  by: string | null;
  method: string;
  route: string;
  params: Record<string, string>;
  status: number | null;
}
