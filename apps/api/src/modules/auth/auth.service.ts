import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  authSessions,
  hashPassword,
  otpChallenges,
  platformUsers,
  runAsTenant,
  tenants,
  tenantUsers,
  verifyPassword,
  type Database,
} from '@gp/db';
import {
  MFA_REQUIRED_ROLES,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  type MfaChallenge,
  type MfaEnrollInput,
  type MfaSetup,
  type MfaSetupRequired,
  type MfaVerifyInput,
  type OtpRequestInput,
  type OtpRequestResult,
  type OtpVerifyInput,
  type PlatformLoginInput,
  type PlatformSession,
  type TenantLoginInput,
  type TenantSession,
  type TokenPair,
} from '@gp/shared';
import { and, count, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { forbidden } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AccessTokenPayload } from './jwt-auth.guard.js';
import { MfaService, type Subject } from './mfa.service.js';
import { hashCode, numericCode } from './totp.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');
const BAD_LOGIN = 'Wrong workspace, email or password';
const BAD_CODE = 'Wrong or expired code';
/** How long the step between the password and the second factor may take. */
const MFA_TOKEN_SECONDS = 5 * 60;
/** Sign-in codes per number per day, on top of the per-15-minute limit. */
const OTP_DAILY_LIMIT = 10;

/** Proof of a correct password while the second step is pending. Never an access token. */
interface MfaTokenPayload {
  sub: string;
  kind: 'platform' | 'tenant';
  tid?: string;
  typ: 'mfa' | 'mfa-setup';
}

type TenantRow = typeof tenants.$inferSelect;
type TenantUserRow = typeof tenantUsers.$inferSelect;
type PlatformUserRow = typeof platformUsers.$inferSelect;

