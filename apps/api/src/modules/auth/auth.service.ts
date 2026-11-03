import { enterpriseInstallations } from '@gp/db';
import { tenantPlacements } from '@gp/db';
import { ConflictException } from '@nestjs/common';
import { policyOf } from '../../common/authority.js';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  authSessions,
  authProofs,
  identityConnections,
  provisioningEvents,
  scimUsers,
  externalIdentities,
  hashPassword,
  otpChallenges,
  platformUsers,
  runAsTenant,
  tenants,
  tenantUsers,
  verifyPassword,
  type Database,
  type Tx,
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
import { and, count, desc, eq, gt, isNull, ne, sql, lt } from 'drizzle-orm';
import { forbidden } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  endSupportSessionOf,
  followRefresh,
  openSupportSession,
} from '../support-access/support-sessions.js';
import type { AccessTokenPayload } from './jwt-auth.guard.js';
import { MfaService, type Subject } from './mfa.service.js';
import { SecurityState } from '../../common/security-state.js';
import { hashCode, numericCode } from './totp.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');
const BAD_LOGIN = 'Wrong workspace, email or password';
const BAD_CODE = 'Wrong or expired code';
const stepExpired = () => new UnauthorizedException('Sign in again: this step has expired');
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
  /** Each token finishes one sign-in: a used one is refused. */
  jti: string;
  method?: string;
  revision: number;
}

type TenantRow = typeof tenants.$inferSelect;
type TenantUserRow = typeof tenantUsers.$inferSelect;
type PlatformUserRow = typeof platformUsers.$inferSelect;

/** A refresh-token session that ends by a set time, recorded with it (support access). */
export interface CappedSession {
  expiresAt: Date;
  onIssued: (tx: Tx, authSessionId: string) => Promise<unknown>;
}

