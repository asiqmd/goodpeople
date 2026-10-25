import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  employees,
  grievanceMessages,
  grievances,
  locations,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  GRIEVANCE_DONE_STATUSES,
  todayIn,
  type GrievanceDetail,
  type GrievanceList,
  type GrievanceListQuery,
  type GrievanceStaffReplyInput,
  type GrievanceStatus,
  type GrievanceStatusInput,
  type GrievanceSummary,
} from '@gp/shared';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import {
  clockOf,
  deadlineOn,
  openBody,
  openText,
  grievanceAccessOf,
  sealText,
} from './grievance-records.js';

type GrievanceRow = typeof grievances.$inferSelect;
interface Row {
  grievance: GrievanceRow;
  location: { id: string; name: string } | null;
}

const isDone = (status: GrievanceStatus) =>
  (GRIEVANCE_DONE_STATUSES as readonly GrievanceStatus[]).includes(status);

/**
 * The staff side: those who handle grievances read and answer them. Harassment cases are
 * the complaint committee's alone (s.332A); others never learn they exist.
 */
const tenantUser = (user: AuthUser) => {
  if (user.kind !== 'tenant') throw new NotFoundException('Grievance not found');
  return user;
};

@Injectable()
export class GrievancesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  list(user: AuthUser, query: GrievanceListQuery): Promise<GrievanceList> {
    return this.tenantDb.run(async (tx) => {
      const access = await grievanceAccessOf(tx, tenantUser(user));
      const rows = await this.rows(
        tx,
        and(
          query.status ? eq(grievances.status, query.status) : undefined,
          query.category ? eq(grievances.category, query.category) : undefined,
          access.canSeeRestricted ? undefined : eq(grievances.restricted, false),
          access.all ? undefined : eq(grievances.restricted, true),
        ),
      );
      const last = await this.lastMessages(
        tx,
        rows.map((r) => r.grievance.id),
      );
      const deadline = deadlineOn(todayIn());
      return {
        items: rows.map((r) => this.summary(r, deadline, last.get(r.grievance.id))),
        deadline,
        committeeMissing: access.committeeMissing,
      };
    });
  }

  detail(user: AuthUser, id: string): Promise<GrievanceDetail> {
    return this.tenantDb.run((tx) => this.view(tx, user, id));
  }

  /** Answers the reporter; a new or reviewed grievance becomes answered. */
  reply(user: AuthUser, id: string, input: GrievanceStaffReplyInput): Promise<GrievanceDetail> {
    return this.tenantDb.run(async (tx) => {
      const { grievance } = await this.visible(tx, user, id);
      if (grievance.status === 'closed') {
        throw badRequest('grievance_closed', 'Reopen the grievance before answering it');
      }
      const [message] = await tx
        .insert(grievanceMessages)
        .values({
          tenantId: currentTenantId(),
          grievanceId: id,
          author: 'staff',
          staffUserId: user.id,
          bodyEnc: sealText(this.cipher, currentTenantId(), input.text),
        })
        .returning({ id: grievanceMessages.id });
      const status: GrievanceStatus =
        grievance.status === 'new' || grievance.status === 'in_review'
          ? 'responded'
          : grievance.status;
      await tx
        .update(grievances)
        .set({ status, updatedAt: new Date() })
        .where(eq(grievances.id, id));
      // Who answered and when, never what was written.
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'grievance.reply',
        entityType: 'grievance',
        entityId: id,
        before: { status: grievance.status },
        after: { status, messageId: message!.id },
      });
      return this.view(tx, user, id);
    });
  }

  setStatus(user: AuthUser, id: string, input: GrievanceStatusInput): Promise<GrievanceDetail> {
    return this.tenantDb.run(async (tx) => {
      const { grievance } = await this.visible(tx, user, id);
      if (grievance.status !== input.status) {
        const closedAt = isDone(input.status) ? (grievance.closedAt ?? new Date()) : null;
        await tx
          .update(grievances)
          .set({ status: input.status, closedAt, updatedAt: new Date() })
          .where(eq(grievances.id, id));
        await this.audit.record(tx, {
          actorUserId: user.id,
          action: 'grievance.status',
          entityType: 'grievance',
          entityId: id,
          before: { status: grievance.status },
          after: { status: input.status },
        });
      }
      return this.view(tx, user, id);
    });
  }

  private rows(tx: Tx, where: SQL | undefined): Promise<Row[]> {
    return tx
      .select({
        grievance: grievances,
        location: { id: locations.id, name: locations.name },
      })
      .from(grievances)
      .leftJoin(locations, eq(locations.id, grievances.locationId))
      .where(where)
      .orderBy(desc(grievances.createdAt));
  }

  /** A grievance this login may open; restricted ones are not found for anyone else. */
  private async visible(tx: Tx, user: AuthUser, id: string) {
    const [row] = await this.rows(tx, eq(grievances.id, id));
    const access = await grievanceAccessOf(tx, tenantUser(user));
    const allowed = row?.grievance.restricted ? access.canSeeRestricted : access.all;
    if (!row || !allowed) {
      throw new NotFoundException('Grievance not found');
    }
    return { ...row, committeeMissing: access.committeeMissing };
  }

  private async lastMessages(tx: Tx, ids: string[]) {
    if (ids.length === 0) return new Map<string, { author: string; createdAt: Date }>();
    const rows = await tx
      .selectDistinctOn([grievanceMessages.grievanceId], {
        grievanceId: grievanceMessages.grievanceId,
        author: grievanceMessages.author,
        createdAt: grievanceMessages.createdAt,
      })
      .from(grievanceMessages)
      .where(inArray(grievanceMessages.grievanceId, ids))
      .orderBy(grievanceMessages.grievanceId, desc(grievanceMessages.createdAt));
    return new Map(rows.map((r) => [r.grievanceId, r]));
  }

  private summary(
    { grievance: g, location }: Row,
    deadline: GrievanceList['deadline'],
    last: { author: string; createdAt: Date } | undefined,
  ): GrievanceSummary {
    return {
      id: g.id,
      reference: g.reference,
      category: g.category,
      status: g.status,
      channel: g.channel,
      anonymous: g.anonymous,
      restricted: g.restricted,
      location,
      createdAt: g.createdAt.toISOString(),
      closedAt: g.closedAt?.toISOString() ?? null,
      ...clockOf(g, deadline),
      // The grievance itself is the reporter's first word.
      awaitingReply: !isDone(g.status) && (last?.author ?? 'reporter') === 'reporter',
      lastMessageAt: (last?.createdAt ?? g.createdAt).toISOString(),
    };
  }

  private async view(tx: Tx, user: AuthUser, id: string): Promise<GrievanceDetail> {
    const row = await this.visible(tx, user, id);
    const g = row.grievance;
    const messages = await tx
      .select({
        message: grievanceMessages,
        staff: { id: tenantUsers.id, name: tenantUsers.name },
      })
      .from(grievanceMessages)
      .leftJoin(tenantUsers, eq(tenantUsers.id, grievanceMessages.staffUserId))
      .where(eq(grievanceMessages.grievanceId, id))
      .orderBy(asc(grievanceMessages.createdAt));
    const [employee] = g.reporterEmployeeId
      ? await tx
          .select({
            id: employees.id,
            name: employees.fullName,
            employeeCode: employees.employeeCode,
          })
          .from(employees)
          .where(eq(employees.id, g.reporterEmployeeId))
      : [];
    const body = openBody(this.cipher, g);
    const deadline = deadlineOn(todayIn());
    const lastMessage = messages.at(-1)?.message;
    return {
      ...this.summary(row, deadline, lastMessage),
      reporter: g.anonymous
        ? null
        : {
            name: body.name ?? null,
            employeeCode: body.employeeCode ?? null,
            employee: employee ?? null,
          },
      thread: [
        { author: 'reporter', text: body.text, createdAt: g.createdAt.toISOString(), staff: null },
        ...messages.map(({ message: m, staff }) => ({
          author: m.author,
          text: openText(this.cipher, m.tenantId, m.bodyEnc),
          createdAt: m.createdAt.toISOString(),
          staff,
        })),
      ],
      deadline,
      committeeMissing: row.committeeMissing,
    };
  }
}
