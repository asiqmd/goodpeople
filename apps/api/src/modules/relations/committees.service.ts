import { Injectable, NotFoundException } from '@nestjs/common';
import {
  committeeMeetings,
  committeeMembers,
  committees,
  employees,
  locations,
  type Tx,
} from '@gp/db';
import {
  can,
  todayIn,
  type CommitteeInput,
  type CommitteeMeetingInput,
  type CommitteeMeetingUpdate,
  type CommitteeMemberEnd,
  type CommitteeMemberInput,
  type CommitteeSummaryView,
  type CommitteeUpdate,
  type CommitteeView,
  type RelationsStatusView,
} from '@gp/shared';
import { and, count, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { committeeRuleOn, termEndOf } from './committee-rules.js';
import { committeeView, loadSnapshot } from './relations-snapshot.js';

/** An employee named by id or by code (in any case, the exact code first), or a 400. */
export async function employeeByRef(tx: Tx, ref: { employeeId?: string; employeeCode?: string }) {
  const code = ref.employeeCode?.trim() ?? '';
  const rows = await tx
    .select()
    .from(employees)
    .where(
      ref.employeeId
        ? eq(employees.id, ref.employeeId)
        : sql`lower(${employees.employeeCode}) = ${code.toLowerCase()}`,
    );
  const row = rows.find((e) => e.employeeCode === code) ?? rows[0];
  if (!row) throw badRequest('employee_not_found', 'No employee with this code');
  return row;
}

/**
 * The complaint committee decides who reads harassment cases (s.332A), so only the workspace
 * admin (users.manage) forms it, changes its term or members, or removes it; whoever handles
 * compliance keeps the other committees and every committee's meetings.
 */
function mustAdministerComplaint(actor: AuthUser, kind: CommitteeInput['kind']) {
  if (kind !== 'complaint' || (actor.kind === 'tenant' && can(actor.role, 'users.manage'))) return;
  throw forbidden(
    'role_not_allowed',
    'Only the workspace admin can change the complaint committee (s.332A)',
  );
}

/** The term the law sets, when the committee's own end date is not given. */
const defaultEnd = (kind: CommitteeInput['kind'], formedOn: string) =>
  termEndOf(committeeRuleOn(kind, formedOn)?.value ?? null, formedOn);

/**
 * The committees the Labour Act requires and any others a company keeps: who sits on them,
 * their meetings, minutes and decisions, and whether each establishment has what the law
 * asks of it (s.90A, s.205–208, s.332A).
 */
@Injectable()
export class CommitteesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  status(): Promise<RelationsStatusView> {
    const today = todayIn();
    return this.tenantDb.run(async (tx) => {
      const { establishments } = await loadSnapshot(tx, today);
      return { asOf: today, establishments };
    });
  }

  list(): Promise<CommitteeSummaryView[]> {
    return this.tenantDb.run(async (tx) =>
      (await loadSnapshot(tx, todayIn())).committees.map((c) => c.summary).toReversed(),
    );
  }

  get(id: string): Promise<CommitteeView> {
    return this.tenantDb.run((tx) => this.viewIn(tx, id));
  }

  create(actor: AuthUser, input: CommitteeInput): Promise<CommitteeView> {
    mustAdministerComplaint(actor, input.kind);
    return this.tenantDb.run(async (tx) => {
      if (input.locationId) {
        const [site] = await tx
          .select({ legalEntityId: locations.legalEntityId })
          .from(locations)
          .where(eq(locations.id, input.locationId));
        if (site && site.legalEntityId !== input.legalEntityId) {
          throw badRequest('location_other_company', 'The site belongs to another company');
        }
      }
      const [row] = await tx
        .insert(committees)
        .values({
          tenantId: currentTenantId(),
          kind: input.kind,
          legalEntityId: input.legalEntityId,
          locationId: input.locationId ?? null,
          name: input.name,
          formedOn: input.formedOn,
          endsOn: input.endsOn ?? defaultEnd(input.kind, input.formedOn),
          note: input.note ?? null,
        })
        .returning();
      await this.record(tx, actor, 'relations.committee.create', row!.id, null, row);
      return this.viewIn(tx, row!.id);
    });
  }

  update(actor: AuthUser, id: string, input: CommitteeUpdate): Promise<CommitteeView> {
    return this.tenantDb.run(async (tx) => {
      const current = await this.committeeOrThrow(tx, id);
      mustAdministerComplaint(actor, current.kind);
      const formedOn = input.formedOn ?? current.formedOn;
      // An end date left as the law's term moves with the formation date.
      const endsOn =
        input.endsOn !== undefined
          ? (input.endsOn ?? defaultEnd(current.kind, formedOn))
          : current.endsOn === defaultEnd(current.kind, current.formedOn)
            ? defaultEnd(current.kind, formedOn)
            : current.endsOn;
      if (endsOn && endsOn < formedOn) {
        throw badRequest('ends_before_start', 'The term cannot end before it starts');
      }
      const [row] = await tx
        .update(committees)
        .set({
          name: input.name ?? current.name,
          formedOn,
          endsOn,
          note: input.note !== undefined ? input.note : current.note,
          updatedAt: new Date(),
        })
        .where(eq(committees.id, id))
        .returning();
      await this.record(tx, actor, 'relations.committee.update', id, current, row);
      return this.viewIn(tx, id);
    });
  }

  /** Only a committee with no meetings: minutes are statutory records. */
  remove(actor: AuthUser, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const current = await this.committeeOrThrow(tx, id);
      mustAdministerComplaint(actor, current.kind);
      const [held] = await tx
        .select({ n: count() })
        .from(committeeMeetings)
        .where(eq(committeeMeetings.committeeId, id));
      if (held!.n > 0) {
        throw conflict('committee_has_meetings', 'A committee with meetings cannot be deleted');
      }
      await tx.delete(committees).where(eq(committees.id, id));
      await this.record(tx, actor, 'relations.committee.delete', id, current, null);
    });
  }

  addMember(actor: AuthUser, id: string, input: CommitteeMemberInput): Promise<CommitteeView> {
    return this.tenantDb.run(async (tx) => {
      mustAdministerComplaint(actor, (await this.committeeOrThrow(tx, id)).kind);
      const employee =
        input.employeeId || input.employeeCode ? await employeeByRef(tx, input) : null;
      if (employee) {
        const [overlap] = await tx
          .select({ id: committeeMembers.id })
          .from(committeeMembers)
          .where(
            and(
              eq(committeeMembers.committeeId, id),
              eq(committeeMembers.employeeId, employee.id),
              or(isNull(committeeMembers.toOn), gte(committeeMembers.toOn, input.fromOn)),
            ),
          );
        if (overlap) throw conflict('already_member', 'Already a member of this committee');
      }
      const [row] = await tx
        .insert(committeeMembers)
        .values({
          tenantId: currentTenantId(),
          committeeId: id,
          employeeId: employee?.id ?? null,
          name: employee?.fullName ?? input.name!,
          gender: employee ? null : (input.gender ?? null),
          side: input.side,
          role: input.role,
          selection: input.selection,
          fromOn: input.fromOn,
          toOn: input.toOn ?? null,
        })
        .returning();
      await this.record(tx, actor, 'relations.committee.member_add', id, null, row);
      return this.viewIn(tx, id);
    });
  }

  endMember(
    actor: AuthUser,
    id: string,
    memberId: string,
    input: CommitteeMemberEnd,
  ): Promise<CommitteeView> {
    return this.tenantDb.run(async (tx) => {
      mustAdministerComplaint(actor, (await this.committeeOrThrow(tx, id)).kind);
      const [member] = await tx
        .select()
        .from(committeeMembers)
        .where(and(eq(committeeMembers.id, memberId), eq(committeeMembers.committeeId, id)));
      if (!member) throw new NotFoundException('Committee member not found');
      if (input.toOn < member.fromOn) {
        throw badRequest('ends_before_start', 'Cannot end before it starts');
      }
      await tx
        .update(committeeMembers)
        .set({ toOn: input.toOn })
        .where(eq(committeeMembers.id, memberId));
      await this.record(tx, actor, 'relations.committee.member_end', id, member, input);
      return this.viewIn(tx, id);
    });
  }

  addMeeting(actor: AuthUser, id: string, input: CommitteeMeetingInput): Promise<CommitteeView> {
    return this.tenantDb.run(async (tx) => {
      const committee = await this.committeeOrThrow(tx, id);
      this.checkDates(committee.formedOn, input.heldOn, input.minutesSentOn ?? null);
      const [row] = await tx
        .insert(committeeMeetings)
        .values({
          tenantId: currentTenantId(),
          committeeId: id,
          heldOn: input.heldOn,
          agenda: input.agenda ?? null,
          minutes: input.minutes ?? null,
          attendees: input.attendees ?? null,
          minutesSentOn: input.minutesSentOn ?? null,
          decisions: input.decisions,
          createdBy: actor.id,
        })
        .returning();
      await this.record(tx, actor, 'relations.committee.meeting_add', id, null, row);
      return this.viewIn(tx, id);
    });
  }

  updateMeeting(
    actor: AuthUser,
    id: string,
    meetingId: string,
    input: CommitteeMeetingUpdate,
  ): Promise<CommitteeView> {
    return this.tenantDb.run(async (tx) => {
      const committee = await this.committeeOrThrow(tx, id);
      const current = await this.meetingOrThrow(tx, id, meetingId);
      const next = {
        heldOn: input.heldOn ?? current.heldOn,
        agenda: input.agenda !== undefined ? input.agenda : current.agenda,
        minutes: input.minutes !== undefined ? input.minutes : current.minutes,
        attendees: input.attendees !== undefined ? input.attendees : current.attendees,
        minutesSentOn:
          input.minutesSentOn !== undefined ? input.minutesSentOn : current.minutesSentOn,
        decisions: input.decisions ?? current.decisions,
      };
      this.checkDates(committee.formedOn, next.heldOn, next.minutesSentOn);
      await tx.update(committeeMeetings).set(next).where(eq(committeeMeetings.id, meetingId));
      await this.record(tx, actor, 'relations.committee.meeting_update', id, current, next);
      return this.viewIn(tx, id);
    });
  }

  setDecision(
    actor: AuthUser,
    id: string,
    meetingId: string,
    index: number,
    done: boolean,
  ): Promise<CommitteeView> {
    return this.tenantDb.run(async (tx) => {
      const meeting = await this.meetingOrThrow(tx, id, meetingId);
      if (!meeting.decisions[index]) throw new NotFoundException('Decision not found');
      const decisions = meeting.decisions.map((d, i) => (i === index ? { ...d, done } : d));
      await tx
        .update(committeeMeetings)
        .set({ decisions })
        .where(eq(committeeMeetings.id, meetingId));
      await this.record(tx, actor, 'relations.committee.decision', id, null, {
        meetingId,
        index,
        done,
      });
      return this.viewIn(tx, id);
    });
  }

  private async viewIn(tx: Tx, id: string): Promise<CommitteeView> {
    const today = todayIn();
    const record = (await loadSnapshot(tx, today)).committees.find((c) => c.row.id === id);
    if (!record) throw new NotFoundException('Committee not found');
    return committeeView(record, today);
  }

  private async committeeOrThrow(tx: Tx, id: string) {
    const [row] = await tx.select().from(committees).where(eq(committees.id, id));
    if (!row) throw new NotFoundException('Committee not found');
    return row;
  }

  private async meetingOrThrow(tx: Tx, committeeId: string, meetingId: string) {
    const [row] = await tx
      .select()
      .from(committeeMeetings)
      .where(
        and(eq(committeeMeetings.id, meetingId), eq(committeeMeetings.committeeId, committeeId)),
      );
    if (!row) throw new NotFoundException('Meeting not found');
    return row;
  }

  /** A meeting is recorded once held, during the committee's life. */
  private checkDates(formedOn: string, heldOn: string, minutesSentOn: string | null) {
    const today = todayIn();
    if (heldOn > today || (minutesSentOn && minutesSentOn > today)) {
      throw badRequest('date_in_future', 'Record a meeting once it has been held');
    }
    if (heldOn < formedOn) {
      throw badRequest('meeting_before_formed', 'The meeting is before the committee was formed');
    }
    if (minutesSentOn && minutesSentOn < heldOn) {
      throw badRequest('ends_before_start', 'Minutes cannot be sent before the meeting');
    }
  }

  private record(
    tx: Tx,
    actor: AuthUser,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record(tx, {
      actorUserId: actor.id,
      action,
      entityType: 'committee',
      entityId,
      before,
      after,
    });
  }
}
