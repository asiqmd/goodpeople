import { Injectable } from '@nestjs/common';
import {
  announcementReceipts,
  announcements,
  employees,
  engagementSurveys,
  legalEntities,
  recognitions,
  surveyParticipants,
  type Tx,
} from '@gp/db';
import {
  addSurveyResponse,
  emptySurveyTotals,
  surveyResults,
  todayIn,
  type AnnouncementInput,
  type AnnouncementView,
  type EngagementMe,
  type RecognitionInput,
  type RecognitionView,
  type SurveyInput,
  type SurveyResponseInput,
  type SurveyView,
} from '@gp/shared';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { NotificationsService, type Recipient } from '../notifications/notifications.service.js';
import {
  companyPeople,
  inServiceCompany,
  managedCompany,
  requireServiceEmployee,
  serviceActor,
  serviceViews,
  serviceMissing,
  type ServiceActor,
} from '../employee-services/access.js';
type Survey = typeof engagementSurveys.$inferSelect;
type Notice = typeof announcements.$inferSelect;
@Injectable()
export class EngagementService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notices: NotificationsService,
  ) {}
  private actor(tx: Tx, user: AuthUser) {
    return serviceActor(tx, user, 'engagement.manage');
  }
  private async log(tx: Tx, user: AuthUser, action: string, id: string, reason?: string) {
    await this.audit.record(tx, {
      actorUserId: user.id,
      action: `engagement.${action}`,
      entityType: 'engagement',
      entityId: id,
      after: reason ? { reason } : undefined,
    });
  }
  async notify(
    tx: Tx,
    recipients: Recipient[],
    title: { en: string; bn: string },
    key: string,
    link = '/workspace/engagement',
  ) {
    return this.notices.notify(tx, {
      event: 'engagement.notice',
      recipients,
      values: {
        'service.title': title,
        'service.detail': {
          en: 'Open Engagement in Good People to read and respond.',
          bn: 'পড়তে ও উত্তর দিতে Good People-এর অংশগ্রহণ পাতায় যান।',
        },
      },
      link,
      dedupeKey: key,
    });
  }
  async me(user: AuthUser): Promise<EngagementMe> {
    const [surveys, notices, feed, actor] = await Promise.all([
      this.surveys(user),
      this.announcements(user),
      this.recognition(user),
      this.db.run((tx) => this.actor(tx, user)),
    ]);
    return {
      employee: actor.employee ? employeeRef(actor.employee) : null,
      manage: actor.manage,
      surveys,
      announcements: notices,
      recognition: feed,
    };
  }
  createSurvey(user: AuthUser, input: SurveyInput) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      await managedCompany(tx, v, input.legalEntityId);
      if (Date.parse(input.closesAt) <= Date.now())
        throw badRequest('survey_dates', 'Choose a future closing time');
      const [row] = await tx
        .insert(engagementSurveys)
        .values({
          ...input,
          closesAt: new Date(input.closesAt),
          totals: emptySurveyTotals(input.questions.length),
          createdBy: user.id,
          tenantId: currentTenantId(),
        })
        .returning();
      await this.log(tx, user, 'survey.create', row!.id);
      return this.surveyView(tx, v, row!);
    });
  }
  private async surveyRow(tx: Tx, id: string, lock = false) {
    const query = tx.select().from(engagementSurveys).where(eq(engagementSurveys.id, id));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw serviceMissing();
    return row;
  }
  updateSurvey(user: AuthUser, id: string, input: SurveyInput) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        previous = await this.surveyRow(tx, id, true);
      await managedCompany(tx, v, previous.legalEntityId);
      await managedCompany(tx, v, input.legalEntityId);
      if (previous.status !== 'draft')
        throw conflict('survey_fixed', 'Published surveys are fixed');
      if (Date.parse(input.closesAt) <= Date.now())
        throw badRequest('survey_dates', 'Choose a future closing time');
      const [row] = await tx
        .update(engagementSurveys)
        .set({
          ...input,
          closesAt: new Date(input.closesAt),
          totals: emptySurveyTotals(input.questions.length),
        })
        .where(eq(engagementSurveys.id, id))
        .returning();
      await this.log(tx, user, 'survey.update', id);
      return this.surveyView(tx, v, row!);
    });
  }
  private closed(s: Survey) {
    return s.status === 'closed' || (s.status === 'open' && s.closesAt.getTime() <= Date.now());
  }
  private async surveyView(tx: Tx, v: ServiceActor, s: Survey): Promise<SurveyView> {
    const [participant] = v.employee
      ? await tx
          .select()
          .from(surveyParticipants)
          .where(
            and(
              eq(surveyParticipants.surveyId, s.id),
              eq(surveyParticipants.employeeId, v.employee.id),
            ),
          )
      : [];
    const manage = v.manage && inServiceCompany(v, s.legalEntityId);
    if (!manage && (!participant || s.status === 'draft')) throw serviceMissing();
    const [company] = await tx
      .select({ id: legalEntities.id, name: legalEntities.name })
      .from(legalEntities)
      .where(eq(legalEntities.id, s.legalEntityId));
    return {
      id: s.id,
      legalEntityId: s.legalEntityId,
      title: s.title,
      titleBn: s.titleBn,
      description: s.description,
      descriptionBn: s.descriptionBn,
      questions: s.questions,
      threshold: s.threshold,
      closesAt: s.closesAt.toISOString(),
      company: company!,
      status: this.closed(s) ? 'closed' : s.status,
      eligible: !!participant && !!v.job,
      submitted: participant?.submitted ?? false,
      manage,
      results: manage
        ? surveyResults(s.totals, s.audienceCount, s.threshold, this.closed(s))
        : null,
    };
  }
  surveys(user: AuthUser) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      const membership = v.employee
        ? await tx
            .select()
            .from(surveyParticipants)
            .where(eq(surveyParticipants.employeeId, v.employee.id))
        : [];
      const ids = new Set(membership.map((p) => p.surveyId));
      const rows = await tx
        .select()
        .from(engagementSurveys)
        .orderBy(desc(engagementSurveys.createdAt));
      return serviceViews(
        rows.filter(
          (s) =>
            (v.manage && inServiceCompany(v, s.legalEntityId)) ||
            (s.status !== 'draft' && ids.has(s.id)),
        ),
        (s) => this.surveyView(tx, v, s),
      );
    });
  }
  survey(user: AuthUser, id: string) {
    return this.db.run(async (tx) =>
      this.surveyView(tx, await this.actor(tx, user), await this.surveyRow(tx, id)),
    );
  }
  publishSurvey(user: AuthUser, id: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        row = await this.surveyRow(tx, id, true);
      await managedCompany(tx, v, row.legalEntityId);
      if (row.status !== 'draft')
        throw conflict('survey_fixed', 'This survey has already been published');
      if (row.closesAt.getTime() <= Date.now())
        throw badRequest('survey_dates', 'Choose a future closing time');
      const people = await companyPeople(tx, row.legalEntityId);
      if (people.length < row.threshold)
        throw badRequest('survey_cohort', 'The audience is smaller than the anonymity threshold');
      await tx
        .insert(surveyParticipants)
        .values(
          people.map((p) => ({ tenantId: currentTenantId(), surveyId: id, employeeId: p.id })),
        );
      const [saved] = await tx
        .update(engagementSurveys)
        .set({ status: 'open', audienceCount: people.length })
        .where(eq(engagementSurveys.id, id))
        .returning();
      await this.log(tx, user, 'survey.publish', id);
      await this.notify(
        tx,
        people.map((p) => ({ employeeId: p.id })),
        { en: 'An anonymous employee survey is open', bn: 'কর্মীদের বেনামি জরিপ শুরু হয়েছে' },
        `survey:publish:${id}`,
        `/workspace/engagement/surveys/${id}`,
      );
      return this.surveyView(tx, v, saved!);
    });
  }
  respond(user: AuthUser, id: string, input: SurveyResponseInput) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        { employee } = requireServiceEmployee(v),
        row = await this.surveyRow(tx, id, true);
      const [participant] = await tx
        .select()
        .from(surveyParticipants)
        .where(
          and(eq(surveyParticipants.surveyId, id), eq(surveyParticipants.employeeId, employee.id)),
        );
      if (!participant || row.status === 'draft') throw serviceMissing();
      if (row.status !== 'open' || this.closed(row))
        throw conflict('survey_closed', 'This survey is closed');
      if (participant.submitted) throw conflict('survey_submitted', 'You already responded');
      if (input.scores.length !== row.questions.length)
        throw badRequest('survey_answers', 'Answer every question');
      await tx
        .update(engagementSurveys)
        .set({ totals: addSurveyResponse(row.totals, input) })
        .where(eq(engagementSurveys.id, id));
      await tx
        .update(surveyParticipants)
        .set({ submitted: true })
        .where(eq(surveyParticipants.id, participant.id));
      // Deliberately no score-bearing audit, response row or per-response timestamp.
      return { submitted: true };
    });
  }
  closeSurvey(user: AuthUser, id: string, reason: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        row = await this.surveyRow(tx, id, true);
      await managedCompany(tx, v, row.legalEntityId);
      if (row.status !== 'open')
        throw conflict('survey_fixed', 'Only a published survey can be closed');
      const [saved] = await tx
        .update(engagementSurveys)
        .set({ status: 'closed' })
        .where(eq(engagementSurveys.id, id))
        .returning();
      await this.log(tx, user, 'survey.close', id, reason);
      return this.surveyView(tx, v, saved!);
    });
  }
  createAnnouncement(user: AuthUser, input: AnnouncementInput) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      await managedCompany(tx, v, input.legalEntityId);
      if (
        (input.dueOn && input.dueOn < todayIn()) ||
        (input.expiresOn && input.expiresOn < todayIn())
      )
        throw badRequest('announcement_dates', 'Choose today or a later date');
      const [row] = await tx
        .insert(announcements)
        .values({ ...input, createdBy: user.id, tenantId: currentTenantId() })
        .returning();
      await this.log(tx, user, 'announcement.create', row!.id);
      return this.announcementView(tx, v, row!);
    });
  }
  private async noticeRow(tx: Tx, id: string, lock = false) {
    const query = tx.select().from(announcements).where(eq(announcements.id, id));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw serviceMissing();
    return row;
  }
  updateAnnouncement(user: AuthUser, id: string, input: AnnouncementInput) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        previous = await this.noticeRow(tx, id, true);
      await managedCompany(tx, v, previous.legalEntityId);
      await managedCompany(tx, v, input.legalEntityId);
      if (previous.status !== 'draft')
        throw conflict('announcement_fixed', 'Published wording is fixed');
      if (
        (input.dueOn && input.dueOn < todayIn()) ||
        (input.expiresOn && input.expiresOn < todayIn())
      )
        throw badRequest('announcement_dates', 'Choose today or a later date');
      const [row] = await tx
        .update(announcements)
        .set(input)
        .where(eq(announcements.id, id))
        .returning();
      await this.log(tx, user, 'announcement.update', id);
      return this.announcementView(tx, v, row!);
    });
  }
  private async announcementView(
    tx: Tx,
    v: ServiceActor,
    row: Notice,
    detail = false,
  ): Promise<AnnouncementView> {
    const manage = v.manage && inServiceCompany(v, row.legalEntityId);
    const [own] = v.employee
      ? await tx
          .select()
          .from(announcementReceipts)
          .where(
            and(
              eq(announcementReceipts.announcementId, row.id),
              eq(announcementReceipts.employeeId, v.employee.id),
            ),
          )
      : [];
    const readable =
      row.status !== 'draft' &&
      (row.requiresAcknowledgement ? !!own : v.job?.legalEntityId === row.legalEntityId);
    if (!manage && !readable) throw serviceMissing();
    const [company] = await tx
      .select({ id: legalEntities.id, name: legalEntities.name })
      .from(legalEntities)
      .where(eq(legalEntities.id, row.legalEntityId));
    const receipts =
      manage && detail && row.requiresAcknowledgement
        ? await tx
            .select({ employee: employees, acknowledgedAt: announcementReceipts.acknowledgedAt })
            .from(announcementReceipts)
            .innerJoin(employees, eq(employees.id, announcementReceipts.employeeId))
            .where(eq(announcementReceipts.announcementId, row.id))
            .orderBy(asc(employees.employeeCode))
        : null;
    const expired = !!row.expiresOn && row.expiresOn < todayIn();
    return {
      id: row.id,
      legalEntityId: row.legalEntityId,
      company: company!,
      title: row.title,
      titleBn: row.titleBn,
      body: row.body,
      bodyBn: row.bodyBn,
      requiresAcknowledgement: row.requiresAcknowledgement,
      dueOn: row.dueOn,
      expiresOn: row.expiresOn,
      status: row.status,
      expired,
      acknowledgedAt: own?.acknowledgedAt?.toISOString() ?? null,
      canAcknowledge:
        !!own && !own.acknowledgedAt && !!v.job && row.status === 'published' && !expired,
      manage,
      receipts:
        receipts?.map((r) => ({
          employee: employeeRef(r.employee),
          acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        })) ?? null,
    };
  }
  announcements(user: AuthUser) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      const receipts = v.employee
        ? await tx
            .select()
            .from(announcementReceipts)
            .where(eq(announcementReceipts.employeeId, v.employee.id))
        : [];
      const own = new Set(receipts.map((r) => r.announcementId));
      const rows = await tx.select().from(announcements).orderBy(desc(announcements.createdAt));
      return serviceViews(
        rows.filter(
          (r) =>
            (v.manage && inServiceCompany(v, r.legalEntityId)) ||
            (r.status !== 'draft' &&
              (r.requiresAcknowledgement
                ? own.has(r.id)
                : r.status === 'published' &&
                  (!r.expiresOn || r.expiresOn >= todayIn()) &&
                  v.job?.legalEntityId === r.legalEntityId)),
        ),
        (r) => this.announcementView(tx, v, r),
      );
    });
  }
  announcement(user: AuthUser, id: string) {
    return this.db.run(async (tx) =>
      this.announcementView(tx, await this.actor(tx, user), await this.noticeRow(tx, id), true),
    );
  }
  publishAnnouncement(user: AuthUser, id: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        row = await this.noticeRow(tx, id, true);
      await managedCompany(tx, v, row.legalEntityId);
      if (row.status !== 'draft')
        throw conflict('announcement_fixed', 'Published wording is fixed; create a new notice');
      if ((row.dueOn && row.dueOn < todayIn()) || (row.expiresOn && row.expiresOn < todayIn()))
        throw badRequest('announcement_dates', 'The due or expiry date has passed');
      const people = await companyPeople(tx, row.legalEntityId);
      if (row.requiresAcknowledgement && people.length)
        await tx.insert(announcementReceipts).values(
          people.map((p) => ({
            tenantId: currentTenantId(),
            announcementId: id,
            employeeId: p.id,
          })),
        );
      const [saved] = await tx
        .update(announcements)
        .set({ status: 'published' })
        .where(eq(announcements.id, id))
        .returning();
      await this.log(tx, user, 'announcement.publish', id);
      await this.notify(
        tx,
        people.map((p) => ({ employeeId: p.id })),
        {
          en: row.requiresAcknowledgement
            ? 'A policy notice needs your acknowledgement'
            : 'A company announcement is available',
          bn: row.requiresAcknowledgement
            ? 'নীতিমালার নোটিশ পড়ে প্রাপ্তি স্বীকার করুন'
            : 'কোম্পানির একটি ঘোষণা এসেছে',
        },
        `announcement:publish:${id}`,
        `/workspace/engagement/announcements/${id}`,
      );
      return this.announcementView(tx, v, saved!, true);
    });
  }
  acknowledge(user: AuthUser, id: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        { employee } = requireServiceEmployee(v),
        row = await this.noticeRow(tx, id, true);
      const view = await this.announcementView(tx, v, row);
      const [receipt] = await tx
        .select()
        .from(announcementReceipts)
        .where(
          and(
            eq(announcementReceipts.announcementId, id),
            eq(announcementReceipts.employeeId, employee.id),
          ),
        );
      if (!receipt) throw serviceMissing();
      if (receipt.acknowledgedAt) return view;
      if (!view.canAcknowledge)
        throw conflict('announcement_fixed', 'This notice no longer accepts acknowledgements');
      await tx
        .update(announcementReceipts)
        .set({ acknowledgedAt: new Date() })
        .where(eq(announcementReceipts.id, receipt.id));
      await this.log(tx, user, 'announcement.acknowledge', id);
      return this.announcementView(tx, v, row);
    });
  }
  retireAnnouncement(user: AuthUser, id: string, reason: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        row = await this.noticeRow(tx, id, true);
      await managedCompany(tx, v, row.legalEntityId);
      if (row.status === 'retired') throw conflict('announcement_fixed', 'Already retired');
      const [saved] = await tx
        .update(announcements)
        .set({ status: 'retired', retiredAt: new Date(), retireReason: reason })
        .where(eq(announcements.id, id))
        .returning();
      await this.log(tx, user, 'announcement.retire', id, reason);
      return this.announcementView(tx, v, saved!, true);
    });
  }
  createRecognition(user: AuthUser, input: RecognitionInput) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        { employee, job } = requireServiceEmployee(v);
      const [recipient] = await tx
        .select()
        .from(employees)
        .where(eq(employees.employeeCode, input.employeeCode));
      if (
        !recipient ||
        !(await companyPeople(tx, job.legalEntityId)).some((p) => p.id === recipient.id)
      )
        throw serviceMissing();
      if (recipient.id === employee.id)
        throw badRequest('recognition_self', 'Recognize a colleague');
      const [row] = await tx
        .insert(recognitions)
        .values({
          tenantId: currentTenantId(),
          legalEntityId: job.legalEntityId,
          senderId: employee.id,
          recipientId: recipient.id,
          value: input.value,
          message: input.message,
        })
        .returning();
      await this.log(tx, user, 'recognition.create', row!.id);
      await this.notify(
        tx,
        [{ employeeId: recipient.id }],
        {
          en: 'A colleague recognized your contribution',
          bn: 'একজন সহকর্মী আপনার অবদানের স্বীকৃতি দিয়েছেন',
        },
        `recognition:${row!.id}`,
      );
      return { id: row!.id };
    });
  }
  recognition(user: AuthUser, companyId?: string): Promise<RecognitionView[]> {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      if (
        companyId &&
        !(v.manage ? inServiceCompany(v, companyId) : v.job?.legalEntityId === companyId)
      )
        throw serviceMissing();
      const companies = companyId
        ? [companyId]
        : v.manage
          ? v.companies
          : v.job
            ? [v.job.legalEntityId]
            : [];
      const rows = await tx
        .select()
        .from(recognitions)
        .where(
          and(
            isNull(recognitions.hiddenAt),
            companies ? inArray(recognitions.legalEntityId, companies) : undefined,
          ),
        )
        .orderBy(desc(recognitions.createdAt))
        .limit(100);
      const people = await tx.select().from(employees),
        allCompanies = await tx.select().from(legalEntities);
      const person = new Map(people.map((p) => [p.id, employeeRef(p)]));
      return rows.map((r) => ({
        id: r.id,
        company: {
          id: r.legalEntityId,
          name: allCompanies.find((c) => c.id === r.legalEntityId)!.name,
        },
        sender: person.get(r.senderId)!,
        recipient: person.get(r.recipientId)!,
        value: r.value,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
        canHide:
          r.senderId === v.employee?.id || (v.manage && inServiceCompany(v, r.legalEntityId)),
      }));
    });
  }
  hideRecognition(user: AuthUser, id: string, reason: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      const [row] = await tx
        .select()
        .from(recognitions)
        .where(eq(recognitions.id, id))
        .for('update');
      if (
        !row ||
        !(row.senderId === v.employee?.id || (v.manage && inServiceCompany(v, row.legalEntityId)))
      )
        throw serviceMissing();
      if (row.hiddenAt) throw conflict('recognition_hidden', 'Already withdrawn');
      await tx
        .update(recognitions)
        .set({ hiddenAt: new Date(), hideReason: reason })
        .where(eq(recognitions.id, id));
      await this.log(tx, user, 'recognition.hide', id, reason);
    });
  }
}
