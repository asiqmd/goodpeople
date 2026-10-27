import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  platformUsers,
  plans,
  runAsTenant,
  supportAccessGrants,
  supportAccessSessions,
  supportAttachments,
  supportMessages,
  supportTickets,
  tenants,
  tenantUsers,
  type Database,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  FIRST_RESPONSE_HOURS,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENTS_PER_MESSAGE,
  ticketLabel,
  type CreateTicketInput,
  type PlanCode,
  type SupportAccessGrantView,
  type SupportMessage,
  type SupportReplyInput,
  type SupportTicketDetail,
  type SupportTicketSummary,
  type TenantWithAccess,
  type TicketListQuery,
  type TicketReplyInput,
  type TicketStatus,
  type UpdateTicketInput,
} from '@gp/shared';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AuthUser, PlatformUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { userCan } from '../../common/roles.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB, FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import type { FileStore } from '../../storage/file-store.js';
import { FILE_STORE } from '../../storage/storage.module.js';
import { AuditService } from '../audit/audit.service.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { EMAIL_SENDER, type EmailMessage, type Sender } from '../notifications/senders.js';
import { attachmentTooLarge, attachmentType, tooManyAttachments } from './attachment-limits.js';
import { attachmentName, supportFileType } from './attachments.js';
import { inboxMail, replyMail, type MailTicket } from './support-mail.js';
import { addSupportHours } from './support-hours.js';

export type TenantLogin = Extract<AuthUser, { kind: 'tenant' }>;
export interface UploadedAttachment {
  originalname: string;
  buffer: Buffer;
}
type TicketRow = typeof supportTickets.$inferSelect;

interface PreparedFile {
  id: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

/** Tickets a login may open in an hour. */
const OPEN_LIMIT = 10;
const HOUR = 3_600_000;
/** Platform roles a ticket can be assigned to. */
const SUPPORT_ROLES = ['super_admin', 'platform_ops', 'support'] as const;
const ACTIVE: TicketStatus[] = ['open', 'waiting_on_customer'];

const ticketClosed = () =>
  conflict('ticket_closed', 'This ticket is closed. Open a new ticket for a new problem.');
const notFound = () => new NotFoundException('Ticket not found');
const iso = (date: Date | null) => date?.toISOString() ?? null;
const storageKey = (ticketId: string, attachmentId: string) =>
  `support/${ticketId}/${attachmentId}`;
const cipherContext = (tenantId: string, attachmentId: string) => ({
  tenantId,
  purpose: `support:${attachmentId}`,
});

/** No first reply yet, the target has passed, and the ticket is still waiting on someone. */
const isOverdue = (t: TicketRow, now: Date) =>
  !t.firstRespondedAt && t.firstResponseDueAt < now && ACTIVE.includes(t.status);
const overdueSql = (now: Date) =>
  sql`(${supportTickets.firstRespondedAt} is null and ${supportTickets.firstResponseDueAt} < ${now} and ${supportTickets.status} in ('open', 'waiting_on_customer'))`;

/** The timestamps that go with a new status. */
function statusChange(status: TicketStatus, now: Date): Partial<TicketRow> {
  return {
    status,
    resolvedAt: status === 'resolved' ? now : null,
    closedAt: status === 'closed' ? now : null,
  };
}

/** Checks a message's files by their bytes and gives each a clean name, before anything is kept. */
function prepareFiles(files: UploadedAttachment[] | undefined): PreparedFile[] {
  const list = files ?? [];
  if (list.length > SUPPORT_ATTACHMENTS_PER_MESSAGE) throw tooManyAttachments();
  return list.map((file) => {
    if (file.buffer.length > SUPPORT_ATTACHMENT_MAX_BYTES) throw attachmentTooLarge();
    const type = supportFileType(file.buffer, file.originalname);
    if (!type) throw attachmentType();
    return {
      id: randomUUID(),
      fileName: attachmentName(file.originalname, type),
      contentType: type,
      bytes: file.buffer,
    };
  });
}

const summarySelect = {
  ticket: supportTickets,
  tenant: { id: tenants.id, name: tenants.name, slug: tenants.slug, plan: plans.code },
  assignee: { id: platformUsers.id, name: platformUsers.name },
};
type SummaryRow = {
  ticket: TicketRow;
  tenant: { id: string; name: string; slug: string; plan: PlanCode };
  assignee: { id: string; name: string } | null;
};

/**
 * Support tickets between a workspace and Good People's support staff. The tables are the
 * platform's, so every workspace read is filtered by the signed-in workspace (another
 * workspace's ticket is simply not found), and internal notes never leave the console.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(FILE_STORE) private readonly store: FileStore,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(EMAIL_SENDER) private readonly email: Sender<EmailMessage>,
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly tenantAudit: TenantAuditService,
    private readonly limiter: RateLimiter,
  ) {}

  // ── The workspace ─────────────────────────────────────────────────────────

  async open(
    user: TenantLogin,
    tenant: TenantWithAccess,
    input: CreateTicketInput,
    files: UploadedAttachment[] | undefined,
  ): Promise<SupportTicketDetail> {
    this.limiter.hit(`support:open:${user.id}`, OPEN_LIMIT, HOUR);
    const prepared = prepareFiles(files);
    const now = new Date();
    const ticketId = randomUUID();
    const due = addSupportHours(now, FIRST_RESPONSE_HOURS[tenant.planCode][input.priority]);
    await this.keepFiles(tenant.id, ticketId, prepared, () =>
      this.tenantDb.run(async (tx) => {
        const login = await this.login(tx, user.id);
        const [ticket] = await tx
          .insert(supportTickets)
          .values({
            id: ticketId,
            tenantId: tenant.id,
            openedByUserId: user.id,
            openedByName: login.name,
            openedByEmail: login.email,
            category: input.category,
            priority: input.priority,
            subject: input.subject,
            requestId: input.requestId ?? null,
            pagePath: input.pagePath || null,
            firstResponseDueAt: due,
            lastCustomerMessageAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ number: supportTickets.number });
        await this.addMessage(tx, ticketId, prepared, {
          author: 'customer',
          authorId: user.id,
          authorName: login.name,
          body: input.body,
          internal: false,
          createdAt: now,
        });
        await this.tenantAudit.record(tx, {
          actorUserId: user.id,
          action: 'support.ticket.open',
          entityType: 'support_ticket',
          entityId: ticketId,
          after: {
            number: ticket!.number,
            subject: input.subject,
            category: input.category,
            priority: input.priority,
            attachments: prepared.length,
          },
        });
      }),
    );
    await this.tellInbox(ticketId, { kind: 'opened' });
    return this.workspaceDetail(user, ticketId);
  }

  /** The login's own tickets, or every one the workspace raised (`support.manage`). */
  async list(user: TenantLogin, scope: 'mine' | 'all'): Promise<SupportTicketSummary[]> {
    const rows = await this.summaryRows(
      and(
        eq(supportTickets.tenantId, user.tenantId),
        scope === 'all' ? undefined : eq(supportTickets.openedByUserId, user.id),
      ),
      [desc(supportTickets.updatedAt)],
    );
    const now = new Date();
    return rows.map((row) => this.summary(row, now, true));
  }

