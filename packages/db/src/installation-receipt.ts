import { createHash, sign, type KeyLike } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { runAsTenant, type Database } from './client.js';
import { readInstallationLicense, type InstallationConfig } from './installation-license-store.js';
export async function installationReadinessReceipt(
  db: Database,
  binding: InstallationConfig,
  input: {
    challenge: string;
    apiOrigin: string;
    webOrigin: string;
    release: string;
    privateKey: KeyLike;
  },
) {
  if (!/^[0-9a-f-]{36}$/.test(input.challenge))
    throw new Error('Use the current control-plane challenge');
  const state = await readInstallationLicense(db, binding);
  if (state.state !== 'valid') throw new Error('A valid non-recovery license is required');
  const mode = await db.execute(
    sql`select mode from enterprise_installations where id=${binding.installationId}`,
  );
  if (mode.rows[0]?.mode !== 'dedicated')
    throw new Error('Readiness routing receipts require a dedicated installation');
  const count = await runAsTenant(db, binding.tenantId, (tx) =>
    tx.execute(
      sql`select count(*)::int n from tenant_users u where u.tenant_id=${binding.tenantId} and u.role='tenant_admin' and u.emergency_local=true and u.mfa_enabled_at is not null and u.disabled_at is null and u.provision_disabled=false and exists(select 1 from provisioning_events e where e.actor_id=u.id and e.action='identity.emergency_used' and e.created_at>clock_timestamp()-interval '24 hours')`,
    ),
  );
  if (Number(count.rows[0]!.n) < 2)
    throw new Error('Test two named local MFA recovery administrators before activation');
  const fingerprint = await db.execute(
    sql`select current_database() db,oid from pg_database where datname=current_database()`,
  );
  const claims = {
    customer_id: state.claims!.customer_id,
    mode: 'dedicated',
    installation_id: binding.installationId,
    tenant_id: binding.tenantId,
    challenge: input.challenge,
    api_origin: new URL(input.apiOrigin).origin,
    web_origin: new URL(input.webOrigin).origin,
    license_id: state.claims!.license_id,
    release: input.release,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 600000).toISOString(),
    database_fingerprint: createHash('sha256')
      .update(JSON.stringify(fingerprint.rows[0]))
      .digest('hex'),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url'),
    body = 'gpready1.' + payload;
  return body + '.' + sign(null, Buffer.from(body), input.privateKey).toString('base64url');
}
