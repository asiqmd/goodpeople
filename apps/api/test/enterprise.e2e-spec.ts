import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createHash, sign, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import {
  createDb,
  preflightInstallationUpgrade,
  ensureDatabases,
  runMigrations,
  withDatabase,
  databaseName,
  bootstrapInstallation,
  signEnterpriseLicense,
  enterpriseInstallations,
  installationInvitations,
  installationEvents,
  tenantUsers,
  runAsTenant,
  type Database,
} from '@gp/db';
import { FEATURE_KEYS, type EnterpriseLicense } from '@gp/shared';
import { eq, sql } from 'drizzle-orm';
import { api, bearer, bootApp, testEnv } from './test-env.js';
import { totpAt } from '../src/modules/auth/totp.js';
import { type AppConfig } from '../src/config.js';
import { DB } from '../src/db/db.module.js';
const keys = generateKeyPairSync('ed25519'),
  publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const password = 'Offline-M3-Owner!2026';
describe('offline enterprise licensing and installation boundaries', () => {
  let appClosed = false;
  let app: INestApplication,
    db: Database,
    pool: ReturnType<typeof createDb>['pool'],
    admin: string,
    installationId: string,
    tenantId: string,
    ownerUrl: string,
    appUrl: string,
    bootstrapToken: string,
    slug: string,
    base: EnterpriseLicense,
    overrides: Partial<Record<keyof AppConfig, string>>;
  const envelope = (change: Partial<EnterpriseLicense> = {}) =>
    signEnterpriseLicense({ ...base, ...change }, 'test-vendor', keys.privateKey);
  async function mfaLogin(email: string) {
    const login = (
      await api(app).post('/auth/login').send({ tenant: slug, email, password }).expect(200)
    ).body;
    expect(login.mfaSetupRequired).toBe(true);
    const setup = (
      await api(app).post('/auth/mfa/enroll/start').send({ mfaToken: login.mfaToken }).expect(200)
    ).body;
    return (
      await api(app)
        .post('/auth/mfa/enroll')
        .send({ mfaToken: login.mfaToken, code: totpAt(setup.secret, new Date()) })
        .expect(200)
    ).body.accessToken as string;
  }
  beforeEach(async () => {
    appClosed = false;
    const env = testEnv();
    if (!env.adminUrl) throw new Error('Enterprise isolation checks require DATABASE_ADMIN_URL');
    const name = databaseName(env.ownerUrl) + '_enterprise';
    ownerUrl = withDatabase(env.ownerUrl, name);
    appUrl = withDatabase(env.appUrl, name);
    await ensureDatabases({ adminUrl: env.adminUrl, ownerUrl, appUrl, databases: [name] });
    const owner = createDb(ownerUrl, { max: 2 });
    db = owner.db;
    pool = owner.pool;
    await db.execute(
      sql`drop schema if exists public cascade;drop schema if exists drizzle cascade;create schema public;grant usage on schema public to gp_app;alter default privileges in schema public grant select,insert,update,delete on tables to gp_app;alter default privileges in schema public grant usage,select on sequences to gp_app`,
    );
    await runMigrations(ownerUrl);
    installationId = randomUUID();
    tenantId = randomUUID();
    slug = 'offline-m3';
    base = {
      schema_version: 1,
      license_id: randomUUID(),
      installation_id: installationId,
      tenant_id: tenantId,
      customer_id: 'Offline Example Customer',
      sequence: 1,
      issued_at: new Date(Date.now() - 3600000).toISOString(),
      not_before: new Date(Date.now() - 3600000).toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      grace_days: 0,
      features: [...FEATURE_KEYS],
      limits: { max_employees: 1, max_legal_entities: 1, storage_gb: 1, sms_credits_monthly: 0 },
    };
    const bootstrap = await bootstrapInstallation(db, {
      installationId,
      tenantId,
      mode: 'self_hosted',
      release: '5.3.0-local',
      name: 'Offline enterprise sandbox',
      slug,
      adminName: 'Named local recovery administrator',
      adminEmail: 'owner@offline.example',
      envelope: envelope(),
      keys: { 'test-vendor': publicKey },
    });
    bootstrapToken = bootstrap.token;
    overrides = {
      DATABASE_URL: appUrl,
      DEPLOYMENT_MODE: 'self_hosted',
      INSTALLATION_ID: installationId,
      INSTALLATION_TENANT_ID: tenantId,
      LICENSE_PUBLIC_KEYS_JSON: JSON.stringify({ 'test-vendor': publicKey }),
      JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
      FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      REQUIRE_ADMIN_MFA: 'on',
      SIGNUP_ENABLED: 'off',
      SECURITY_STORE: 'redis',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6381',
      SECURITY_NAMESPACE: 'gp:m3:' + randomUUID(),
    };
    app = await bootApp(overrides);
    await api(app)
      .post('/installation/claim')
      .send({ token: bootstrapToken, password })
      .expect(201);
    admin = await mfaLogin('owner@offline.example');
  });
  afterEach(async () => {
    if (!appClosed) await app?.close();
    await pool?.end();
    if (ownerUrl) {
      const adminDb = createDb(testEnv().adminUrl!);
      try {
        await adminDb.db.execute(
          sql.raw(`drop database if exists "${databaseName(ownerUrl)}" with (force)`),
        );
      } finally {
        await adminDb.pool.end();
      }
    }
  });
  it('claims one invitation once, stores only its hash, requires MFA and refuses seed/bootstrap reuse', async () => {
    const [invite] = await db.select().from(installationInvitations);
    expect(invite!.tokenHash).not.toBe(bootstrapToken);
    expect(invite!.claimedAt).not.toBeNull();
    await api(app)
      .post('/installation/claim')
      .send({ token: bootstrapToken, password })
      .expect(400);
    await expect(
      bootstrapInstallation(db, {
        installationId,
        tenantId,
        mode: 'self_hosted',
        release: '5.3.0-local',
        name: 'Overwrite',
        slug,
        adminName: 'Other owner',
        adminEmail: 'other@offline.example',
        envelope: envelope(),
        keys: { 'test-vendor': publicKey },
      }),
    ).rejects.toThrow('existing or demo');
    const overview = await api(app).get('/tenant/enterprise').set(bearer(admin)).expect(200);
    expect(overview.body.license.state).toBe('valid');
    expect(overview.body).not.toHaveProperty('envelope');
  });
  it('applies signed limits rather than the enterprise catalogue or unsigned grants', async () => {
    await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(admin))
      .send({ name: 'Licensed company', code: 'LIC' })
      .expect(201);
    await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(admin))
      .send({ name: 'Over limit', code: 'OVER' })
      .expect(403);
  });
  it('keeps read and export authority while expired, rejects bad renewal and restores writes on valid renewal', async () => {
    await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(admin))
      .send({ name: 'Existing licensed company', code: 'EXIST' })
      .expect(201);
    const expired = {
      sequence: 2,
      license_id: randomUUID(),
      issued_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      not_before: new Date(Date.now() - 86400000 * 3).toISOString(),
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    };
    await api(app)
      .post('/tenant/enterprise/license')
      .set(bearer(admin))
      .send({ envelope: envelope(expired) })
      .expect(201);
    await api(app).get('/tenant/legal-entities').set(bearer(admin)).expect(200);
    await api(app)
      .get('/tenant/payroll/reports/pf-register?fiscalYear=2026-27')
      .set(bearer(admin))
      .expect(200)
      .expect('Content-Type', /text\/csv/);
    await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(admin))
      .send({ name: 'Blocked write', code: 'BLOCK' })
      .expect(403);
    await api(app)
      .post('/tenant/enterprise/license')
      .set(bearer(admin))
      .send({ envelope: envelope({ sequence: 3, installation_id: randomUUID() }) })
      .expect(400);
    const old = (await api(app).get('/tenant/enterprise').set(bearer(admin)).expect(200)).body;
    expect(old.license.sequence).toBe(2);
    expect(old.license.state).toBe('expired');
    expect(old.license.lastImportError).toBe('binding_mismatch');
    await api(app)
      .post('/tenant/enterprise/license')
      .set(bearer(admin))
      .send({
        envelope: envelope({
          sequence: 3,
          license_id: randomUUID(),
          limits: { ...base.limits, max_legal_entities: 2 },
        }),
      })
      .expect(201);
    await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(admin))
      .send({ name: 'Renewed company', code: 'RENEW' })
      .expect(201);
    await api(app)
      .post('/tenant/enterprise/license')
      .set(bearer(admin))
      .send({ envelope: envelope({ sequence: 2 }) })
      .expect(400);
  });
  it('does not export tenant data, credentials, envelopes or connection strings in opt-in diagnostics', async () => {
    const diag = (
      await api(app).post('/tenant/enterprise/diagnostics').set(bearer(admin)).expect(201)
    ).body;
    const text = JSON.stringify(diag);
    expect(diag.egress.vendorCallback).toBe(false);
    for (const secret of [
      overrides.JWT_ACCESS_SECRET!,
      overrides.FIELD_ENCRYPTION_KEY!,
      ownerUrl,
      appUrl,
      publicKey,
      tenantId,
      'owner@offline.example',
      'Offline Example Customer',
    ])
      expect(text).not.toContain(secret);
    expect(diag).toHaveProperty('database.migrations');
  });
  it('rejects a wrong installation, managed-mode bypass and cross-tenant transaction before data access', async () => {
    for (const [change, message] of [
      [{ INSTALLATION_TENANT_ID: randomUUID() }, 'database dedicated'],
      [{ DEPLOYMENT_MODE: 'managed' }, 'cannot start in managed'],
    ] as const) {
      const refused = await createApp(
        loadConfig({ DATABASE_URL: appUrl, BACKGROUND_JOBS: 'off', ...overrides, ...change }),
      );
      try {
        await expect(refused.init()).rejects.toThrow(message);
      } finally {
        await refused.close();
      }
    }
    await expect(
      runAsTenant(app.get<Database>(DB), randomUUID(), (tx) => tx.select().from(tenantUsers)),
    ).rejects.toThrow('does not belong');
    await api(app)
      .post('/platform/auth/login')
      .send({ email: testEnv().superAdminEmail, password: testEnv().password })
      .expect(401);
  });
  it('suspends business access during recovery and records an MFA-backed local administrator acknowledgement', async () => {
    await db
      .update(enterpriseInstallations)
      .set({ recoveryPending: true })
      .where(eq(enterpriseInstallations.id, installationId));
    await api(app).get('/tenant/legal-entities').set(bearer(admin)).expect(403);
    expect(
      (await api(app).get('/tenant/enterprise').set(bearer(admin)).expect(200)).body.license.state,
    ).toBe('recovery_pending');
    await api(app)
      .post('/tenant/enterprise/recovery-acknowledgement')
      .set(bearer(admin))
      .send({
        reason: 'Reviewed current IdP and HR users, scopes and machine credentials',
        reconciled: false,
      })
      .expect(400);
    await api(app)
      .post('/tenant/enterprise/recovery-acknowledgement')
      .set(bearer(admin))
      .send({
        reason: 'Reviewed current IdP and HR users, scopes and machine credentials',
        reconciled: true,
      })
      .expect(201);
    await api(app).get('/tenant/legal-entities').set(bearer(admin)).expect(200);
    const events = await db
      .select()
      .from(installationEvents)
      .where(eq(installationEvents.action, 'recovery_reconciled'));
    expect(events[0]!.reason).toContain('Reviewed current IdP');
  });
  it('gates owner upgrades on trusted source/schema, maintenance and a restored/decrypted matching point', async () => {
    const releaseKey = generateKeyPairSync('ed25519'),
      releasePublic = releaseKey.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      archiveSha256 = 'a'.repeat(64),
      manifest = Buffer.from(
        JSON.stringify({
          schema: 1,
          kind: 'good-people-enterprise-release',
          version: '5.3.0',
          status: 'candidate',
          licenseSchema: 1,
          schemaVersion: 58,
          upgradeFrom: ['5.3.0-local'],
        }),
      ),
      checksums = Buffer.from(
        createHash('sha256').update(manifest).digest('hex') + '  release.json\n',
      ),
      input = {
        manifest,
        checksums,
        signature: sign(null, checksums, releaseKey.privateKey),
        trustedReleasePublicKey: releasePublic,
        archiveSha256,
        appRole: decodeURIComponent(new URL(appUrl).username),
        targetRelease: '5.3.0',
        expectedSchemaVersion: 58,
        acceptCandidate: true,
        recovery: {
          snapshotId: randomUUID(),
          installationId,
          tenantId,
          sourceRelease: '5.3.0-local',
          snapshotCreatedAt: new Date(Date.now() - 60000).toISOString(),
          restoredAt: new Date().toISOString(),
          archiveSha256,
          rowCountsAndChecksumsMatched: true,
          documentChecksumsMatched: true,
          fieldKeyFingerprintsMatched: true,
          fieldAndFileDecryptionConfirmed: true,
        },
      },
      binding = { installationId, tenantId, keys: { 'test-vendor': publicKey } };
    await expect(
      preflightInstallationUpgrade(db, binding, { ...input, acceptCandidate: false }),
    ).rejects.toThrow('approved release');
    await expect(preflightInstallationUpgrade(db, binding, input)).rejects.toThrow('Stop API');
    await app.close();
    appClosed = true;
    expect(await preflightInstallationUpgrade(db, binding, input)).toMatchObject({
      from: '5.3.0-local',
      to: '5.3.0',
    });
    await expect(
      preflightInstallationUpgrade(db, binding, { ...input, expectedSchemaVersion: 59 }),
    ).rejects.toThrow('approved release');
    await expect(
      preflightInstallationUpgrade(db, binding, { ...input, archiveSha256: 'b'.repeat(64) }),
    ).rejects.toThrow('matching recent');
    await expect(
      runMigrations(ownerUrl, {
        beforeUpgrade: async () => {
          throw new Error('Unverified recovery point');
        },
      }),
    ).rejects.toThrow('Unverified recovery');
  });
  it('records rollback anomalies, holds read-only and requires the clock to catch up before acknowledgement', async () => {
    await db
      .update(enterpriseInstallations)
      .set({ maxObservedAt: new Date(Date.now() + 3600000) })
      .where(eq(enterpriseInstallations.id, installationId));
    const view = (await api(app).get('/tenant/enterprise').set(bearer(admin)).expect(200)).body;
    expect(view.license.state).toBe('clock_rollback');
    await api(app).post('/tenant/enterprise/clock-acknowledgement').set(bearer(admin)).expect(409);
    // A restored wall-clock must pass the recorded high-water mark; the monotonic DB guard forbids lowering it.
    await expect(
      db
        .update(enterpriseInstallations)
        .set({ maxObservedAt: new Date(0) })
        .where(eq(enterpriseInstallations.id, installationId)),
    ).rejects.toThrow();
  });
});