export type TenantLoginResult = TenantSession | MfaChallenge | MfaSetupRequired;
export type PlatformLoginResult = PlatformSession | MfaChallenge | MfaSetupRequired;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Compared against when the user does not exist, so both paths take similar time. */
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly limiter: RateLimiter,
    private readonly mfa: MfaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Passwords ──────────────────────────────────────────────────────────────

  async loginPlatform(input: PlatformLoginInput, ip: string): Promise<PlatformLoginResult> {
    const email = input.email.toLowerCase();
    // '@' cannot appear in a workspace slug, so platform and workspace counters never mix.
    this.limitPassword(ip, `@platform:${email}`);
    const [user] = await this.db.select().from(platformUsers).where(eq(platformUsers.email, email));
    if (!(await this.checkPassword(user?.passwordHash, input.password)) || !user) {
      throw new UnauthorizedException('Wrong email or password');
    }
    this.limiter.reset(`login:@platform:${email}`);
    // Every platform role can reach every workspace, so all of them count as admins.
    return this.secondStep({ kind: 'platform', id: user.id }, user.mfaEnabledAt, true, () =>
      this.platformSession(user),
    );
  }

  async loginTenant(input: TenantLoginInput, ip: string): Promise<TenantLoginResult> {
    const email = input.email.toLowerCase();
    this.limitPassword(ip, `${input.tenant}:${email}`);
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, input.tenant));
    const user = tenant
      ? await runAsTenant(this.db, tenant.id, async (tx) => {
          const [row] = await tx.select().from(tenantUsers).where(eq(tenantUsers.email, email));
          return row;
        })
      : undefined;
    if (
      !(await this.checkPassword(user?.passwordHash ?? undefined, input.password)) ||
      !user ||
      !tenant
    ) {
      throw new UnauthorizedException(BAD_LOGIN);
    }
    this.checkCanSignIn(tenant, user);
    this.limiter.reset(`login:${input.tenant}:${email}`);
    return this.secondStep(
      { kind: 'tenant', id: user.id, tenantId: tenant.id },
      user.mfaEnabledAt,
      MFA_REQUIRED_ROLES.includes(user.role),
      () => this.tenantSession(tenant, user),
    );
  }

  // ── Two-step sign-in ───────────────────────────────────────────────────────

  /** The authenticator (or recovery) code after a correct password. */
  async verifyMfa(input: MfaVerifyInput): Promise<TenantSession | PlatformSession> {
    const payload = await this.readMfaToken(input.mfaToken, 'mfa');
    this.limiter.hit(`mfa:${payload.sub}`, 5, 15 * MINUTE_MS);
    const subject = this.subjectOf(payload);
    if (!(await this.mfa.check(subject, input.code))) {
      throw new UnauthorizedException(BAD_CODE);
    }
    this.limiter.reset(`mfa:${payload.sub}`);
    return this.sessionFor(subject);
  }

  /** An admin who must use two-step sign-in sets it up as part of signing in. */
  async enrollStart(mfaToken: string): Promise<MfaSetup> {
    const payload = await this.readMfaToken(mfaToken, 'mfa-setup');
    return this.mfa.begin(this.subjectOf(payload));
  }

  async enroll(
    input: MfaEnrollInput,
  ): Promise<(TenantSession | PlatformSession) & { recoveryCodes: string[] }> {
    const payload = await this.readMfaToken(input.mfaToken, 'mfa-setup');
    this.limiter.hit(`mfa:${payload.sub}`, 5, 15 * MINUTE_MS);
    const subject = this.subjectOf(payload);
    const recoveryCodes = await this.mfa.confirm(subject, input.code);
    return { ...(await this.sessionFor(subject)), recoveryCodes };
  }

  // ── Sign-in by SMS code ────────────────────────────────────────────────────

  /**
   * Sends a code if the number belongs to an employee login. The answer is the same either
   * way, so nobody can find out which numbers have logins.
   */
  async requestOtp(input: OtpRequestInput, ip: string): Promise<OtpRequestResult> {
    this.limiter.hit(`otp-ip:${ip}`, 30, 60 * MINUTE_MS);
    this.limiter.hit(`otp:${input.tenant}:${input.phone}`, 3, 15 * MINUTE_MS);
    const result: OtpRequestResult = { sent: true, expiresInSeconds: OTP_TTL_MINUTES * 60 };

    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, input.tenant));
    if (!tenant || tenant.status === 'suspended' || tenant.status === 'archived') return result;
    const code = numericCode(OTP_LENGTH);
    const user = await runAsTenant(this.db, tenant.id, async (tx) => {
      const [row] = await tx
        .select()
        .from(tenantUsers)
        .where(and(eq(tenantUsers.phone, input.phone), isNull(tenantUsers.disabledAt)));
      // Staff sign in with a password (and a second step); codes are for self-service logins.
      if (!row || row.role !== 'employee') return undefined;
      const [today] = await tx
        .select({ n: count() })
        .from(otpChallenges)
        .where(
          and(
            eq(otpChallenges.phone, input.phone),
            gt(otpChallenges.createdAt, new Date(Date.now() - DAY_MS)),
          ),
        );
      if ((today?.n ?? 0) >= OTP_DAILY_LIMIT) return undefined;
      await tx.insert(otpChallenges).values({
        tenantId: tenant.id,
        userId: row.id,
        phone: input.phone,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * MINUTE_MS),
      });
      return row;
    });
    if (!user) return result;
    // Not awaited: waiting for the SMS gateway would make known numbers answer more slowly.
    void runInTenantContext(tenant.id, () =>
      this.notifications.sendSignInCode({
        phone: input.phone,
        code,
        language: user.language,
        workspaceName: tenant.name,
      }),
    ).catch((error: unknown) => this.logger.error('Sending a sign-in code failed', error as Error));
    return result;
  }

  async verifyOtp(input: OtpVerifyInput): Promise<TenantSession> {
    this.limiter.hit(`otp-verify:${input.tenant}:${input.phone}`, 10, 15 * MINUTE_MS);
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, input.tenant));
    if (!tenant) throw new UnauthorizedException(BAD_CODE);
    const user = await runAsTenant(this.db, tenant.id, async (tx) => {
      const [challenge] = await tx
        .select()
        .from(otpChallenges)
        .where(
          and(
            eq(otpChallenges.phone, input.phone),
            isNull(otpChallenges.consumedAt),
            gt(otpChallenges.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(otpChallenges.createdAt))
        .limit(1)
        .for('update');
      if (!challenge) return undefined;
      const attempts = challenge.attempts + 1;
      const right = timingSafeEqual(
        Buffer.from(hashCode(input.code)),
        Buffer.from(challenge.codeHash),
      );
      await tx
        .update(otpChallenges)
        .set({
          attempts,
          // Used, or too many wrong guesses: either way this code is finished.
          consumedAt: right || attempts >= OTP_MAX_ATTEMPTS ? new Date() : null,
        })
        .where(eq(otpChallenges.id, challenge.id));
      if (!right) return undefined;
      const [row] = await tx.select().from(tenantUsers).where(eq(tenantUsers.id, challenge.userId));
      return row;
    });
    if (!user) throw new UnauthorizedException(BAD_CODE);
    this.checkCanSignIn(tenant, user);
    this.limiter.reset(`otp-verify:${input.tenant}:${input.phone}`);
    return this.tenantSession(tenant, user);
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  /**
   * Rotates the refresh token. Presenting an already-rotated token means it leaked, so every
   * session of that user is revoked.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const [session] = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, sha256(refreshToken)));
    if (!session) throw new UnauthorizedException('Invalid refresh token');
    if (session.revokedAt) {
      // A token that was rotated is being used again: it leaked. One that was signed out
      // (logout, password change, disabled login) is simply no longer valid.
      if (session.replacedBy) {
        await this.revokeAll(session.subjectKind, session.subjectId);
        throw new UnauthorizedException('Refresh token reuse detected; signed out everywhere');
      }
      throw new UnauthorizedException('This session has ended; sign in again');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const payload = await this.currentPayload(
      session.subjectKind,
      session.subjectId,
      session.tenantId,
    );
    const subject: Subject =
      session.subjectKind === 'tenant'
        ? { kind: 'tenant', id: session.subjectId, tenantId: session.tenantId! }
        : { kind: 'platform', id: session.subjectId };
    return this.issue(subject, payload, session.id);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.tokenHash, sha256(refreshToken)), isNull(authSessions.revokedAt)));
  }

  /**
   * Signs a login out everywhere, e.g. after a password change or when it is disabled;
   * `keep` is the refresh token of the session making the change, which stays signed in.
   */
  async revokeAll(kind: 'platform' | 'tenant', subjectId: string, keep?: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authSessions.subjectKind, kind),
          eq(authSessions.subjectId, subjectId),
          isNull(authSessions.revokedAt),
          keep ? ne(authSessions.tokenHash, sha256(keep)) : undefined,
        ),
      );
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private limitPassword(ip: string, account: string) {
    this.limiter.hit(`login-ip:${ip}`, 300, 15 * MINUTE_MS);
    this.limiter.hit(`login:${account}`, 10, 15 * MINUTE_MS);
  }

  private checkCanSignIn(tenant: TenantRow, user: TenantUserRow) {
    if (tenant.status === 'suspended' || tenant.status === 'archived') {
      throw forbidden('tenant_suspended', 'This workspace is suspended');
    }
    if (user.disabledAt) {
      throw forbidden('login_disabled', 'This login is no longer active');
    }
  }

  /** After a right password: a second step if the login has one or must set one up. */
  private async secondStep<S>(
    subject: Subject,
    mfaEnabledAt: Date | null,
    isAdmin: boolean,
    session: () => Promise<S>,
  ): Promise<S | MfaChallenge | MfaSetupRequired> {
    if (mfaEnabledAt) return { mfaRequired: true, mfaToken: await this.mfaToken(subject, 'mfa') };
    if (this.config.REQUIRE_ADMIN_MFA && isAdmin) {
      return { mfaSetupRequired: true, mfaToken: await this.mfaToken(subject, 'mfa-setup') };
    }
    return session();
  }

  private mfaToken(subject: Subject, typ: MfaTokenPayload['typ']): Promise<string> {
    const payload: MfaTokenPayload = {
      sub: subject.id,
      kind: subject.kind,
      ...(subject.kind === 'tenant' ? { tid: subject.tenantId } : {}),
      typ,
    };
    return this.jwt.signAsync(payload, { secret: this.mfaSecret(), expiresIn: MFA_TOKEN_SECONDS });
  }

  private async readMfaToken(token: string, typ: MfaTokenPayload['typ']): Promise<MfaTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<MfaTokenPayload>(token, {
        secret: this.mfaSecret(),
      });
      if (payload.typ === typ) return payload;
    } catch {
      // Falls through to the same answer as a wrong type.
    }
    throw new UnauthorizedException('Sign in again: this step has expired');
  }

  /** A key of its own, so a second-step token can never pass as an access token. */
  private mfaSecret() {
    return sha256(`${this.config.JWT_ACCESS_SECRET}:mfa`);
  }

  private subjectOf(payload: MfaTokenPayload): Subject {
    return payload.kind === 'tenant'
      ? { kind: 'tenant', id: payload.sub, tenantId: payload.tid! }
      : { kind: 'platform', id: payload.sub };
  }

  private async sessionFor(subject: Subject): Promise<TenantSession | PlatformSession> {
    if (subject.kind === 'platform') {
      const [user] = await this.db
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.id, subject.id));
      if (!user) throw new UnauthorizedException('User no longer exists');
      return this.platformSession(user);
    }
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, subject.tenantId));
    const user = await runAsTenant(this.db, subject.tenantId, async (tx) => {
      const [row] = await tx.select().from(tenantUsers).where(eq(tenantUsers.id, subject.id));
      return row;
    });
    if (!tenant || !user) throw new UnauthorizedException('User no longer exists');
    this.checkCanSignIn(tenant, user);
    return this.tenantSession(tenant, user);
  }

  private async tenantSession(tenant: TenantRow, user: TenantUserRow): Promise<TenantSession> {
    const tokens = await this.issue(
      { kind: 'tenant', id: user.id, tenantId: tenant.id },
      { sub: user.id, kind: 'tenant', role: user.role, tid: tenant.id },
    );
    await runAsTenant(this.db, tenant.id, (tx) =>
      tx.update(tenantUsers).set({ lastSignInAt: new Date() }).where(eq(tenantUsers.id, user.id)),
    );
    return {
      ...tokens,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }

  private async platformSession(user: PlatformUserRow): Promise<PlatformSession> {
    const tokens = await this.issue(
      { kind: 'platform', id: user.id },
      { sub: user.id, kind: 'platform', role: user.role },
    );
    await this.db
      .update(platformUsers)
      .set({ lastSignInAt: new Date() })
      .where(eq(platformUsers.id, user.id));
    return {
      ...tokens,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  private async checkPassword(hash: string | undefined, password: string): Promise<boolean> {
    if (hash) return verifyPassword(hash, password);
    this.dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
    await verifyPassword(await this.dummyHash, password);
    return false;
  }

  /** Re-reads the user so a role change or removal takes effect at the next refresh. */
  private async currentPayload(
    kind: 'platform' | 'tenant',
    subjectId: string,
    tenantId: string | null,
  ): Promise<AccessTokenPayload> {
    if (kind === 'platform') {
      const [user] = await this.db
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.id, subjectId));
      if (!user) throw new UnauthorizedException('User no longer exists');
      return { sub: user.id, kind: 'platform', role: user.role };
    }
    const user = await runAsTenant(this.db, tenantId!, async (tx) => {
      const [row] = await tx.select().from(tenantUsers).where(eq(tenantUsers.id, subjectId));
      return row;
    });
    if (!user) throw new UnauthorizedException('User no longer exists');
    if (user.disabledAt) throw new UnauthorizedException('This login is no longer active');
    return { sub: user.id, kind: 'tenant', role: user.role, tid: tenantId! };
  }

  private async issue(
    subject: Subject,
    payload: AccessTokenPayload,
    replaces?: string,
  ): Promise<TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(authSessions)
        .values({
          subjectKind: subject.kind,
          subjectId: subject.id,
          tenantId: subject.kind === 'tenant' ? subject.tenantId : null,
          tokenHash: sha256(refreshToken),
          expiresAt,
        })
        .returning({ id: authSessions.id });
      if (replaces) {
        await tx
          .update(authSessions)
          .set({ revokedAt: new Date(), replacedBy: created!.id })
          .where(eq(authSessions.id, replaces));
      }
    });
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
    });
    return { accessToken, refreshToken, expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS };
  }
}
