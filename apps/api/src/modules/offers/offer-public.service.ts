import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  legalEntities,
  locations,
  offers,
  orgUnits,
  grades,
  tenants,
  type Database,
  type Tx,
} from '@gp/db';
import {
  formatAddress,
  sameName,
  todayIn,
  type ApiError,
  type OfferAcceptInput,
  type OfferDeclineInput,
  type PublicOfferView,
} from '@gp/shared';
import { eq } from 'drizzle-orm';
import { badRequest, conflict } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { runInTenantContext } from '../../common/request-context.js';
import { DB, TenantDb } from '../../db/db.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EMAIL_SENDER, type EmailMessage, type Sender } from '../notifications/senders.js';
import { acceptedEmail, letterDate } from './offer-letter.js';
import { OfferLetterService } from './offer-letter.service.js';
import {
  noticeOutcome,
  offerContext,
  offerEvent,
  positionOf,
  tokenHash,
  type OfferContext,
} from './offer-records.js';

const MINUTE_MS = 60_000;
const LIMITS = {
  view: { limit: 120, windowMs: 15 * MINUTE_MS },
  decide: { limit: 20, windowMs: 60 * MINUTE_MS },
};

/** What `randomBytes(32).toString('base64url')` gives; anything else is not a link we sent. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type Workspace = { id: string; name: string; slug: string };

const notFound = () => {
  const body: ApiError = {
    statusCode: 404,
    error: 'Not Found',
    message: 'There is no offer at this address',
    code: 'offer_not_found',
  };
  return new NotFoundException(body);
};

/**
 * The candidate's side, without signing in: the private link shows the offer and its letter,
 * and takes their answer. The address is kept only with an acceptance (who, when, from where:
 * the ICT Act 2006, ss.6–7), and is otherwise just a key for the in-memory rate limits.
 */
