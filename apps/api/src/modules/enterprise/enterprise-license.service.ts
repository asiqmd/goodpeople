import { Inject, Injectable, ConflictException, OnApplicationBootstrap } from '@nestjs/common';
import {
  enterpriseInstallations,
  installationEvents,
  installationInvitations,
  tenantUsers,
  tenants,
  hashPassword,
  importInstallationLicense,
  readInstallationLicense,
  installationHistory,
  RLS_TABLES,
  type Database,
} from '@gp/db';
import { type EnterpriseOverview } from '@gp/shared';
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { DB, TenantDb } from '../../db/db.module.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { identityAdmin } from '../identity/identity.service.js';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { SecurityState } from '../../common/security-state.js';
@Injectable()
export class EnterpriseLicenseService implements OnApplicationBootstrap {
  constructor(
    @Inject(DB) private db: Database,
    @Inject(APP_CONFIG) private config: AppConfig,
    private tenantDb: TenantDb,
    private security: SecurityState,
  ) {}
  binding() {
    if (this.config.DEPLOYMENT_MODE === 'managed')
      throw badRequest('managed_installation', 'This is a managed deployment');
    return {
      installationId: this.config.INSTALLATION_ID!,
      tenantId: this.config.INSTALLATION_TENANT_ID!,
      keys: this.config.LICENSE_PUBLIC_KEYS_JSON,
    };
  }
  async onApplicationBootstrap() {
    if (this.config.DEPLOYMENT_MODE === 'managed') {
      const installed = await this.db
        .select({ id: enterpriseInstallations.id })
        .from(enterpriseInstallations)
        .limit(1);
      if (installed.length) throw new Error('An installed database cannot start in managed mode');
      return;
    }
    const binding = this.binding();
    const role = await this.db.execute(
      sql`select rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,has_schema_privilege(current_user,'public','CREATE') schema_create from pg_roles where rolname=current_user`,
    );
    if (Object.values(role.rows[0]!).some(Boolean))
      throw new Error('Installed API must use a separate unprivileged application role');
    const rls = await this.db.execute(
      sql`select count(*)::int n from pg_class where relname in (${sql.join(
        RLS_TABLES.map((name) => sql`${name}`),
        sql`,`,
      )}) and relrowsecurity and relforcerowsecurity`,
    );
    if (Number(rls.rows[0]!.n) !== RLS_TABLES.length)
      throw new Error('Tenant row-level security is incomplete');
    const foreign = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(ne(tenants.id, binding.tenantId))
      .limit(1);
    if (foreign.length)
      throw new Error('Installed deployment must use a database dedicated to its bound tenant');
    const [row] = await this.db
      .select()
      .from(enterpriseInstallations)
      .where(eq(enterpriseInstallations.id, binding.installationId));
    if (row && (row.tenantId !== binding.tenantId || row.mode !== this.config.DEPLOYMENT_MODE))
      throw new Error('Installation binding does not match this deployment');
  }
  async overview(actor: AuthUser): Promise<EnterpriseOverview> {
    identityAdmin(actor, false);
    if (this.config.DEPLOYMENT_MODE === 'managed')
      return {
        mode: 'managed',
        release: this.config.RELEASE_VERSION,
        installationId: null,
        license: null,
        events: [],
      };
    if (actor.tenantId !== this.config.INSTALLATION_TENANT_ID)
      throw badRequest('installation_mismatch', 'Installation unavailable');
    const binding = this.binding(),
      result = await readInstallationLicense(this.db, binding),
      claims = result.claims;
    return {
      mode: this.config.DEPLOYMENT_MODE,
      release: this.config.RELEASE_VERSION,
      installationId: binding.installationId,
      license: {
        state: result.state,
        licenseId: claims?.license_id ?? null,
        customer: claims?.customer_id ?? null,
        expiresAt: claims?.expires_at ?? null,
        graceEndsAt: claims
          ? new Date(Date.parse(claims.expires_at) + claims.grace_days * 86400000).toISOString()
          : null,
        sequence: result.row?.licenseSequence ?? 0,
        lastImportError: result.row?.lastImportError ?? null,
        clockRollback: !!result.row?.clockRollbackAt,
        features: result.features,
        limits: result.limits,
      },
      events: (await installationHistory(this.db, binding.installationId)).map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
  async import(actor: AuthUser, envelope: string) {
    identityAdmin(actor);
    const binding = this.binding();
    if (actor.tenantId !== binding.tenantId)
      throw badRequest('installation_mismatch', 'Installation unavailable');
    const result = await this.tenantDb.run((tx) =>
      importInstallationLicense(tx, binding, envelope, actor.id),
    );
    if (!result.accepted)
      throw badRequest(
        'license_rejected',
        `License rejected (${result.code}); the previous accepted license remains recorded`,
      );
    return { accepted: true };
  }
  async acknowledgeClock(actor: AuthUser) {
    identityAdmin(actor);
    const binding = this.binding();
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .select()
        .from(enterpriseInstallations)
        .where(eq(enterpriseInstallations.id, binding.installationId))
        .for('update');
      if (!row) throw badRequest('installation_missing', 'Installation unavailable');
      const clock = await tx.execute(sql`select clock_timestamp() as clock`),
        now = new Date(String(clock.rows[0]!.clock));
      if (now.getTime() < row.maxObservedAt.getTime())
        throw new ConflictException({
          code: 'clock_still_behind',
          message: 'Restore the system clock before acknowledging the anomaly',
        });
      await tx
        .update(enterpriseInstallations)
        .set({ clockRollbackAt: null, maxObservedAt: now })
        .where(eq(enterpriseInstallations.id, row.id));
      await tx
        .insert(installationEvents)
        .values({ installationId: row.id, actorId: actor.id, action: 'clock_acknowledged' });
      return { acknowledged: true };
    });
  }
  async acknowledgeRecovery(actor: AuthUser, reason: string) {
    identityAdmin(actor);
    const binding = this.binding();
    return this.tenantDb.run(async (tx) => {
      const [owner] = await tx.select().from(tenantUsers).where(eq(tenantUsers.id, actor.id));
      if (!owner?.emergencyLocal)
        throw badRequest('recovery_admin_required', 'Use a named local recovery administrator');
      await tx
        .update(enterpriseInstallations)
        .set({ recoveryPending: false })
        .where(eq(enterpriseInstallations.id, binding.installationId));
      await tx.insert(installationEvents).values({
        installationId: binding.installationId,
        actorId: actor.id,
        action: 'recovery_reconciled',
        code: 'operator_attested',
        reason,
      });
      return { acknowledged: true, reasonRecorded: reason.length > 0 };
    });
  }
  async claim(token: string, password: string, ip: string) {
    const binding = this.binding();
    const limit = await this.security.count(
      `installation-claim:${binding.installationId}:${ip}`,
      60000,
    );
    if (limit.count > 5) throw badRequest('activation_limited', 'Try again later');
    const hash = createHash('sha256').update(token).digest('hex');
    const [preview] = await this.db
      .select()
      .from(installationInvitations)
      .where(
        and(
          eq(installationInvitations.installationId, binding.installationId),
          eq(installationInvitations.tokenHash, hash),
        ),
      );
    if (!preview) throw badRequest('invalid_activation', 'Activation code is invalid or expired');
    const passwordHash = await hashPassword(password);
    return this.db.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(installationInvitations)
        .where(
          and(
            eq(installationInvitations.id, preview.id),
            isNull(installationInvitations.claimedAt),
            gt(installationInvitations.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .for('update');
      if (!invite || !timingSafeEqual(Buffer.from(hash), Buffer.from(invite.tokenHash)))
        throw badRequest('invalid_activation', 'Activation code is invalid or expired');
      await tx.execute(sql`select set_config('app.tenant_id',${binding.tenantId},true)`);
      const id = randomUUID();
      await tx.insert(tenantUsers).values({
        id,
        tenantId: binding.tenantId,
        name: invite.name,
        email: invite.email,
        passwordHash,
        role: 'tenant_admin',
        scopeMode: 'all',
        emergencyLocal: true,
      });
      await tx
        .update(installationInvitations)
        .set({ claimedAt: new Date() })
        .where(eq(installationInvitations.id, invite.id));
      await tx.insert(installationEvents).values({
        installationId: binding.installationId,
        actorId: id,
        action: 'bootstrap_claimed',
      });
      return { claimed: true, mfaRequired: true };
    });
  }
  async diagnostics(actor: AuthUser) {
    identityAdmin(actor);
    const binding = this.binding();
    const state = await readInstallationLicense(this.db, binding);
    const result = await this.db.execute(
      sql`select public.enterprise_schema_version() migrations,(select count(*)::int from job_leases where ok=false) failed_jobs,version() database_version`,
    );
    await this.tenantDb.run((tx) =>
      tx.insert(installationEvents).values({
        installationId: binding.installationId,
        actorId: actor.id,
        action: 'diagnostics_exported',
      }),
    );
    return {
      schema: 1,
      generatedAt: new Date().toISOString(),
      release: this.config.RELEASE_VERSION,
      installationFingerprint: createHash('sha256')
        .update(binding.installationId)
        .digest('hex')
        .slice(0, 16),
      runtime: {
        node: process.versions.node,
        platform: process.platform,
        architecture: process.arch,
      },
      database: {
        version: String(result.rows[0]!.database_version).split(',')[0],
        migrations: Number(result.rows[0]!.migrations),
      },
      workers: { failedJobs: Number(result.rows[0]!.failed_jobs) },
      license: { state: state.state },
      egress: {
        identityProvider: 'operator-configured',
        email: this.config.EMAIL_DRIVER,
        sms: this.config.SMS_DRIVER,
        push: this.config.PUSH_DRIVER,
        webhooks: 'approved-subscriptions-only',
        vendorCallback: false,
        telemetry: false,
      },
    };
  }
}
