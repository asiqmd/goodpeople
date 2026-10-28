import { Inject, Injectable } from '@nestjs/common';
import {
  applications,
  candidates,
  employees,
  jobOpenings,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  isClosedStage,
  type CandidateAddInput,
  type CandidateAdded,
  type CandidateDetail,
  type CandidateListItem,
  type CandidateListQuery,
  type CandidateUpdateInput,
  type CvContacts,
  type Page,
} from '@gp/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import type { FileStore } from '../../storage/file-store.js';
import { FILE_STORE } from '../../storage/storage.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import type { EmailMessage } from '../notifications/senders.js';
import { intake, readCv } from '../recruitment/intake.js';
import { employeeRefs, managesOpening, notFound, viewerOf, type Viewer } from './access.js';
import { checkedCvType } from './cv-upload.js';
import { contactsFromText, cvText } from './cv-reader.js';
import { eraseCandidate, wasHired } from './erasure.js';
import { moveStage } from './events.js';
import { InterviewsService } from './interviews.service.js';
import { RecruitmentMailer } from './recruitment-mailer.service.js';

type UploadedCv = { originalname: string; buffer: Buffer } | undefined;

const like = (text: string) => `%${text.replaceAll(/[%_\\]/g, '\\$&')}%`;

/** Openings in the companies the login looks after, as a condition. */
const inCompanies = (viewer: Viewer) =>
  viewer.companies ? inArray(jobOpenings.legalEntityId, viewer.companies) : undefined;

/**
 * Candidates, for those who manage recruitment: found, read, corrected, added by hand to an
 * opening (from walk-ins, referrals, agencies and job boards), and erased on request.
 */
