import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  applications,
  candidates,
  employees,
  interviewPanel,
  interviews,
  jobOpenings,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  isClosedStage,
  type EmployeeRef,
  type InterviewInput,
  type InterviewView,
  type MyInterviewDetail,
  type MyInterviewItem,
  type MyInterviews,
  type ScorecardInput,
  type ScorecardView,
  type UserLanguage,
} from '@gp/shared';
import { and, asc, eq, ilike, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { EmailMessage } from '../notifications/senders.js';
import {
  applicationFor,
  criteriaOf,
  employeeRefs,
  employeeRefSelect,
  notFound,
  postTitle,
  viewerOf,
  type ApplicationRow,
  type CandidateRow,
  type OpeningRow,
} from './access.js';
import { ERASED_NAME } from './erasure.js';
import { addEvent, clock, moveStage } from './events.js';
import { calendarInvitation, type CalendarPerson } from './ics.js';
import {
  candidateInterviewMail,
  dhakaWhen,
  interviewerMail,
  interviewWhere,
  KIND_TEXT,
  type Localized,
} from './recruitment-mail.js';
import { RecruitmentMailer } from './recruitment-mailer.service.js';

type InterviewRow = typeof interviews.$inferSelect;
type PanelRow = typeof interviewPanel.$inferSelect;

/** An interviewer and where their invitation goes. */
interface Interviewer extends EmployeeRef {
  email: string | null;
  language: UserLanguage;
}

/** A few minutes' grace, so an interview starting now can still be booked. */
const PAST_GRACE_MS = 5 * 60_000;
const MY_INTERVIEWS = '/workspace/interviews';

const NEW_INTERVIEW: Localized = { en: 'New interview.', bn: 'নতুন সাক্ষাৎকার।' };
const OFF_THE_PANEL: Localized = {
  en: 'You are no longer on the panel.',
  bn: 'আপনি আর এই প্যানেলে নেই।',
};

export const applicationClosed = () => conflict('application_closed', 'This application is closed');
const notScheduled = () =>
  conflict('interview_not_scheduled', 'Only a scheduled interview can change');

export const scorecardOf = (p: PanelRow): ScorecardView | null =>
  p.submittedAt && p.ratings && p.recommendation
    ? {
        ratings: p.ratings,
        recommendation: p.recommendation,
        feedback: p.feedback,
        submittedAt: p.submittedAt.toISOString(),
      }
    : null;

/** An application's interviews with their panels and every submitted scorecard. */
export async function interviewViewsFor(tx: Tx, applicationId: string): Promise<InterviewView[]> {
  const rows = await tx
    .select()
    .from(interviews)
    .where(eq(interviews.applicationId, applicationId))
    .orderBy(asc(interviews.startsAt));
  if (rows.length === 0) return [];
  const panel = await tx
    .select()
    .from(interviewPanel)
    .where(
      inArray(
        interviewPanel.interviewId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(interviewPanel.createdAt));
  const people = await employeeRefs(
    tx,
    panel.map((p) => p.employeeId),
  );
  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    kind: r.kind,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    location: r.location,
    meetingUrl: r.meetingUrl,
    status: r.status,
    notes: r.notes,
    panel: panel
      .filter((p) => p.interviewId === r.id)
      .map((p) => ({
        employee: people.get(p.employeeId)!,
        submitted: !!p.submittedAt,
        scorecard: scorecardOf(p),
      })),
  }));
}

/** Employees with an active login, as interviewers. */
async function interviewersOf(tx: Tx, ids: string[]): Promise<Interviewer[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .select({
      ...employeeRefSelect,
      loginEmail: tenantUsers.email,
      workEmail: employees.workEmail,
      language: tenantUsers.language,
    })
    .from(employees)
    .innerJoin(tenantUsers, eq(tenantUsers.id, employees.userId))
    .where(
      and(
        inArray(employees.id, ids),
        eq(employees.status, 'active'),
        isNull(tenantUsers.disabledAt),
      ),
    );
  return rows.map(({ loginEmail, workEmail, ...r }) => ({ ...r, email: loginEmail ?? workEmail }));
}

