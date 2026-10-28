import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  applicationEvents,
  applications,
  designations,
  documents,
  hashPassword,
  jobOpenings,
  offers,
  payGroups,
  salaryStructures,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  hireEmployeeSchema,
  todayIn,
  type ApiError,
  type HireEmployeeInput,
  type OfferHireInput,
  type OfferHirePrefill,
  type OfferHireResult,
  type PayRecordView,
  type TenantWithAccess,
  type WorkerCategory,
} from '@gp/shared';
import { and, asc, count, eq } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { conflict } from '../../common/errors.js';
import { zod } from '../../common/zod.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import type { FileStore } from '../../storage/file-store.js';
import { FILE_STORE } from '../../storage/storage.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { cleanFileName, DocumentsService } from '../documents/documents.service.js';
import { EmployeesService } from '../employees/employees.service.js';
import { EmployeePayService } from '../payroll/employee-pay.service.js';
import { readCv } from '../recruitment/intake.js';
import { OfferLetterService } from './offer-letter.service.js';
import {
  offerContext,
  offerRef,
  offerViews,
  visibleWhere,
  type OfferContext,
} from './offer-records.js';
import { probationEnd } from './offer-terms.js';

const asHire = zod(hireEmployeeSchema);

/** Why the offered pay was not proposed. */
const note = (code: string, message: string) => ({ pay: null, payNote: { code, message } });

/**
 * Hiring the candidate of an accepted offer: the employee and their first job through the
 * ordinary hire with all its checks, the CV and the accepted letter into their documents, the
 * application hired and the opening filled at its headcount, in one transaction. The offered
 * pay is then proposed through payroll's maker-checker, never set directly.
 */
