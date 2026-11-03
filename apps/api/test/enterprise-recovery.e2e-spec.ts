import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type INestApplication } from '@nestjs/common';
import {
  createDb,
  ensureDatabases,
  runMigrations,
  withDatabase,
  databaseName,
  bootstrapInstallation,
  signEnterpriseLicense,
  createFieldCipher,
  runAsTenant,
  employees,
  documents,
  tenantUsers,
  hashPassword,
  installationReadinessReceipt,
  enterpriseInstallations,
  apiClientCredentials,
  anomalyFindings,
  attendanceSettings,
  insightJobs,
  type Database,
} from '@gp/db';
import { FEATURE_KEYS, type EnterpriseLicense } from '@gp/shared';
import { eq, sql } from 'drizzle-orm';
import { snapshot, restore } from '../../../infra/enterprise/recovery.mjs';
import { api, bearer, bootApp, testEnv } from './test-env.js';
import { totpAt } from '../src/modules/auth/totp.js';
import type { AppConfig } from '../src/config.js';
import { runInTenantContext } from '../src/common/request-context.js';
import { latestReviewMonth, monthEnd } from '../src/modules/analytics/anomaly-detector.js';
import { InsightJobsService } from '../src/modules/analytics/insight-jobs.service.js';
// Explicit opt-in requires local PostgreSQL 17 clients. CI installs those clients before enabling this drill.
describe.skipIf(process.env.GP_ENTERPRISE_DRILLS !== 'on')(
  'native encrypted recovery rehearsal (same physical host)',
  () => {
    let dir: string,
      sourceName: string,
      targetName: string,
      backupRole: string,
      db: Database,
      pool: ReturnType<typeof createDb>['pool'],
      app: INestApplication | undefined;
    const vendor = generateKeyPairSync('ed25519'),
      proof = generateKeyPairSync('ed25519'),
      publicKey = vendor.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      installationId = randomUUID(),
      tenantId = randomUUID(),
      employeeId = randomUUID(),
      documentId = randomUUID(),
      password = 'Native-Recovery-Only!2026';
    const root = randomBytes(32).toString('base64'),
      historical = randomBytes(32).toString('base64'),
      cipher = createFieldCipher(root, { activeKeyId: 'a', keys: { a: historical } }),
      plain = Buffer.from('%PDF-1.4\nSynthetic private recovery document\n%%EOF'),
      nid = '1234567890';
    const month = latestReviewMonth();
    let mfaSecret: string, actorId: string, companyId: string;
    let reportId: string, exportId: string, originalCsv: string;
    let findingId: string, findingRevision: string;
    let config: Record<string, string>,
      admin: string,
      oldAccess: string,
      oldRefresh: string,
      client: { clientId: string; secret: string },
      sourceUrl: string,
      ownerUrl: string;
    const save = async (name: string, value: unknown) => {
      const path = join(dir, name);
      await writeFile(path, JSON.stringify(value), { mode: 0o600 });
      return path;
    };
    async function enroll(email: string) {
      const login = (
        await api(app!)
          .post('/auth/login')
          .send({ tenant: 'recovery-native', email, password })
          .expect(200)
      ).body;
      const setup = (
        await api(app!)
          .post('/auth/mfa/enroll/start')
          .send({ mfaToken: login.mfaToken })
          .expect(200)
      ).body;
      if (email === 'first@recovery.test') mfaSecret = setup.secret;
      return (
        await api(app!)
          .post('/auth/mfa/enroll')
          .send({ mfaToken: login.mfaToken, code: totpAt(setup.secret, new Date()) })
          .expect(200)
      ).body;
    }
    beforeAll(async () => {
      const env = testEnv();
      if (!env.adminUrl) throw new Error('DATABASE_ADMIN_URL is required');
      dir = await mkdtemp(join(tmpdir(), 'gp-native-recovery-'));
      sourceName = databaseName(env.ownerUrl) + '_m3s_' + randomUUID().slice(0, 8);
      targetName = sourceName.replace('_m3s_', '_m3r_');
      ownerUrl = withDatabase(env.ownerUrl, sourceName);
      sourceUrl = withDatabase(env.adminUrl, sourceName);
      await ensureDatabases({
        adminUrl: env.adminUrl,
        ownerUrl,
        appUrl: withDatabase(env.appUrl, sourceName),
        databases: [sourceName],
      });
      await runMigrations(ownerUrl);
      const owner = createDb(ownerUrl);
      db = owner.db;
      pool = owner.pool;
      const claims: EnterpriseLicense = {
        schema_version: 1,
        license_id: randomUUID(),
        installation_id: installationId,
        tenant_id: tenantId,
        customer_id: 'Native rehearsal only',
        sequence: 1,
        issued_at: new Date(Date.now() - 3600000).toISOString(),
        not_before: new Date(Date.now() - 3600000).toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        grace_days: 0,
        features: [...FEATURE_KEYS],
        limits: { max_employees: 10, max_legal_entities: 2, storage_gb: 1, sms_credits_monthly: 0 },
      };
      const first = await bootstrapInstallation(db, {
        installationId,
        tenantId,
        mode: 'dedicated',
        release: '6.5.0-local',
        name: 'Native recovery only',
        slug: 'recovery-native',
        adminName: 'First named recovery owner',
        adminEmail: 'first@recovery.test',
        envelope: signEnterpriseLicense(claims, 'vendor', vendor.privateKey),
        keys: { vendor: publicKey },
      });
      config = {
        DATABASE_URL: withDatabase(env.appUrl, sourceName),
        DEPLOYMENT_MODE: 'dedicated',
        INSTALLATION_ID: installationId,
        INSTALLATION_TENANT_ID: tenantId,
        LICENSE_PUBLIC_KEYS_JSON: JSON.stringify({ vendor: publicKey }),
        FIELD_ENCRYPTION_KEY: root,
        FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'a',
        FIELD_ENCRYPTION_KEYS_JSON: JSON.stringify({ a: historical }),
        JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
        REQUIRE_ADMIN_MFA: 'on',
        SIGNUP_ENABLED: 'off',
        SECURITY_STORE: 'redis',
        REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6381',
        SECURITY_NAMESPACE: 'gp:m3:recovery:' + randomUUID(),
        STORAGE_DIR: join(dir, 'source-documents'),
        RELEASE_VERSION: '6.5.0-local',
        EMAIL_DRIVER: 'disabled',
        SMS_DRIVER: 'disabled',
        PUSH_DRIVER: 'disabled',
      };
      await mkdir(config.STORAGE_DIR!);
      app = await bootApp(config as Partial<Record<keyof AppConfig, string>>);
      await api(app).post('/installation/claim').send({ token: first.token, password }).expect(201);
      const session = await enroll('first@recovery.test');
      admin = session.accessToken;
      oldAccess = admin;
      oldRefresh = session.refreshToken;
      await runAsTenant(db, tenantId, async (tx) => {
        await tx.insert(tenantUsers).values({
          tenantId,
          email: 'second@recovery.test',
          name: 'Second named recovery owner',
          passwordHash: await hashPassword(password),
          role: 'tenant_admin',
          emergencyLocal: true,
        });
        const address = {
          line: 'Synthetic address',
          district: 'Dhaka',
          upazila: 'Dhaka',
          postcode: '1200',
          division: 'dhaka' as const,
        };
        await tx.insert(employees).values({
          id: employeeId,
          tenantId,
          employeeCode: 'DR-01',
          fullName: 'Synthetic recovery employee',
          fatherName: 'Synthetic father',
          motherName: 'Synthetic mother',
          dateOfBirth: '1990-01-01',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          joinedOn: '2026-01-01',
          nidEnc: cipher.encrypt(nid, { tenantId, field: 'employees.nid' }),
          nidHash: cipher.blindIndex(nid, { tenantId, field: 'employees.nid' }),
        });
        await tx.insert(documents).values({
          id: documentId,
          tenantId,
          employeeId,
          category: 'passport',
          title: 'Synthetic encrypted document',
          fileName: 'recovery.pdf',
          contentType: 'application/pdf',
          sizeBytes: plain.length,
          sha256: 'synthetic-hash',
          storageKey: 'recovery.gpf',
        });
      });
      await writeFile(
        join(config.STORAGE_DIR!, 'recovery.gpf'),
        cipher.encryptBytes(plain, { tenantId, purpose: 'document:' + documentId }),
      );
      await expect(
        installationReadinessReceipt(
          db,
          { installationId, tenantId, keys: { vendor: publicKey } },
          {
            challenge: randomUUID(),
            apiOrigin: 'https://pilot-api.example',
            webOrigin: 'https://pilot.example',
            release: '6.5.0-local',
            privateKey: proof.privateKey,
          },
        ),
      ).rejects.toThrow('two named');
      await enroll('second@recovery.test');
      const receipt = await installationReadinessReceipt(
        db,
        { installationId, tenantId, keys: { vendor: publicKey } },
        {
          challenge: randomUUID(),
          apiOrigin: 'https://pilot-api.example',
          webOrigin: 'https://pilot.example',
          release: '6.5.0-local',
          privateKey: proof.privateKey,
        },
      );
      expect(receipt).toMatch(/^gpready1\./);
      const company = (
        await api(app)
          .post('/tenant/legal-entities')
          .set(bearer(admin))
          .send({ name: 'Recovery company', code: 'DR' })
          .expect(201)
      ).body;
      companyId = company.id;
      actorId = session.user.id;
      const coverage = { trackingFrom: month + '-01', processedThrough: monthEnd(month) };
      await runAsTenant(db, tenantId, (tx) =>
        tx
          .insert(attendanceSettings)
          .values({ tenantId, ...coverage })
          .onConflictDoUpdate({ target: attendanceSettings.tenantId, set: coverage }),
      );
      const scan = await api(app)
        .post('/tenant/analytics/anomalies/scan')
        .set(bearer(admin))
        .send({ rule: 'assignment_coverage', month })
        .expect(200);
      expect(scan.body.evaluation).toMatchObject({
        state: 'detected',
        evidence: { kind: 'assignments', issues: ['missing_assignment'] },
      });
      findingId = scan.body.findingId;
      findingRevision = scan.body.evaluation.sourceRevision;
      const saved = await api(app)
        .post('/tenant/analytics/saved-insights')
        .set(bearer(admin))
        .send({ kind: 'attendance', month, companyId })
        .expect(201);
      reportId = saved.body.id;
      exportId = randomUUID();
      await api(app)
        .post('/tenant/analytics/saved-insights/' + reportId + '/jobs')
        .set(bearer(admin))
        .send({ requestId: exportId })
        .expect(202);
      await runInTenantContext(tenantId, () => app!.get(InsightJobsService).runTenant());
      originalCsv = (
        await api(app)
          .get('/tenant/analytics/insight-files/' + exportId)
          .set(bearer(admin))
          .expect(200)
      ).text;
      expect(originalCsv).toContain('worked_minutes,0,recorded');

      const clientResponse = await api(app)
        .post('/tenant/integrations/clients')
        .set(bearer(admin))
        .send({
          name: 'Pre-recovery client',
          ownerId: session.user.id,
          days: 10,
          scopes: ['org:read'],
          fields: [],
          scope: 'selected',
          companyIds: [company.id],
        });
      expect(clientResponse.status, JSON.stringify(clientResponse.body)).toBe(201);
      client = clientResponse.body;
      await api(app)
        .post('/oauth/token')
        .auth(client.clientId, client.secret)
        .type('form')
        .send({ grant_type: 'client_credentials' })
        .expect(200);
      await app.close();
      app = undefined;
      backupRole = 'gp_m3backup_' + randomUUID().replaceAll('-', '').slice(0, 10);
      const backupPassword = randomBytes(32).toString('hex'),
        maint = createDb(sourceUrl);
      try {
        await maint.db.execute(
          sql.raw(
            `create role ${backupRole} login nosuperuser nocreatedb nocreaterole bypassrls password '${backupPassword}';grant connect on database ${sourceName} to ${backupRole};grant usage on schema public,drizzle to ${backupRole};grant select on all tables in schema public,drizzle to ${backupRole};grant select on all sequences in schema public,drizzle to ${backupRole}`,
          ),
        );
      } finally {
        await maint.pool.end();
      }
      const backupUrl = new URL(sourceUrl);
      backupUrl.username = backupRole;
      backupUrl.password = backupPassword;
      sourceUrl = backupUrl.href;
    }, 30000);
    afterAll(async () => {
      await app?.close();
      await pool?.end();
      if (sourceName) {
        const adminDb = createDb(testEnv().adminUrl!);
        try {
          for (const name of [sourceName, targetName])
            await adminDb.db.execute(sql.raw(`drop database if exists "${name}" with(force)`));
          if (backupRole) await adminDb.db.execute(sql.raw(`drop role if exists ${backupRole}`));
        } finally {
          await adminDb.pool.end();
        }
      }
      if (dir) await rm(dir, { recursive: true, force: true });
    });
    it('rejects missing objects; restores matching encrypted data and freezes old access without overwriting a destination', async () => {
      const configFile = await save('source.json', config),
        backupKeyFile = join(dir, 'backup.key'),
        output = join(dir, 'point.gpb');
      await writeFile(backupKeyFile, randomBytes(32).toString('base64'), { mode: 0o600 });
      const options = {
        databaseUrl: sourceUrl,
        documents: config.STORAGE_DIR!,
        configFile,
        backupKeyFile,
        output,
        quiesced: true,
      };
      await expect(snapshot({ ...options, quiesced: false })).rejects.toThrow('quiesced');
      const linkedKey = join(dir, 'linked.key');
      await symlink(backupKeyFile, linkedKey);
      await expect(snapshot({ ...options, backupKeyFile: linkedKey })).rejects.toMatchObject({
        code: 'ELOOP',
      });
      const encrypted = await readFile(join(config.STORAGE_DIR!, 'recovery.gpf'));
      await rm(join(config.STORAGE_DIR!, 'recovery.gpf'));
      await expect(snapshot(options)).rejects.toThrow('missing document');
      await writeFile(join(config.STORAGE_DIR!, 'recovery.gpf'), encrypted);
      const snap = await snapshot(options);
      expect(snap.documentObjects).toBe(1);
      expect((await readFile(output)).subarray(0, 4).toString()).toBe('GPB1');
      await expect(snapshot(options)).rejects.toThrow();
      expect((await readFile(output)).subarray(0, 4).toString()).toBe('GPB1');
      const targetConfig = {
        ...config,
        DATABASE_URL: withDatabase(testEnv().appUrl, targetName),
        STORAGE_DIR: join(dir, 'restored-documents'),
        JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
      };
      const restoredConfig = await save('restored.json', targetConfig),
        restoreOptions = {
          adminUrl: testEnv().adminUrl!,
          ownerUrl: withDatabase(testEnv().ownerUrl, targetName),
          targetDatabase: targetName,
          documents: targetConfig.STORAGE_DIR,
          configFile: restoredConfig,
          backupKeyFile,
          input: output,
          evidenceFile: join(dir, 'evidence.json'),
        };
      const wrong = await save('wrong-keys.json', {
        ...targetConfig,
        FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      });
      await expect(restore({ ...restoreOptions, configFile: wrong })).rejects.toThrow(
        'historical field',
      );
      const wrongReadKey = await save('wrong-read-key.json', {
        ...targetConfig,
        FIELD_ENCRYPTION_KEYS_JSON: JSON.stringify({ a: randomBytes(32).toString('base64') }),
      });
      await expect(restore({ ...restoreOptions, configFile: wrongReadKey })).rejects.toThrow(
        'historical field',
      );
      const restoreStarted = performance.now();
      const report = await restore(restoreOptions);
      expect(report.archiveSha256).toBe(
        createHash('sha256')
          .update(await readFile(output))
          .digest('hex'),
      );
      let restoredMfaStep = 0;
      expect(report).toMatchObject({
        rowCountsAndChecksumsMatched: true,
        documentChecksumsMatched: true,
        fieldKeyFingerprintsMatched: true,
        reconciliationRequired: true,
      });
      const target = createDb(withDatabase(testEnv().ownerUrl, targetName));
      try {
        const employee = await runAsTenant(target.db, tenantId, (tx) =>
          tx.select().from(employees).where(eq(employees.id, employeeId)),
        );
        expect(cipher.decrypt(employee[0]!.nidEnc!, { tenantId, field: 'employees.nid' })).toBe(
          nid,
        );
        expect(
          cipher.decryptBytes(await readFile(join(targetConfig.STORAGE_DIR, 'recovery.gpf')), {
            tenantId,
            purpose: 'document:' + documentId,
          }),
        ).toEqual(plain);
        const [binding] = await target.db.select().from(enterpriseInstallations);
        expect(binding!.recoveryPending).toBe(true);
        const creds = await runAsTenant(target.db, tenantId, (tx) =>
          tx.select().from(apiClientCredentials),
        );
        expect(creds.every((c) => c.revokedAt !== null)).toBe(true);
        const recovered = await runAsTenant(target.db, tenantId, async (tx) => {
          const [job] = await tx.select().from(insightJobs).where(eq(insightJobs.id, exportId));
          const [finding] = await tx
            .select()
            .from(anomalyFindings)
            .where(eq(anomalyFindings.id, findingId));
          const [user] = await tx
            .select({ step: tenantUsers.mfaLastStep })
            .from(tenantUsers)
            .where(eq(tenantUsers.id, actorId));
          return { job: job!, finding: finding!, user: user! };
        });
        expect(recovered.job.status).toBe('ready');
        expect(
          cipher
            .decryptBytes(Buffer.from(recovered.job.ciphertext!, 'base64'), {
              tenantId,
              purpose: `insight:${actorId}:${exportId}:${reportId}`,
            })
            .toString('utf8'),
        ).toBe(originalCsv);
        expect(recovered.finding.sourceRevision).toBe(findingRevision);
        expect(
          JSON.parse(
            cipher
              .decryptBytes(Buffer.from(recovered.finding.evidenceEnc, 'base64'), {
                tenantId,
                purpose: `anomaly:${findingId}:evidence`,
              })
              .toString('utf8'),
          ),
        ).toEqual({ kind: 'assignments', issues: ['missing_assignment'] });
        restoredMfaStep = recovered.user.step!;
      } finally {
        await target.pool.end();
      }
      app = await bootApp(targetConfig as Partial<Record<keyof AppConfig, string>>);
      await api(app).get('/tenant/enterprise').set(bearer(oldAccess)).expect(401);
      await api(app).post('/auth/refresh').send({ refreshToken: oldRefresh }).expect(401);
      await api(app)
        .post('/oauth/token')
        .auth(client.clientId, client.secret)
        .type('form')
        .send({ grant_type: 'client_credentials' })
        .expect(401);
      await api(app).get('/ready').expect(200);
      const frozenApiReadyMs = Math.round(performance.now() - restoreStarted);
      // Restoring advances the replay watermark beyond codes that may have
      // been used. Include the real wait for the next eligible code.
      const waitStarted = performance.now();
      const eligibleAt = (restoredMfaStep + 1) * 30_000 + 150;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, eligibleAt - Date.now())));
      const mfaWaitMs = Math.round(performance.now() - waitStarted);
      const challenge = await api(app)
        .post('/auth/login')
        .send({ tenant: 'recovery-native', email: 'first@recovery.test', password })
        .expect(200);
      const signedIn = await api(app)
        .post('/auth/mfa/verify')
        .send({ mfaToken: challenge.body.mfaToken, code: totpAt(mfaSecret, new Date()) })
        .expect(200);
      const currentAuth = bearer(signedIn.body.accessToken);
      const inboxPath = '/tenant/analytics/anomalies/inbox?rule=assignment_coverage&month=' + month;
      await api(app).get(inboxPath).set(currentAuth).expect(403);
      await api(app)
        .post('/tenant/enterprise/recovery-acknowledgement')
        .set(currentAuth)
        .send({
          reconciled: true,
          reason: 'Isolated synthetic reconciliation of access, scope and restored evidence',
        })
        .expect(201);
      const inbox = await api(app).get(inboxPath).set(currentAuth).expect(200);
      expect(inbox.body.findings).toMatchObject([
        { id: findingId, sourceRevision: findingRevision },
      ]);
      await api(app)
        .get('/tenant/analytics/insight-files/' + exportId)
        .set(currentAuth)
        .expect(404);
      const rebuiltId = randomUUID();
      await api(app)
        .post('/tenant/analytics/saved-insights/' + reportId + '/jobs')
        .set(currentAuth)
        .send({ requestId: rebuiltId })
        .expect(202);
      await runInTenantContext(tenantId, () => app!.get(InsightJobsService).runTenant());
      const rebuilt = await api(app)
        .get('/tenant/analytics/insight-files/' + rebuiltId)
        .set(currentAuth)
        .expect(200);
      expect(rebuilt.text).toContain('worked_minutes,0,recorded');
      const serviceToAcceptanceMs = Math.round(performance.now() - restoreStarted);

      await expect(restore(restoreOptions)).rejects.toThrow('never overwrites');
      if (process.env.GP_ENTERPRISE_EVIDENCE_FILE)
        await writeFile(
          process.env.GP_ENTERPRISE_EVIDENCE_FILE,
          JSON.stringify(
            {
              ...report,
              fieldAndFileDecryptionConfirmed: true,
              encryptedInsightAndAnomalyReconciled: true,
              revokedExportFamilyRejected: true,
              freshExportRebuilt: true,
              frozenApiReadyMs,
              mfaWaitMs,
              serviceToAcceptanceMs,
              scope:
                'native macOS, fresh logical database on the same host; not a Linux/physical cross-host qualification',
            },
            null,
            2,
          ) + '\n',
          { mode: 0o600 },
        );
    }, 120000);
  },
);
