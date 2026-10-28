import { randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  applicationEvents,
  applications,
  approvalSteps,
  candidates,
  designations,
  jobAssignments,
  jobOpenings,
  locations,
  offers,
  orgUnits,
  type Tx,
} from '@gp/db';
import {
  isClosedStage,
  LIVE_OFFER_STATUSES,
  OFFER_EDITABLE_STATUSES,
  OFFER_WITHDRAWABLE_STATUSES,
  todayIn,
  type ApiError,
  type ApplicationOffers,
  type ApprovalItem,
  type OfferInput,
  type OfferStatus,
  type OfferUpdateInput,
  type OfferView,
  type TenantWithAccess,
} from '@gp/shared';
import { and, eq, gt, inArray, max, notExists, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { mustUseCompany } from '../access-scopes/employee-scope.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { noticeRequested, type ApprovalSummary } from '../approvals/approval-notices.js';
import {
  cancelOpenSteps,
  type ApprovalStepRow,
  type ApprovalSubjectHandler,
  type Whose,
} from '../approvals/approval-steps.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EMAIL_SENDER, type EmailMessage, type Sender } from '../notifications/senders.js';
import { amountText } from '../payroll/payslip.js';
import { offerEmail } from './offer-letter.js';
import { OfferLetterService } from './offer-letter.service.js';
import {
  isAboveBudget,
  NOT_FOUND,
  offerContext,
  offerEvent,
  offerViews,
  positionOf,
  tokenHash,
  visibleWhere,
  type OfferContext,
} from './offer-records.js';
import { offerProbation, statutoryProbation } from './offer-terms.js';

/**
 * An offer is nobody's own request: the nil id matches no employee, so the engine's checks on
 * the requester pass, and `finalize` checks the deciding login's companies itself.
 */
const NOBODY = '00000000-0000-0000-0000-000000000000';

/** A 400 on one field of the form; the web translates the code and the field's issue. */
function fieldError(
  code: string,
  path: string,
  message: string,
  params?: Record<string, string | number>,
) {
  const body: ApiError = {
    statusCode: 400,
    error: 'Bad Request',
    message,
    code,
    issues: [{ path, message, code: `offers.${code}`, ...(params ? { params } : {}) }],
  };
  return new BadRequestException(body);
}

/**
 * Offers as HR drafts, approves and sends them. One above the opening's budget is approved
 * by another HR login through the approvals engine first; within it, it is approved as soon as
 * it is submitted. Sending emails the candidate a private link, of which only the hash is kept.
 */
@Injectable()
export class OffersService implements ApprovalSubjectHandler<OfferView> {
  readonly auditPrefix = 'offer';
  readonly entityType = 'offer' as const;
  private readonly logger = new Logger(OffersService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_SENDER) private readonly email: Sender<EmailMessage>,
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
    private readonly letters: OfferLetterService,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────

  /** An application's offers, and what a new one starts with. */
  forApplication(user: AuthUser, applicationId: string): Promise<ApplicationOffers> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select({ application: applications, opening: jobOpenings, candidate: candidates })
        .from(applications)
        .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .where(await visibleWhere(tx, user, eq(applications.id, applicationId)));
      if (!row) throw new NotFoundException('Application not found');
      const list = await offerViews(tx, eq(offers.applicationId, applicationId));
      const live = list.some((o) => (LIVE_OFFER_STATUSES as readonly string[]).includes(o.status));
      const { opening } = row;
      return {
        applicationId,
        stage: row.application.stage,
        offers: list,
        canOffer: !live && !isClosedStage(row.application.stage),
        defaults: {
          legalEntityId: opening.legalEntityId,
          orgUnitId: opening.orgUnitId,
          locationId: opening.locationId,
          designationId: opening.designationId,
          gradeId: opening.gradeId,
          employmentType: opening.employmentType,
          language: row.candidate.language,
        },
        budgetMax: opening.budgetMax,
        probation: statutoryProbation(todayIn()),
      };
    });
  }

  get(user: AuthUser, id: string): Promise<OfferView> {
    return this.tenantDb.run(async (tx) => {
      const [view] = await offerViews(tx, await visibleWhere(tx, user, eq(offers.id, id)));
      if (!view) throw new NotFoundException(NOT_FOUND);
      return view;
    });
  }

  /** The letter: as accepted once the candidate accepted it, else as it reads now. */
  letter(user: AuthUser, id: string): Promise<{ bytes: Buffer; fileName: string }> {
    return this.tenantDb.run(async (tx) => {
      const ctx = await offerContext(tx, await visibleWhere(tx, user, eq(offers.id, id)));
      const fileName = this.letters.fileName(id, ctx.offer.language);
      if (ctx.offer.letterStorageKey) {
        return {
          bytes: await this.letters.kept(ctx.offer.tenantId, ctx.offer.letterStorageKey),
          fileName,
        };
      }
      const data = await this.letters.data(tx, ctx, ctx.offer.language);
      return { bytes: await this.letters.render(data), fileName };
    });
  }

  // ── Changing ───────────────────────────────────────────────────────────────

  async create(user: AuthUser, input: OfferInput): Promise<OfferView> {
    const id = await this.tenantDb.run(async (tx) => {
      // The application is locked so two offers cannot start at once.
      const [row] = await tx
        .select({ application: applications })
        .from(applications)
        .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
        .where(await visibleWhere(tx, user, eq(applications.id, input.applicationId)))
        .for('update', { of: applications });
      if (!row) throw new NotFoundException('Application not found');
      const { application } = row;
      if (isClosedStage(application.stage)) {
        throw conflict('application_closed', `This application is ${application.stage}`);
      }
      const [live] = await tx
        .select({ id: offers.id })
        .from(offers)
        .where(
          and(
            eq(offers.applicationId, application.id),
            inArray(offers.status, [...LIVE_OFFER_STATUSES]),
          ),
        );
      if (live) throw conflict('offer_exists', 'This application already has an offer');
      const terms = await this.checkTerms(tx, user, input);
      const [offer] = await tx
        .insert(offers)
        .values({
          tenantId: currentTenantId(),
          applicationId: application.id,
          ...terms,
          createdByUserId: user.id,
        })
        .returning();
      if (application.stage !== 'offer') {
        await tx
          .update(applications)
          .set({ stage: 'offer', stageChangedAt: new Date(), updatedAt: new Date() })
          .where(eq(applications.id, application.id));
        await tx.insert(applicationEvents).values({
          tenantId: application.tenantId,
          applicationId: application.id,
          kind: 'stage',
          fromStage: application.stage,
          toStage: 'offer',
          actorUserId: user.id,
        });
      }
      await offerEvent(tx, offer!, 'draft', user.id);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'offer.create',
        entityType: 'offer',
        entityId: offer!.id,
        after: { applicationId: application.id, ...this.auditTerms(terms) },
      });
      return offer!.id;
    });
    return this.get(user, id);
  }

  /** New terms; an approved or rejected offer goes back to draft to be submitted again. */
  async update(user: AuthUser, id: string, input: OfferUpdateInput): Promise<OfferView> {
    await this.tenantDb.run(async (tx) => {
      const { offer } = await this.lock(tx, user, id);
      if (!(OFFER_EDITABLE_STATUSES as readonly OfferStatus[]).includes(offer.status)) {
        throw conflict('offer_not_editable', `An offer that is ${offer.status} cannot change`);
      }
      const terms = await this.checkTerms(tx, user, input);
      await tx
        .update(offers)
        .set({ ...terms, status: 'draft', updatedAt: new Date() })
        .where(eq(offers.id, id));
      if (offer.status !== 'draft') await offerEvent(tx, offer, 'draft', user.id);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'offer.update',
        entityType: 'offer',
        entityId: id,
        before: { status: offer.status },
        after: this.auditTerms(terms),
      });
    });
    return this.get(user, id);
  }

  /** Ready to send: approved at once within the budget, else waiting for HR's approval. */
  async submit(user: AuthUser, id: string): Promise<OfferView> {
    await this.tenantDb.run(async (tx) => {
      const { offer, opening } = await this.lock(tx, user, id);
      if (offer.status !== 'draft') {
        throw conflict('offer_not_draft', `This offer is ${offer.status}, not a draft`);
      }
      this.notExpired(offer.expiresOn);
      const needsApproval = isAboveBudget(offer.monthlyGross, opening.budgetMax);
      const status = needsApproval ? 'pending_approval' : 'approved';
      await tx.update(offers).set({ status, updatedAt: new Date() }).where(eq(offers.id, id));
      if (needsApproval) {
        // A rejected offer may come back: its earlier steps stay as the record.
        const [last] = await tx
          .select({ stepNo: max(approvalSteps.stepNo) })
          .from(approvalSteps)
          .where(eq(approvalSteps.subjectId, id));
        await tx.insert(approvalSteps).values({
          tenantId: offer.tenantId,
          subjectType: 'offer',
          subjectId: id,
          stepNo: (last?.stepNo ?? 0) + 1,
          kind: 'hr',
          status: 'pending',
        });
        await noticeRequested(
          tx,
          this.notifications,
          { type: 'offer', id },
          await this.summarize(tx, id),
        );
      }
      await offerEvent(tx, offer, status, user.id);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'offer.submit',
        entityType: 'offer',
        entityId: id,
        after: { status, aboveBudget: needsApproval },
      });
    });
    return this.get(user, id);
  }

  /**
   * Emails the candidate their private link. Sending again makes a new link; the old one
   * stops working.
   */
  async send(user: AuthUser, tenant: TenantWithAccess, id: string): Promise<OfferView> {
    const token = randomBytes(32).toString('base64url');
    const message = await this.tenantDb.run(async (tx) => {
      const ctx = await this.lock(tx, user, id);
      const { offer, candidate } = ctx;
      if (offer.status !== 'approved' && offer.status !== 'sent') {
        throw conflict('offer_not_approved', `This offer is ${offer.status}, not approved`);
      }
      if (offer.expiresOn < todayIn()) {
        throw conflict('offer_expired', 'This offer has expired; change its expiry date first');
      }
      if (!candidate.email) {
        throw badRequest(
          'candidate_no_email',
          'Add the candidate’s email address to send the offer',
        );
      }
      await tx
        .update(offers)
        .set({
          status: 'sent',
          tokenHash: tokenHash(token),
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(offers.id, id));
      await offerEvent(tx, offer, 'sent', user.id);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'offer.send',
        entityType: 'offer',
        entityId: id,
        after: { resent: offer.status === 'sent' },
      });
      const position = await positionOf(tx, ctx);
      const language = candidate.language;
      const data = await this.letters.data(tx, ctx, language);
      const link = `${this.config.WEB_ORIGIN}/offers/${tenant.slug}/${token}`;
      return {
        to: candidate.email,
        ...offerEmail(language, {
          candidate: candidate.fullName,
          company: data.company.name,
          position: position[language],
          expiresOn: offer.expiresOn,
          link,
        }),
      };
    });
    await this.email.send(message).catch((error: Error) => {
      this.logger.error(`Offer email for ${id} failed: ${error.message}`);
    });
    return this.get(user, id);
  }

  async withdraw(user: AuthUser, id: string): Promise<OfferView> {
    await this.tenantDb.run(async (tx) => {
      const { offer } = await this.lock(tx, user, id);
      if (!(OFFER_WITHDRAWABLE_STATUSES as readonly OfferStatus[]).includes(offer.status)) {
        throw conflict(
          'offer_not_withdrawable',
          `An offer that is ${offer.status} cannot be withdrawn`,
        );
      }
      await tx
        .update(offers)
        .set({ status: 'withdrawn', updatedAt: new Date() })
        .where(eq(offers.id, id));
      await cancelOpenSteps(tx, id, ['pending', 'waiting']);
      await offerEvent(tx, offer, 'withdrawn', user.id);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'offer.withdraw',
        entityType: 'offer',
        entityId: id,
        before: { status: offer.status },
      });
    });
    return this.get(user, id);
  }

  // ── Approval handler ───────────────────────────────────────────────────────

  async lockSubject(tx: Tx, subjectId: string) {
    const [row] = await tx
      .select({ madeBy: offers.createdByUserId })
      .from(offers)
      .where(eq(offers.id, subjectId))
      .for('update');
    // Whoever drafted it may not approve it (maker-checker).
    return row ? { employeeId: NOBODY, madeBy: row.madeBy } : null;
  }

  ownedBy(tx: Tx, who: Whose): SQL {
    // Nobody's own request; a limited HR login sees the offers of its people's companies.
    if (typeof who === 'string') return sql`false`;
    const later = alias(jobAssignments, 'offer_later_job');
    const companies = tx
      .select({ id: jobAssignments.legalEntityId })
      .from(jobAssignments)
      .where(
        and(
          inArray(jobAssignments.employeeId, who),
          notExists(
            tx
              .select({ id: later.id })
              .from(later)
              .where(
                and(
                  eq(later.employeeId, jobAssignments.employeeId),
                  gt(later.effectiveFrom, jobAssignments.effectiveFrom),
                ),
              ),
          ),
        ),
      );
    return inArray(
      approvalSteps.subjectId,
      tx.select({ id: offers.id }).from(offers).where(inArray(offers.legalEntityId, companies)),
    );
  }

  madeBy(tx: Tx, userId: string): SQL {
    return inArray(
      approvalSteps.subjectId,
      tx.select({ id: offers.id }).from(offers).where(eq(offers.createdByUserId, userId)),
    );
  }

  async finalize(tx: Tx, subjectId: string, outcome: 'approved' | 'rejected', actorUserId: string) {
    const [row] = await tx
      .select({ offer: offers, openingEntity: jobOpenings.legalEntityId })
      .from(offers)
      .innerJoin(applications, eq(applications.id, offers.applicationId))
      .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
      .where(eq(offers.id, subjectId));
    const entities = await entityScopeOf(tx, actorUserId);
    if (entities && !entities.includes(row!.openingEntity)) {
      throw forbidden('outside_scope', 'This offer is for a company you do not look after');
    }
    await tx
      .update(offers)
      .set({ status: outcome, updatedAt: new Date() })
      .where(eq(offers.id, subjectId));
    await offerEvent(tx, row!.offer, outcome, actorUserId);
  }

  async inboxItems(tx: Tx, steps: ApprovalStepRow[]) {
    const views = await offerViews(
      tx,
      inArray(
        offers.id,
        steps.map((s) => s.subjectId),
      ),
    );
    return steps.flatMap((step) => {
      const offer = views.find((v) => v.id === step.subjectId);
      if (!offer) return [];
      const item: ApprovalItem = { subjectType: 'offer', stepId: step.id, kind: step.kind, offer };
      return [{ sortKey: offer.createdAt, item }];
    });
  }

  view(subjectId: string): Promise<OfferView> {
    return this.tenantDb.run(async (tx) => {
      const [view] = await offerViews(tx, eq(offers.id, subjectId));
      if (!view) throw new NotFoundException(NOT_FOUND);
      return view;
    });
  }

  async summarize(tx: Tx, subjectId: string): Promise<ApprovalSummary> {
    const ctx = await offerContext(tx, eq(offers.id, subjectId));
    const { offer, candidate, opening } = ctx;
    const budget = opening.budgetMax ?? '0';
    return {
      employeeId: '',
      personName: candidate.fullName,
      summary: {
        en: `Offer to ${candidate.fullName} for ${opening.title}: Tk ${amountText('en', offer.monthlyGross)} a month, above the budget of Tk ${amountText('en', budget)}`,
        bn: `${opening.title} পদে ${candidate.fullName}-কে প্রস্তাব: মাসে ${amountText('bn', offer.monthlyGross)} টাকা, বাজেট ${amountText('bn', budget)} টাকার বেশি`,
      },
      link: `/workspace/recruitment/applications/${ctx.application.id}`,
      madeBy: offer.createdByUserId,
      decisionRecipients: offer.createdByUserId ? [{ userId: offer.createdByUserId }] : [],
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async lock(tx: Tx, user: AuthUser, id: string): Promise<OfferContext> {
    return offerContext(tx, await visibleWhere(tx, user, eq(offers.id, id)), { lock: true });
  }

  private notExpired(expiresOn: string) {
    if (expiresOn < todayIn()) {
      throw fieldError('offer_expiry_past', 'expiresOn', 'The offer must expire today or later');
    }
  }

  /** The terms as columns, checked: the company, its units and places, and the probation. */
  private async checkTerms(tx: Tx, user: AuthUser, input: OfferUpdateInput) {
    await mustUseCompany(tx, user, input.legalEntityId);
    this.notExpired(input.expiresOn);
    if (input.orgUnitId) {
      const [unit] = await tx.select().from(orgUnits).where(eq(orgUnits.id, input.orgUnitId));
      if (!unit || unit.legalEntityId !== input.legalEntityId) {
        throw fieldError('unit_other_company', 'orgUnitId', 'Choose a unit of this company');
      }
    }
    if (input.locationId) {
      const [place] = await tx.select().from(locations).where(eq(locations.id, input.locationId));
      if (!place || place.legalEntityId !== input.legalEntityId) {
        throw fieldError('location_other_company', 'locationId', 'Choose a place of this company');
      }
    }
    const [designation] = input.designationId
      ? await tx.select().from(designations).where(eq(designations.id, input.designationId))
      : [];
    const probation = offerProbation(
      input.employmentType,
      designation?.workerCategory ?? 'worker',
      input.joiningOn,
      input.probationMonths,
    );
    if (probation.tooLong) {
      throw fieldError(
        'probation_too_long',
        'probationMonths',
        `Probation is at most ${probation.limit} months for this work (Labour Act s.4)`,
        { limit: probation.limit, section: '4' },
      );
    }
    return {
      legalEntityId: input.legalEntityId,
      orgUnitId: input.orgUnitId ?? null,
      locationId: input.locationId ?? null,
      designationId: input.designationId ?? null,
      gradeId: input.gradeId ?? null,
      employmentType: input.employmentType,
      joiningOn: input.joiningOn,
      monthlyGross: input.monthlyGross,
      probationMonths: probation.months,
      expiresOn: input.expiresOn,
      language: input.language,
      terms: input.terms?.trim() || null,
    };
  }

  /** The audit log keeps which terms, not how much the pay is. */
  private auditTerms(terms: Awaited<ReturnType<OffersService['checkTerms']>>) {
    const { monthlyGross: _pay, terms: _text, ...rest } = terms;
    return rest;
  }
}
