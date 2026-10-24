import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  authSessions,
  hashPassword,
  platformUsers,
  runAsTenant,
  tenants,
  tenantUsers,
  verifyPassword,
  type Database,
} from '@gp/db';
import type {
  PlatformLoginInput,
  PlatformSession,
  TenantLoginInput,
  TenantSession,
  TokenPair,
} from '@gp/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { forbidden } from '../../common/errors.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import type { AccessTokenPayload } from './jwt-auth.guard.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');
const BAD_LOGIN = 'Wrong workspace, email or password';

type Subject = { kind: 'platform'; id: string } | { kind: 'tenant'; id: string; tenantId: string };

@Injectable()
export class AuthService {
  /** Compared against when the user does not exist, so both paths take similar time. */
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  async loginPlatform(input: PlatformLoginInput): Promise<PlatformSession> {
    const [user] = await this.db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.email, input.email.toLowerCase()));
    if (!(await this.checkPassword(user?.passwordHash, input.password)) || !user) {
      throw new UnauthorizedException('Wrong email or password');
    }
    const tokens = await this.issue(
      { kind: 'platform', id: user.id },
      {
        sub: user.id,
        kind: 'platform',
        role: user.role,
      },
    );
    return {
      ...tokens,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  async loginTenant(input: TenantLoginInput): Promise<TenantSession> {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, input.tenant));
    const user = tenant
      ? await runAsTenant(this.db, tenant.id, async (tx) => {
          const [row] = await tx
            .select()
            .from(tenantUsers)
            .where(eq(tenantUsers.email, input.email.toLowerCase()));
          return row;
        })
      : undefined;
    if (!(await this.checkPassword(user?.passwordHash, input.password)) || !user || !tenant) {
      throw new UnauthorizedException(BAD_LOGIN);
    }
    if (tenant.status === 'suspended' || tenant.status === 'archived') {
      throw forbidden('tenant_suspended', 'This workspace is suspended');
    }
    const tokens = await this.issue(
      { kind: 'tenant', id: user.id, tenantId: tenant.id },
      {
        sub: user.id,
        kind: 'tenant',
        role: user.role,
        tid: tenant.id,
      },
    );
    return {
      ...tokens,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }

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
      await this.db
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(authSessions.subjectKind, session.subjectKind),
            eq(authSessions.subjectId, session.subjectId),
            isNull(authSessions.revokedAt),
          ),
        );
      throw new UnauthorizedException('Refresh token reuse detected; signed out everywhere');
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
    const tokens = await this.issue(subject, payload, session.id);
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.tokenHash, sha256(refreshToken)), isNull(authSessions.revokedAt)));
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
