import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableFile, type INestApplication } from '@nestjs/common';
import {
  createDb,
  authSessions,
  jobAssignments,
  runAsTenant,
  tenantUsers,
  type Database,
  type Tx,
} from '@gp/db';
import { ACCESS_FIELDS, emptyFieldPolicy, type AccessRoleView } from '@gp/shared';
import { eq, sql } from 'drizzle-orm';
import { bindingHash } from '../src/modules/identity/oidc.service.js';
import { totpAt } from '../src/modules/auth/totp.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { fieldAllowed, projectFields } from '../src/common/field-access.js';
import type { AuthUser } from '../src/common/auth-user.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { DB, TenantDb } from '../src/db/db.module.js';
import { SecurityState } from '../src/common/security-state.js';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';

const allFields = () =>
  Object.fromEntries(
    ACCESS_FIELDS.map((f) => [f, { read: true, write: true, export: true }]),
  ) as ReturnType<typeof emptyFieldPolicy>;

describe('enterprise identity and access', () => {
  let app: INestApplication,
    other: INestApplication,
    db: Database,
    pool: ReturnType<typeof createDb>['pool'];
  let admin: string,
    adminId: string,
    tenantId: string,
    slug: string,
    companyA: string,
    companyB: string;
  let connection: string, scimToken: string, idp: Server, issuer: string;
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let activeKeys = keys,
    activeKid = 'fixture',
    corruptSignature = false;
  const codes = new Map<
    string,
    { nonce: string; challenge: string; sub: string; claims?: Record<string, unknown> }
  >();
  let seq = 0;
  const email = () => `identity-${Date.now()}-${seq++}@example.test`;
  async function createUser(assignedRole = 'hr_officer') {
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({
          name: 'Identity test user',
          email: email(),
          role: assignedRole,
          password: testEnv().password,
        })
        .expect(201)
    ).body;
    const session = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: slug, email: user.email, password: testEnv().password })
        .expect(200)
    ).body;
    return { user, session };
  }
  async function hirePerson(legalEntityId: string, managerId?: string) {
    return (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: `SCOPED-${seq++}`,
          fullName: 'Scoped person',
          fatherName: 'Family name',
          motherName: 'Family name',
          dateOfBirth: '2000-01-01',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: { line: 'Office', district: 'Dhaka', division: 'dhaka' },
          permanentAddress: { line: 'Home', district: 'Dhaka', division: 'dhaka' },
          identity: { nid: String(1234567890 + seq) },
          joinedOn: '2026-09-01',
          job: {
            legalEntityId,
            managerId,
            employmentType: 'probationer',
            workerCategory: 'worker',
          },
        })
        .expect(201)
    ).body.employee;
  }
  async function role(
    permissions: string[],
    fields = allFields(),
    deniedPermissions: string[] = [],
  ): Promise<AccessRoleView> {
    return (
      await api(app)
        .post('/tenant/identity/roles')
        .set(bearer(admin))
        .send({ name: `Role ${seq++}`, permissions, deniedPermissions, fields })
        .expect(201)
    ).body;
  }
  const assign = (userId: string, roleId: string, companyIds: string[], scope = 'selected') =>
    api(app)
      .post(`/tenant/identity/users/${userId}/assignments`)
      .set(bearer(admin))
      .send({ roleId, scope, companyIds });
  async function adminMfa(token: string) {
    const setup = (await api(app).post('/account/mfa/setup').set(bearer(token)).expect(200)).body;
    return (
      await api(app)
        .post('/account/mfa/confirm')
        .set(bearer(token))
        .send({ code: totpAt(setup.secret, new Date()) })
        .expect(200)
    ).body;
  }
  async function startSso(client: 'web' | 'mobile' = 'web') {
    const verifier = randomBytes(32).toString('base64url');
    const start = (
      await api(app)
        .post('/auth/sso/start')
        .send({ tenant: slug, binding: bindingHash(verifier), client })
        .expect(200)
    ).body;
    return { ...start, verifier };
  }
  async function callback(url: string, sub: string, claims?: Record<string, unknown>) {
    const u = new URL(url),
      code = randomBytes(16).toString('hex');
    codes.set(code, {
      nonce: u.searchParams.get('nonce')!,
      challenge: u.searchParams.get('code_challenge')!,
      sub,
      claims,
    });
    return api(app)
      .get('/auth/sso/callback')
      .query({ code, state: u.searchParams.get('state') });
  }
  async function scimUser(name = email(), externalId = `subject-${seq++}`) {
    const result = await api(app)
      .post('/scim/v2/Users')
      .set(bearer(scimToken))
      .set('content-type', 'application/scim+json')
      .send({ userName: name, externalId, displayName: 'Provisioned person', active: true })
      .expect(201);
    return result.body;
  }
  beforeAll(async () => {
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 4 }));
    idp = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/.well-known/openid-configuration')
        return res.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks`,
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            code_challenge_methods_supported: ['S256'],
          }),
        );
      if (req.url === '/jwks')
        return res.end(
          JSON.stringify({
            keys: [
              {
                ...activeKeys.publicKey.export({ format: 'jwk' }),
                kid: activeKid,
                alg: 'RS256',
                use: 'sig',
              },
            ],
          }),
        );
      if (req.url === '/token') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = new URLSearchParams(raw),
          grant = codes.get(body.get('code') ?? '');
        codes.delete(body.get('code') ?? '');
        if (
          !grant ||
          body.get('client_id') !== 'identity-client' ||
          body.get('client_secret') !== 'fixture-client-secret' ||
          bindingHash(body.get('code_verifier') ?? '') !== grant.challenge
        ) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'invalid_grant' }));
        }
        const now = Math.floor(Date.now() / 1000),
          header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: activeKid })).toString(
            'base64url',
          );
        const payload = Buffer.from(
          JSON.stringify({
            iss: issuer,
            sub: grant.sub,
            aud: 'identity-client',
            iat: now,
            exp: now + 120,
            nonce: grant.nonce,
            ...grant.claims,
          }),
        ).toString('base64url');
        const signed = sign(
          'RSA-SHA256',
          Buffer.from(`${header}.${payload}`),
          activeKeys.privateKey,
        );
        if (corruptSignature) signed[0] = signed[0]! ^ 1;
        const signature = signed.toString('base64url');
        return res.end(
          JSON.stringify({
            access_token: 'fixture-access',
            token_type: 'Bearer',
            id_token: `${header}.${payload}.${signature}`,
          }),
        );
      }
      res.statusCode = 404;
      res.end('{}');
    });
    await new Promise<void>((resolve) => idp.listen(0, '127.0.0.1', resolve));
    issuer = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`;
    const config = {
      SECURITY_STORE: 'redis',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6381',
      SECURITY_NAMESPACE: `gp:identity-test:${Date.now()}`,
      OIDC_PRIVATE_HOSTS: '127.0.0.1',
    };
    app = await bootApp(config);
    other = await bootApp(config);
    slug = uniqueSlug('identity');
    const platform = await platformToken(app);
    const assigned = (
      await api(app)
        .post('/platform/tenants')
        .set(bearer(platform))
        .send({
          name: 'Identity pilot',
          slug,
          industryTemplate: 'corporate',
          billingMode: 'internal',
          planCode: 'enterprise',
          reason: 'Isolated identity acceptance fixture',
          admin: { name: 'Identity administrator', email: `admin@${slug}.test` },
        })
        .expect(201)
    ).body;
    tenantId = assigned.tenant.id;
    const session = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: slug, email: `admin@${slug}.test`, password: assigned.temporaryPassword })
        .expect(200)
    ).body;
    admin = session.accessToken;
    adminId = session.user.id;
    await api(app)
      .post('/tenant/identity/roles')
      .set(bearer(admin))
      .send({ name: 'No MFA role', permissions: [], fields: allFields() })
      .expect(403);
    await adminMfa(admin);
    companyA = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Identity A', code: 'IDA' })
        .expect(201)
    ).body.id;
    companyB = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Identity B', code: 'IDB' })
        .expect(201)
    ).body.id;
    connection = (
      await api(app)
        .post('/tenant/identity/connections')
        .set(bearer(admin))
        .send({
          name: 'Fixture OIDC',
          issuer,
          clientId: 'identity-client',
          clientSecret: 'fixture-client-secret',
          enabled: true,
        })
        .expect(201)
    ).body.id;
    scimToken = (
      await api(app)
        .post('/tenant/identity/credentials')
        .set(bearer(admin))
        .send({ connectionId: connection, name: 'Fixture provisioner', days: 2 })
        .expect(201)
    ).body.token;
  });
  afterAll(async () => {
    await app?.close();
    await other?.close();
    await pool?.end();
    await new Promise<void>((resolve) => idp?.close(() => resolve()));
  });

  it('checks current role and disability on both instances using an already-issued token', async () => {
    const { user, session } = await createUser();
    await api(other).get('/tenant/employees').set(bearer(session.accessToken)).expect(200);
    await api(app)
      .patch(`/tenant/users/${user.id}`)
      .set(bearer(admin))
      .send({ role: 'employee' })
      .expect(200);
    await api(other).get('/tenant/employees').set(bearer(session.accessToken)).expect(403);
    await api(app)
      .patch(`/tenant/users/${user.id}`)
      .set(bearer(admin))
      .send({ disabled: true })
      .expect(200);
    await api(other).get('/account').set(bearer(session.accessToken)).expect(401);
    await api(app)
      .patch(`/tenant/users/${user.id}`)
      .set(bearer(admin))
      .send({ disabled: false })
      .expect(200);
    await api(other).get('/account').set(bearer(session.accessToken)).expect(401);
  });
  it('logout ends access tokens and refresh reuse ends the replacement session', async () => {
    const first = (await createUser()).session;
    const rotated = (
      await api(other).post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200)
    ).body;
    await api(app).get('/account').set(bearer(first.accessToken)).expect(401);
    await api(app).post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await api(other).get('/account').set(bearer(rotated.accessToken)).expect(401);
    const second = (await createUser()).session;
    await api(other).post('/auth/logout').send({ refreshToken: second.refreshToken }).expect(204);
    await api(app).get('/account').set(bearer(second.accessToken)).expect(401);
  });
  it('revokes a refresh child even when sign-out starts before its transaction commits', async () => {
    const { user, session } = await createUser();
    const service = other.get(AuthService) as unknown as {
      issue: (...args: unknown[]) => Promise<unknown>;
    };
    const appDb = other.get<Database>(DB),
      transact = appDb.transaction.bind(appDb),
      issue = service.issue.bind(service);
    let release!: () => void, ready!: () => void;
    const commit = new Promise<void>((resolve) => (release = resolve)),
      paused = new Promise<void>((resolve) => (ready = resolve));
    let txSpy: ReturnType<typeof vi.spyOn> | undefined;
    const pause: Database['transaction'] = <T>(
      work: (tx: Tx) => Promise<T>,
      config?: Parameters<Database['transaction']>[1],
    ) =>
      transact(async (tx) => {
        const result = await work(tx);
        ready();
        await commit;
        return result;
      }, config);
    const issueSpy = vi.spyOn(service, 'issue').mockImplementationOnce((...args) => {
      txSpy = vi.spyOn(appDb, 'transaction').mockImplementationOnce(pause);
      return issue(...args);
    });
    try {
      const request = Promise.resolve(
        api(other).post('/auth/refresh').send({ refreshToken: session.refreshToken }),
      );
      await paused;
      const revoked = app.get(AuthService).revokeAll('tenant', user.id);
      await vi.waitFor(
        async () => {
          const rows = await appDb.execute(
            sql`select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike 'update%auth_sessions%'`,
          );
          expect(Number(rows.rows[0]?.n)).toBeGreaterThan(0);
        },
        { timeout: 3000, interval: 10 },
      );
      release();
      const result = await request;
      expect(result.status).toBe(200);
      await revoked;
      await api(app).get('/account').set(bearer(result.body.accessToken)).expect(401);
      await api(app)
        .post('/auth/refresh')
        .send({ refreshToken: result.body.refreshToken })
        .expect(401);
    } finally {
      release();
      issueSpy.mockRestore();
      txSpy?.mockRestore();
    }
  });
  it('does not export a denied read field even when its export box is enabled', () => {
    const fields = allFields();
    fields.identity.read = false;
    const principal: AuthUser = {
      kind: 'tenant',
      id: adminId,
      tenantId,
      role: 'hr_officer',
      policy: {
        custom: true,
        grants: [
          {
            id: 'fixture',
            roleId: 'fixture',
            name: 'Restricted export',
            scope: 'all',
            companyIds: [],
            relationship: 'all',
            source: 'local',
            permissions: ['employees.read'],
            deniedPermissions: [],
            fields,
          },
        ],
      },
    };
    expect(fieldAllowed(principal, 'identity', 'export')).toBe(false);
    expect(() =>
      projectFields(new StreamableFile(Buffer.from('private file')), principal),
    ).toThrow();
  });
  it('keeps unrelated permissions bound to their own companies and revokes the final grant to none', async () => {
    const { user, session } = await createUser();
    const directory = await role(['employees.read']),
      attendance = await role(['attendance.manage']);
    const first = (await assign(user.id, directory.id, [companyA]).expect(201)).body;
    await assign(user.id, attendance.id, [companyB]).expect(201);
    const org = (await api(other).get('/tenant/org').set(bearer(session.accessToken)).expect(200))
      .body;
    expect(org.legalEntities.map((c: { id: string }) => c.id)).toEqual([companyA]);
    await api(app)
      .delete(`/tenant/identity/assignments/${first.id}`)
      .set(bearer(admin))
      .expect(200);
    await api(other).get('/tenant/employees').set(bearer(session.accessToken)).expect(403);
    const grants = (
      await api(app).get('/tenant/identity').set(bearer(admin)).expect(200)
    ).body.users.find((u: { id: string }) => u.id === user.id).grants;
    for (const grant of grants)
      await api(app)
        .delete(`/tenant/identity/assignments/${grant.id}`)
        .set(bearer(admin))
        .expect(200);
    const [login] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(tenantUsers).where(eq(tenantUsers.id, user.id)),
    );
    expect(login!.accessMode).toBe('custom');
    expect(login!.scopeMode).toBe('none');
  });
  it('denials beat allowances and a role update affects existing sessions', async () => {
    const { user, session } = await createUser();
    const allow = await role(['employees.read']);
    await assign(user.id, allow.id, [companyA]).expect(201);
    const deny = await role([], allFields(), ['employees.read']);
    await assign(user.id, deny.id, [companyA]).expect(201);
    await api(other).get('/tenant/employees').set(bearer(session.accessToken)).expect(403);
    await api(app)
      .put(`/tenant/identity/roles/${deny.id}`)
      .set(bearer(admin))
      .send({
        name: deny.name,
        version: deny.version,
        fields: deny.fields,
        permissions: ['employees.read'],
        deniedPermissions: [],
      })
      .expect(200);
    await api(other).get('/tenant/employees').set(bearer(session.accessToken)).expect(200);
    await api(app)
      .put(`/tenant/identity/roles/${deny.id}`)
      .set(bearer(admin))
      .send({
        name: deny.name,
        permissions: [],
        deniedPermissions: [],
        fields: allFields(),
        version: deny.version,
      })
      .expect(409);
  });
  it('blocks restricted-field input, indirect filtering, payroll and exports', async () => {
    const { user, session } = await createUser();
    const limited = await role(
      ['employees.read', 'employees.write', 'employees.identity', 'documents.manage'],
      emptyFieldPolicy(),
    );
    await assign(user.id, limited.id, [companyA]).expect(201);
    const pay = await role(['payroll.view'], emptyFieldPolicy());
    await assign(user.id, pay.id, [], 'all').expect(201);
    await api(other)
      .get('/tenant/employees?search=017')
      .set(bearer(session.accessToken))
      .expect(403);
    await api(other).get('/tenant/payroll/runs').set(bearer(session.accessToken)).expect(403);
    await api(other)
      .patch(`/tenant/employees/${adminId}`)
      .set(bearer(session.accessToken))
      .send({ identity: { nid: '1234567890' } })
      .expect(403);
    await api(other)
      .get(`/tenant/documents/${adminId}/file`)
      .set(bearer(session.accessToken))
      .expect(403);
    await api(other).get('/tenant/identity').set(bearer(session.accessToken)).expect(403);
  });
  it('projects restricted employee fields, permits a safe partial edit and preserves own service', async () => {
    const { user, session } = await createUser('employee');
    const employee = await hirePerson(companyA);
    await api(app)
      .put(`/tenant/identity/users/${user.id}/employee`)
      .set(bearer(admin))
      .send({ employeeId: employee.id })
      .expect(200);
    const restricted = await role(
      ['employees.read', 'employees.write', 'employees.identity'],
      emptyFieldPolicy(),
    );
    await assign(user.id, restricted.id, [companyA]).expect(201);
    const detail = (
      await api(other)
        .get(`/tenant/employees/${employee.id}`)
        .set(bearer(session.accessToken))
        .expect(200)
    ).body;
    expect(detail).toMatchObject({
      fullName: 'Scoped person',
      fatherName: null,
      dateOfBirth: null,
      mobilePhone: null,
      presentAddress: null,
      identity: null,
      isAdolescent: null,
      paymentAccounts: [],
      nominees: [],
    });
    await api(other)
      .patch(`/tenant/employees/${employee.id}`)
      .set(bearer(session.accessToken))
      .send({ fullName: 'Scoped person edited' })
      .expect(200);
    await api(other)
      .put(`/tenant/employees/${employee.id}/payment-accounts`)
      .set(bearer(session.accessToken))
      .send([])
      .expect(403);
    await api(other)
      .put(`/tenant/employees/${employee.id}/nominees`)
      .set(bearer(session.accessToken))
      .send([])
      .expect(403);
    const own = (
      await api(other).get('/tenant/me/employee').set(bearer(session.accessToken)).expect(200)
    ).body;
    expect(own.identity.nid).toBe(employee.identity.nid);
  });
  it('enforces own and direct-report directory relationships within the granted company', async () => {
    const { user, session } = await createUser('employee');
    const manager = await hirePerson(companyA),
      report = await hirePerson(companyA, manager.id);
    await api(app)
      .put(`/tenant/identity/users/${user.id}/employee`)
      .set(bearer(admin))
      .send({ employeeId: manager.id })
      .expect(200);
    const directory = await role(['employees.read', 'employees.identity']);
    const grant = (
      await api(app)
        .post(`/tenant/identity/users/${user.id}/assignments`)
        .set(bearer(admin))
        .send({
          roleId: directory.id,
          scope: 'selected',
          companyIds: [companyA],
          relationship: 'direct_reports',
        })
        .expect(201)
    ).body;
    let list = (
      await api(other).get('/tenant/employees').set(bearer(session.accessToken)).expect(200)
    ).body;
    expect(list.items.map((e: { id: string }) => e.id)).toEqual([report.id]);
    await api(app)
      .delete(`/tenant/identity/assignments/${grant.id}`)
      .set(bearer(admin))
      .expect(200);
    await api(app)
      .post(`/tenant/identity/users/${user.id}/assignments`)
      .set(bearer(admin))
      .send({
        roleId: directory.id,
        scope: 'selected',
        companyIds: [companyA],
        relationship: 'own',
      })
      .expect(201);
    list = (await api(other).get('/tenant/employees').set(bearer(session.accessToken)).expect(200))
      .body;
    expect(list.items.map((e: { id: string }) => e.id)).toEqual([manager.id]);
  });
  it('filters the recorded company of history after an employee transfers into scope', async () => {
    const employee = await hirePerson(companyB),
      { user, session } = await createUser();
    // Legacy history predates M4's reviewed-transfer gate. Only this isolated owner fixture
    // bypasses the new write trigger; the API must still scope each recorded company.
    await runAsTenant(db, tenantId, async (tx) => {
      const [prior] = await tx
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.employeeId, employee.id));
      await tx.execute(sql`alter table job_assignments disable trigger job_currency_boundary`);
      await tx
        .update(jobAssignments)
        .set({ effectiveTo: '2026-09-30' })
        .where(eq(jobAssignments.id, prior!.id));
      await tx.insert(jobAssignments).values({
        tenantId,
        employeeId: employee.id,
        event: 'transfer',
        effectiveFrom: '2026-10-01',
        legalEntityId: companyA,
        employmentType: prior!.employmentType,
        workerCategory: prior!.workerCategory,
        reason: 'Historical pre-M4 scope fixture',
      });
      await tx.execute(sql`set constraints all immediate`);
      await tx.execute(sql`alter table job_assignments enable trigger job_currency_boundary`);
    });
    const directory = await role(['employees.read']);
    await assign(user.id, directory.id, [companyA]).expect(201);
    const history = (
      await api(other)
        .get(`/tenant/employees/${employee.id}/job-history`)
        .set(bearer(session.accessToken))
        .expect(200)
    ).body;
    expect(history).toHaveLength(1);
    expect(history[0].legalEntity.id).toBe(companyA);
  });
  it('binds a pending MFA proof to the password and authority revision without consuming a recovery code', async () => {
    const { user, session } = await createUser();
    const recovery = await adminMfa(session.accessToken);
    const pending = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: slug, email: user.email, password: testEnv().password })
        .expect(200)
    ).body;
    await api(app).post(`/tenant/users/${user.id}/reset-password`).set(bearer(admin)).expect(200);
    await api(other)
      .post('/auth/mfa/verify')
      .send({ mfaToken: pending.mfaToken, code: recovery.recoveryCodes[0] })
      .expect(401);
  });
  it('rejects a password reset between the MFA revision check and the issuance row read', async () => {
    const { user, session } = await createUser(),
      setup = await adminMfa(session.accessToken);
    const pending = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: slug, email: user.email, password: testEnv().password })
        .expect(200)
    ).body;
    const service = app.get(AuthService) as unknown as {
      proofRevision: (subject: unknown) => Promise<number>;
    };
    const original = service.proofRevision.bind(service);
    let revisions = 0;
    const spy = vi.spyOn(service, 'proofRevision').mockImplementation(async (subject) => {
      const revision = await original(subject);
      if (++revisions === 2)
        await api(other)
          .post(`/tenant/users/${user.id}/reset-password`)
          .set(bearer(admin))
          .expect(200);
      return revision;
    });
    try {
      await api(app)
        .post('/auth/mfa/verify')
        .send({ mfaToken: pending.mfaToken, code: setup.recoveryCodes[0] })
        .expect(401);
      expect(revisions).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
  it('stops a protected request already waiting behind a committed login revocation', async () => {
    const { user, session } = await createUser();
    let unlock!: () => void, ready!: () => void, entered!: () => void;
    const released = new Promise<void>((resolve) => (unlock = resolve)),
      locked = new Promise<void>((resolve) => (ready = resolve)),
      started = new Promise<void>((resolve) => (entered = resolve));
    const store = other.get(TenantDb),
      original = store.run.bind(store);
    const intercepted = vi
      .spyOn(store, 'run')
      .mockImplementationOnce(<T>(work: (tx: Tx) => Promise<T>): Promise<T> => {
        entered();
        return original(work);
      });
    const revoke = runAsTenant(db, tenantId, async (tx) => {
      await tx.select().from(tenantUsers).where(eq(tenantUsers.id, user.id)).for('update');
      ready();
      await released;
      await tx
        .update(tenantUsers)
        .set({ disabledAt: new Date() })
        .where(eq(tenantUsers.id, user.id));
    });
    try {
      await locked;
      const request = Promise.resolve(
        api(other).get('/tenant/employees').set(bearer(session.accessToken)),
      );
      await started;
      unlock();
      await revoke;
      expect((await request).status).toBe(401);
    } finally {
      unlock();
      await revoke;
      intercepted.mockRestore();
    }
  });
  it('keeps private HR case text from a field-limited delegate while preserving the author’s own service', async () => {
    const owner = await createUser('employee'),
      employee = await hirePerson(companyA);
    await api(app)
      .put(`/tenant/identity/users/${owner.user.id}/employee`)
      .set(bearer(admin))
      .send({ employeeId: employee.id })
      .expect(200);
    const privateCase = (
      await api(app)
        .post('/tenant/employee-services/requests')
        .set(bearer(owner.session.accessToken))
        .send({
          category: 'other',
          subject: 'Private identity help',
          body: 'Private bank and contact details belong only to this case',
        })
        .expect(201)
    ).body;
    const ownOnly = await role([], emptyFieldPolicy());
    await assign(owner.user.id, ownOnly.id, [companyA]).expect(201);
    const own = (
      await api(other)
        .get(`/tenant/employee-services/requests/${privateCase.id}`)
        .set(bearer(owner.session.accessToken))
        .expect(200)
    ).body;
    expect(
      own.messages.some((m: { body: string }) => m.body.includes('Private bank and contact')),
    ).toBe(true);
    const reader = await createUser(),
      restricted = await role(
        ['employee_services.manage', 'recruitment.manage', 'performance.manage'],
        emptyFieldPolicy(),
      );
    await assign(reader.user.id, restricted.id, [companyA]).expect(201);
    await api(other)
      .get(`/tenant/employee-services/requests/${privateCase.id}`)
      .set(bearer(reader.session.accessToken))
      .expect(404);
    const account = (
      await api(other).get('/account').set(bearer(reader.session.accessToken)).expect(200)
    ).body;
    for (const permission of restricted.permissions)
      expect(account.permissions).not.toContain(permission);
  });
  it('refuses privileged custom grants and cross-tenant company references', async () => {
    await api(app)
      .post('/tenant/identity/roles')
      .set(bearer(admin))
      .send({ name: 'Cannot become admin', permissions: ['users.manage'], fields: allFields() })
      .expect(403);
    const { user } = await createUser(),
      r = await role(['employees.read']);
    await assign(user.id, r.id, ['00000000-0000-4000-8000-000000000000']).expect(400);
    await assign(adminId, r.id, [companyA]).expect(403);
  });
  it('SCIM authenticates only the provisioning credential and publishes its actual capabilities', async () => {
    await api(app).get('/scim/v2/Users').set(bearer(admin)).expect(401);
    await api(app).get('/account').set(bearer(scimToken)).expect(401);
    const config = (
      await api(app).get('/scim/v2/ServiceProviderConfig').set(bearer(scimToken)).expect(200)
    ).body;
    expect(config.bulk.supported).toBe(false);
    expect(config.etag.supported).toBe(true);
    const schemas = (await api(app).get('/scim/v2/Schemas').set(bearer(scimToken)).expect(200))
      .body;
    expect(schemas.totalResults).toBe(2);
  });
  it('publishes complex SCIM attributes and returns protocol errors for malformed JSON', async () => {
    const schemas = (await api(app).get('/scim/v2/Schemas').set(bearer(scimToken)).expect(200))
      .body;
    expect(
      schemas.Resources[0].attributes.find((a: { name: string }) => a.name === 'emails')
        .subAttributes,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'value', type: 'string' })]));
    await api(app)
      .get('/scim/v2/Schemas/' + encodeURIComponent(schemas.Resources[0].id))
      .set(bearer(scimToken))
      .expect('content-type', /scim\+json/)
      .expect(200);
    const malformed = await api(app)
      .post('/scim/v2/Users')
      .set(bearer(scimToken))
      .set('content-type', 'application/scim+json')
      .send('{')
      .expect(400);
    expect(malformed.body).toMatchObject({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '400',
    });
  });
  it('provisions no employment or implicit grants and never links an existing account by email', async () => {
    const local = await createUser();
    await api(app)
      .post('/scim/v2/Users')
      .set(bearer(scimToken))
      .send({ userName: local.user.email, active: true })
      .expect(409);
    const resource = await scimUser();
    const result = (
      await api(app)
        .get(
          `/scim/v2/Users?filter=${encodeURIComponent(`externalId eq "${resource.externalId}"`)}`,
        )
        .set(bearer(scimToken))
        .expect(200)
    ).body;
    expect(result.Resources.map((r: { id: string }) => r.id)).toEqual([resource.id]);
    const [user] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(tenantUsers).where(eq(tenantUsers.email, resource.userName)),
    );
    expect(user).toMatchObject({
      role: 'employee',
      accessMode: 'custom',
      scopeMode: 'none',
      passwordHash: null,
    });
    await api(app).get('/scim/v2/Users?filter=active%20pr').set(bearer(scimToken)).expect(400);
  });
  it('binds OIDC code, nonce, signature and browser/app verifier; consumes the handoff once', async () => {
    const resource = await scimUser(),
      flow = await startSso('mobile');
    const callbackResult = await callback(flow.url, resource.externalId);
    expect(callbackResult.status).toBe(303);
    expect(callbackResult.headers.location).toContain(flow.flowId);
    await api(other)
      .post('/auth/sso/exchange')
      .send({ flowId: flow.flowId, verifier: randomBytes(32).toString('base64url') })
      .expect(202);
    const session = (
      await api(other)
        .post('/auth/sso/exchange')
        .send({ flowId: flow.flowId, verifier: flow.verifier })
        .expect(200)
    ).body.result;
    expect(session.user.email).toBe(resource.userName);
    await api(app).get('/tenant/employees').set(bearer(session.accessToken)).expect(403);
    await api(app)
      .post('/auth/sso/exchange')
      .send({ flowId: flow.flowId, verifier: flow.verifier })
      .expect(202);
    await api(app)
      .post('/auth/login')
      .send({ tenant: slug, email: resource.userName, password: testEnv().password })
      .expect(401);
  });
  it('accepts an old signing key only during the configured overlap, with current authority checks', async () => {
    const { user, session } = await createUser(),
      old = app.get<AppConfig>(APP_CONFIG);
    const signingConfig = {
      JWT_ACCESS_SECRET: randomBytes(48).toString('base64'),
      JWT_ACCESS_KEY_ID: 'rotated',
      JWT_PREVIOUS_ACCESS_SECRET: old.JWT_ACCESS_SECRET,
      JWT_PREVIOUS_KEY_ID: old.JWT_ACCESS_KEY_ID,
      JWT_PREVIOUS_VALID_UNTIL: new Date(Date.now() + 60_000).toISOString(),
    };
    const overlap = await bootApp(signingConfig);
    let current: string;
    try {
      await api(overlap).get('/account').set(bearer(session.accessToken)).expect(200);
      current = (
        await api(overlap)
          .post('/auth/login')
          .send({ tenant: slug, email: user.email, password: testEnv().password })
          .expect(200)
      ).body.accessToken;
    } finally {
      await overlap.close();
    }
    const cutoff = await bootApp({
      ...signingConfig,
      JWT_PREVIOUS_VALID_UNTIL: new Date(Date.now() - 1000).toISOString(),
    });
    try {
      await api(cutoff).get('/account').set(bearer(session.accessToken)).expect(401);
      await api(cutoff).get('/account').set(bearer(current!)).expect(200);
      await api(app)
        .patch(`/tenant/users/${user.id}`)
        .set(bearer(admin))
        .send({ disabled: true })
        .expect(200);
      await api(cutoff).get('/account').set(bearer(current!)).expect(401);
    } finally {
      await cutoff.close();
    }
  });
  it('verifies a rotated provider signing key and rejects a bad signature', async () => {
    const managed = await scimUser();
    activeKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    activeKid = 'rotated';
    try {
      let start = await startSso('mobile');
      let result = await callback(start.url, managed.externalId);
      expect(result.headers.location).toContain('/auth/sso/complete?');
      await api(app)
        .post('/auth/sso/exchange')
        .send({ flowId: start.flowId, verifier: start.verifier })
        .expect(200);
      corruptSignature = true;
      start = await startSso('mobile');
      result = await callback(start.url, managed.externalId);
      expect(result.headers.location).toContain('/login?sso=failed');
    } finally {
      activeKeys = keys;
      activeKid = 'fixture';
      corruptSignature = false;
    }
  });
  it('keeps TOTP replay protection after the Redis step key is lost', async () => {
    const { user, session } = await createUser();
    const setup = (
      await api(app).post('/account/mfa/setup').set(bearer(session.accessToken)).expect(200)
    ).body;
    const code = totpAt(setup.secret, new Date());
    await api(app)
      .post('/account/mfa/confirm')
      .set(bearer(session.accessToken))
      .send({ code })
      .expect(200);
    await app.get(SecurityState).remove(`totp:tenant:${user.id}`);
    const pending = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: slug, email: user.email, password: testEnv().password })
        .expect(200)
    ).body;
    await api(other)
      .post('/auth/mfa/verify')
      .send({ mfaToken: pending.mfaToken, code })
      .expect(401);
    await api(other)
      .post('/auth/mfa/verify')
      .send({
        mfaToken: pending.mfaToken,
        code: totpAt(setup.secret, new Date(Date.now() + 30_000)),
      })
      .expect(200);
  });
  it.each([
    { nonce: 'wrong-nonce' },
    { aud: 'wrong-client' },
    { iss: 'https://wrong-issuer.invalid' },
  ])('rejects altered signed OIDC claims %j', async (claims) => {
    const resource = await scimUser(),
      flow = await startSso();
    const result = await callback(flow.url, resource.externalId, claims);
    expect(result.headers.location).toContain('sso=failed');
    await api(other)
      .post('/auth/sso/exchange')
      .send({ flowId: flow.flowId, verifier: flow.verifier })
      .expect(202);
  });
  it('requires current ETags, makes deactivation immediate and does not revive independent disables', async () => {
    const resource = await scimUser(),
      flow = await startSso();
    await callback(flow.url, resource.externalId);
    const session = (
      await api(app)
        .post('/auth/sso/exchange')
        .send({ flowId: flow.flowId, verifier: flow.verifier })
        .expect(200)
    ).body.result;
    const deactivate = { Operations: [{ op: 'Replace', path: 'active', value: false }] };
    const off = (
      await api(app)
        .patch(`/scim/v2/Users/${resource.id}`)
        .set(bearer(scimToken))
        .send(deactivate)
        .expect(200)
    ).body;
    expect(off.active).toBe(false);
    await api(other).get('/account').set(bearer(session.accessToken)).expect(401);
    await api(app)
      .patch(`/scim/v2/Users/${resource.id}`)
      .set(bearer(scimToken))
      .set('if-match', resource.meta.version)
      .send({ Operations: [{ op: 'Replace', path: 'active', value: true }] })
      .expect(412);
    const [login] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(tenantUsers).where(eq(tenantUsers.email, resource.userName)),
    );
    await api(app)
      .patch(`/tenant/users/${login!.id}`)
      .set(bearer(admin))
      .send({ disabled: true })
      .expect(200);
    const latest = (
      await api(app).get(`/scim/v2/Users/${resource.id}`).set(bearer(scimToken)).expect(200)
    ).body;
    const on = (
      await api(app)
        .patch(`/scim/v2/Users/${resource.id}`)
        .set(bearer(scimToken))
        .set('if-match', latest.meta.version)
        .send({ Operations: [{ op: 'Replace', path: 'active', value: true }] })
        .expect(200)
    ).body;
    expect(on.active).toBe(false);
    const again = await startSso();
    expect((await callback(again.url, resource.externalId)).headers.location).toContain(
      'sso=failed',
    );
    await api(app).delete(`/scim/v2/Users/${resource.id}`).set(bearer(scimToken)).expect(204);
    await api(app).delete(`/scim/v2/Users/${resource.id}`).set(bearer(scimToken)).expect(204);
    await api(app).get(`/scim/v2/Users/${resource.id}`).set(bearer(scimToken)).expect(404);
    await api(app)
      .post('/scim/v2/Users')
      .set(bearer(scimToken))
      .send({ userName: resource.userName, externalId: resource.externalId, active: true })
      .expect(409);
  });
  it('SCIM groups grant only approved mappings; membership removal cannot fall through to all companies', async () => {
    const resource = await scimUser();
    const group = (
      await api(app)
        .post('/scim/v2/Groups')
        .set(bearer(scimToken))
        .send({ displayName: 'Fixture scoped group', members: [{ value: resource.id }] })
        .expect(201)
    ).body;
    const r = await role(['employees.read']);
    await api(app)
      .put(`/tenant/identity/groups/${group.id}/mappings`)
      .set(bearer(admin))
      .send({ roleId: r.id, scope: 'selected', companyIds: [companyA] })
      .expect(200);
    const flow = await startSso();
    await callback(flow.url, resource.externalId);
    const session = (
      await api(app)
        .post('/auth/sso/exchange')
        .send({ flowId: flow.flowId, verifier: flow.verifier })
        .expect(200)
    ).body.result;
    await api(other)
      .get('/tenant/org')
      .set(bearer(session.accessToken))
      .expect(200)
      .expect((res) =>
        expect(res.body.legalEntities.map((c: { id: string }) => c.id)).toEqual([companyA]),
      );
    await api(app)
      .patch(`/scim/v2/Groups/${group.id}`)
      .set(bearer(scimToken))
      .set('if-match', group.meta.version)
      .send({ Operations: [{ op: 'remove', path: `members[value eq "${resource.id}"]` }] })
      .expect(200);
    await api(other).get('/tenant/employees').set(bearer(session.accessToken)).expect(403);
    const approve = await role(['payroll.approve']);
    await api(app)
      .put(`/tenant/identity/groups/${group.id}/mappings`)
      .set(bearer(admin))
      .send({ roleId: approve.id, scope: 'all', companyIds: [] })
      .expect(403);
  });
  it('accepts initial Entra-style updates without ETags but rejects stale reactivation and removed-member replay', async () => {
    const user = await scimUser();
    await api(app)
      .patch(`/scim/v2/Users/${user.id}`)
      .set(bearer(scimToken))
      .send({ Operations: [{ op: 'Replace', path: 'name.givenName', value: 'Updated' }] })
      .expect(200);
    const group = (
      await api(app)
        .post('/scim/v2/Groups')
        .set(bearer(scimToken))
        .send({ displayName: 'No ETag group' })
        .expect(201)
    ).body;
    const add = { Operations: [{ op: 'Add', path: 'members', value: [{ value: user.id }] }] };
    await api(app)
      .patch(`/scim/v2/Groups/${group.id}`)
      .set(bearer(scimToken))
      .send(add)
      .expect(200);
    await api(app)
      .patch(`/scim/v2/Groups/${group.id}`)
      .set(bearer(scimToken))
      .send({ Operations: [{ op: 'Remove', path: `members[value eq "${user.id}"]` }] })
      .expect(200);
    await api(app)
      .patch(`/scim/v2/Groups/${group.id}`)
      .set(bearer(scimToken))
      .send(add)
      .expect(428);
    const current = (
      await api(app).get(`/scim/v2/Groups/${group.id}`).set(bearer(scimToken)).expect(200)
    ).body;
    await api(app)
      .patch(`/scim/v2/Groups/${group.id}`)
      .set(bearer(scimToken))
      .set('if-match', current.meta.version)
      .send(add)
      .expect(200);
    await api(app)
      .patch(`/scim/v2/Users/${user.id}`)
      .set(bearer(scimToken))
      .send({ Operations: [{ op: 'Replace', path: 'active', value: false }] })
      .expect(200);
    await api(app)
      .patch(`/scim/v2/Users/${user.id}`)
      .set(bearer(scimToken))
      .send({ Operations: [{ op: 'Replace', path: 'active', value: true }] })
      .expect(428);
  });
  it('serializes concurrent PATCHes with a version and does not disclose client secrets', async () => {
    const user = await scimUser();
    const results = await Promise.all(
      [app, other].map((instance) =>
        api(instance)
          .patch(`/scim/v2/Users/${user.id}`)
          .set(bearer(scimToken))
          .set('if-match', user.meta.version)
          .send({ Operations: [{ op: 'Replace', path: 'displayName', value: 'Concurrent name' }] }),
      ),
    );
    expect(results.map((r) => r.status).toSorted()).toEqual([200, 412]);
    const overview = (await api(app).get('/tenant/identity').set(bearer(admin)).expect(200)).text;
    expect(overview).not.toContain('fixture-client-secret');
    expect(overview).not.toContain(scimToken);
  });
  it('requires recent local proof when linking an existing account, even if an older session used MFA', async () => {
    const { user, session } = await createUser();
    await adminMfa(session.accessToken);
    await db
      .update(authSessions)
      .set({
        authenticatedAt: new Date(Date.now() - 15 * 60_000),
        mfaAt: new Date(Date.now() - 15 * 60_000),
      })
      .where(eq(authSessions.subjectId, user.id));
    const result = await api(app)
      .post('/account/sso/link')
      .set(bearer(session.accessToken))
      .send({ binding: bindingHash(randomBytes(32).toString('base64url')) })
      .expect(403);
    expect(result.body.code).toBe('recent_auth_required');
  });
  it('requires two successful emergency recoveries before enforcement and keeps the last two protected', async () => {
    const recovery: {
      user: { id: string; email: string };
      setup: { recoveryCodes: string[] };
      token: string;
    }[] = [];
    for (let i = 0; i < 2; i++) {
      const { user, session } = await createUser('tenant_admin');
      const setup = await adminMfa(session.accessToken);
      await api(app)
        .put(`/tenant/identity/users/${user.id}/emergency`)
        .set(bearer(admin))
        .send({ enabled: true })
        .expect(200);
      recovery.push({ user, setup, token: session.accessToken });
    }
    for (const { user, token } of recovery) {
      const verifier = randomBytes(32).toString('base64url');
      const start = (
        await api(app)
          .post(`/tenant/identity/connections/${connection}/test`)
          .set(bearer(token))
          .send({ binding: bindingHash(verifier) })
          .expect(201)
      ).body;
      const result = await callback(start.url, `recovery-subject-${user.id}`);
      expect(result.headers.location).toContain('/auth/sso/complete?');
      await api(app)
        .post('/auth/sso/exchange')
        .send({ flowId: start.flowId, verifier })
        .expect(200);
    }
    expect(
      (
        await api(app)
          .put(`/tenant/identity/connections/${connection}/enforcement`)
          .set(bearer(admin))
          .send({ enabled: true })
          .expect(403)
      ).body.code,
    ).toBe('recovery_required');
    for (const { user, setup } of recovery) {
      const pending = (
        await api(app)
          .post('/auth/login')
          .send({ tenant: slug, email: user.email, password: testEnv().password })
          .expect(200)
      ).body;
      await api(other)
        .post('/auth/mfa/verify')
        .send({ mfaToken: pending.mfaToken, code: setup.recoveryCodes[0] })
        .expect(200);
    }
    await api(app)
      .put(`/tenant/identity/connections/${connection}/enforcement`)
      .set(bearer(admin))
      .send({ enabled: true })
      .expect(200);
    await api(app)
      .put(`/tenant/identity/users/${recovery[0]!.user.id}/emergency`)
      .set(bearer(admin))
      .send({ enabled: false })
      .expect(403);
    await api(app)
      .put(`/tenant/identity/connections/${connection}/enforcement`)
      .set(bearer(admin))
      .send({ enabled: false })
      .expect(200);
  });
  it('repeated one-use state and rate limits are shared across instances; unavailable Redis fails closed', async () => {
    const one = app.get(SecurityState),
      two = other.get(SecurityState),
      key = `fixture:${seq++}`;
    expect(await one.once(key, 60_000)).toBe(true);
    expect(await two.once(key, 60_000)).toBe(false);
    expect((await one.count(key + 'rate', 60_000)).count).toBe(1);
    expect((await two.count(key + 'rate', 60_000)).count).toBe(2);
    const down = await bootApp({
      SECURITY_STORE: 'redis',
      REDIS_URL: 'redis://127.0.0.1:1',
      SECURITY_NAMESPACE: 'fixture-down',
    });
    try {
      await api(down)
        .post('/auth/login')
        .send({ tenant: slug, email: 'nobody@example.test', password: 'wrong-password' })
        .expect(503);
    } finally {
      await down.close();
    }
  });
});