  async workspaceDetail(user: TenantLogin, id: string): Promise<SupportTicketDetail> {
    const ticket = await this.ownTicket(user, id);
    return this.detail(ticket.id, true);
  }

  async customerReply(
    user: TenantLogin,
    id: string,
    input: TicketReplyInput,
    files: UploadedAttachment[] | undefined,
  ): Promise<SupportTicketDetail> {
    const prepared = prepareFiles(files);
    const ticket = await this.ownTicket(user, id);
    if (ticket.status === 'closed') throw ticketClosed();
    const now = new Date();
    const name = await this.keepFiles(ticket.tenantId, ticket.id, prepared, () =>
      this.tenantDb.run(async (tx) => {
        const locked = await this.lock(tx, ticket.id);
        if (locked.status === 'closed') throw ticketClosed();
        const login = await this.login(tx, user.id);
        await this.addMessage(tx, ticket.id, prepared, {
          author: 'customer',
          authorId: user.id,
          authorName: login.name,
          body: input.body,
          internal: false,
          createdAt: now,
        });
        // Whatever it was waiting for, a customer's message puts the ticket back with us.
        await tx
          .update(supportTickets)
          .set({ ...statusChange('open', now), lastCustomerMessageAt: now, updatedAt: now })
          .where(eq(supportTickets.id, ticket.id));
        await this.tenantAudit.record(tx, {
          actorUserId: user.id,
          action: 'support.ticket.reply',
          entityType: 'support_ticket',
          entityId: ticket.id,
          before: { status: locked.status },
          after: { status: 'open', attachments: prepared.length },
        });
        return login.name;
      }),
    );
    await this.tellInbox(ticket.id, { kind: 'replied', by: name });
    return this.detail(ticket.id, true);
  }

