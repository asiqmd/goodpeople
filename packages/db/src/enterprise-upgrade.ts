import { createHash, createPublicKey, verify } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  enterpriseUpgradeRecoverySchema as recoverySchema,
  enterpriseUpgradeReleaseSchema as releaseSchema,
} from '@gp/shared';
import type { Database } from './client.js';
import { enterpriseInstallations } from './schema/enterprise.js';
import { readInstallationLicense, type InstallationConfig } from './installation-license-store.js';
/** Owner-only upgrade gate. The release's full archive verification happens before loading its image. */
export async function preflightInstallationUpgrade(
  db: Database,
  binding: InstallationConfig,
  input: {
    manifest: Buffer;
    checksums: Buffer;
    signature: Buffer;
    trustedReleasePublicKey: string;
    recovery: unknown;
    archiveSha256: string;
    appRole: string;
    targetRelease: string;
    expectedSchemaVersion: number;
    acceptCandidate?: boolean;
  },
) {
  const key = createPublicKey(input.trustedReleasePublicKey);
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, input.checksums, key, input.signature))
    throw new Error('Upgrade release signature is invalid');
  const hash = createHash('sha256').update(input.manifest).digest('hex');
  if (
    !input.checksums
      .toString('utf8')
      .split('\n')
      .includes(hash + '  release.json')
  )
    throw new Error('Upgrade manifest checksum mismatch');
  const release = releaseSchema.parse(JSON.parse(input.manifest.toString('utf8')));
  if (
    release.schemaVersion !== input.expectedSchemaVersion ||
    release.version !== input.targetRelease ||
    (release.status !== 'qualified' && !input.acceptCandidate)
  )
    throw new Error('Upgrade target is not an approved release');
  const [installation] = await db
    .select()
    .from(enterpriseInstallations)
    .where(eq(enterpriseInstallations.id, binding.installationId));
  if (
    !installation ||
    installation.tenantId !== binding.tenantId ||
    !release.upgradeFrom.includes(installation.release)
  )
    throw new Error('This installed version is not a supported upgrade source');
  const license = await readInstallationLicense(db, binding);
  if (!['valid', 'grace', 'expired'].includes(license.state))
    throw new Error('A verified bound license is required before an upgrade');
  const active = await db.execute(
    sql`select count(*)::int n from pg_stat_activity where datname=current_database() and usename=${input.appRole}`,
  );
  if (Number(active.rows[0]!.n) > 0) throw new Error('Stop API and worker before upgrading');
  const recovery = recoverySchema.parse(input.recovery),
    age = Date.now() - Date.parse(recovery.snapshotCreatedAt);
  if (
    recovery.installationId !== binding.installationId ||
    recovery.tenantId !== binding.tenantId ||
    recovery.sourceRelease !== installation.release ||
    recovery.archiveSha256 !== input.archiveSha256 ||
    age < 0 ||
    age > 3600000 ||
    Date.parse(recovery.restoredAt) < Date.parse(recovery.snapshotCreatedAt)
  )
    throw new Error(
      'A matching recent independently restored and decrypted recovery point is required',
    );
  return { from: installation.release, to: release.version, snapshotId: recovery.snapshotId };
}