export type TenantLoginResult = TenantSession | MfaChallenge | MfaSetupRequired;
export type PlatformLoginResult = PlatformSession | MfaChallenge | MfaSetupRequired;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Second-step tokens that finished a sign-in, until they would have expired anyway. */

  /** Compared against when the user does not exist, so both paths take similar time. */
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly limiter: RateLimiter,
    private readonly mfa: MfaService,
    private readonly state: SecurityState,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Passwords ──────────────────────────────────────────────────────────────

  async loginPlatform(input: PlatformLoginInput, ip: string): Promise<PlatformLoginResult> {
    if (this.config.DEPLOYMENT_MODE !== 'managed') throw new UnauthorizedException(BAD_LOGIN);
    const email = input.email.toLowerCase();
    // '@' cannot appear in a workspace slug, so platform and workspace counters never mix.
    await this.limitPassword(ip, `@platform:${email}`);
    const [user] = await this.db.select().from(platformUsers).where(eq(platformUsers.email, email));
    if (!(await this.checkPassword(user?.passwordHash, input.password)) || !user) {
      throw new UnauthorizedException('Wrong email or password');
    }
    await this.limiter.reset(`login:@platform:${email}`);
    // Every platform role can reach every workspace, so all of them count as admins.
    return this.secondStep(
      { kind: 'platform', id: user.id, revision: user.authRevision },
      user.mfaEnabledAt,
      true,
      () => this.platformSession(user),
    );
  }

  async loginTenant(input: TenantLoginInput, ip: string): Promise<TenantLoginResult> {
    const email = input.email.toLowerCase();
    await this.limitPassword(ip, `${input.tenant}:${email}`);
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, input.tenant));
    if (tenant) await this.checkDeployment(tenant.id);
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
    await this.checkCanSignIn(tenant, user);
    await this.limiter.reset(`login:${input.tenant}:${email}`);
    return this.secondStep(
      { kind: 'tenant', id: user.id, tenantId: tenant.id, revision: user.authRevision },
      user.mfaEnabledAt,
      MFA_REQUIRED_ROLES.includes(user.role),
      () => this.tenantSession(tenant, user),
      'password',
      await this.customMfaRequired(tenant.id, user),
    );
  }

  // ── Two-step sign-in ───────────────────────────────────────────────────────

  /** The authenticator (or recovery) code after a correct password. */
  async verifyMfa(input: MfaVerifyInput): Promise<TenantSession | PlatformSession> {
    const payload = await this.readMfaToken(input.mfaToken, 'mfa');
    await this.limiter.hit(`mfa:${payload.sub}`, 5, 15 * MINUTE_MS);
    const subject = this.subjectOf(payload);
    if (!(await this.mfa.check(subject, input.code))) {
      throw new UnauthorizedException(BAD_CODE);
    }
    await this.useMfaToken(payload);
    await this.limiter.reset(`mfa:${payload.sub}`);
    return this.sessionFor(subject, payload.method, new Date());
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
    await this.limiter.hit(`mfa:${payload.sub}`, 5, 15 * MINUTE_MS);
    const subject = this.subjectOf(payload);
    const recoveryCodes = await this.mfa.confirm(subject, input.code);
    await this.useMfaToken(payload);
    return { ...(await this.sessionFor(subject, payload.method, new Date())), recoveryCodes };
  }

  // ── Sign-in by SMS code ────────────────────────────────────────────────────

  /**
   * Sends a code if the number belongs to an employee login. The answer is the same either
   * way, so nobody can find out which numbers have logins.
   */
  async requestOtp(input: OtpRequestInput, ip: string): Promise<OtpRequestResult> {
    await this.limiter.hit(`otp-ip:${ip}`, 30, 60 * MINUTE_MS);
    await this.limiter.hit(`otp:${input.tenant}:${input.phone}`, 3, 15 * MINUTE_MS);
    const result: OtpRequestResult = { sent: true, expiresInSeconds: OTP_TTL_MINUTES * 60 };

    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, input.tenant));
    if (tenant) {
      try {
        await this.checkDeployment(tenant.id);
      } catch {
        return result;
      }
    }
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
    await this.limiter.hit(`otp-verify:${input.tenant}:${input.phone}`, 10, 15 * MINUTE_MS);
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, input.tenant));
    if (!tenant) throw new UnauthorizedException(BAD_CODE);
    await this.checkDeployment(tenant.id);
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
      return row?.phone === challenge.phone ? row : undefined;
    });
    if (!user) throw new UnauthorizedException(BAD_CODE);
    await this.checkCanSignIn(tenant, user);
    await this.limiter.reset(`otp-verify:${input.tenant}:${input.phone}`);
    if (user.role !== 'employee' || (await this.customMfaRequired(tenant.id, user)))
      throw new UnauthorizedException(BAD_CODE);
    return this.tenantSession(tenant, user, 'otp');
  }

  async finishFederated(
    tenantId: string,
    userId: string,
    connectionId: string,
  ): Promise<TenantLoginResult> {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, tenantId));
    await this.checkDeployment(tenantId);
    const [user] = await runAsTenant(this.db, tenantId, (tx) =>
      tx.select().from(tenantUsers).where(eq(tenantUsers.id, userId)),
    );
    if (!tenant || !user) throw new UnauthorizedException(BAD_LOGIN);
    const method = `sso:${connectionId}`;
    await this.checkCanSignIn(tenant, user, method);
    return this.secondStep(
      { kind: 'tenant', id: user.id, tenantId, revision: user.authRevision },
      user.mfaEnabledAt,
      true,
      () => this.tenantSession(tenant, user, method),
      method,
      await this.customMfaRequired(tenantId, user),
    );
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
    if (
      this.config.DEPLOYMENT_MODE !== 'managed' &&
      (session.subjectKind === 'platform' ||
        session.tenantId !== this.config.INSTALLATION_TENANT_ID)
    )
      throw new UnauthorizedException('Invalid refresh token');
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
    if (session.subjectKind === 'tenant' && payload.role !== 'support') {
      const [tenant] = await this.db
        .select()
        .from(tenants)
        .where(eq(tenants.id, session.tenantId!));
      const [user] = await runAsTenant(this.db, session.tenantId!, (tx) =>
        tx.select().from(tenantUsers).where(eq(tenantUsers.id, session.subjectId)),
      );
      if (!tenant || !user) throw new UnauthorizedException('Login no longer exists');
      await this.checkCanSignIn(tenant, user, session.authMethod);
    }
    const subject: Subject =
      session.subjectKind === 'tenant'
        ? { kind: 'tenant', id: session.subjectId, tenantId: session.tenantId! }
        : { kind: 'platform', id: session.subjectId };
    if (payload.kind === 'tenant' && payload.role === 'support') {
      // Support access lasts only while its session and the workspace's grant do, and a
      // refresh never moves its end.
      if (!(await openSupportSession(this.db, { authSessionId: session.id }))) {
        throw new UnauthorizedException('Support access to this workspace has ended');
      }
      return this.issue(
        subject,
        payload,
        session.id,
        {
          expiresAt: session.expiresAt,
          onIssued: (tx, id) => followRefresh(tx, session.id, id),
        },
        {
          method: session.authMethod,
          mfaAt: session.mfaAt ?? undefined,
          familyId: session.familyId,
          authenticatedAt: session.authenticatedAt,
        },
      );
    }
    return this.issue(subject, payload, session.id, undefined, {
      method: session.authMethod,
      mfaAt: session.mfaAt ?? undefined,
      familyId: session.familyId,
      authenticatedAt: session.authenticatedAt,
    });
  }

  /**
   * Signs Good People support into a workspace as its read-only `support` login, until
   * `capped.expiresAt` at the latest.
   */
  issueSupportSession(
    login: { id: string; tenantId: string },
    capped: CappedSession,
  ): Promise<TokenPair> {
    return this.issue(
      { kind: 'tenant', id: login.id, tenantId: login.tenantId },
      { sub: login.id, kind: 'tenant', role: 'support', tid: login.tenantId },
      undefined,
      capped,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const [session] = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, sha256(refreshToken)));
    if (!session) return;
    // The durable root marker closes a refresh that has not inserted its child yet.
    await this.db
      .update(authSessions)
      .set({ familyRevokedAt: new Date() })
      .where(eq(authSessions.id, session.familyId));
    const ended = await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(eq(authSessions.familyId, session.familyId))
      .returning({ id: authSessions.id });
    for (const row of ended) await endSupportSessionOf(this.db, row.id);
  }

  /** Revoke whole families; an explicitly retained device keeps its current family. */
  async revokeAll(kind: 'platform' | 'tenant', subjectId: string, keep?: string): Promise<void> {
    const [retained] = keep
      ? await this.db
          .select()
          .from(authSessions)
          .where(
            and(
              eq(authSessions.subjectKind, kind),
              eq(authSessions.subjectId, subjectId),
              eq(authSessions.tokenHash, sha256(keep)),
            ),
          )
      : [];
    const affected = and(
      eq(authSessions.subjectKind, kind),
      eq(authSessions.subjectId, subjectId),
      retained ? ne(authSessions.familyId, retained.familyId) : undefined,
    );
    await this.db
      .update(authSessions)
      .set({ familyRevokedAt: new Date() })
      .where(and(affected, eq(authSessions.id, authSessions.familyId)));
    await this.db.update(authSessions).set({ revokedAt: new Date() }).where(affected);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async limitPassword(ip: string, account: string) {
    await this.limiter.hit(`login-ip:${ip}`, 300, 15 * MINUTE_MS);
    await this.limiter.hit(`login:${account}`, 10, 15 * MINUTE_MS);
  }

  private async checkDeployment(tenantId: string) {
    if (this.config.DEPLOYMENT_MODE !== 'managed') {
      if (tenantId !== this.config.INSTALLATION_TENANT_ID)
        throw new UnauthorizedException(BAD_LOGIN);
      return;
    }
    const [placement] = await this.db
      .select({ webOrigin: tenantPlacements.webOrigin })
      .from(tenantPlacements)
      .where(and(eq(tenantPlacements.tenantId, tenantId), eq(tenantPlacements.status, 'active')));
    if (placement)
      throw new ConflictException({
        code: 'dedicated_workspace',
        message: 'Use the dedicated workspace sign-in page',
        routeUrl: placement.webOrigin + '/login',
      });
  }
  private async checkCanSignIn(tenant: TenantRow, user: TenantUserRow, method = 'password') {
    await this.checkDeployment(tenant.id);
    if (this.config.DEPLOYMENT_MODE !== 'managed') {
      const [installation] = await this.db
        .select({ pending: enterpriseInstallations.recoveryPending })
        .from(enterpriseInstallations)
        .where(eq(enterpriseInstallations.id, this.config.INSTALLATION_ID!));
      if (
        installation?.pending &&
        (!user.emergencyLocal || user.role !== 'tenant_admin' || method !== 'password')
      )
        throw new UnauthorizedException('Installation recovery is awaiting reconciliation');
    }
    if (tenant.status === 'suspended' || tenant.status === 'archived') {
      throw forbidden('tenant_suspended', 'This workspace is suspended');
    }
    if (user.disabledAt || user.provisionDisabled) {
      throw forbidden('login_disabled', 'This login is no longer active');
    }
    // Support's read-only login is opened from the console only, never signed in to.
    if (user.role === 'support') throw new UnauthorizedException(BAD_LOGIN);
    await runAsTenant(this.db, tenant.id, async (tx) => {
      if (method.startsWith('sso:')) {
        const [connection] = await tx
          .select()
          .from(identityConnections)
          .where(
            and(eq(identityConnections.id, method.slice(4)), eq(identityConnections.enabled, true)),
          );
        if (!connection) throw forbidden('sso_required', 'The identity connection is disabled');
      }
      if (user.emergencyLocal) return;
      const linked = await tx
        .select({ id: identityConnections.id })
        .from(identityConnections)
        .innerJoin(externalIdentities, eq(externalIdentities.connectionId, identityConnections.id))
        .where(and(eq(identityConnections.enforced, true), eq(externalIdentities.userId, user.id)));
      const managed = await tx
        .select({ connectionId: scimUsers.connectionId })
        .from(scimUsers)
        .where(eq(scimUsers.userId, user.id));
      if (
        (linked.length && !linked.some((c) => method === `sso:${c.id}`)) ||
        (managed.length && !managed.some((c) => method === `sso:${c.connectionId}`))
      )
        throw forbidden('sso_required', 'Use your organisation’s single sign-on');
    });
  }

  /** After a right password: a second step if the login has one or must set one up. */
  private async secondStep<S>(
    subject: Subject,
    mfaEnabledAt: Date | null,
    isAdmin: boolean,
    session: () => Promise<S>,
    method = 'password',
    forceMfa = false,
  ): Promise<S | MfaChallenge | MfaSetupRequired> {
    if (mfaEnabledAt)
      return { mfaRequired: true, mfaToken: await this.mfaToken(subject, 'mfa', method) };
    if (forceMfa || (this.config.REQUIRE_ADMIN_MFA && isAdmin)) {
      return {
        mfaSetupRequired: true,
        mfaToken: await this.mfaToken(subject, 'mfa-setup', method),
      };
    }
    return session();
  }

  private mfaToken(subject: Subject, typ: MfaTokenPayload['typ'], method: string): Promise<string> {
    const payload: MfaTokenPayload = {
      sub: subject.id,
      kind: subject.kind,
      ...(subject.kind === 'tenant' ? { tid: subject.tenantId } : {}),
      typ,
      jti: randomUUID(),
      method,
      revision: subject.revision ?? -1,
    };
    return this.jwt.signAsync(payload, { secret: this.mfaSecret(), expiresIn: MFA_TOKEN_SECONDS });
  }

  /** Marks a second-step token used; a replay (even one racing this call) is refused. */
  private async useMfaToken(payload: MfaTokenPayload): Promise<void> {
    if (!(await this.state.once(`mfa-token:${payload.jti}`, MFA_TOKEN_SECONDS * 1000)))
      throw stepExpired();
    await this.db.delete(authProofs).where(lt(authProofs.expiresAt, new Date()));
    const used = await this.db
      .insert(authProofs)
      .values({
        hash: sha256(`mfa:${payload.jti}`),
        kind: 'mfa',
        expiresAt: new Date(Date.now() + MFA_TOKEN_SECONDS * 1000),
      })
      .onConflictDoNothing()
      .returning();
    if (!used.length) throw stepExpired();
  }

  private async readMfaToken(token: string, typ: MfaTokenPayload['typ']): Promise<MfaTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<MfaTokenPayload>(token, {
        secret: this.mfaSecret(),
        algorithms: ['HS256'],
      });
      if (
        this.config.DEPLOYMENT_MODE !== 'managed' &&
        (payload.kind === 'platform' || payload.tid !== this.config.INSTALLATION_TENANT_ID)
      )
        throw stepExpired();
      if (payload.typ === typ && payload.jti && ['platform', 'tenant'].includes(payload.kind)) {
        const [used] = await this.db
          .select({ hash: authProofs.hash })
          .from(authProofs)
          .where(eq(authProofs.hash, sha256(`mfa:${payload.jti}`)));
        const current = await this.proofRevision(this.subjectOf(payload));
        if (!used && payload.revision === current) return payload;
      }
    } catch {
      /* same public error for invalid challenges */
    }
    throw stepExpired();
  }

  /** A key of its own, so a second-step token can never pass as an access token. */
  private mfaSecret() {
    return sha256(`${this.config.JWT_ACCESS_SECRET}:mfa`);
  }

  private subjectOf(payload: MfaTokenPayload): Subject {
    return payload.kind === 'tenant'
      ? { kind: 'tenant', id: payload.sub, tenantId: payload.tid!, revision: payload.revision }
      : { kind: 'platform', id: payload.sub, revision: payload.revision };
  }

  private async sessionFor(
    subject: Subject,
    method = 'password',
    mfaAt?: Date,
  ): Promise<TenantSession | PlatformSession> {
    if (subject.revision !== undefined && subject.revision !== (await this.proofRevision(subject)))
      throw stepExpired();
    if (subject.kind === 'platform') {
      const [user] = await this.db
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.id, subject.id));
      if (!user) throw new UnauthorizedException('User no longer exists');
      if (subject.revision !== undefined && user.authRevision !== subject.revision)
        throw stepExpired();
      return this.platformSession(user, mfaAt);
    }
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, subject.tenantId));
    const user = await runAsTenant(this.db, subject.tenantId, async (tx) => {
      const [row] = await tx.select().from(tenantUsers).where(eq(tenantUsers.id, subject.id));
      return row;
    });
    if (!tenant || !user) throw new UnauthorizedException('User no longer exists');
    if (subject.revision !== undefined && user.authRevision !== subject.revision)
      throw stepExpired();
    await this.checkCanSignIn(tenant, user, method);
    return this.tenantSession(tenant, user, method, mfaAt);
  }

  private async tenantSession(
    tenant: TenantRow,
    user: TenantUserRow,
    method = 'password',
    mfaAt?: Date,
  ): Promise<TenantSession> {
    const tokens = await this.issue(
      { kind: 'tenant', id: user.id, tenantId: tenant.id, revision: user.authRevision },
      { sub: user.id, kind: 'tenant', role: user.role, tid: tenant.id },
      undefined,
      undefined,
      { method, mfaAt },
    );
    await runAsTenant(this.db, tenant.id, (tx) =>
      tx.update(tenantUsers).set({ lastSignInAt: new Date() }).where(eq(tenantUsers.id, user.id)),
    );
    if (user.emergencyLocal && !method.startsWith('sso:'))
      await runInTenantContext(tenant.id, () =>
        runAsTenant(this.db, tenant.id, async (tx) => {
          await tx.insert(provisioningEvents).values({
            tenantId: tenant.id,
            actorId: user.id,
            actorKind: 'user',
            action: 'identity.emergency_used',
            resourceId: user.id,
          });
          const admins = await tx
            .select({ id: tenantUsers.id })
            .from(tenantUsers)
            .where(and(eq(tenantUsers.role, 'tenant_admin'), isNull(tenantUsers.disabledAt)));
          await this.notifications.notify(tx, {
            event: 'identity.emergency_used',
            recipients: admins.map((a) => ({ userId: a.id })),
            values: { 'person.name': user.name },
            link: '/workspace/identity',
          });
        }),
      );
    return {
      ...tokens,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }

  private async platformSession(user: PlatformUserRow, mfaAt?: Date): Promise<PlatformSession> {
    const tokens = await this.issue(
      { kind: 'platform', id: user.id, revision: user.authRevision },
      { sub: user.id, kind: 'platform', role: user.role },
      undefined,
      undefined,
      { method: 'password', mfaAt },
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

  private async proofRevision(subject: Subject): Promise<number> {
    if (subject.kind === 'platform') {
      const [user] = await this.db
        .select({ revision: platformUsers.authRevision })
        .from(platformUsers)
        .where(eq(platformUsers.id, subject.id));
      return user?.revision ?? -2;
    }
    const [user] = await runAsTenant(this.db, subject.tenantId, (tx) =>
      tx
        .select({ revision: tenantUsers.authRevision })
        .from(tenantUsers)
        .where(eq(tenantUsers.id, subject.id)),
    );
    return user?.revision ?? -2;
  }

  private async customMfaRequired(tenantId: string, user: TenantUserRow): Promise<boolean> {
    if (user.emergencyLocal) return true;
    if (user.accessMode !== 'custom') return false;
    return runAsTenant(this.db, tenantId, async (tx) =>
      (await policyOf(tx, user)).grants.some((g) =>
        g.permissions.some((p) => p.startsWith('payroll.')),
      ),
    );
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
    if (user.disabledAt || user.provisionDisabled)
      throw new UnauthorizedException('This login is no longer active');
    return { sub: user.id, kind: 'tenant', role: user.role, tid: tenantId! };
  }

  private async issue(
    subject: Subject,
    payload: AccessTokenPayload,
    replaces?: string,
    capped?: CappedSession,
    proof: { method: string; mfaAt?: Date; familyId?: string; authenticatedAt?: Date } = {
      method: 'password',
    },
  ): Promise<TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt =
      capped?.expiresAt ?? new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    let sessionId: string;
    const issuedId = randomUUID(),
      familyId = proof.familyId ?? issuedId;
    await this.db.transaction(async (tx) => {
      if (subject.kind === 'tenant') {
        await tx.execute(sql`select set_config('app.tenant_id', ${subject.tenantId}, true)`);
        const [login] = await tx
          .select()
          .from(tenantUsers)
          .where(eq(tenantUsers.id, subject.id))
          .for('share');
        if (
          !login ||
          login.disabledAt ||
          login.provisionDisabled ||
          (subject.revision !== undefined && login.authRevision !== subject.revision)
        )
          throw new UnauthorizedException('Login no longer active');
      }
      if (subject.kind === 'platform') {
        const [login] = await tx
          .select()
          .from(platformUsers)
          .where(eq(platformUsers.id, subject.id))
          .for('share');
        if (!login || (subject.revision !== undefined && login.authRevision !== subject.revision))
          throw new UnauthorizedException('Login proof changed');
      }
      if (proof.familyId) {
        const [root] = await tx
          .select()
          .from(authSessions)
          .where(eq(authSessions.id, familyId))
          .for('update');
        if (
          !root ||
          root.familyRevokedAt ||
          root.subjectId !== subject.id ||
          root.subjectKind !== subject.kind
        )
          throw new UnauthorizedException('Session family has ended');
      }
      const [created] = await tx
        .insert(authSessions)
        .values({
          id: issuedId,
          subjectKind: subject.kind,
          subjectId: subject.id,
          tenantId: subject.kind === 'tenant' ? subject.tenantId : null,
          tokenHash: sha256(refreshToken),
          familyId,
          authMethod: proof.method,
          mfaAt: proof.mfaAt ?? null,
          authenticatedAt: proof.authenticatedAt ?? new Date(),
          expiresAt,
        })
        .returning({ id: authSessions.id });
      if (replaces) {
        // Only one refresh can rotate a token: a second one at the same moment waits for the
        // row, finds it rotated and is refused (the new session rolls back). A later reuse
        // is caught as a leak by refresh().
        const [rotated] = await tx
          .update(authSessions)
          .set({ revokedAt: new Date(), replacedBy: created!.id })
          .where(and(eq(authSessions.id, replaces), isNull(authSessions.revokedAt)))
          .returning({ id: authSessions.id });
        if (!rotated) throw new UnauthorizedException('This session was just renewed');
      }
      sessionId = created!.id;
      await capped?.onIssued(tx, created!.id);
    });
    const accessToken = await this.jwt.signAsync(
      { ...payload, sid: sessionId!, typ: 'access' },
      {
        issuer: 'good-people',
        audience: 'gp-human',
        algorithm: 'HS256',
        keyid: this.config.JWT_ACCESS_KEY_ID,
        expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
      },
    );
    return { accessToken, refreshToken, expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS };
  }
}
