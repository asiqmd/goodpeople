import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  employees,
  grievanceMessages,
  grievances,
  hashPassword,
  locations,
  tenants,
  verifyPassword,
  type Database,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  GRIEVANCE_CATEGORIES,
  GRIEVANCE_DONE_STATUSES,
  RESTRICTED_GRIEVANCE_CATEGORIES,
  todayIn,
  grievanceFollowUpSchema,
  grievanceReporterReplySchema,
  grievanceSubmitSchema,
  type ApiError,
  type GrievanceCategory,
  type GrievanceFollowUp,
  type GrievanceStatus,
  type GrievanceSubmitted,
  type SpeakUpInfo,
} from '@gp/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { badRequest } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { runInTenantContext } from '../../common/request-context.js';
import { DB, FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { NotificationsService, usersWith } from '../notifications/notifications.service.js';
import { newGrievanceReference, PinLockout, referenceLocked } from './codes.js';
import {
  CATEGORY_LABELS,
  complaintCommitteeLogins,
  deadlineOn,
  openBody,
  openText,
  sealText,
  type GrievanceBody,
} from './grievance-records.js';

type SubmitInput = z.output<typeof grievanceSubmitSchema>;
type FollowUpInput = z.output<typeof grievanceFollowUpSchema>;
type ReplyInput = z.output<typeof grievanceReporterReplySchema>;
type GrievanceRow = typeof grievances.$inferSelect;

const MINUTE_MS = 60_000;
const LIMITS = {
  view: { limit: 120, windowMs: 15 * MINUTE_MS },
  // Generous: a kiosk, or a factory's wifi, puts many workers behind one address.
  submit: { limit: 20, windowMs: 60 * MINUTE_MS },
  follow: { limit: 60, windowMs: 15 * MINUTE_MS },
};

/**
 * The worker's side, without signing in. Nothing about the visitor is kept: no login, no
 * session, no address or device. Their address is only a key for the in-memory rate limits.
 */
@Injectable()
export class SpeakUpService {
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    private readonly tenantDb: TenantDb,
    private readonly notifications: NotificationsService,
    private readonly limiter: RateLimiter,
    private readonly lockout: PinLockout,
  ) {}

  async info(slug: string, ip: string): Promise<SpeakUpInfo> {
    const workspace = await this.open(slug, ip, 'view');
    const sites = await this.asTenant(workspace.id, (tx) =>
      tx
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(eq(locations.isActive, true))
        .orderBy(asc(locations.name)),
    );
    return {
      workspace: { name: workspace.name, slug: workspace.slug },
      sites,
      categories: [...GRIEVANCE_CATEGORIES],
      deadline: deadlineOn(todayIn()),
    };
  }

  async submit(slug: string, input: SubmitInput, ip: string): Promise<GrievanceSubmitted> {
    const workspace = await this.open(slug, ip, 'submit');
    const pinHash = await hashPassword(input.pin);
    return this.asTenant(workspace.id, async (tx) => {
      if (input.locationId) {
        const [site] = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.id, input.locationId), eq(locations.isActive, true)));
        if (!site) throw badRequest('invalid_reference', 'Choose one of the sites listed');
      }
      const named = Boolean(input.name || input.employeeCode);
      const body: GrievanceBody = {
        text: input.text,
        ...(input.name ? { name: input.name } : {}),
        ...(input.employeeCode ? { employeeCode: input.employeeCode } : {}),
      };
      const restricted = (RESTRICTED_GRIEVANCE_CATEGORIES as readonly GrievanceCategory[]).includes(
        input.category,
      );
      const [row] = await tx
        .insert(grievances)
        .values({
          tenantId: workspace.id,
          reference: await this.freeReference(tx),
          pinHash,
          category: input.category,
          bodyEnc: sealText(this.cipher, workspace.id, JSON.stringify(body)),
          anonymous: !named,
          reporterEmployeeId: input.employeeCode
            ? await this.activeEmployee(tx, input.employeeCode)
            : null,
          locationId: input.locationId ?? null,
          channel: input.channel,
          restricted,
        })
        .returning();
      // Harassment goes to the complaint committee only (s.332A), or without one to the
      // workspace admin, who reads it then (readsWithoutCommittee).
      const committee = restricted ? await complaintCommitteeLogins(tx) : [];
      await this.notifications.notify(tx, {
        event: 'grievance.received',
        recipients: committee.length
          ? committee.map((userId) => ({ userId }))
          : await usersWith(tx, restricted ? 'users.manage' : 'grievances.manage'),
        values: {
          'grievance.reference': row!.reference,
          'grievance.category': CATEGORY_LABELS[row!.category],
        },
        link: `/workspace/grievances/${row!.id}`,
        dedupeKey: `grievance.received:${row!.id}`,
      });
      return { reference: row!.reference, createdAt: row!.createdAt.toISOString() };
    });
  }

  async followUp(slug: string, input: FollowUpInput, ip: string): Promise<GrievanceFollowUp> {
    const workspace = await this.open(slug, ip, 'follow');
    return this.asTenant(workspace.id, async (tx) =>
      this.view(tx, await this.unlock(tx, workspace.id, input)),
    );
  }

  /** The reporter answers; a grievance that was answered or resolved goes back for review. */
  async reply(slug: string, input: ReplyInput, ip: string): Promise<GrievanceFollowUp> {
    const workspace = await this.open(slug, ip, 'follow');
    return this.asTenant(workspace.id, async (tx) => {
      const row = await this.unlock(tx, workspace.id, input);
      if (row.status === 'closed') {
        throw badRequest('grievance_closed', 'This grievance is closed; raise a new one');
      }
      await tx.insert(grievanceMessages).values({
        tenantId: workspace.id,
        grievanceId: row.id,
        author: 'reporter',
        bodyEnc: sealText(this.cipher, workspace.id, input.text),
      });
      const reopened = (['responded', ...GRIEVANCE_DONE_STATUSES] as GrievanceStatus[]).includes(
        row.status,
      );
      const [updated] = await tx
        .update(grievances)
        .set({
          updatedAt: new Date(),
          ...(reopened ? { status: 'in_review' as const, closedAt: null } : {}),
        })
        .where(eq(grievances.id, row.id))
        .returning();
      return this.view(tx, updated!);
    });
  }

  /** Counted before the workspace is looked up, so made-up workspace slugs are limited too. */
  private async open(slug: string, ip: string, kind: keyof typeof LIMITS) {
    const wanted = slug.trim().toLowerCase();
    const { limit, windowMs } = LIMITS[kind];
    await this.limiter.hit(`speak-up:${kind}:${ip}:${wanted}`, limit, windowMs);
    return this.workspace(wanted);
  }

  /**
   * The workspace behind a speak-up address. Suspended and archived ones are not found;
   * read-only ones still take grievances, since raising one is the worker's right.
   */
  private async workspace(slug: string) {
    const [row] = await this.db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.slug, slug));
    if (!row || row.status === 'suspended' || row.status === 'archived') {
      const body: ApiError = {
        statusCode: 404,
        error: 'Not Found',
        message: 'There is no workspace at this address',
        code: 'workspace_not_found',
      };
      throw new NotFoundException(body);
    }
    return row;
  }

  private asTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return runInTenantContext(tenantId, () => this.tenantDb.run(fn));
  }

  /**
   * The grievance for a reference and PIN. An unknown reference costs the same as a wrong
   * PIN, so neither the answer nor its timing tells whether a reference exists.
   */
  private async unlock(tx: Tx, tenantId: string, input: FollowUpInput): Promise<GrievanceRow> {
    const key = `${tenantId}:${input.reference}`;
    const locked = this.lockout.lockedFor(key);
    if (locked) throw referenceLocked(locked);
    const [row] = await tx
      .select()
      .from(grievances)
      .where(eq(grievances.reference, input.reference));
    const matches = await verifyPassword(row?.pinHash ?? (await this.dummy()), input.pin);
    if (!row || !matches) {
      this.lockout.fail(key);
      const body: ApiError = {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'The reference or the PIN is wrong',
        code: 'wrong_reference_or_pin',
      };
      throw new UnauthorizedException(body);
    }
    this.lockout.clear(key);
    return row;
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= hashPassword(newGrievanceReference());
    return this.dummyHash;
  }

  private async view(tx: Tx, row: GrievanceRow): Promise<GrievanceFollowUp> {
    const messages = await tx
      .select()
      .from(grievanceMessages)
      .where(eq(grievanceMessages.grievanceId, row.id))
      .orderBy(asc(grievanceMessages.createdAt));
    return {
      reference: row.reference,
      category: row.category,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      thread: [
        {
          author: 'reporter',
          text: openBody(this.cipher, row).text,
          createdAt: row.createdAt.toISOString(),
        },
        ...messages.map((m) => ({
          author: m.author,
          text: openText(this.cipher, m.tenantId, m.bodyEnc),
          createdAt: m.createdAt.toISOString(),
        })),
      ],
    };
  }

  private async freeReference(tx: Tx): Promise<string> {
    for (;;) {
      const reference = newGrievanceReference();
      const [taken] = await tx
        .select({ id: grievances.id })
        .from(grievances)
        .where(eq(grievances.reference, reference));
      if (!taken) return reference;
    }
  }

  /** The employee with this code, only while employed; codes compare ignoring case. */
  private async activeEmployee(tx: Tx, code: string): Promise<string | null> {
    const [row] = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          sql`upper(${employees.employeeCode}) = ${code.toUpperCase()}`,
          eq(employees.status, 'active'),
        ),
      );
    return row?.id ?? null;
  }
}
