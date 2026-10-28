import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  jobOpenings,
  legalEntities,
  locations,
  tenants,
  userEntityScopes,
  type Database,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  CV_MAX_BYTES,
  todayIn,
  type ApiError,
  type CareersApplied,
  type CareersApplyInput,
  type CareersJob,
  type CareersJobSummary,
  type CareersPageView,
  type RecruitmentSettingsView,
} from '@gp/shared';
import { and, asc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { runInTenantContext } from '../../common/request-context.js';
import { DB, FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import type { FileStore } from '../../storage/file-store.js';
import { FILE_STORE } from '../../storage/storage.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import {
  NotificationsService,
  usersWith,
  type Recipient,
} from '../notifications/notifications.service.js';
import { EMAIL_SENDER, type EmailMessage, type Sender } from '../notifications/senders.js';
import { applicationReceipt } from './careers-email.js';
import { cvFileType, intake } from './intake.js';
import { settingsOf } from './recruitment-settings.service.js';

const MINUTE_MS = 60_000;
const LIMITS = {
  view: { limit: 300, windowMs: 15 * MINUTE_MS },
  // An office's or a training centre's wifi puts many applicants behind one address.
  apply: { limit: 10, windowMs: 60 * MINUTE_MS },
  applyEmail: { limit: 3, windowMs: 24 * 60 * MINUTE_MS },
};

/** Every careers address that is not a careers page: no workspace, page off, or no plan. */
function noCareersPage(): NotFoundException {
  const body: ApiError = {
    statusCode: 404,
    error: 'Not Found',
    message: 'There is no careers page at this address',
    code: 'careers_not_found',
  };
  return new NotFoundException(body);
}

const jobNotFound = () => new NotFoundException('There is no such job');

interface Workspace {
  id: string;
  name: string;
  slug: string;
  settings: RecruitmentSettingsView;
  /** A read-only workspace shows its jobs but takes no applications. */
  writable: boolean;
}

type CvFile = { originalname: string; buffer: Buffer; size: number };

const SOURCE_LABEL = { en: 'careers page', bn: 'ক্যারিয়ার পেজ' };

/** The careers page's columns of an opening: never its budget unless shown, nor anything internal. */
function selectPublic(tx: Tx) {
  return tx
    .select({
      id: jobOpenings.id,
      status: jobOpenings.status,
      postTitleEn: jobOpenings.postTitleEn,
      postTitleBn: jobOpenings.postTitleBn,
      descriptionEn: jobOpenings.descriptionEn,
      descriptionBn: jobOpenings.descriptionBn,
      employmentType: jobOpenings.employmentType,
      closesOn: jobOpenings.closesOn,
      publishedAt: jobOpenings.publishedAt,
      showSalary: jobOpenings.showSalary,
      budgetMin: jobOpenings.budgetMin,
      budgetMax: jobOpenings.budgetMax,
      company: legalEntities.name,
      location: locations.name,
      locationAddress: locations.address,
    })
    .from(jobOpenings)
    .innerJoin(legalEntities, eq(legalEntities.id, jobOpenings.legalEntityId))
    .leftJoin(locations, eq(locations.id, jobOpenings.locationId))
    .$dynamic();
}

type PublicRow = Awaited<ReturnType<typeof selectPublic>>[number];

const summaryOf = (r: PublicRow): CareersJobSummary => ({
  id: r.id,
  titleEn: r.postTitleEn,
  titleBn: r.postTitleBn,
  company: r.company,
  location: r.location,
  employmentType: r.employmentType,
  // Listed and shown only once published, which needs a closing date.
  closesOn: r.closesOn!,
  publishedAt: r.publishedAt?.toISOString() ?? null,
  salary:
    r.showSalary && (r.budgetMin || r.budgetMax) ? { min: r.budgetMin, max: r.budgetMax } : null,
});

/** Logins that handle recruitment for this company: those not limited, or limited to include it. */
async function recruitersOf(tx: Tx, legalEntityId: string): Promise<Recipient[]> {
  const people = await usersWith(tx, 'recruitment.manage');
  const ids = people.flatMap((p) => (p.userId ? [p.userId] : []));
  const scopes = ids.length
    ? await tx
        .select({ userId: userEntityScopes.userId, legalEntityId: userEntityScopes.legalEntityId })
        .from(userEntityScopes)
        .where(inArray(userEntityScopes.userId, ids))
    : [];
  return people.filter(
    (p) =>
      !scopes.some((s) => s.userId === p.userId) ||
      scopes.some((s) => s.userId === p.userId && s.legalEntityId === legalEntityId),
  );
}

/**
 * A workspace's careers page, without signing in: its open jobs and applying to one. The
 * visitor's address is only a key for the in-memory rate limits, never stored.
 */
@Injectable()
export class CareersService {
  private readonly logger = new Logger(CareersService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(FILE_STORE) private readonly store: FileStore,
    @Inject(EMAIL_SENDER) private readonly email: Sender<EmailMessage>,
    private readonly tenantDb: TenantDb,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly limiter: RateLimiter,
  ) {}

  async page(slug: string, ip: string): Promise<CareersPageView> {
    const ws = await this.open(slug, ip, 'view');
    const jobs = await this.asTenant(ws.id, (tx) =>
      selectPublic(tx)
        .where(and(eq(jobOpenings.status, 'open'), gte(jobOpenings.closesOn, todayIn())))
        .orderBy(asc(jobOpenings.closesOn), asc(jobOpenings.createdAt)),
    );
    return {
      workspace: { name: ws.name, slug: ws.slug },
      introEn: ws.settings.introEn,
      introBn: ws.settings.introBn,
      jobs: jobs.map(summaryOf),
    };
  }

  /** An open job; one that was published and is no longer open says so with its title only. */
  async job(slug: string, id: string, ip: string): Promise<CareersJob> {
    const ws = await this.open(slug, ip, 'view');
    const [row] = await this.asTenant(ws.id, (tx) =>
      selectPublic(tx).where(and(eq(jobOpenings.id, id), isNotNull(jobOpenings.publishedAt))),
    );
    if (!row) throw jobNotFound();
    const workspace = { name: ws.name, slug: ws.slug };
    if (this.taking(row)) {
      return {
        ...summaryOf(row),
        closed: false,
        workspace,
        descriptionEn: row.descriptionEn,
        descriptionBn: row.descriptionBn,
        locationAddress: row.locationAddress,
        retentionMonths: ws.settings.retentionMonths,
        privacyEmail: ws.settings.privacyEmail,
      };
    }
    // Published once, so closed by hand, filled, cancelled or past its closing date.
    return { closed: true, workspace, titleEn: row.postTitleEn, titleBn: row.postTitleBn };
  }

  /**
   * Applies with a CV: the candidate (found again by email or mobile) and their application,
   * HR and the hiring manager told, and a confirmation emailed in the candidate's language.
   */
  async apply(
    slug: string,
    id: string,
    input: CareersApplyInput,
    cv: CvFile | undefined,
    ip: string,
  ): Promise<CareersApplied> {
    const ws = await this.open(slug, ip, 'apply');
    if (!ws.writable) {
      throw forbidden('tenant_read_only', 'This workspace is not taking applications now');
    }
    // A filled hidden field is a bot: it gets the same answer and nothing is kept.
    if (input.website) return { received: true };
    const email = input.email.trim().toLowerCase();
    this.limiter.hit(
      `careers:apply-email:${ws.id}:${email}`,
      LIMITS.applyEmail.limit,
      LIMITS.applyEmail.windowMs,
    );
    if (!cv?.buffer.length) throw badRequest('cv_required', 'Attach your CV');
    if (cv.size > CV_MAX_BYTES) throw cvTooLarge();
    const type = cvFileType(cv.buffer);
    if (!type) throw badRequest('cv_type', 'Attach your CV as a PDF or a Word (.docx) file');

    const receipt = await this.asTenant(ws.id, async (tx) => {
      const [opening] = await tx
        .select({ o: jobOpenings, company: legalEntities.name })
        .from(jobOpenings)
        .innerJoin(legalEntities, eq(legalEntities.id, jobOpenings.legalEntityId))
        .where(and(eq(jobOpenings.id, id), isNotNull(jobOpenings.publishedAt)));
      if (!opening) throw jobNotFound();
      const o = opening.o;
      if (!this.taking(o)) {
        throw conflict('job_closed', 'This job is no longer taking applications');
      }
      const { applicationId, replacedCvKey } = await intake(
        tx,
        { store: this.store, cipher: this.cipher },
        {
          tenantId: ws.id,
          openingId: o.id,
          fullName: input.fullName,
          email,
          phone: input.phone,
          source: 'careers_page',
          language: input.language,
          coverNote: input.coverNote,
          consent: input.consent,
          talentPool: input.talentPool,
          cv: { upload: { bytes: cv.buffer, fileName: cv.originalname }, type },
          actorUserId: null,
        },
      );
      await this.notifications.notify(tx, {
        event: 'recruitment.application',
        recipients: [
          ...(await recruitersOf(tx, o.legalEntityId)),
          ...(o.hiringManagerEmployeeId ? [{ employeeId: o.hiringManagerEmployeeId }] : []),
        ],
        values: {
          'candidate.name': input.fullName,
          'opening.title': o.title,
          'application.source': SOURCE_LABEL,
        },
        link: `/workspace/recruitment/applications/${applicationId}`,
        dedupeKey: `recruitment.application:${applicationId}`,
        data: { openingId: o.id, applicationId },
      });
      const bn = input.language === 'bn';
      const message = applicationReceipt({
        to: email,
        language: input.language,
        jobTitle:
          (bn ? (o.postTitleBn ?? o.postTitleEn) : (o.postTitleEn ?? o.postTitleBn)) ?? o.title,
        company: opening.company,
        retentionMonths: ws.settings.retentionMonths,
        talentPool: !!input.talentPool,
        privacyEmail: ws.settings.privacyEmail,
      });
      return { message, replacedCvKey };
    });
    // The CV this one replaced goes only once the new one is saved for good.
    if (receipt.replacedCvKey) {
      await this.store.delete(receipt.replacedCvKey).catch(() => undefined);
    }
    // Sent once the application is saved; a failed send never loses it.
    await this.email.send(receipt.message).catch((error: Error) => {
      this.logger.error(`Application confirmation failed: ${error.message}`);
    });
    return { received: true };
  }

  /** Open, and not past its closing date (which the daily job may not have reached yet). */
  private taking(o: { status: string | null; closesOn: string | null }) {
    return o.status === 'open' && !!o.closesOn && o.closesOn >= todayIn();
  }

  /** Counted before the workspace is looked up, so made-up addresses are limited too. */
  private async open(slug: string, ip: string, kind: 'view' | 'apply'): Promise<Workspace> {
    const wanted = slug.trim().toLowerCase();
    const { limit, windowMs } = LIMITS[kind];
    this.limiter.hit(`careers:${kind}:${ip}`, limit, windowMs);
    const [row] = await this.db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.slug, wanted));
    if (!row || row.status === 'archived') throw noCareersPage();
    const tenant = await this.entitlements.forTenant(row.id);
    if (
      !tenant ||
      tenant.access.accessState === 'suspended' ||
      !tenant.access.features.includes('recruitment')
    ) {
      throw noCareersPage();
    }
    const settings = await this.asTenant(row.id, settingsOf);
    if (!settings.careersEnabled) throw noCareersPage();
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      settings,
      writable: tenant.access.accessState === 'full',
    };
  }

  private asTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return runInTenantContext(tenantId, () => this.tenantDb.run(fn));
  }
}

export function cvTooLarge() {
  return badRequest('cv_too_large', `A CV can be up to ${CV_MAX_BYTES / (1024 * 1024)} MB`);
}