/** What a rescheduling changed, as the interviewers' notification says it. */
function changesOf(before: InterviewRow, after: InterviewRow): Localized | null {
  const en: string[] = [];
  const bn: string[] = [];
  if (
    before.startsAt.getTime() !== after.startsAt.getTime() ||
    before.endsAt.getTime() !== after.endsAt.getTime()
  ) {
    const was = dhakaWhen(before.startsAt);
    en.push(`time (was ${was.en})`);
    bn.push(`সময় (আগে ছিল ${was.bn})`);
  }
  if (before.kind !== after.kind) {
    en.push(`type (now ${KIND_TEXT[after.kind].en})`);
    bn.push(`ধরন (এখন ${KIND_TEXT[after.kind].bn})`);
  }
  if ((before.location ?? '') !== (after.location ?? '')) {
    en.push('place');
    bn.push('স্থান');
  }
  if ((before.meetingUrl ?? '') !== (after.meetingUrl ?? '')) {
    en.push('meeting link');
    bn.push('মিটিংয়ের লিংক');
  }
  return en.length ? { en: `Changed: ${en.join(', ')}.`, bn: `পরিবর্তন: ${bn.join(', ')}।` } : null;
}

/** Everything an invitation and its notification are about. */
interface Announcement {
  interview: InterviewRow;
  opening: OpeningRow;
  candidate: CandidateRow;
  change: 'scheduled' | 'rescheduled' | 'cancelled';
  /** The panel after the change, and who of them is new to it. */
  panel: Interviewer[];
  added: Set<string>;
  removed: Interviewer[];
  /** What the panel's notification says changed. */
  what: Localized;
  tellCandidate: boolean;
}

/**
 * Interviews: scheduled by those who manage recruitment or hire for the opening, with calendar
 * invitations to the candidate and the panel that update (a higher SEQUENCE) or cancel with the
 * interview; each interviewer's own list and scorecards.
 */