@Injectable()
export class OfferPublicService {
  private readonly logger = new Logger(OfferPublicService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EMAIL_SENDER) private readonly email: Sender<EmailMessage>,
    private readonly tenantDb: TenantDb,
    private readonly limiter: RateLimiter,
    private readonly notifications: NotificationsService,
    private readonly letters: OfferLetterService,
  ) {}

  async view(slug: string, token: string, ip: string): Promise<PublicOfferView> {
    const workspace = await this.open(slug, token, ip, 'view');
    return this.asTenant(workspace.id, async (tx) =>
      this.publicView(tx, workspace, await this.byToken(tx, token)),
    );
  }

  /** The letter: as accepted, once accepted; else as it reads now. */
  async letter(slug: string, token: string, ip: string) {
    const workspace = await this.open(slug, token, ip, 'view');
    return this.asTenant(workspace.id, async (tx) => {
      const ctx = await this.byToken(tx, token);
      const fileName = this.letters.fileName(ctx.offer.id, ctx.offer.language);
      if (ctx.offer.letterStorageKey) {
        return {
          bytes: await this.letters.kept(workspace.id, ctx.offer.letterStorageKey),
          fileName,
        };
      }
      const data = await this.letters.data(tx, ctx, ctx.offer.language);
      return { bytes: await this.letters.render(data), fileName };
    });
  }

  async accept(
    slug: string,
    token: string,
    input: OfferAcceptInput,
    ip: string,
  ): Promise<PublicOfferView> {
    const workspace = await this.open(slug, token, ip, 'decide');
    // A filled hidden field is a bot: it gets the offer back and nothing changes.
    if (input.website) return this.view(slug, token, ip);
    const { view, message } = await this.asTenant(workspace.id, async (tx) => {
      const ctx = await this.byToken(tx, token, true);
      this.stillOpen(ctx);
      if (!sameName(input.name, ctx.candidate.fullName)) {
        throw badRequest('name_mismatch', 'Type your full name as it is on the offer');
      }
      const at = new Date();
      const { language } = ctx.offer;
      const data = await this.letters.data(tx, ctx, language);
      const bytes = await this.letters.render({ ...data, acceptance: { name: input.name, at } });
      const kept = await this.letters.keep(workspace.id, ctx.offer.id, bytes);
      await tx
        .update(offers)
        .set({
          status: 'accepted',
          decidedAt: at,
          acceptedName: input.name,
          acceptedIp: ip,
          letterStorageKey: kept.storageKey,
          letterSha256: kept.sha256,
          updatedAt: at,
        })
        .where(eq(offers.id, ctx.offer.id));
      await offerEvent(tx, ctx.offer, 'accepted', null);
      const joining = {
        en: letterDate(ctx.offer.joiningOn, 'en'),
        bn: letterDate(ctx.offer.joiningOn, 'bn'),
      };
      await noticeOutcome(tx, this.notifications, ctx, 'accepted', {
        en: `Joining on ${joining.en}.`,
        bn: `যোগদান ${joining.bn}।`,
      });
      const position = await positionOf(tx, ctx);
      const mailLanguage = ctx.candidate.language;
      const confirmation: EmailMessage | null = ctx.candidate.email
        ? {
            to: ctx.candidate.email,
            ...acceptedEmail(mailLanguage, {
              candidate: ctx.candidate.fullName,
              company: data.company.name,
              position: position[mailLanguage],
              joiningOn: ctx.offer.joiningOn,
            }),
            attachments: [
              {
                filename: this.letters.fileName(ctx.offer.id, language),
                content: bytes,
                contentType: 'application/pdf',
              },
            ],
          }
        : null;
      const accepted = await this.byToken(tx, token);
      return { view: await this.publicView(tx, workspace, accepted), message: confirmation };
    });
    if (message) {
      await this.email.send(message).catch((error: Error) => {
        this.logger.error(`Offer confirmation email failed: ${error.message}`);
      });
    }
    return view;
  }

  async decline(
    slug: string,
    token: string,
    input: OfferDeclineInput,
    ip: string,
  ): Promise<PublicOfferView> {
    const workspace = await this.open(slug, token, ip, 'decide');
    if (input.website) return this.view(slug, token, ip);
    return this.asTenant(workspace.id, async (tx) => {
      const ctx = await this.byToken(tx, token, true);
      this.stillOpen(ctx);
      const reason = input.reason?.trim() || null;
      await tx
        .update(offers)
        .set({
          status: 'declined',
          decidedAt: new Date(),
          declineReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(offers.id, ctx.offer.id));
      await offerEvent(tx, ctx.offer, 'declined', null);
      await noticeOutcome(
        tx,
        this.notifications,
        ctx,
        'declined',
        reason ? { en: `Reason: ${reason}`, bn: `কারণ: ${reason}` } : '',
      );
      return this.publicView(tx, workspace, await this.byToken(tx, token));
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Counted before anything is looked up, so guessed links are limited too. */
  private async open(slug: string, token: string, ip: string, kind: keyof typeof LIMITS) {
    const wanted = slug.trim().toLowerCase();
    const { limit, windowMs } = LIMITS[kind];
    await this.limiter.hit(`offer:${kind}:${ip}:${wanted}`, limit, windowMs);
    if (!TOKEN.test(token)) throw notFound();
    const [row] = await this.db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.slug, wanted));
    if (!row || row.status === 'suspended' || row.status === 'archived') throw notFound();
    return row;
  }

  private asTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return runInTenantContext(tenantId, () => this.tenantDb.run(fn));
  }

  /** The offer behind a link, inside its own workspace only (row-level security). */
  private async byToken(tx: Tx, token: string, lock = false): Promise<OfferContext> {
    try {
      return await offerContext(tx, eq(offers.tokenHash, tokenHash(token)), { lock });
    } catch (error) {
      if (error instanceof NotFoundException) throw notFound();
      throw error;
    }
  }

  /** Only a sent offer within its last day takes an answer. */
  private stillOpen({ offer }: OfferContext) {
    if (offer.status === 'withdrawn') {
      throw conflict('offer_withdrawn', 'This offer has been withdrawn');
    }
    if (offer.status === 'expired' || (offer.status === 'sent' && offer.expiresOn < todayIn())) {
      throw conflict('offer_expired', 'This offer has expired');
    }
    if (offer.status !== 'sent') {
      throw conflict('offer_decided', 'This offer has already been answered');
    }
  }

  private async publicView(
    tx: Tx,
    workspace: Workspace,
    ctx: OfferContext,
  ): Promise<PublicOfferView> {
    const { offer } = ctx;
    const status =
      offer.status === 'sent' && offer.expiresOn < todayIn() ? 'expired' : offer.status;
    if (
      status !== 'sent' &&
      status !== 'accepted' &&
      status !== 'declined' &&
      status !== 'expired' &&
      status !== 'withdrawn'
    ) {
      throw notFound();
    }
    const [entity] = await tx
      .select()
      .from(legalEntities)
      .where(eq(legalEntities.id, offer.legalEntityId));
    const [unit] = offer.orgUnitId
      ? await tx.select().from(orgUnits).where(eq(orgUnits.id, offer.orgUnitId))
      : [];
    const [place] = offer.locationId
      ? await tx.select().from(locations).where(eq(locations.id, offer.locationId))
      : [];
    const [grade] = offer.gradeId
      ? await tx.select().from(grades).where(eq(grades.id, offer.gradeId))
      : [];
    return {
      workspace: { name: workspace.name, slug: workspace.slug },
      company: {
        name: entity?.legalName ?? entity?.name ?? workspace.name,
        address: entity?.address
          ? { en: formatAddress(entity.address, 'en'), bn: formatAddress(entity.address, 'bn') }
          : null,
      },
      candidate: { fullName: ctx.candidate.fullName },
      position: await positionOf(tx, ctx),
      orgUnit: unit ? { en: unit.name, bn: unit.nameBn ?? unit.name } : null,
      location: place?.name ?? null,
      grade: grade?.name ?? null,
      employmentType: offer.employmentType,
      joiningOn: offer.joiningOn,
      monthlyGross: offer.monthlyGross,
      probationMonths: offer.probationMonths,
      expiresOn: offer.expiresOn,
      language: offer.language,
      terms: offer.terms,
      status,
      sentAt: offer.sentAt?.toISOString() ?? null,
      decidedAt: offer.decidedAt?.toISOString() ?? null,
      acceptedName: offer.acceptedName,
    };
  }
}
