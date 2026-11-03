import { z } from 'zod';
import { FEATURE_KEYS, LIMIT_KEYS } from './catalog.js';
const limitsSchema = z
  .object(
    Object.fromEntries(
      LIMIT_KEYS.map((key) => [key, z.number().int().min(0).nullable()]),
    ) as Record<(typeof LIMIT_KEYS)[number], z.ZodNullable<z.ZodNumber>>,
  )
  .strict();
export const enterpriseLicenseSchema = z
  .object({
    schema_version: z.literal(1),
    license_id: z.uuid(),
    installation_id: z.uuid(),
    tenant_id: z.uuid(),
    customer_id: z.string().min(2).max(100),
    sequence: z.number().int().min(1).max(2147483647),
    issued_at: z.iso.datetime(),
    not_before: z.iso.datetime(),
    expires_at: z.iso.datetime(),
    grace_days: z.number().int().min(0).max(30),
    features: z.array(z.enum(FEATURE_KEYS)).min(1).max(FEATURE_KEYS.length),
    limits: limitsSchema,
  })
  .strict()
  .refine(
    (v) =>
      v.features.includes('core_hr') &&
      new Set(v.features).size === v.features.length &&
      Date.parse(v.not_before) < Date.parse(v.expires_at) &&
      Date.parse(v.issued_at) <= Date.parse(v.expires_at),
    { message: 'Invalid license entitlement or dates' },
  );
export type EnterpriseLicense = z.infer<typeof enterpriseLicenseSchema>;
export type LicenseState =
  'valid' | 'grace' | 'expired' | 'missing' | 'invalid' | 'clock_rollback' | 'recovery_pending';
export interface EnterpriseOverview {
  mode: 'managed' | 'self_hosted' | 'dedicated';
  release: string;
  installationId: string | null;
  license: {
    state: LicenseState;
    licenseId: string | null;
    customer: string | null;
    expiresAt: string | null;
    graceEndsAt: string | null;
    sequence: number;
    lastImportError: string | null;
    clockRollback: boolean;
    features: string[];
    limits: Record<string, number | null>;
  } | null;
  events: { action: string; createdAt: string; code: string | null }[];
}
export const placementInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/),
    customerId: z.string().min(2).max(100),
    installationId: z.uuid(),
    region: z.string().min(2).max(80),
    routeKey: z.string().regex(/^[a-z][a-z0-9_-]{2,63}$/),
    apiOrigin: z.url(),
    webOrigin: z.url(),
    proofPublicKey: z.string().min(50).max(500),
    residency: z
      .object({
        primary: z.string().min(2).max(500),
        replicas: z.string().min(2).max(500),
        backups: z.string().min(2).max(500),
        logs: z.string().min(2).max(500),
        support: z.string().min(2).max(500),
        notifications: z.string().min(2).max(500),
        integrations: z.string().min(2).max(500),
      })
      .strict(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export type PlacementInput = z.infer<typeof placementInputSchema>;
export interface PlacementView {
  id: string;
  tenantId: string;
  installationId: string;
  region: string;
  routeKey: string;
  webOrigin: string;
  apiOrigin: string;
  status: 'provisioning' | 'active' | 'disabled';
  version: number;
  residency: Record<string, string>;
}

export const enterpriseUpgradeRecoverySchema = z.object({
  snapshotId: z.uuid(),
  installationId: z.uuid(),
  tenantId: z.uuid(),
  sourceRelease: z.string(),
  snapshotCreatedAt: z.iso.datetime(),
  restoredAt: z.iso.datetime(),
  archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rowCountsAndChecksumsMatched: z.literal(true),
  documentChecksumsMatched: z.literal(true),
  fieldKeyFingerprintsMatched: z.literal(true),
  fieldAndFileDecryptionConfirmed: z.literal(true),
});
export const enterpriseUpgradeReleaseSchema = z.object({
  schema: z.literal(1),
  kind: z.literal('good-people-enterprise-release'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(['candidate', 'qualified']),
  licenseSchema: z.literal(1),
  schemaVersion: z.number().int().min(58),
  upgradeFrom: z.array(z.string()),
});