@Injectable()
export class InterviewsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
    private readonly mailer: RecruitmentMailer,
  ) {}

  // ── Scheduling ─────────────────────────────────────────────────────────────

  async schedule(user: AuthUser, applicationId: string, input: InterviewInput) {
    const { view, mails } = await this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { application, opening, candidate } = await applicationFor(tx, viewer, applicationId, {
        lock: true,
      });
      if (isClosedStage(application.stage)) throw applicationClosed();
      notInPast(input.startsAt);
      const panel = await this.panelOf(tx, input.interviewerIds);
      const id = randomUUID();
      const [interview] = await tx
        .insert(interviews)
        .values({
          id,
          tenantId: currentTenantId(),
          applicationId,
          ...fieldsOf(input),
          icsUid: `${id}@${this.mailer.organizerEmail().split('@')[1] ?? 'goodpeople'}`,
          icsSequence: 0,
          createdByUserId: user.id,
        })
        .returning();
      await tx.insert(interviewPanel).values(
        panel.map((p) => ({
          tenantId: currentTenantId(),
          interviewId: id,
          employeeId: p.id,
          createdAt: clock,
        })),
      );
      await addEvent(tx, applicationId, 'interview', 'scheduled', user.id);
      if (application.stage === 'applied' || application.stage === 'screening') {
        await moveStage(tx, application, 'interview', { actorUserId: user.id });
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'interview.schedule',
        entityType: 'interview',
        entityId: id,
        after: { applicationId, startsAt: input.startsAt, interviewers: input.interviewerIds },
      });
      const outbox = await this.announce(tx, {
        interview: interview!,
        opening,
        candidate,
        change: 'scheduled',
        panel,
        added: new Set(panel.map((p) => p.id)),
        removed: [],
        what: NEW_INTERVIEW,
        tellCandidate: true,
      });
      return { view: await this.viewOf(tx, id), mails: outbox };
    });
    await this.mailer.send(mails);
    return view;
  }

  /** New time, place or panel: everyone gets the updated invitation; those taken off, a cancellation. */
  async reschedule(user: AuthUser, id: string, input: InterviewInput) {
    const { view, mails } = await this.tenantDb.run(async (tx) => {
      const { interview, opening, candidate } = await this.managed(tx, user, id);
      notInPast(input.startsAt);
      const current = await tx
        .select()
        .from(interviewPanel)
        .where(eq(interviewPanel.interviewId, id));
      const keep = new Set(input.interviewerIds);
      const leaving = current.filter((p) => !keep.has(p.employeeId));
      if (leaving.some((p) => p.submittedAt)) {
        throw conflict(
          'interviewer_has_scorecard',
          'An interviewer who submitted a scorecard stays on the panel',
        );
      }
      const before = new Set(current.map((p) => p.employeeId));
      const panel = await this.panelOf(tx, input.interviewerIds);
      const removed = await interviewersOf(
        tx,
        leaving.map((p) => p.employeeId),
      );
      const [updated] = await tx
        .update(interviews)
        .set({
          ...fieldsOf(input),
          icsSequence: interview.icsSequence + 1,
          updatedAt: new Date(),
        })
        .where(eq(interviews.id, id))
        .returning();
      if (leaving.length) {
        await tx.delete(interviewPanel).where(
          inArray(
            interviewPanel.id,
            leaving.map((p) => p.id),
          ),
        );
      }
      const added = panel.filter((p) => !before.has(p.id));
      if (added.length) {
        await tx.insert(interviewPanel).values(
          added.map((p) => ({
            tenantId: currentTenantId(),
            interviewId: id,
            employeeId: p.id,
            createdAt: clock,
          })),
        );
      }
      await addEvent(tx, interview.applicationId, 'interview', 'rescheduled', user.id);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'interview.reschedule',
        entityType: 'interview',
        entityId: id,
        before: { startsAt: interview.startsAt.toISOString(), sequence: interview.icsSequence },
        after: { startsAt: input.startsAt, interviewers: input.interviewerIds },
      });
      const outbox = await this.announce(tx, {
        interview: updated!,
        opening,
        candidate,
        change: 'rescheduled',
        panel,
        added: new Set(added.map((p) => p.id)),
        removed,
        what: changesOf(interview, updated!) ?? {
          en: 'The panel changed.',
          bn: 'প্যানেল বদলেছে।',
        },
        tellCandidate: true,
      });
      return { view: await this.viewOf(tx, id), mails: outbox };
    });
    await this.mailer.send(mails);
    return view;
  }

  async cancel(user: AuthUser, id: string, reason: string | null | undefined) {
    const { view, mails } = await this.tenantDb.run(async (tx) => {
      const { interview } = await this.managed(tx, user, id, { closedToo: true });
      const outbox = await this.cancelIn(tx, interview, { actorUserId: user.id, reason });
      return { view: await this.viewOf(tx, id), mails: outbox };
    });
    await this.mailer.send(mails);
    return view;
  }

  async complete(user: AuthUser, id: string) {
    return this.tenantDb.run(async (tx) => {
      const { interview } = await this.managed(tx, user, id, { closedToo: true });
      if (interview.startsAt.getTime() > Date.now()) {
        throw conflict('interview_not_started', 'An interview is completed once it has started');
      }
      await tx
        .update(interviews)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(interviews.id, id));
      await addEvent(tx, interview.applicationId, 'interview', 'completed', user.id);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'interview.complete',
        entityType: 'interview',
        entityId: id,
      });
      return this.viewOf(tx, id);
    });
  }

  /**
   * Cancels an application's interviews still to come, as when it is rejected or withdrawn.
   * Returns the emails to send once the transaction commits.
   */
  async cancelUpcoming(
    tx: Tx,
    applicationId: string,
    options: { actorUserId: string | null; tellCandidate: boolean },
  ): Promise<EmailMessage[]> {
    const upcoming = await tx
      .select()
      .from(interviews)
      .where(and(eq(interviews.applicationId, applicationId), eq(interviews.status, 'scheduled')));
    const mails: EmailMessage[] = [];
    for (const interview of upcoming) {
      if (interview.endsAt.getTime() < Date.now()) continue;
      mails.push(...(await this.cancelIn(tx, interview, { ...options, reason: null })));
    }
    return mails;
  }

  private async cancelIn(
    tx: Tx,
    interview: InterviewRow,
    options: { actorUserId: string | null; reason?: string | null; tellCandidate?: boolean },
  ): Promise<EmailMessage[]> {
    const [cancelled] = await tx
      .update(interviews)
      .set({ status: 'cancelled', icsSequence: interview.icsSequence + 1, updatedAt: new Date() })
      .where(eq(interviews.id, interview.id))
      .returning();
    await addEvent(tx, interview.applicationId, 'interview', 'cancelled', options.actorUserId);
    if (options.actorUserId) {
      await this.audit.record(tx, {
        actorUserId: options.actorUserId,
        action: 'interview.cancel',
        entityType: 'interview',
        entityId: interview.id,
        after: { reason: options.reason ?? null },
      });
    }
    const [context] = await tx
      .select({ opening: jobOpenings, candidate: candidates })
      .from(applications)
      .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .where(eq(applications.id, interview.applicationId));
    const members = await tx
      .select({ employeeId: interviewPanel.employeeId })
      .from(interviewPanel)
      .where(eq(interviewPanel.interviewId, interview.id));
    const reason = options.reason?.trim();
    return this.announce(tx, {
      interview: cancelled!,
      opening: context!.opening,
      candidate: context!.candidate,
      change: 'cancelled',
      panel: await interviewersOf(
        tx,
        members.map((m) => m.employeeId),
      ),
      added: new Set(),
      removed: [],
      what: reason
        ? { en: `Cancelled: ${reason}`, bn: `বাতিল করা হয়েছে: ${reason}` }
        : { en: 'Cancelled.', bn: 'বাতিল করা হয়েছে।' },
      tellCandidate: options.tellCandidate ?? true,
    });
  }

  /** People who may be chosen as interviewers: employees with an active login. */
  async interviewerChoices(
    user: AuthUser,
    applicationId: string,
    search?: string,
  ): Promise<EmployeeRef[]> {
    return this.tenantDb.run(async (tx) => {
      await applicationFor(tx, await viewerOf(tx, user), applicationId);
      const words = search?.trim().replaceAll(/[%_\\]/g, '\\$&');
      return tx
        .select(employeeRefSelect)
        .from(employees)
        .innerJoin(tenantUsers, eq(tenantUsers.id, employees.userId))
        .where(
          and(
            eq(employees.status, 'active'),
            isNull(tenantUsers.disabledAt),
            words
              ? or(
                  ilike(employees.fullName, `%${words}%`),
                  ilike(employees.employeeCode, `%${words}%`),
                )
              : undefined,
          ),
        )
        .orderBy(asc(employees.fullName))
        .limit(30);
    });
  }

  // ── My interviews ──────────────────────────────────────────────────────────

  async mine(user: AuthUser): Promise<MyInterviews> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      if (!viewer.employeeId) return { upcoming: [], past: [] };
      const rows = await this.myRows(tx, viewer.employeeId);
      const now = Date.now();
      const items = rows.map(myItem);
      const upcoming = (r: (typeof rows)[number]) =>
        r.interview.status === 'scheduled' && r.interview.endsAt.getTime() >= now;
      return {
        upcoming: items.filter((_, i) => upcoming(rows[i]!)),
        past: items.filter((_, i) => !upcoming(rows[i]!)).toReversed(),
      };
    });
  }

  async myInterview(user: AuthUser, id: string): Promise<MyInterviewDetail> {
    return this.tenantDb.run(async (tx) => this.myDetail(tx, user, id));
  }

  /** An interviewer's scorecard: a rating for each of the opening's criteria. */
  async submitScorecard(
    user: AuthUser,
    id: string,
    input: ScorecardInput,
  ): Promise<MyInterviewDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      if (!viewer.employeeId) throw notFound('interview');
      const [row] = await this.myRows(tx, viewer.employeeId, id, true);
      if (!row) throw notFound('interview');
      if (isClosedStage(row.application.stage)) throw applicationClosed();
      if (row.interview.status === 'cancelled') {
        throw conflict('interview_cancelled', 'This interview was cancelled');
      }
      const criteria = criteriaOf(row.opening);
      const rated = Object.keys(input.ratings);
      if (
        rated.length !== criteria.length ||
        !criteria.every((c) => Object.hasOwn(input.ratings, c))
      ) {
        throw badRequest(
          'scorecard_criteria',
          `Rate each criterion from 1 to 5: ${criteria.join(', ')}`,
        );
      }
      const first = !row.panel.submittedAt;
      await tx
        .update(interviewPanel)
        .set({
          ratings: Object.fromEntries(criteria.map((c) => [c, input.ratings[c]!])),
          recommendation: input.recommendation,
          feedback: input.feedback?.trim() || null,
          submittedAt: row.panel.submittedAt ?? new Date(),
        })
        .where(eq(interviewPanel.id, row.panel.id));
      if (first) await addEvent(tx, row.application.id, 'interview', 'scorecard', user.id);
      return this.myDetail(tx, user, id);
    });
  }

  private myRows(tx: Tx, employeeId: string, interviewId?: string, lock = false) {
    const query = tx
      .select({
        panel: interviewPanel,
        interview: interviews,
        application: applications,
        candidate: {
          fullName: candidates.fullName,
          erasedAt: candidates.erasedAt,
          cv: candidates.cvStorageKey,
        },
        opening: jobOpenings,
      })
      .from(interviewPanel)
      .innerJoin(interviews, eq(interviews.id, interviewPanel.interviewId))
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
      .where(
        and(
          eq(interviewPanel.employeeId, employeeId),
          interviewId ? eq(interviews.id, interviewId) : undefined,
        ),
      )
      .orderBy(asc(interviews.startsAt));
    return lock ? query.for('update', { of: interviewPanel }) : query;
  }

  /** What an interviewer sees: others' scorecards only once they have submitted their own. */
  private async myDetail(tx: Tx, user: AuthUser, id: string): Promise<MyInterviewDetail> {
    const viewer = await viewerOf(tx, user);
    if (!viewer.employeeId) throw notFound('interview');
    const [row] = await this.myRows(tx, viewer.employeeId, id);
    if (!row) throw notFound('interview');
    const mine = scorecardOf(row.panel);
    const others = mine
      ? await tx
          .select({ panel: interviewPanel })
          .from(interviewPanel)
          .innerJoin(interviews, eq(interviews.id, interviewPanel.interviewId))
          .where(
            and(
              eq(interviews.applicationId, row.application.id),
              isNotNull(interviewPanel.submittedAt),
              ne(interviewPanel.id, row.panel.id),
            ),
          )
          .orderBy(asc(interviewPanel.submittedAt))
      : [];
    const members = await tx
      .select()
      .from(interviewPanel)
      .where(eq(interviewPanel.interviewId, row.interview.id))
      .orderBy(asc(interviewPanel.createdAt));
    const people = await employeeRefs(tx, [
      ...new Set([...others.map((o) => o.panel.employeeId), ...members.map((m) => m.employeeId)]),
    ]);
    return {
      ...myItem(row),
      applicationId: row.application.id,
      notes: row.interview.notes,
      hasCv: !!row.candidate.cv,
      coverNote: row.application.coverNote,
      criteria: criteriaOf(row.opening),
      scorable: row.interview.status !== 'cancelled' && !isClosedStage(row.application.stage),
      mine,
      others: others.map((o) => ({
        employee: people.get(o.panel.employeeId)!,
        scorecard: scorecardOf(o.panel)!,
      })),
      // Who else is on it is no secret; what they scored is, until the reader has submitted.
      panel: members.map((m) => ({
        employee: people.get(m.employeeId)!,
        submitted: !!m.submittedAt,
        scorecard: m.id === row.panel.id || mine ? scorecardOf(m) : null,
      })),
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** The interview, for those who may change it, while its application is open. */
  private async managed(tx: Tx, user: AuthUser, id: string, options: { closedToo?: boolean } = {}) {
    const [interview] = await tx
      .select()
      .from(interviews)
      .where(eq(interviews.id, id))
      .for('update');
    if (!interview) throw notFound('interview');
    const access = await applicationFor(tx, await viewerOf(tx, user), interview.applicationId);
    if (interview.status !== 'scheduled') throw notScheduled();
    if (!options.closedToo && isClosedStage(access.application.stage)) throw applicationClosed();
    return { ...access, interview };
  }

  private async panelOf(tx: Tx, ids: string[]): Promise<Interviewer[]> {
    const panel = await interviewersOf(tx, ids);
    if (panel.length !== ids.length) {
      throw badRequest(
        'interviewer_without_login',
        'Each interviewer must be an active employee with a login',
      );
    }
    return ids.map((id) => panel.find((p) => p.id === id)!);
  }

  private async viewOf(tx: Tx, id: string): Promise<InterviewView> {
    const [row] = await tx
      .select({ applicationId: interviews.applicationId })
      .from(interviews)
      .where(eq(interviews.id, id));
    return (await interviewViewsFor(tx, row!.applicationId)).find((i) => i.id === id)!;
  }

  /**
   * Tells the panel (an inbox notification and an invitation) and the candidate (an invitation)
   * about the interview as it now is. Returns the emails, to send after the transaction.
   */
  private async announce(tx: Tx, a: Announcement): Promise<EmailMessage[]> {
    const { interview, opening, candidate } = a;
    const workspace = await this.mailer.workspaceName(currentTenantId());
    const organizer = { name: workspace, email: this.mailer.organizerEmail() };
    const erased = !!candidate.erasedAt;
    const candidateName = erased ? ERASED_NAME : candidate.fullName;
    const candidateEmail = erased ? null : candidate.email;
    const attendees: CalendarPerson[] = [
      ...(candidateEmail ? [{ name: candidateName, email: candidateEmail }] : []),
      ...a.panel.flatMap((p) => (p.email ? [{ name: p.fullName, email: p.email }] : [])),
    ];
    const method = a.change === 'cancelled' ? 'CANCEL' : 'REQUEST';
    const when = dhakaWhen(interview.startsAt);
    const where = interviewWhere(interview);
    const link = this.mailer.link(MY_INTERVIEWS);
    const stamp = new Date();
    const invitation = (
      kind: 'REQUEST' | 'CANCEL',
      summary: string,
      description: string,
      to: CalendarPerson[],
    ) => ({
      method: kind,
      content: calendarInvitation({
        method: kind,
        uid: interview.icsUid,
        sequence: interview.icsSequence,
        stamp,
        start: interview.startsAt,
        end: interview.endsAt,
        summary,
        description,
        location: interview.location ?? interview.meetingUrl,
        url: interview.meetingUrl,
        organizer,
        attendees: to,
      }),
    });
    const facts = { workspace, candidateName, when, where };
    const mails: EmailMessage[] = [];

    if (a.tellCandidate && candidateEmail) {
      const language = candidate.language;
      const title = postTitle(opening, language);
      mails.push(
        candidateInterviewMail({
          ...facts,
          title,
          to: candidateEmail,
          language,
          change: a.change,
          ics: invitation(
            method,
            language === 'bn'
              ? `সাক্ষাৎকার: ${title}, ${workspace}`
              : `Interview: ${title}, ${workspace}`,
            where[language],
            // The candidate's copy names only them: the panel's addresses stay internal.
            [{ name: candidateName, email: candidateEmail }],
          ),
        }),
      );
    }
    const staffInvitation = (language: UserLanguage, kind: 'REQUEST' | 'CANCEL', to = attendees) =>
      invitation(
        kind,
        language === 'bn'
          ? `সাক্ষাৎকার: ${candidateName}, ${opening.title}`
          : `Interview: ${candidateName}, ${opening.title}`,
        `${where[language]}\n${link}`,
        to,
      );
    for (const p of a.panel) {
      if (!p.email) continue;
      mails.push(
        interviewerMail({
          ...facts,
          title: opening.title,
          to: p.email,
          language: p.language,
          change: a.added.has(p.id) ? 'scheduled' : a.change,
          link,
          ics: staffInvitation(p.language, method),
        }),
      );
    }
    for (const p of a.removed) {
      if (!p.email) continue;
      mails.push(
        interviewerMail({
          ...facts,
          title: opening.title,
          to: p.email,
          language: p.language,
          change: 'removed',
          link,
          ics: staffInvitation(p.language, 'CANCEL', [{ name: p.fullName, email: p.email }]),
        }),
      );
    }

    const values = {
      'candidate.name': candidateName,
      'opening.title': opening.title,
      'interview.when': when,
      'interview.where': where,
      'interview.change': a.what,
    };
    const dedupeKey = `recruitment.interview:${interview.id}:${interview.icsSequence}`;
    if (a.panel.length) {
      await this.notifications.notify(tx, {
        event: 'recruitment.interview',
        recipients: a.panel.map((p) => ({ employeeId: p.id })),
        values,
        perRecipient: new Map(
          a.panel
            .filter((p) => a.added.has(p.id))
            .map((p) => [p.id, { 'interview.change': NEW_INTERVIEW }]),
        ),
        link: MY_INTERVIEWS,
        dedupeKey,
        data: { interviewId: interview.id },
      });
    }
    if (a.removed.length) {
      await this.notifications.notify(tx, {
        event: 'recruitment.interview',
        recipients: a.removed.map((p) => ({ employeeId: p.id })),
        values: { ...values, 'interview.change': OFF_THE_PANEL },
        link: MY_INTERVIEWS,
        dedupeKey: `${dedupeKey}:removed`,
        data: { interviewId: interview.id },
      });
    }
    return mails;
  }
}

function fieldsOf(input: InterviewInput) {
  return {
    kind: input.kind,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    location: input.location?.trim() || null,
    meetingUrl: input.kind === 'video' ? (input.meetingUrl ?? null) : null,
    notes: input.notes?.trim() || null,
  };
}

function notInPast(startsAt: string) {
  if (Date.parse(startsAt) < Date.now() - PAST_GRACE_MS) {
    throw badRequest('interview_in_past', 'Choose a time that has not passed');
  }
}

type MyRow = {
  panel: PanelRow;
  interview: InterviewRow;
  application: ApplicationRow;
  candidate: { fullName: string; erasedAt: Date | null; cv: string | null };
  opening: OpeningRow;
};

function myItem(row: MyRow): MyInterviewItem {
  const { interview, opening } = row;
  return {
    id: interview.id,
    kind: interview.kind,
    startsAt: interview.startsAt.toISOString(),
    endsAt: interview.endsAt.toISOString(),
    location: interview.location,
    meetingUrl: interview.meetingUrl,
    status: interview.status,
    candidateName: row.candidate.erasedAt ? ERASED_NAME : row.candidate.fullName,
    opening: {
      id: opening.id,
      title: opening.title,
      postTitleEn: opening.postTitleEn,
      postTitleBn: opening.postTitleBn,
    },
    submitted: !!row.panel.submittedAt,
  };
}
