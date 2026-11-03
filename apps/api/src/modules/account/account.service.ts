import { userCan } from '../../common/roles.js';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  authSessions,
  deviceTokens,
  hashPassword,
  platformUsers,
  runAsTenant,
  tenantUsers,
  verifyPassword,
  type Database,
} from '@gp/db';
import {
  ACCESS_FIELDS,
  policyField,
  MFA_REQUIRED_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type AccountView,
  type DeviceInput,
  type MfaEnabled,
  type MfaSetup,
  type PasswordChangeInput,
  type PreferencesInput,
} from '@gp/shared';
import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { AuthService } from '../auth/auth.service.js';
import { MfaService, type Subject } from '../auth/mfa.service.js';

const subjectOf = (user: AuthUser): Subject =>
  user.kind === 'tenant'
    ? { kind: 'tenant', id: user.id, tenantId: user.tenantId }
    : { kind: 'platform', id: user.id };

/** The signed-in person's own login: password, two-step sign-in, language and devices. */
@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly limiter: RateLimiter,
  ) {}

  async view(user: AuthUser): Promise<AccountView> {
    const row = await this.load(user);
    const required =
      (this.config.REQUIRE_ADMIN_MFA &&
        (user.kind === 'platform' || MFA_REQUIRED_ROLES.includes(user.role))) ||
      (user.kind === 'tenant' &&
        !!user.policy?.grants.some((g) => g.permissions.some((p) => p.startsWith('payroll.'))));
    return {
      kind: user.kind,
      id: row.id,
      name: row.name,
      email: row.email,
      phone: 'phone' in row ? row.phone : null,
      role: row.role,
      language: 'language' in row ? row.language : 'en',
      hasPassword: !!row.passwordHash,
      mfaEnabled: !!row.mfaEnabledAt,
      mfaRequired: required,
      recoveryCodesLeft: row.mfaEnabledAt ? row.mfaRecoveryCodes.length : 0,
      ...(user.kind === 'tenant' && user.policy?.custom
        ? {
            fieldPolicy: Object.fromEntries(
              ACCESS_FIELDS.map((f) => [
                f,
                {
                  read: policyField(user.policy!, f, 'read'),
                  write: policyField(user.policy!, f, 'write'),
                  export: policyField(user.policy!, f, 'export'),
                },
              ]),
            ) as import('@gp/shared').FieldPolicy,
          }
        : {}),
      permissions:
        user.kind === 'tenant'
          ? user.policy?.custom
            ? PERMISSIONS.filter((p) => userCan(user, p))
            : [...ROLE_PERMISSIONS[user.role]]
          : [...PERMISSIONS],
    };
  }

  /** Changes the password and signs every other session out. */
  async changePassword(user: AuthUser, input: PasswordChangeInput): Promise<void> {
    await this.limiter.hit(`password:${user.id}`, 5, 15 * 60_000);
    const row = await this.load(user);
    if (!row.passwordHash || !(await verifyPassword(row.passwordHash, input.currentPassword))) {
      throw badRequest('wrong_password', 'Your current password is not right');
    }
    const passwordHash = await hashPassword(input.newPassword);
    if (user.kind === 'platform') {
      await this.db
        .update(platformUsers)
        .set({ passwordHash })
        .where(eq(platformUsers.id, user.id));
    } else {
      await runAsTenant(this.db, user.tenantId, (tx) =>
        tx.update(tenantUsers).set({ passwordHash }).where(eq(tenantUsers.id, user.id)),
      );
    }
    await this.auth.revokeAll(user.kind, user.id, input.keepRefreshToken);
  }

  async startMfa(user: AuthUser): Promise<MfaSetup> {
    const row = await this.load(user);
    if (!row.passwordHash && !user.authMethod?.startsWith('sso:')) {
      throw badRequest('mfa_needs_password', 'Two-step sign-in is for logins with a password');
    }
    return this.mfa.begin(subjectOf(user));
  }

  async confirmMfa(user: AuthUser, code: string): Promise<MfaEnabled> {
    await this.limiter.hit(`mfa:${user.id}`, 5, 15 * 60_000);
    const recoveryCodes = await this.mfa.confirm(subjectOf(user), code);
    if (user.sessionId)
      await this.db
        .update(authSessions)
        .set({ mfaAt: new Date() })
        .where(eq(authSessions.id, user.sessionId));
    return { recoveryCodes };
  }

  async disableMfa(user: AuthUser, password: string): Promise<void> {
    if ((await this.view(user)).mfaRequired) {
      throw forbidden('mfa_required', 'Your role must use two-step sign-in');
    }
    await this.limiter.hit(`password:${user.id}`, 5, 15 * 60_000);
    const row = await this.load(user);
    if (!row.passwordHash || !(await verifyPassword(row.passwordHash, password))) {
      throw badRequest('wrong_password', 'Your password is not right');
    }
    await this.mfa.disable(subjectOf(user));
  }

  async updatePreferences(user: AuthUser, input: PreferencesInput): Promise<AccountView> {
    if (user.kind !== 'tenant') throw forbidden('tenant_only', 'This is for workspace logins');
    await runAsTenant(this.db, user.tenantId, (tx) =>
      tx.update(tenantUsers).set(input).where(eq(tenantUsers.id, user.id)),
    );
    return this.view(user);
  }

  /** Registers a phone or browser for push; a token moves to whoever signed in on it last. */
  async addDevice(user: AuthUser, input: DeviceInput): Promise<void> {
    if (user.kind !== 'tenant') throw forbidden('tenant_only', 'This is for workspace logins');
    await runAsTenant(this.db, user.tenantId, (tx) =>
      tx
        .insert(deviceTokens)
        .values({ tenantId: user.tenantId, userId: user.id, ...input })
        .onConflictDoUpdate({
          target: [deviceTokens.tenantId, deviceTokens.token],
          set: { userId: user.id, platform: input.platform, lastSeenAt: new Date() },
        }),
    );
  }

  /** On sign-out, so the device stops receiving this login's notifications. */
  async removeDevice(user: AuthUser, token: string): Promise<void> {
    if (user.kind !== 'tenant') throw forbidden('tenant_only', 'This is for workspace logins');
    await runAsTenant(this.db, user.tenantId, (tx) =>
      tx
        .delete(deviceTokens)
        .where(and(eq(deviceTokens.token, token), eq(deviceTokens.userId, user.id))),
    );
  }

  private async load(user: AuthUser) {
    const [row] =
      user.kind === 'platform'
        ? await this.db.select().from(platformUsers).where(eq(platformUsers.id, user.id))
        : await runAsTenant(this.db, user.tenantId, (tx) =>
            tx.select().from(tenantUsers).where(eq(tenantUsers.id, user.id)),
          );
    if (!row) throw new UnauthorizedException('This login no longer exists');
    return row;
  }
}
