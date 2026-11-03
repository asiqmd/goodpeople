import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  enterpriseInstallations,
  installationInvitations,
  installationEvents,
  tenants,
  plans,
} from './schema/index.js';
import { upsertPlanCatalog } from './seed.js';
import { scopeToTenant, type Database } from './client.js';
import { provisionCountryDefaults } from './provision.js';
import { licenseState, verifyEnterpriseLicense } from './enterprise-license.js';
import { todayIn } from '@gp/shared';
export interface BootstrapInput {
  installationId: string;
  tenantId: string;
  mode: 'self_hosted' | 'dedicated';
  release: string;
  name: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  envelope: string;
  keys: Record<string, string>;
}

function validAdminEmail(email: string): boolean {
  if (email.length > 254 || /\s/.test(email)) return false;
  const [local, domain, extra] = email.split('@');
  return (
    !!local &&
    !!domain &&
    extra === undefined &&
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    !domain.includes('..')
  );
}
/** Owner-only command. An existing installation is never overwritten or reseeded. */
export async function bootstrapInstallation(db: Database, input: BootstrapInput) {
  const license = verifyEnterpriseLicense(input.envelope, input.keys, input);
  if (!['valid', 'grace'].includes(licenseState(license, new Date())))
    throw new Error('Bootstrap requires a currently valid offline license');
  if (
    !/^[a-z0-9][a-z0-9-]{2,62}$/.test(input.slug) ||
    input.name.trim().length < 2 ||
    input.adminName.trim().length < 2 ||
    !validAdminEmail(input.adminEmail)
  )
    throw new Error('Named workspace and local administrator are required');
  await upsertPlanCatalog(db);
  return db.transaction(async (tx) => {
    await tx.execute(sql`lock table tenants,platform_users in share row exclusive mode`);
    const counts = await tx.execute(
      sql`select (select count(*)::int from tenants) tenants,(select count(*)::int from platform_users) operators`,
    );
    if (Number(counts.rows[0]!.tenants) || Number(counts.rows[0]!.operators))
      throw new Error('Bootstrap refuses an existing or demo database');
    const [plan] = await tx.select().from(plans).where(eq(plans.code, 'enterprise'));
    if (!plan) throw new Error('Plan catalogue missing');
    await tx.insert(tenants).values({
      id: input.tenantId,
      name: input.name,
      slug: input.slug,
      industryTemplate: 'corporate',
      billingMode: 'license',
      planId: plan.id,
      bypassReason: 'Offline signed installation license',
    });
    await tx.insert(enterpriseInstallations).values({
      id: input.installationId,
      tenantId: input.tenantId,
      customerId: license.customer_id,
      mode: input.mode,
      release: input.release,
      licenseEnvelope: input.envelope,
      licenseSequence: license.sequence,
      acceptedClaims: license,
    });
    await scopeToTenant(tx, input.tenantId);
    await provisionCountryDefaults(tx, input.tenantId, { countryPack: 'BD', today: todayIn() });
    const token = `gpinit.v1.${input.installationId}.${randomBytes(32).toString('base64url')}`;
    await tx.insert(installationInvitations).values({
      installationId: input.installationId,
      name: input.adminName,
      email: input.adminEmail.toLowerCase(),
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 86400000),
    });
    await tx
      .insert(installationEvents)
      .values({ installationId: input.installationId, action: 'bootstrap_created' });
    return { token, expiresInSeconds: 86400, tenantId: input.tenantId };
  });
}
/** In-place upgrade of an existing single-customer database. Never relocates a tenant. */
export async function adoptInstallation(
  db: Database,
  input: Omit<BootstrapInput, 'name' | 'slug' | 'adminName' | 'adminEmail'> & {
    reason: string;
    appRole: string;
  },
) {
  if (
    input.mode !== 'self_hosted' ||
    input.reason.trim().length < 20 ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input.appRole)
  )
    throw new Error('Adoption requires explicit single-host upgrade approval');
  const license = verifyEnterpriseLicense(input.envelope, input.keys, input);
  if (!['valid', 'grace'].includes(licenseState(license, new Date())))
    throw new Error('A current signed license is required for adoption');
  return db.transaction(async (tx) => {
    await tx.execute(sql`lock table tenants in share row exclusive mode`);
    const rows = await tx.select().from(tenants);
    if (
      rows.length !== 1 ||
      rows[0]!.id !== input.tenantId ||
      ['my-group', 'trial-co', 'demo-ngo'].includes(rows[0]!.slug)
    )
      throw new Error('Adoption refuses a shared, demo or different-tenant database');
    if ((await tx.select().from(enterpriseInstallations)).length)
      throw new Error('Installation is already bound');
    const connections = await tx.execute(
      sql`select count(*)::int n from pg_stat_activity where datname=current_database() and usename=${input.appRole}`,
    );
    if (Number(connections.rows[0]!.n)) throw new Error('Stop API and workers before adoption');
    await scopeToTenant(tx, input.tenantId);
    const admins = await tx.execute(
      sql`select count(*)::int n from tenant_users where role='tenant_admin' and disabled_at is null and provision_disabled=false and mfa_enabled_at is not null and emergency_local=true`,
    );
    if (Number(admins.rows[0]!.n) < 2)
      throw new Error('Test two named local MFA recovery administrators before adoption');
    await tx
      .update(tenants)
      .set({ billingMode: 'license', accessExpiresAt: null })
      .where(eq(tenants.id, input.tenantId));
    await tx.insert(enterpriseInstallations).values({
      id: input.installationId,
      tenantId: input.tenantId,
      mode: input.mode,
      customerId: license.customer_id,
      release: input.release,
      licenseEnvelope: input.envelope,
      acceptedClaims: license,
      licenseSequence: license.sequence,
      recoveryPending: true,
    });
    await tx.execute(
      sql`update auth_sessions set revoked_at=clock_timestamp(),family_revoked_at=clock_timestamp()`,
    );
    await tx.insert(installationEvents).values({
      installationId: input.installationId,
      action: 'installation_adopted',
      reason: input.reason,
      code: 'reconciliation_required',
    });
    return { adopted: true, reconciliationRequired: true };
  });
}
