import { enterpriseInstallations, installationEvents } from './schema/enterprise.js';
import {
  enterpriseLicenseSchema,
  type EnterpriseLicense,
  type FeatureKey,
  type Limits,
  type LicenseState,
} from '@gp/shared';
import { and, eq, desc, sql } from 'drizzle-orm';
import type { Database, Tx } from './client.js';
import { LicenseError, licenseState, verifyEnterpriseLicense } from './enterprise-license.js';
export interface InstallationConfig {
  installationId: string;
  tenantId: string;
  keys: Record<string, string>;
}
export interface InstallationLicenseResult {
  state: LicenseState;
  claims: EnterpriseLicense | null;
  features: FeatureKey[];
  limits: Limits;
  row: typeof enterpriseInstallations.$inferSelect | null;
}
const EMPTY: Limits = {
  max_employees: 0,
  max_legal_entities: 0,
  storage_gb: 0,
  sms_credits_monthly: 0,
};
export async function readInstallationLicense(
  db: Database,
  config: InstallationConfig,
): Promise<InstallationLicenseResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(enterpriseInstallations)
      .where(
        and(
          eq(enterpriseInstallations.id, config.installationId),
          eq(enterpriseInstallations.tenantId, config.tenantId),
        ),
      )
      .for('update');
    if (!row)
      return { state: 'missing', claims: null, features: ['core_hr'], limits: EMPTY, row: null };
    const clock = await tx.execute(sql`select clock_timestamp() as clock`);
    const now = new Date(String(clock.rows[0]!.clock));
    const rollback = now.getTime() + 300000 < row.maxObservedAt.getTime();
    if (rollback && !row.clockRollbackAt) {
      await tx
        .insert(installationEvents)
        .values({ installationId: row.id, action: 'clock_rollback', code: 'clock_rollback' });
      row.clockRollbackAt = now;
      await tx
        .update(enterpriseInstallations)
        .set({ clockRollbackAt: now })
        .where(eq(enterpriseInstallations.id, row.id));
    }
    if (now.getTime() > row.maxObservedAt.getTime() + 30000) {
      await tx
        .update(enterpriseInstallations)
        .set({ maxObservedAt: now })
        .where(eq(enterpriseInstallations.id, row.id));
      row.maxObservedAt = now;
    }
    let claims: EnterpriseLicense | null = null,
      state: LicenseState = 'missing';
    if (row.licenseEnvelope) {
      try {
        claims = verifyEnterpriseLicense(row.licenseEnvelope, config.keys, {
          ...config,
          customerId: row.customerId,
        });
        state = licenseState(
          claims,
          new Date(Math.max(now.getTime(), row.maxObservedAt.getTime())),
          !!row.clockRollbackAt,
        );
      } catch {
        state = 'invalid';
      }
    }
    if (row.recoveryPending) state = 'recovery_pending';
    const fallback = enterpriseLicenseSchema.safeParse(row.acceptedClaims);
    const retained = claims ?? (fallback.success ? fallback.data : null);
    return {
      state,
      claims: retained,
      features: retained?.features ?? ['core_hr'],
      limits: retained?.limits ?? EMPTY,
      row,
    };
  });
}
export async function importInstallationLicense(
  tx: Tx,
  config: InstallationConfig,
  envelope: string,
  actorId: string | null,
) {
  const [row] = await tx
    .select()
    .from(enterpriseInstallations)
    .where(
      and(
        eq(enterpriseInstallations.id, config.installationId),
        eq(enterpriseInstallations.tenantId, config.tenantId),
      ),
    )
    .for('update');
  if (!row) throw new LicenseError('installation_missing');
  let claims: EnterpriseLicense;
  try {
    claims = verifyEnterpriseLicense(envelope, config.keys, {
      ...config,
      customerId: row.customerId,
    });
    if (claims.sequence <= row.licenseSequence) throw new LicenseError('stale_sequence');
    const clock = await tx.execute(sql`select clock_timestamp() as clock`);
    if (Date.parse(claims.not_before) > new Date(String(clock.rows[0]!.clock)).getTime())
      throw new LicenseError('license_not_yet_active');
  } catch (error) {
    const code = error instanceof LicenseError ? error.code : 'invalid_license';
    await tx
      .update(enterpriseInstallations)
      .set({ lastImportError: code })
      .where(eq(enterpriseInstallations.id, row.id));
    await tx
      .insert(installationEvents)
      .values({ installationId: row.id, actorId, action: 'license_rejected', code });
    return { accepted: false, code };
  }
  await tx
    .update(enterpriseInstallations)
    .set({
      licenseEnvelope: envelope,
      acceptedClaims: claims,
      licenseSequence: claims.sequence,
      lastImportError: null,
    })
    .where(eq(enterpriseInstallations.id, row.id));
  await tx
    .insert(installationEvents)
    .values({ installationId: row.id, actorId, action: 'license_imported' });
  return { accepted: true };
}
export async function installationHistory(db: Database, id: string) {
  return db
    .select({
      action: installationEvents.action,
      createdAt: installationEvents.createdAt,
      code: installationEvents.code,
    })
    .from(installationEvents)
    .where(eq(installationEvents.installationId, id))
    .orderBy(desc(installationEvents.createdAt))
    .limit(50);
}