@Injectable()
export class OfferHireService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly employees: EmployeesService,
    private readonly vault: DocumentsService,
    private readonly pay: EmployeePayService,
    private readonly letters: OfferLetterService,
    @Inject(FILE_STORE) private readonly store: FileStore,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** What the hire form starts with. */
  prefill(user: AuthUser, tenant: TenantWithAccess, id: string): Promise<OfferHirePrefill> {
    return this.tenantDb.run(async (tx) => {
      const ctx = await this.hireable(tx, user, id, false);
      const [offer] = await offerViews(tx, eq(offers.id, id));
      const payroll = tenant.access.features.includes('payroll')
        ? {
            structures: await tx
              .select({
                id: salaryStructures.id,
                code: salaryStructures.code,
                name: salaryStructures.name,
                nameBn: salaryStructures.nameBn,
                basis: salaryStructures.basis,
                wageBoard: salaryStructures.wageBoard,
              })
              .from(salaryStructures)
              .where(eq(salaryStructures.isActive, true))
              .orderBy(asc(salaryStructures.code)),
            payGroups: await tx
              .select({ id: payGroups.id, code: payGroups.code, name: payGroups.name })
              .from(payGroups)
              .where(eq(payGroups.isActive, true))
              .orderBy(asc(payGroups.code)),
          }
        : null;
      return {
        offer: offer!,
        mobilePhone: ctx.candidate.phone?.replace(/^\+88/, '') ?? null,
        email: ctx.candidate.email,
        workerCategory: await this.workerCategory(tx, ctx),
        probationEndsOn: this.probationEndsOn(ctx),
        payroll,
      };
    });
  }

  async hire(
    user: AuthUser,
    tenant: TenantWithAccess,
    id: string,
    input: OfferHireInput,
  ): Promise<OfferHireResult> {
    const { job: extra, pay, mobilePhone, personalEmail, ...person } = input;
    const portal = input.portalAccess;
    // As the hire form: a login with only a mobile number signs in by SMS code.
    const password = portal?.email
      ? (portal.password ?? randomBytes(12).toString('base64url'))
      : undefined;
    const passwordHash = password ? await hashPassword(password) : undefined;

    const hired = await this.tenantDb.run(async (tx) => {
      const ctx = await this.hireable(tx, user, id, true);
      const { offer, candidate, application, opening } = ctx;
      // Checked as any hire is: the minimum age (s.34), identity, the company the login looks
      // after and the plan's limit.
      const hire = asHire.transform(
        {
          ...person,
          fullName: candidate.fullName,
          mobilePhone: mobilePhone ?? candidate.phone ?? undefined,
          personalEmail: personalEmail ?? candidate.email ?? undefined,
          joinedOn: offer.joiningOn,
          probationEndsOn: this.probationEndsOn(ctx) ?? undefined,
          job: {
            legalEntityId: offer.legalEntityId,
            orgUnitId: offer.orgUnitId ?? undefined,
            locationId: offer.locationId ?? undefined,
            designationId: offer.designationId ?? undefined,
            gradeId: offer.gradeId ?? undefined,
            costCentreId: extra.costCentreId,
            managerId: extra.managerId,
            employmentType: offer.employmentType,
            workerCategory: extra.workerCategory ?? (await this.workerCategory(tx, ctx)),
          },
        },
        { type: 'body' },
      ) as HireEmployeeInput;
      await this.employees.checkLimit(tx, tenant.access.limits.max_employees, 1);
      const employeeId = await this.employees.insertHire(tx, user, hire, passwordHash);

      await tx
        .update(applications)
        .set({ stage: 'hired', employeeId, stageChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(applications.id, application.id));
      await tx.insert(applicationEvents).values({
        tenantId: application.tenantId,
        applicationId: application.id,
        kind: 'stage',
        fromStage: application.stage,
        toStage: 'hired',
        actorUserId: user.id,
      });
      const papers = await this.fileDocuments(tx, user, ctx, employeeId);

      const [{ value: hiredCount } = { value: 0 }] = await tx
        .select({ value: count() })
        .from(applications)
        .where(and(eq(applications.openingId, opening.id), eq(applications.stage, 'hired')));
      const filled =
        hiredCount >= opening.headcount &&
        opening.status !== 'filled' &&
        opening.status !== 'cancelled';
      if (filled) {
        await tx
          .update(jobOpenings)
          .set({ status: 'filled', closedAt: new Date(), updatedAt: new Date() })
          .where(eq(jobOpenings.id, opening.id));
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'offer.hire',
        entityType: 'offer',
        entityId: offer.id,
        after: {
          applicationId: application.id,
          employeeId,
          documents: papers,
          openingFilled: filled,
        },
      });
      return { employeeId, offer };
    });

    const proposed = await this.proposePay(user, tenant, hired.employeeId, hired.offer, pay);
    return {
      employee: await this.employees.get(hired.employeeId),
      ...(password && !portal?.password ? { temporaryPassword: password } : {}),
      ...proposed,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** The offer, accepted and not yet hired from. */
  private async hireable(tx: Tx, user: AuthUser, id: string, lock: boolean) {
    const ctx = await offerContext(tx, await visibleWhere(tx, user, eq(offers.id, id)), { lock });
    if (ctx.offer.status !== 'accepted') {
      throw conflict('offer_not_accepted', `This offer is ${ctx.offer.status}, not accepted`);
    }
    if (ctx.application.employeeId) {
      throw conflict('already_hired', 'This candidate has already been hired');
    }
    return ctx;
  }

  private async workerCategory(tx: Tx, ctx: OfferContext): Promise<WorkerCategory> {
    const [designation] = ctx.offer.designationId
      ? await tx
          .select({ category: designations.workerCategory })
          .from(designations)
          .where(eq(designations.id, ctx.offer.designationId))
      : [];
    return designation?.category ?? 'worker';
  }

  private probationEndsOn({ offer }: OfferContext) {
    return offer.employmentType === 'probationer' && offer.probationMonths
      ? probationEnd(offer.joiningOn, offer.probationMonths)
      : null;
  }

  /** The CV and the letter as accepted, encrypted in the employee's documents. */
  private async fileDocuments(tx: Tx, user: AuthUser, ctx: OfferContext, employeeId: string) {
    const { offer, candidate } = ctx;
    const filed: string[] = [];
    if (candidate.cvStorageKey) {
      const bytes = await readCv(
        { store: this.store, cipher: this.cipher },
        offer.tenantId,
        candidate.cvStorageKey,
      );
      const cv = {
        employeeId,
        category: 'other' as const,
        title: 'CV',
        fileName: candidate.cvFileName ?? 'cv',
        bytes,
        source: 'upload' as const,
        visibleToEmployee: true,
        uploadedBy: user.id,
      };
      if (candidate.cvContentType === 'application/pdf') await this.vault.save(tx, cv);
      else await this.saveWordFile(tx, offer.tenantId, cv, candidate.cvContentType!);
      filed.push('cv');
    }
    if (offer.letterStorageKey) {
      await this.vault.save(tx, {
        employeeId,
        category: 'contract',
        title: 'Accepted offer',
        fileName: this.letters.fileName(offer.id, offer.language),
        bytes: await this.letters.kept(offer.tenantId, offer.letterStorageKey),
        source: 'generated',
        refNo: offerRef(offer.id),
        issuedOn: offer.sentAt ? todayIn('Asia/Dhaka', offer.sentAt) : null,
        visibleToEmployee: true,
        uploadedBy: user.id,
      });
      filed.push('accepted_offer');
    }
    return filed;
  }

  /**
   * A Word CV, which the vault's own upload does not take, stored as the vault stores files:
   * encrypted for the workspace and the document.
   */
  private async saveWordFile(
    tx: Tx,
    tenantId: string,
    file: {
      employeeId: string;
      title: string;
      fileName: string;
      bytes: Buffer;
      uploadedBy: string;
    },
    contentType: string,
  ) {
    const id = randomUUID();
    const storageKey = `tenants/${tenantId}/documents/${id}`;
    await this.store.put(
      storageKey,
      this.cipher.encryptBytes(file.bytes, { tenantId, purpose: `document:${id}` }),
    );
    await tx.insert(documents).values({
      id,
      tenantId,
      employeeId: file.employeeId,
      category: 'other',
      title: file.title,
      fileName: cleanFileName(file.fileName),
      contentType,
      sizeBytes: file.bytes.length,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
      storageKey,
      source: 'upload',
      visibleToEmployee: true,
      uploadedBy: file.uploadedBy,
    });
  }

  /**
   * The offered gross as a pay change waiting for payroll's approval, when the workspace has
   * payroll and HR chose a structure that takes a gross amount. Otherwise, or if payroll
   * refuses it (a minimum wage, say), a note says HR sets the pay on the pay page.
   */
  private async proposePay(
    user: AuthUser,
    tenant: TenantWithAccess,
    employeeId: string,
    offer: OfferContext['offer'],
    pay: OfferHireInput['pay'],
  ): Promise<Pick<OfferHireResult, 'pay' | 'payNote'>> {
    if (!tenant.access.features.includes('payroll')) return { pay: null, payNote: null };
    if (!pay) {
      return note('pay_not_chosen', 'No salary structure was chosen; set the pay on the pay page');
    }
    const [structure] = await this.tenantDb.run((tx) =>
      tx
        .select({ basis: salaryStructures.basis })
        .from(salaryStructures)
        .where(eq(salaryStructures.id, pay.structureId)),
    );
    // An unknown structure is left to payroll's own refusal below.
    if (structure && structure.basis !== 'gross') {
      return note(
        'pay_not_gross',
        'This structure is worked out from basic pay, not a gross; set the pay on the pay page',
      );
    }
    try {
      const record: PayRecordView = await this.pay.propose(user, employeeId, {
        effectiveFrom: offer.joiningOn,
        structureId: pay.structureId,
        payGroupId: pay.payGroupId,
        amount: offer.monthlyGross,
        fixed: {},
        wageGrade: pay.wageGrade ?? null,
        reason: `Offer ${offerRef(offer.id)} accepted`,
      });
      return { pay: record, payNote: null };
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      const body = error.getResponse() as Partial<ApiError>;
      return note(body.code ?? 'pay_not_proposed', body.message ?? error.message);
    }
  }
}