@Injectable()
export class CandidatesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly interviews: InterviewsService,
    private readonly mailer: RecruitmentMailer,
    @Inject(FILE_STORE) private readonly store: FileStore,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  list(user: AuthUser, query: CandidateListQuery): Promise<Page<CandidateListItem>> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const search = query.search?.trim();
      const digits = search?.replace(/\D/g, '') ?? '';
      const where = and(
        isNull(candidates.erasedAt),
        query.talentPool === undefined ? undefined : eq(candidates.talentPool, query.talentPool),
        search
          ? or(
              ilike(candidates.fullName, like(search)),
              ilike(candidates.email, like(search)),
              digits.length >= 3 ? ilike(candidates.phone, like(digits)) : undefined,
            )
          : undefined,
        exists(
          tx
            .select({ one: sql`1` })
            .from(applications)
            .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
            .where(
              and(
                eq(applications.candidateId, candidates.id),
                inCompanies(viewer),
                query.openingId ? eq(applications.openingId, query.openingId) : undefined,
              ),
            ),
        ),
      );
      const [total] = await tx.select({ n: count() }).from(candidates).where(where);
      const rows = await tx
        .select()
        .from(candidates)
        .where(where)
        .orderBy(desc(candidates.updatedAt), asc(candidates.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const apps = await this.visibleApplications(
        tx,
        viewer,
        rows.map((r) => r.id),
      );
      return {
        items: rows.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          email: c.email,
          phone: c.phone,
          source: c.source,
          talentPool: c.talentPool,
          applications: apps
            .filter((a) => a.candidateId === c.id)
            .map((a) => ({
              id: a.id,
              openingId: a.openingId,
              openingTitle: a.openingTitle,
              stage: a.stage,
            })),
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
        total: total?.n ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  get(user: AuthUser, id: string): Promise<CandidateDetail> {
    return this.tenantDb.run(async (tx) => this.detail(tx, await viewerOf(tx, user), id));
  }

  update(user: AuthUser, id: string, input: CandidateUpdateInput): Promise<CandidateDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const candidate = await this.visible(tx, viewer, id, true);
      if (candidate.erasedAt) throw conflict('candidate_erased', 'This candidate was erased');
      const email = input.email === undefined ? undefined : (input.email?.toLowerCase() ?? null);
      if (email) {
        const [taken] = await tx
          .select({ id: candidates.id })
          .from(candidates)
          .where(
            and(eq(candidates.email, email), isNull(candidates.erasedAt), ne(candidates.id, id)),
          );
        if (taken) {
          throw conflict('candidate_email_taken', 'Another candidate has this email address');
        }
      }
      await tx
        .update(candidates)
        .set({
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          ...(input.talentPool !== undefined ? { talentPool: input.talentPool } : {}),
          ...(input.language !== undefined ? { language: input.language } : {}),
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, id));
      // Which fields changed, never what they hold.
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'candidate.update',
        entityType: 'candidate',
        entityId: id,
        after: { fields: Object.keys(input) },
      });
      return this.detail(tx, viewer, id);
    });
  }

  /** Adds a person to an opening by hand, found again if they applied before. */
  async add(user: AuthUser, input: CandidateAddInput, file: UploadedCv): Promise<CandidateAdded> {
    const cv = file
      ? {
          upload: { bytes: file.buffer, fileName: file.originalname },
          type: checkedCvType(file.buffer),
        }
      : null;
    const { replacedCvKey, ...added } = await this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const [opening] = await tx
        .select()
        .from(jobOpenings)
        .where(eq(jobOpenings.id, input.openingId));
      if (!opening || !managesOpening(viewer, opening)) throw notFound('opening');
      if (opening.status !== 'approved' && opening.status !== 'open') {
        throw conflict(
          'opening_not_taking_candidates',
          'Candidates are added to approved or open openings',
        );
      }
      if (input.referredByEmployeeId) {
        const [referrer] = await tx
          .select({ id: employees.id })
          .from(employees)
          .where(eq(employees.id, input.referredByEmployeeId));
        if (!referrer) throw badRequest('referrer_unknown', 'No such employee');
      }
      const result = await intake(
        tx,
        { store: this.store, cipher: this.cipher },
        {
          tenantId: currentTenantId(),
          openingId: opening.id,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          source: input.source,
          referredByEmployeeId: input.referredByEmployeeId,
          coverNote: input.coverNote,
          language: input.language,
          consent: input.consent,
          talentPool: input.talentPool,
          cv,
          actorUserId: user.id,
        },
      );
      // HR's notes on a person found again go after what was written before.
      const notes = input.notes?.trim();
      if (notes) {
        await tx
          .update(candidates)
          .set({ notes: sql`concat_ws(${'\n\n'}::text, ${candidates.notes}, ${notes}::text)` })
          .where(eq(candidates.id, result.candidateId));
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'candidate.add',
        entityType: 'application',
        entityId: result.applicationId,
        after: {
          candidateId: result.candidateId,
          openingId: opening.id,
          source: input.source,
          newCandidate: result.newCandidate,
        },
      });
      return result;
    });
    // The CV a new one replaced goes only once the change is saved.
    if (replacedCvKey) await this.store.delete(replacedCvKey).catch(() => undefined);
    return added;
  }

  /**
   * Erases a candidate on request: their applications still open are withdrawn and their
   * interviews to come cancelled, then the person is blanked and the CV deleted. Never someone
   * who was hired.
   */
  async erase(user: AuthUser, id: string): Promise<CandidateDetail> {
    const { detail, cvKey, mails } = await this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const candidate = await this.visible(tx, viewer, id, true);
      if (candidate.erasedAt) {
        return { detail: await this.detail(tx, viewer, id), cvKey: null, mails: [] };
      }
      if (await wasHired(tx, id)) {
        throw conflict(
          'candidate_hired',
          'A hired candidate is an employee now; their data is kept with their record',
        );
      }
      const theirs = await tx
        .select({ id: applications.id, stage: applications.stage })
        .from(applications)
        .where(eq(applications.candidateId, id))
        .for('update');
      const outbox: EmailMessage[] = [];
      for (const application of theirs.filter((a) => !isClosedStage(a.stage))) {
        outbox.push(
          ...(await this.interviews.cancelUpcoming(tx, application.id, {
            actorUserId: user.id,
            tellCandidate: false,
          })),
        );
        await moveStage(tx, application, 'withdrawn', {
          reason: 'Erased at the candidate’s request',
          actorUserId: user.id,
        });
      }
      const key = await eraseCandidate(tx, id, { actorUserId: user.id, reason: 'request' });
      return { detail: await this.detail(tx, viewer, id), cvKey: key, mails: outbox };
    });
    if (cvKey) await this.store.delete(cvKey).catch(() => undefined);
    await this.mailer.send(mails);
    return detail;
  }

  cv(user: AuthUser, id: string) {
    return this.tenantDb.run(async (tx) => {
      const candidate = await this.visible(tx, await viewerOf(tx, user), id);
      if (!candidate.cvStorageKey || !candidate.cvFileName || !candidate.cvContentType) {
        throw notFound('CV');
      }
      return {
        fileName: candidate.cvFileName,
        contentType: candidate.cvContentType,
        bytes: await readCv(
          { store: this.store, cipher: this.cipher },
          currentTenantId(),
          candidate.cvStorageKey,
        ),
      };
    });
  }

  /** The contact details a CV gives, to fill the add-by-hand form. */
  async parse(file: UploadedCv): Promise<CvContacts> {
    if (!file) throw badRequest('cv_missing', 'Attach the CV');
    return contactsFromText(await cvText(file.buffer, checkedCvType(file.buffer)));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** The candidate, if they applied to an opening of a company the login looks after. */
  private async visible(tx: Tx, viewer: Viewer, id: string, lock = false) {
    const query = tx.select().from(candidates).where(eq(candidates.id, id));
    const [candidate] = lock ? await query.for('update') : await query;
    if (!candidate || !viewer.manage) throw notFound('candidate');
    if ((await this.visibleApplications(tx, viewer, [id])).length === 0) {
      throw notFound('candidate');
    }
    return candidate;
  }

  private async visibleApplications(tx: Tx, viewer: Viewer, candidateIds: string[]) {
    if (candidateIds.length === 0) return [];
    return tx
      .select({
        id: applications.id,
        candidateId: applications.candidateId,
        openingId: jobOpenings.id,
        openingTitle: jobOpenings.title,
        openingStatus: jobOpenings.status,
        stage: applications.stage,
        source: applications.source,
        appliedAt: applications.appliedAt,
        stageChangedAt: applications.stageChangedAt,
      })
      .from(applications)
      .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
      .where(and(inArray(applications.candidateId, candidateIds), inCompanies(viewer)))
      .orderBy(desc(applications.appliedAt));
  }

  private async detail(tx: Tx, viewer: Viewer, id: string): Promise<CandidateDetail> {
    const c = await this.visible(tx, viewer, id);
    const apps = await this.visibleApplications(tx, viewer, [id]);
    const referrers = await employeeRefs(
      tx,
      c.referredByEmployeeId ? [c.referredByEmployeeId] : [],
    );
    return {
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      source: c.source,
      language: c.language,
      referredBy: c.referredByEmployeeId ? (referrers.get(c.referredByEmployeeId) ?? null) : null,
      cv:
        c.cvStorageKey && c.cvFileName && c.cvContentType && c.cvSizeBytes !== null
          ? { fileName: c.cvFileName, contentType: c.cvContentType, sizeBytes: c.cvSizeBytes }
          : null,
      consentAt: c.consentAt?.toISOString() ?? null,
      talentPool: c.talentPool,
      notes: c.notes,
      erasedAt: c.erasedAt?.toISOString() ?? null,
      hired: await wasHired(tx, id),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      applications: apps.map((a) => ({
        id: a.id,
        opening: { id: a.openingId, title: a.openingTitle, status: a.openingStatus },
        stage: a.stage,
        source: a.source,
        appliedAt: a.appliedAt.toISOString(),
        stageChangedAt: a.stageChangedAt.toISOString(),
      })),
    };
  }
}