  /** The customer says it is fixed; it closes by itself unless they write again. */
  async solve(user: TenantLogin, id: string): Promise<SupportTicketDetail> {
    const ticket = await this.ownTicket(user, id);
    await this.tenantDb.run(async (tx) => {
      const locked = await this.lock(tx, ticket.id);
      if (locked.status === 'closed') throw ticketClosed();
      if (locked.status === 'resolved') return;
      const now = new Date();
      await tx
        .update(supportTickets)
        .set({ ...statusChange('resolved', now), updatedAt: now })
        .where(eq(supportTickets.id, ticket.id));
      await this.tenantAudit.record(tx, {
        actorUserId: user.id,
        action: 'support.ticket.solve',
        entityType: 'support_ticket',
        entityId: ticket.id,
        before: { status: locked.status },
        after: { status: 'resolved' },
      });
    });
    return this.detail(ticket.id, true);
  }

  /** A file from one of the workspace's tickets; never one from an internal note. */
  async workspaceAttachment(user: TenantLogin, id: string) {
    const [row] = await this.db
      .select({ attachment: supportAttachments, tenantId: supportTickets.tenantId })
      .from(supportAttachments)
      .innerJoin(supportMessages, eq(supportMessages.id, supportAttachments.messageId))
      .innerJoin(supportTickets, eq(supportTickets.id, supportAttachments.ticketId))
      .where(
        and(
          eq(supportAttachments.id, id),
          eq(supportMessages.internal, false),
          eq(supportTickets.tenantId, user.tenantId),
          userCan(user, 'support.manage') ? undefined : eq(supportTickets.openedByUserId, user.id),
        ),
      );
    if (!row) throw new NotFoundException('File not found');
    return this.readFile(row.attachment, row.tenantId);
  }

  // ── Good People's support staff ───────────────────────────────────────────

  /** The queue: urgent and overdue tickets first, then the soonest due. */
  async queue(actor: PlatformUser, query: TicketListQuery): Promise<SupportTicketSummary[]> {
    const now = new Date();
    const status = query.status ?? 'active';
    const assignee =
      query.assignee === 'me'
        ? eq(supportTickets.assigneeId, actor.id)
        : query.assignee === 'none'
          ? isNull(supportTickets.assigneeId)
          : query.assignee
            ? eq(supportTickets.assigneeId, query.assignee)
            : undefined;
    const rows = await this.summaryRows(
      and(
        status === 'active'
          ? inArray(supportTickets.status, ACTIVE)
          : eq(supportTickets.status, status),
        assignee,
        query.tenantId ? eq(supportTickets.tenantId, query.tenantId) : undefined,
        query.q ? search(query.q) : undefined,
      ),
      [
        desc(sql`(${supportTickets.priority} = 'urgent' or ${overdueSql(now)})`),
        asc(supportTickets.firstResponseDueAt),
      ],
      200,
    );
    return rows.map((row) => this.summary(row, now, false));
  }

  async supportDetail(id: string): Promise<SupportTicketDetail> {
    await this.ticket(id);
    return this.detail(id, false);
  }

