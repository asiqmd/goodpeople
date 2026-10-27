import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  authSessions,
  platformUsers,
  runAsTenant,
  supportAccessGrants,
  supportAccessSessions,
  supportTickets,
  tenantAuditLog,
  tenants,
  tenantUsers,
  type Database,
  type Tx,
} from '@gp/db';
import type {
  GrantSupportAccessInput,
  OpenSupportSessionInput,
  PlatformSupportGrantView,
  SupportAccessGrantView,
  SupportActivityEntry,
  SupportSessionOpened,
  SupportSessionView,
} from '@gp/shared';
import { and, asc, desc, eq, gt, inArray, isNull, lte, type SQL } from 'drizzle-orm';
import type { AuthUser, PlatformUser } from '../../common/auth-user.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB, TenantDb } from '../../db/db.module.js';
import { AuditService } from '../audit/audit.service.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { EMAIL_SENDER, type EmailMessage, type Sender } from '../notifications/senders.js';
import { isActiveGrant, openSupportSession, sessionEndsAt } from './support-sessions.js';

type TenantUser = Extract<AuthUser, { kind: 'tenant' }>;
type GrantRow = typeof supportAccessGrants.$inferSelect;
type SessionRow = typeof supportAccessSessions.$inferSelect;
type PlatformUserRow = typeof platformUsers.$inferSelect;

const DAY_MS = 86_400_000;
/** The read-only login's address: one per support person and workspace, never a real inbox. */
const supportEmail = (platformUserId: string) =>
  `support+${platformUserId}@support.goodpeople.invalid`;

/**
 * Read-only access a workspace grants Good People support: the workspace's consent (a grant of
 * up to a week, revocable) and each support person's use of it (a session as the workspace's
 * `support` login). Grants and sessions are platform tables, so every workspace read here
 * filters by the signed-in workspace.
 */
@Injectable()
export class SupportAccessService {
  private readonly logger = new Logger(SupportAccessService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_SENDER) private readonly email: Sender<EmailMessage>,
    private readonly tenantDb: TenantDb,
    private readonly tenantAudit: TenantAuditService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  // ── The workspace ──────────────────────────────────────────────────────────

  async list(user: TenantUser): Promise<SupportAccessGrantView[]> {
    const grants = await this.grants(eq(supportAccessGrants.tenantId, user.tenantId));
    return (await this.views(grants)).map((v) => v.view);
  }

  async grant(user: TenantUser, input: GrantSupportAccessInput): Promise<SupportAccessGrantView> {
    const now = new Date();
    const id = await this.tenantDb.run(async (tx) => {
      if (input.ticketId) {
        const [ticket] = await tx
          .select({ id: supportTickets.id })
          .from(supportTickets)
          .where(
            and(eq(supportTickets.id, input.ticketId), eq(supportTickets.tenantId, user.tenantId)),
          );
        if (!ticket) {
          throw badRequest('unknown_ticket', 'That ticket is not one of this workspace’s');
        }
      }
      const [me] = await tx
        .select({ name: tenantUsers.name })
        .from(tenantUsers)
        .where(eq(tenantUsers.id, user.id));
      const [grant] = await tx
        .insert(supportAccessGrants)
        .values({
          tenantId: user.tenantId,
          ticketId: input.ticketId ?? null,
          grantedByUserId: user.id,
          grantedByName: me!.name,
          note: input.note || null,
          startsAt: now,
          endsAt: new Date(now.getTime() + input.days * DAY_MS),
        })
        .returning();
      await this.tenantAudit.record(tx, {
        actorUserId: user.id,
        action: 'support_access.grant',
        entityType: 'support_access_grant',
        entityId: grant!.id,
        after: {
          days: input.days,
          endsAt: grant!.endsAt.toISOString(),
          ticketId: grant!.ticketId,
          note: grant!.note,
        },
      });
      return grant!.id;
    });
    return this.viewOf(id);
  }

