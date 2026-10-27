import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  hashPassword,
  plans,
  provisionCountryDefaults,
  provisionIndustryTemplate,
  scopeToTenant,
  signups,
  tenantUsers,
  tenants,
  type Database,
} from '@gp/db';
import {
  SIGNUP_CODE_ATTEMPTS,
  SIGNUP_CODE_MINUTES,
  slugFrom,
  slugSchema,
  TERMS_VERSION,
  todayIn,
  TRIAL_DAYS,
  TRIAL_PLAN,
  type SignupStartInput,
  type SignupStarted,
  type SignupVerifyInput,
  type SignupView,
  type SlugCheck,
} from '@gp/shared';
import { and, desc, eq, isNotNull, like } from 'drizzle-orm';
import { badRequest, conflict } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService, type TenantLoginResult } from '../auth/auth.service.js';
import { hashCode, numericCode } from '../auth/totp.js';
import { EMAIL_SENDER, type EmailMessage, type Sender } from '../notifications/senders.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Addresses that name parts of the product, not workspaces. */
const RESERVED = new Set([
  'www',
  'app',
  'api',
  'admin',
  'platform',
  'login',
  'signup',
  'help',
  'status',
  'support',
  'mail',
  'billing',
  'docs',
  'demo',
]);

/**
 * Self-serve sign-up: an emailed code proves the address, then a 30-day trial workspace is
 * created with the country pack and the industry's starting organisation, and its owner is
 * signed in. Every step is rate-limited; one trial per address.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_SENDER) private readonly email: Sender<EmailMessage>,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
  ) {}

  async start(input: SignupStartInput, ip: string): Promise<SignupStarted> {
    this.enabled();
    const email = input.email.trim().toLowerCase();
    this.limiter.hit(`signup-ip:${ip}`, 10, 60 * MINUTE_MS);
    this.limiter.hit(`signup:${email}`, 3, 15 * MINUTE_MS);
    const code = numericCode(6);
    const [row] = await this.db
      .insert(signups)
      .values({
        name: input.name,
        email,
        company: input.company,
        industryTemplate: input.industryTemplate,
        language: input.language,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + SIGNUP_CODE_MINUTES * MINUTE_MS),
        ip,
        // The schema only lets a sign-up start with the box ticked.
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
      })
      .returning({ id: signups.id });
    // A filled hidden field is a bot: it gets the same answer and nothing is sent.
    if (input.website) {
      return { signupId: row!.id, expiresInSeconds: SIGNUP_CODE_MINUTES * 60, suggestedSlug: '' };
    }
    const existing = await this.trialOf(email);
    const bn = input.language === 'bn';
    await this.send(
      existing
        ? {
            to: email,
            subject: bn ? 'আপনার Good People ওয়ার্কস্পেস' : 'Your Good People workspace',
            text: bn
              ? `আপনার ইমেইল দিয়ে আগেই একটি ট্রায়াল ওয়ার্কস্পেস খোলা হয়েছে: "${existing.slug}"। সাইন ইন করুন: ${this.config.WEB_ORIGIN}/login`
              : `You already started a trial workspace with this email: "${existing.slug}". Sign in at ${this.config.WEB_ORIGIN}/login`,
          }
        : {
            to: email,
            subject: bn ? `${code}: Good People-এ আপনার কোড` : `${code} is your Good People code`,
            // Nothing the form typed goes into the email: anyone can start a sign-up for any
            // address, and a name or company could carry a link in our name.
            text: bn
              ? `Good People-এ আপনার ওয়ার্কস্পেস খুলতে এই কোডটি দিন: ${code}\n\nকোডটি ${SIGNUP_CODE_MINUTES} মিনিট কাজ করবে। আপনি না চাইলে এই ইমেইলটি উপেক্ষা করুন।`
              : `Enter this code to open your workspace on Good People: ${code}\n\nIt works for ${SIGNUP_CODE_MINUTES} minutes. If you did not ask for it, ignore this email.`,
          },
    );
    return {
      signupId: row!.id,
      expiresInSeconds: SIGNUP_CODE_MINUTES * 60,
      suggestedSlug:
        (await this.checkSlug(slugFrom(input.company))).suggestion ?? slugFrom(input.company),
    };
  }

  /** Whether a workspace address is free, with a free one near it when it is not. */
  async checkSlug(slug: string): Promise<SlugCheck> {
    const wanted = slug.trim().toLowerCase();
    const valid = slugSchema.safeParse(wanted).success && !RESERVED.has(wanted);
    const base = slugFrom(wanted) || 'workspace';
    const taken = new Set(
      (
        await this.db
          .select({ slug: tenants.slug })
          .from(tenants)
          .where(like(tenants.slug, `${base.slice(0, 36)}%`))
      ).map((t) => t.slug),
    );
    const available = valid && !taken.has(wanted);
    if (available) return { slug: wanted, available, suggestion: null };
    let suggestion = RESERVED.has(base) ? `${base}-hr` : base;
    for (let n = 2; taken.has(suggestion) || RESERVED.has(suggestion); n++) {
      suggestion = `${base.slice(0, 36)}-${n}`;
    }
    return { slug: wanted, available, suggestion };
  }

  /** The code, an address and a password: the trial workspace is created and its owner signed in. */
  async verify(
    input: SignupVerifyInput,
    ip: string,
  ): Promise<{ tenant: { slug: string; name: string }; login: TenantLoginResult }> {
    this.enabled();
    this.limiter.hit(`signup-verify:${input.signupId}`, 10, 15 * MINUTE_MS);
    const [signup] = await this.db.select().from(signups).where(eq(signups.id, input.signupId));
    if (!signup || signup.tenantId) throw new NotFoundException('This sign-up is not open');
    if (signup.expiresAt.getTime() <= Date.now() || signup.attempts >= SIGNUP_CODE_ATTEMPTS) {
      throw badRequest('code_expired', 'The code has expired; start again for a new one');
    }
    if (hashCode(input.code) !== signup.codeHash) {
      await this.db
        .update(signups)
        .set({ attempts: signup.attempts + 1 })
        .where(eq(signups.id, signup.id));
      throw badRequest('code_wrong', 'That code is not right');
    }
    if (await this.trialOf(signup.email)) {
      throw conflict('trial_used', 'This email already has a trial workspace; sign in instead');
    }
    const slug = await this.checkSlug(input.slug);
    if (!slug.available) throw conflict('slug_taken', `"${input.slug}" is taken or not allowed`);

    const [plan] = await this.db.select().from(plans).where(eq(plans.code, TRIAL_PLAN));
    const passwordHash = await hashPassword(input.password);
    const tenantId = await this.db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: signup.company,
          slug: slug.slug,
          countryPack: 'BD',
          industryTemplate: signup.industryTemplate,
          billingMode: 'trial',
          planId: plan!.id,
          accessExpiresAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS),
          // Accepted by the owner whose email the code proved.
          termsVersion: signup.termsVersion,
          termsAcceptedAt: signup.termsAcceptedAt,
          termsAcceptedBy: signup.email,
        })
        .returning({ id: tenants.id });
      await tx.update(signups).set({ tenantId: tenant!.id }).where(eq(signups.id, signup.id));
      await this.audit.record(tx, {
        actorId: null,
        action: 'tenant.signup',
        tenantId: tenant!.id,
        reason: 'Self-serve sign-up',
        after: {
          email: signup.email,
          industryTemplate: signup.industryTemplate,
          planCode: TRIAL_PLAN,
          trialDays: TRIAL_DAYS,
          termsVersion: signup.termsVersion,
          ip,
        },
      });
      await scopeToTenant(tx, tenant!.id);
      await tx.insert(tenantUsers).values({
        tenantId: tenant!.id,
        email: signup.email,
        name: signup.name,
        passwordHash,
        role: 'tenant_admin',
        language: signup.language,
      });
      await provisionCountryDefaults(tx, tenant!.id, { countryPack: 'BD', today: todayIn() });
      await provisionIndustryTemplate(tx, tenant!.id, {
        template: signup.industryTemplate,
        company: signup.company,
      });
      return tenant!.id;
    });
    this.logger.log(`Trial workspace ${slug.slug} (${tenantId}) signed up`);
    const bn = signup.language === 'bn';
    await this.send({
      to: signup.email,
      subject: bn
        ? 'আপনার Good People ওয়ার্কস্পেস প্রস্তুত'
        : 'Your Good People workspace is ready',
      text: bn
        ? `${signup.company}-এর ওয়ার্কস্পেস "${slug.slug}" প্রস্তুত। ${TRIAL_DAYS} দিনের ট্রায়ালে সব মডিউল ব্যবহার করুন। সাইন ইন: ${this.config.WEB_ORIGIN}/login`
        : `${signup.company}'s workspace "${slug.slug}" is ready, with every module for ${TRIAL_DAYS} days. Sign in at ${this.config.WEB_ORIGIN}/login`,
    });
    return {
      tenant: { slug: slug.slug, name: signup.company },
      login: await this.auth.loginTenant(
        { tenant: slug.slug, email: signup.email, password: input.password },
        ip,
      ),
    };
  }

  /** Sign-ups for the platform console, newest first. */
  async list(limit = 200): Promise<SignupView[]> {
    const rows = await this.db
      .select({ signup: signups, slug: tenants.slug })
      .from(signups)
      .leftJoin(tenants, eq(tenants.id, signups.tenantId))
      .orderBy(desc(signups.createdAt))
      .limit(limit);
    const now = Date.now();
    return rows.map(({ signup, slug }) => ({
      id: signup.id,
      name: signup.name,
      email: signup.email,
      company: signup.company,
      industryTemplate: signup.industryTemplate,
      stage: signup.tenantId
        ? 'workspace_created'
        : signup.expiresAt.getTime() <= now
          ? 'expired'
          : 'code_sent',
      tenant: signup.tenantId && slug ? { id: signup.tenantId, slug } : null,
      termsVersion: signup.termsVersion,
      createdAt: signup.createdAt.toISOString(),
    }));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private enabled() {
    if (!this.config.SIGNUP_ENABLED) {
      throw new ForbiddenException({
        code: 'signup_disabled',
        message: 'Sign-up is not open on this server',
      });
    }
  }

  /** The trial workspace this address already signed up for, if any. */
  private async trialOf(email: string) {
    const [row] = await this.db
      .select({ slug: tenants.slug })
      .from(signups)
      .innerJoin(tenants, eq(tenants.id, signups.tenantId))
      .where(and(eq(signups.email, email), isNotNull(signups.tenantId)))
      .limit(1);
    return row ?? null;
  }

  private async send(message: EmailMessage) {
    await this.email.send(message).catch((error: Error) => {
      this.logger.error(`Sign-up email to ${message.to} failed: ${error.message}`);
    });
  }
}