  /** Assign, re-prioritise, re-categorise or move a ticket along. */
  async update(
    actor: PlatformUser,
    id: string,
    input: UpdateTicketInput,
  ): Promise<SupportTicketDetail> {
    if (input.assigneeId) await this.mustBeSupportStaff(input.assigneeId);
    await this.db.transaction(async (tx) => {
      const ticket = await this.lock(tx, id);
      if (ticket.status === 'closed') throw ticketClosed();
      const now = new Date();
      const set: Partial<TicketRow> = {};
      if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
        set.assigneeId = input.assigneeId;
      }
      if (input.category && input.category !== ticket.category) set.category = input.category;
      if (input.priority && input.priority !== ticket.priority) {
        set.priority = input.priority;
        // The target follows the priority until someone has answered.
        if (!ticket.firstRespondedAt) {
          const plan = await this.planOf(tx, ticket.tenantId);
          set.firstResponseDueAt = addSupportHours(
            ticket.createdAt,
            FIRST_RESPONSE_HOURS[plan][input.priority],
          );
        }
      }
      if (input.status && input.status !== ticket.status) {
        Object.assign(set, statusChange(input.status, now));
      }
      if (Object.keys(set).length === 0) return;
      await tx
        .update(supportTickets)
        .set({ ...set, updatedAt: now })
        .where(eq(supportTickets.id, id));
      const changed = Object.keys(set) as (keyof TicketRow)[];
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'support.ticket.update',
        tenantId: ticket.tenantId,
        reason: `Support ticket ${ticketLabel(ticket.number)}`,
        before: Object.fromEntries(changed.map((k) => [k, ticket[k]])),
        after: set,
      });
    });
    return this.detail(id, false);
  }

  /** Support's reply to the workspace, or an internal note it never sees. */
  async supportReply(
    actor: PlatformUser,
    id: string,
    input: SupportReplyInput,
    files: UploadedAttachment[] | undefined,
  ): Promise<SupportTicketDetail> {
    const prepared = prepareFiles(files);
    const ticket = await this.ticket(id);
    if (ticket.status === 'closed') throw ticketClosed();
    const [author] = await this.db
      .select({ name: platformUsers.name })
      .from(platformUsers)
      .where(eq(platformUsers.id, actor.id));
    const now = new Date();
    const status = await this.keepFiles(ticket.tenantId, ticket.id, prepared, () =>
      this.db.transaction(async (tx) => {
        const locked = await this.lock(tx, id);
        if (locked.status === 'closed') throw ticketClosed();
        const messageId = await this.addMessage(tx, id, prepared, {
          author: 'support',
          authorId: actor.id,
          authorName: author?.name ?? 'Good People support',
          body: input.body,
          internal: input.internal,
          createdAt: now,
        });
        // A public reply hands the ticket to the customer unless support says otherwise; a
        // note moves it only when asked to.
        const next = input.internal ? input.status : (input.status ?? 'waiting_on_customer');
        const set: Partial<TicketRow> = {
          ...(next && next !== locked.status ? statusChange(next, now) : {}),
          ...(input.internal
            ? {}
            : { firstRespondedAt: locked.firstRespondedAt ?? now, lastSupportMessageAt: now }),
        };
        if (Object.keys(set).length > 0) {
          await tx
            .update(supportTickets)
            .set({ ...set, updatedAt: now })
            .where(eq(supportTickets.id, id));
        }
        await this.audit.record(tx, {
          actorId: actor.id,
          action: input.internal ? 'support.ticket.note' : 'support.ticket.reply',
          tenantId: locked.tenantId,
          reason: `Support ticket ${ticketLabel(locked.number)}`,
          before: { status: locked.status },
          after: { messageId, status: next ?? locked.status, attachments: prepared.length },
        });
        return next ?? locked.status;
      }),
    );
    if (!input.internal) {
      await this.tellCustomer(id, {
        authorName: author?.name ?? 'Good People support',
        body: input.body,
        resolved: status === 'resolved',
      });
    }
    return this.detail(id, false);
  }

  async supportAttachment(id: string) {
    const [row] = await this.db
      .select({ attachment: supportAttachments, tenantId: supportTickets.tenantId })
      .from(supportAttachments)
      .innerJoin(supportTickets, eq(supportTickets.id, supportAttachments.ticketId))
      .where(eq(supportAttachments.id, id));
    if (!row) throw new NotFoundException('File not found');
    return this.readFile(row.attachment, row.tenantId);
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  private summaryRows(where: SQL | undefined, order: SQL[], limit?: number) {
    const query = this.db
      .select(summarySelect)
      .from(supportTickets)
      .innerJoin(tenants, eq(tenants.id, supportTickets.tenantId))
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .leftJoin(platformUsers, eq(platformUsers.id, supportTickets.assigneeId))
      .where(where)
      .orderBy(...order);
    return (limit ? query.limit(limit) : query) as Promise<SummaryRow[]>;
  }

  /** The workspace does not see which of our staff holds its ticket. */
  private summary(row: SummaryRow, now: Date, forWorkspace: boolean): SupportTicketSummary {
    const t = row.ticket;
    return {
      id: t.id,
      number: t.number,
      tenant: row.tenant,
      category: t.category,
      priority: t.priority,
      status: t.status,
      subject: t.subject,
      openedBy: { id: t.openedByUserId, name: t.openedByName, email: t.openedByEmail },
      assignee: forWorkspace ? null : row.assignee,
      firstResponseDueAt: t.firstResponseDueAt.toISOString(),
      firstRespondedAt: iso(t.firstRespondedAt),
      overdue: isOverdue(t, now),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private async detail(id: string, forWorkspace: boolean): Promise<SupportTicketDetail> {
    const [row] = await this.summaryRows(eq(supportTickets.id, id), []);
    if (!row) throw notFound();
    const [messages, access] = await Promise.all([
      this.messages(id, forWorkspace),
      this.access(row.ticket.tenantId, id),
    ]);
    return {
      ...this.summary(row, new Date(), forWorkspace),
      requestId: row.ticket.requestId,
      pagePath: row.ticket.pagePath,
      messages,
      access,
    };
  }

  private async messages(ticketId: string, publicOnly: boolean): Promise<SupportMessage[]> {
    const rows = await this.db
      .select()
      .from(supportMessages)
      .where(
        and(
          eq(supportMessages.ticketId, ticketId),
          publicOnly ? eq(supportMessages.internal, false) : undefined,
        ),
      )
      .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
    const files =
      rows.length === 0
        ? []
        : await this.db
            .select()
            .from(supportAttachments)
            .where(
              inArray(
                supportAttachments.messageId,
                rows.map((m) => m.id),
              ),
            )
            .orderBy(asc(supportAttachments.createdAt), asc(supportAttachments.fileName));
    return rows.map((m) => ({
      id: m.id,
      author: m.author,
      authorName: m.authorName,
      body: m.body,
      internal: m.internal,
      attachments: files
        .filter((f) => f.messageId === m.id)
        .map((f) => ({
          id: f.id,
          fileName: f.fileName,
          contentType: f.contentType,
          sizeBytes: f.sizeBytes,
        })),
      createdAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * Read-only access the workspace has running: the grant tied to this ticket, else one it gave
   * for the workspace as a whole.
   */
  private async access(tenantId: string, ticketId: string): Promise<SupportAccessGrantView | null> {
    const now = new Date();
    const [row] = await this.db
      .select({ grant: supportAccessGrants, ticketNumber: supportTickets.number })
      .from(supportAccessGrants)
      .leftJoin(supportTickets, eq(supportTickets.id, supportAccessGrants.ticketId))
      .where(
        and(
          eq(supportAccessGrants.tenantId, tenantId),
          isNull(supportAccessGrants.revokedAt),
          lte(supportAccessGrants.startsAt, now),
          gt(supportAccessGrants.endsAt, now),
          or(eq(supportAccessGrants.ticketId, ticketId), isNull(supportAccessGrants.ticketId)),
        ),
      )
      .orderBy(sql`${supportAccessGrants.ticketId} is null`, desc(supportAccessGrants.endsAt))
      .limit(1);
    if (!row) return null;
    const g = row.grant;
    const sessions = await this.db
      .select({
        platformUserName: supportAccessSessions.platformUserName,
        startedAt: supportAccessSessions.startedAt,
      })
      .from(supportAccessSessions)
      .where(eq(supportAccessSessions.grantId, g.id))
      .orderBy(desc(supportAccessSessions.startedAt));
    return {
      id: g.id,
      tenantId: g.tenantId,
      ticketId: g.ticketId,
      ticketNumber: row.ticketNumber,
      grantedBy: { id: g.grantedByUserId, name: g.grantedByName },
      note: g.note,
      startsAt: g.startsAt.toISOString(),
      endsAt: g.endsAt.toISOString(),
      revokedAt: null,
      active: true,
      sessions: sessions.map((s) => ({
        platformUserName: s.platformUserName,
        startedAt: s.startedAt.toISOString(),
      })),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** One of the workspace's tickets the login may see; any other is not found. */
  private async ownTicket(user: TenantLogin, id: string): Promise<TicketRow> {
    const [row] = await this.db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.id, id),
          eq(supportTickets.tenantId, user.tenantId),
          userCan(user, 'support.manage') ? undefined : eq(supportTickets.openedByUserId, user.id),
        ),
      );
    if (!row) throw notFound();
    return row;
  }

  private async ticket(id: string): Promise<TicketRow> {
    const [row] = await this.db.select().from(supportTickets).where(eq(supportTickets.id, id));
    if (!row) throw notFound();
    return row;
  }

  private async lock(tx: Tx, id: string): Promise<TicketRow> {
    const [row] = await tx
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .for('update');
    if (!row) throw notFound();
    return row;
  }

  /** The signed-in login's name and email, read inside its workspace. */
  private async login(tx: Tx, id: string) {
    const [login] = await tx
      .select({ name: tenantUsers.name, email: tenantUsers.email })
      .from(tenantUsers)
      .where(eq(tenantUsers.id, id));
    if (!login) throw new NotFoundException('Login not found');
    return login;
  }

  private async planOf(tx: Tx, tenantId: string): Promise<PlanCode> {
    const [row] = await tx
      .select({ plan: plans.code })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .where(eq(tenants.id, tenantId));
    return row!.plan;
  }

  private async mustBeSupportStaff(id: string) {
    const [user] = await this.db
      .select({ role: platformUsers.role })
      .from(platformUsers)
      .where(eq(platformUsers.id, id));
    if (!user || !(SUPPORT_ROLES as readonly string[]).includes(user.role)) {
      throw badRequest('assignee_not_support', 'Assign the ticket to someone in support');
    }
  }

  private async addMessage(
    tx: Tx,
    ticketId: string,
    files: PreparedFile[],
    message: Omit<typeof supportMessages.$inferInsert, 'ticketId'>,
  ): Promise<string> {
    const [row] = await tx
      .insert(supportMessages)
      .values({ ...message, ticketId })
      .returning({ id: supportMessages.id });
    if (files.length > 0) {
      await tx.insert(supportAttachments).values(
        files.map((f) => ({
          id: f.id,
          ticketId,
          messageId: row!.id,
          fileName: f.fileName,
          contentType: f.contentType,
          sizeBytes: f.bytes.length,
          storageKey: storageKey(ticketId, f.id),
          createdAt: message.createdAt,
        })),
      );
    }
    return row!.id;
  }

  /**
   * Stores a message's files, encrypted for the workspace, then writes its rows; when the
   * write fails, the stored files go again.
   */
  private async keepFiles<T>(
    tenantId: string,
    ticketId: string,
    files: PreparedFile[],
    write: () => Promise<T>,
  ): Promise<T> {
    const kept: string[] = [];
    try {
      for (const file of files) {
        const key = storageKey(ticketId, file.id);
        await this.store.put(
          key,
          this.cipher.encryptBytes(file.bytes, cipherContext(tenantId, file.id)),
        );
        kept.push(key);
      }
      return await write();
    } catch (error) {
      await Promise.all(kept.map((key) => this.store.delete(key).catch(() => undefined)));
      throw error;
    }
  }

  private async readFile(attachment: typeof supportAttachments.$inferSelect, tenantId: string) {
    const stored = await this.store.get(attachment.storageKey);
    return {
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      bytes: this.cipher.decryptBytes(stored, cipherContext(tenantId, attachment.id)),
    };
  }

  // ── Email ─────────────────────────────────────────────────────────────────

  private async mailTicket(id: string): Promise<MailTicket & TicketRow> {
    const [row] = await this.summaryRows(eq(supportTickets.id, id), []);
    return { ...row!.ticket, tenant: row!.tenant };
  }

  private async tellInbox(id: string, event: { kind: 'opened' } | { kind: 'replied'; by: string }) {
    const ticket = await this.mailTicket(id);
    await this.send(
      inboxMail(
        this.config.SUPPORT_INBOX_EMAIL,
        ticket,
        event,
        `${this.config.WEB_ORIGIN}/platform/support/${id}`,
      ),
    );
  }

  /** Support's public reply, to whoever opened the ticket, in their language. */
  private async tellCustomer(
    id: string,
    reply: { authorName: string; body: string; resolved: boolean },
  ) {
    const ticket = await this.mailTicket(id);
    const [login] = await runAsTenant(this.db, ticket.tenantId, (tx) =>
      tx
        .select({ language: tenantUsers.language, disabledAt: tenantUsers.disabledAt })
        .from(tenantUsers)
        .where(eq(tenantUsers.id, ticket.openedByUserId)),
    );
    // Someone who has left the workspace is not written to about it.
    if (!ticket.openedByEmail || !login || login.disabledAt) return;
    await this.send(
      replyMail(
        ticket.openedByEmail,
        login.language,
        ticket,
        reply,
        `${this.config.WEB_ORIGIN}/workspace/support/${id}`,
      ),
    );
  }

  private async send(message: EmailMessage) {
    await this.email.send(message).catch((error: Error) => {
      this.logger.error(`Support email to ${message.to} failed: ${error.message}`);
    });
  }
}

/** GP-1001, 1001 or words from the subject. */
function search(q: string): SQL | undefined {
  const number = /^(?:gp-?)?(\d{1,9})$/i.exec(q)?.[1];
  const words = ilike(supportTickets.subject, `%${q.replaceAll(/[%_\\]/g, '\\$&')}%`);
  return number ? or(eq(supportTickets.number, Number(number)), words) : words;
}