  /** Ends the grant now, with every session on it: support is signed out at its next request. */
  async revoke(user: TenantUser, grantId: string): Promise<SupportAccessGrantView> {
    const now = new Date();
    await this.tenantDb.run(async (tx) => {
      const [grant] = await tx
        .select()
        .from(supportAccessGrants)
        .where(
          and(eq(supportAccessGrants.id, grantId), eq(supportAccessGrants.tenantId, user.tenantId)),
        )
        .for('update');
      if (!grant) throw new NotFoundException('Support access not found');
      if (grant.revokedAt) return;
      await tx
        .update(supportAccessGrants)
        .set({ revokedAt: now, revokedByUserId: user.id })
        .where(eq(supportAccessGrants.id, grantId));
      const ended = await this.endSessions(tx, eq(supportAccessSessions.grantId, grantId), now);
      await this.tenantAudit.record(tx, {
        actorUserId: user.id,
        action: 'support_access.revoke',
        entityType: 'support_access_grant',
        entityId: grantId,
        before: { endsAt: grant.endsAt.toISOString() },
        after: { revokedAt: now.toISOString(), sessionsEnded: ended },
      });
    });
    return this.viewOf(grantId);
  }

  /** Each request support made here, newest first. */
  activity(): Promise<SupportActivityEntry[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({ log: tenantAuditLog, by: tenantUsers.name })
        .from(tenantAuditLog)
        .leftJoin(tenantUsers, eq(tenantUsers.id, tenantAuditLog.actorUserId))
        .where(
          and(
            eq(tenantAuditLog.entityType, 'support_access_session'),
            eq(tenantAuditLog.action, 'support.viewed'),
          ),
        )
        .orderBy(desc(tenantAuditLog.createdAt))
        .limit(200);
      return rows.map(({ log, by }) => {
        const after = (log.after ?? {}) as Partial<SupportActivityEntry>;
        return {
          id: log.id,
          at: log.createdAt.toISOString(),
          by,
          method: after.method ?? '',
          route: after.route ?? '',
          params: after.params ?? {},
          status: after.status ?? null,
        };
      });
    });
  }

  /** The signed-in support login's session, for its banner. */
  async current(user: TenantUser, tenantName: string): Promise<SupportSessionView> {
    const found =
      user.role === 'support'
        ? await openSupportSession(this.db, { tenantUserId: user.id, tenantId: user.tenantId })
        : null;
    if (!found) throw new NotFoundException('Not a support session');
    return {
      id: found.session.id,
      platformUserName: found.session.platformUserName,
      startedAt: found.session.startedAt.toISOString(),
      endsAt: sessionEndsAt(found.grant.endsAt, found.session.startedAt).toISOString(),
      tenantName,
    };
  }

  // ── The console ────────────────────────────────────────────────────────────

  /** Grants running now, across workspaces, soonest to end first. */
  async active(): Promise<PlatformSupportGrantView[]> {
    const now = new Date();
    const grants = await this.grants(
      and(
        isNull(supportAccessGrants.revokedAt),
        lte(supportAccessGrants.startsAt, now),
        gt(supportAccessGrants.endsAt, now),
      ),
      'endsAt',
    );
    if (grants.length === 0) return [];
    const [views, workspaces] = await Promise.all([
      this.views(grants),
      this.db
        .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
        .from(tenants)
        .where(inArray(tenants.id, [...new Set(grants.map((g) => g.grant.tenantId))])),
    ]);
    return views.map(({ view, open }) => ({
      ...view,
      tenant: workspaces.find((w) => w.id === view.tenantId)!,
      openSessions: open.map((s) => ({
        id: s.id,
        platformUserName: s.platformUserName,
        startedAt: s.startedAt.toISOString(),
      })),
    }));
  }

  /**
   * Opens the workspace for one support person under its grant: their read-only login there
   * (made the first time), a session that ends with the grant or after eight hours, a record of
   * it, and an email to the admin who granted it.
   */
  async open(actor: PlatformUser, input: OpenSupportSessionInput): Promise<SupportSessionOpened> {
    const [person] = await this.db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.id, actor.id));
    if (!person) throw new NotFoundException('Platform user not found');
    if (this.config.REQUIRE_ADMIN_MFA && !person.mfaEnabledAt) {
      throw forbidden('mfa_required', 'Set up two-step sign-in before opening a workspace');
    }
    const now = new Date();
    const [found] = await this.db
      .select({ grant: supportAccessGrants, tenant: tenants })
      .from(supportAccessGrants)
      .innerJoin(tenants, eq(tenants.id, supportAccessGrants.tenantId))
      .where(
        and(
          eq(supportAccessGrants.id, input.grantId),
          eq(supportAccessGrants.tenantId, input.tenantId),
        ),
      );
    if (!found || !isActiveGrant(found.grant, now)) {
      throw forbidden(
        'no_support_access',
        'This workspace has not let support in, or its access has ended',
      );
    }
    const { grant, tenant } = found;
    const login = await this.supportLogin(grant.tenantId, person);
    const endsAt = sessionEndsAt(grant.endsAt, now);
    let sessionId = '';
    const tokens = await this.auth.issueSupportSession(
      { id: login.id, tenantId: grant.tenantId },
      {
        expiresAt: endsAt,
        onIssued: async (tx, authSessionId) => {
          const [session] = await tx
            .insert(supportAccessSessions)
            .values({
              grantId: grant.id,
              platformUserId: person.id,
              platformUserName: person.name,
              tenantUserId: login.id,
              authSessionId,
              startedAt: now,
            })
            .returning({ id: supportAccessSessions.id });
          sessionId = session!.id;
          await this.audit.record(tx, {
            actorId: person.id,
            action: 'support_access.open',
            tenantId: grant.tenantId,
            reason: `Read-only support access granted by ${grant.grantedByName}`,
            after: { grantId: grant.id, sessionId, endsAt: endsAt.toISOString() },
          });
        },
      },
    );
    await this.tellGranter(grant, tenant.name, person.name, now, endsAt);
    return {
      ...tokens,
      sessionId,
      endsAt: endsAt.toISOString(),
      grant: await this.viewOf(grant.id),
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }

  async end(actor: PlatformUser, sessionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({ session: supportAccessSessions, tenantId: supportAccessGrants.tenantId })
        .from(supportAccessSessions)
        .innerJoin(supportAccessGrants, eq(supportAccessGrants.id, supportAccessSessions.grantId))
        .where(eq(supportAccessSessions.id, sessionId));
      if (!found) throw new NotFoundException('Support session not found');
      if (found.session.endedAt) return;
      await this.endSessions(tx, eq(supportAccessSessions.id, sessionId), new Date());
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'support_access.end',
        tenantId: found.tenantId,
        reason: `Ended ${found.session.platformUserName}'s read-only support session`,
        after: { sessionId },
      });
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Ends the open sessions that match and signs their refresh tokens out; how many ended. */
  private async endSessions(tx: Tx, where: SQL, now: Date): Promise<number> {
    const ended = await tx
      .update(supportAccessSessions)
      .set({ endedAt: now })
      .where(and(where, isNull(supportAccessSessions.endedAt)))
      .returning({ authSessionId: supportAccessSessions.authSessionId });
    const ids = ended.flatMap((s) => (s.authSessionId ? [s.authSessionId] : []));
    if (ids.length > 0) {
      await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(and(inArray(authSessions.id, ids), isNull(authSessions.revokedAt)));
    }
    return ended.length;
  }

  /**
   * The person's `support` login in the workspace: made the first time, renamed when their
   * name changed. Its address is ours, so a login the workspace made with it becomes ours too.
   */
  private supportLogin(tenantId: string, person: PlatformUserRow): Promise<{ id: string }> {
    const name = `${person.name} (Good People support)`;
    return runAsTenant(this.db, tenantId, async (tx) => {
      const [login] = await tx
        .insert(tenantUsers)
        .values({ tenantId, email: supportEmail(person.id), name, role: 'support', language: 'en' })
        .onConflictDoUpdate({
          target: [tenantUsers.tenantId, tenantUsers.email],
          set: { name, role: 'support', passwordHash: null, disabledAt: null },
        })
        .returning({ id: tenantUsers.id });
      return login!;
    });
  }

  /** Tells the admin who granted access who opened the workspace, when, and until when. */
  private async tellGranter(
    grant: GrantRow,
    workspace: string,
    person: string,
    startedAt: Date,
    endsAt: Date,
  ) {
    const [admin] = await runAsTenant(this.db, grant.tenantId, (tx) =>
      tx
        .select({ email: tenantUsers.email, language: tenantUsers.language })
        .from(tenantUsers)
        .where(eq(tenantUsers.id, grant.grantedByUserId)),
    );
    if (!admin?.email) return;
    const bn = admin.language === 'bn';
    const at = (date: Date) =>
      new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Dhaka',
      }).format(date);
    const link = `${this.config.WEB_ORIGIN}/workspace/support/access`;
    const message: EmailMessage = {
      to: admin.email,
      subject: bn
        ? `গুড পিপল সহায়তা দল ${workspace} খুলেছে`
        : `Good People support opened ${workspace}`,
      text: bn
        ? `আপনার দেওয়া অনুমতিতে গুড পিপল সহায়তা দলের ${person} ${at(startedAt)}-এ ${workspace} ওয়ার্কস্পেসটি খুলেছেন। তিনি শুধু দেখতে পারবেন, কিছু বদলাতে পারবেন না। এই সেশন সর্বোচ্চ ${at(endsAt)} পর্যন্ত চলবে, আর তিনি যে পাতাই খোলেন তা আপনার ওয়ার্কস্পেসের অডিট লগে লেখা থাকে।\n\nঅনুমতি এখনই তুলে নিতে চাইলে: ${link}`
        : `${person} from Good People support opened ${workspace} at ${at(startedAt)}, under the access you granted. They can look but not change anything. This session lasts until ${at(endsAt)} at the latest, and every page they open is recorded in your workspace's audit log.\n\nTo take the access back now: ${link}`,
    };
    await this.email.send(message).catch((error: Error) => {
      this.logger.error(`Support access email to ${message.to} failed: ${error.message}`);
    });
  }

  private grants(where: SQL | undefined, order: 'createdAt' | 'endsAt' = 'createdAt') {
    return this.db
      .select({ grant: supportAccessGrants, ticketNumber: supportTickets.number })
      .from(supportAccessGrants)
      .leftJoin(supportTickets, eq(supportTickets.id, supportAccessGrants.ticketId))
      .where(where)
      .orderBy(
        order === 'endsAt' ? asc(supportAccessGrants.endsAt) : desc(supportAccessGrants.createdAt),
      );
  }

  private async viewOf(id: string): Promise<SupportAccessGrantView> {
    const [found] = await this.views(await this.grants(eq(supportAccessGrants.id, id)));
    return found!.view;
  }

  /** Each grant as the workspace sees it, and the sessions still open on it. */
  private async views(
    grants: { grant: GrantRow; ticketNumber: number | null }[],
  ): Promise<{ view: SupportAccessGrantView; open: SessionRow[] }[]> {
    const sessions = grants.length
      ? await this.db
          .select()
          .from(supportAccessSessions)
          .where(
            inArray(
              supportAccessSessions.grantId,
              grants.map((g) => g.grant.id),
            ),
          )
          .orderBy(asc(supportAccessSessions.startedAt))
      : [];
    const now = new Date();
    return grants.map(({ grant, ticketNumber }) => {
      const mine = sessions.filter((s) => s.grantId === grant.id);
      const view: SupportAccessGrantView = {
        id: grant.id,
        tenantId: grant.tenantId,
        ticketId: grant.ticketId,
        ticketNumber,
        grantedBy: { id: grant.grantedByUserId, name: grant.grantedByName },
        note: grant.note,
        startsAt: grant.startsAt.toISOString(),
        endsAt: grant.endsAt.toISOString(),
        revokedAt: grant.revokedAt?.toISOString() ?? null,
        active: isActiveGrant(grant, now),
        sessions: mine.map((s) => ({
          platformUserName: s.platformUserName,
          startedAt: s.startedAt.toISOString(),
        })),
      };
      const open = mine.filter((s) => !s.endedAt && sessionEndsAt(grant.endsAt, s.startedAt) > now);
      return { view, open };
    });
  }
}
