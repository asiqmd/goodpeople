import { readFile } from 'node:fs/promises';
import { verifyWebhook } from '../examples/verify-webhook.js';
import { createServer, type Server } from 'node:http';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  createDb,
  runAsTenant,
  employees,
  jobAssignments,
  attendanceDays,
  apiClients,
  apiClientCredentials,
  webhookDeliveries,
  integrationEvents,
  jobLeases,
  type Database,
} from '@gp/db';
import { PUBLIC_FIELDS, emptyFieldPolicy, ACCESS_FIELDS } from '@gp/shared';
import { eq, and } from 'drizzle-orm';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';
import { totpAt } from '../src/modules/auth/totp.js';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import { WebhookWorker } from '../src/modules/integrations/webhook-worker.js';
import { DurableJobs } from '../src/jobs/durable-jobs.js';
import { DB } from '../src/db/db.module.js';
import { runInTenantContext, currentPrincipal } from '../src/common/request-context.js';
import { PublicDirectory } from '../src/modules/integrations/public.service.js';
import { SCHEDULED_TASKS } from '../src/jobs/scheduled-worker.js';
import { ModuleRef } from '@nestjs/core';

const fields = () =>
  Object.fromEntries(
    ACCESS_FIELDS.map((f) => [f, { read: true, write: true, export: true }]),
  ) as ReturnType<typeof emptyFieldPolicy>;

describe('public integrations and durable workers', () => {
  let app: INestApplication,
    other: INestApplication,
    db: Database,
    pool: ReturnType<typeof createDb>['pool'];
  let admin: string,
    tenantId: string,
    slug: string,
    ownerId: string,
    a: string,
    b: string,
    receiver: Server,
    url: string;
  let client: { id: string; clientId: string; secret: string }, access: string;
  let seq = 0,
    status = 200;
  const receipts: { body: string; headers: Record<string, string | string[] | undefined> }[] = [];
  const postClient = (body: Record<string, unknown>) =>
    api(app)
      .post('/tenant/integrations/clients')
      .set(bearer(admin))
      .send({
        name: `Client ${seq++}`,
        ownerId,
        days: 30,
        scopes: ['org:read', 'employees:read', 'attendance:read'],
        fields: [...PUBLIC_FIELDS],
        scope: 'selected',
        companyIds: [a],
        ...body,
      });
  function token(c = client, instance = app, scope?: string) {
    return api(instance)
      .post('/oauth/token')
      .auth(c.clientId, c.secret)
      .type('form')
      .send({ grant_type: 'client_credentials', ...(scope ? { scope } : {}) });
  }
  async function hire(companyId = a) {
    return (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: `API-${seq++}`,
          fullName: 'Public sandbox employee',
          fatherName: 'Private father',
          motherName: 'Private mother',
          dateOfBirth: '2000-01-01',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: { line: 'Private address', district: 'Dhaka', division: 'dhaka' },
          permanentAddress: { line: 'Private home', district: 'Dhaka', division: 'dhaka' },
          identity: { nid: String(1234567890 + seq) },
          joinedOn: '2026-10-01',
          job: {
            legalEntityId: companyId,
            employmentType: 'probationer',
            workerCategory: 'worker',
          },
        })
        .expect(201)
    ).body.employee;
  }
  const work = (instance = app) =>
    runInTenantContext(tenantId, () => instance.get(WebhookWorker).runTenant());
  async function subscribe(c = client) {
    return (
      await api(app)
        .post('/tenant/integrations/webhooks')
        .set(bearer(admin))
        .send({ clientId: c.id, name: 'Sandbox receiver', url, events: ['employee.created'] })
        .expect(201)
    ).body;
  }
  beforeAll(async () => {
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 4 }));
    receiver = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      receipts.push({ body, headers: req.headers });
      res.statusCode = status;
      if (status === 302) res.setHeader('Location', 'http://169.254.169.254/latest/meta-data');
      res.end('ok');
    });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/events`;
    const config = {
      SECURITY_STORE: 'redis',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6381',
      SECURITY_NAMESPACE: `gp:m2:${Date.now()}`,
      WEBHOOK_PRIVATE_HOSTS: '127.0.0.1',
      WEBHOOK_MAX_ATTEMPTS: '2',
    };
    app = await bootApp(config);
    other = await bootApp(config);
    const platform = await platformToken(app);
    slug = uniqueSlug('public');
    const assigned = (
      await api(app)
        .post('/platform/tenants')
        .set(bearer(platform))
        .send({
          name: 'Integration sandbox',
          slug,
          industryTemplate: 'corporate',
          billingMode: 'internal',
          planCode: 'enterprise',
          reason: 'Isolated M2 acceptance sandbox',
          admin: { name: 'Integration administrator', email: `admin@${slug}.test` },
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
    ownerId = session.user.id;
    const setup = (await api(app).post('/account/mfa/setup').set(bearer(admin)).expect(200)).body;
    await api(app)
      .post('/account/mfa/confirm')
      .set(bearer(admin))
      .send({ code: totpAt(setup.secret, new Date()) })
      .expect(200);
    a = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Public A', code: 'PA' })
        .expect(201)
    ).body.id;
    b = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Public B', code: 'PB' })
        .expect(201)
    ).body.id;
    client = (await postClient({}).expect(201)).body;
    access = (await token().expect(200)).body.access_token;
  });
  afterAll(async () => {
    await app?.close();
    await other?.close();
    await pool?.end();
    await new Promise<void>((r) => receiver?.close(() => r()));
  });
  it('keeps the service tables under forced tenant isolation and rejects a different tenant identifier', async () => {
    const appDb = app.get<Database>(DB);
    expect(await appDb.select().from(apiClients)).toHaveLength(0);
    const otherTenant = randomUUID();
    expect(
      await runAsTenant(appDb, otherTenant, (tx) => tx.select().from(apiClients)),
    ).toHaveLength(0);
    await token({ ...client, clientId: `gpcli.v1.${otherTenant}.${client.id}` }).expect(401);
  });
  it('uses a separate client-credentials grant with no refresh token or human authority', async () => {
    const result = await token().expect(200);
    expect(result.body).toMatchObject({ token_type: 'Bearer', expires_in: 300 });
    expect(result.body).not.toHaveProperty('refresh_token');
    await api(other).get('/tenant/employees').set(bearer(result.body.access_token)).expect(401);
    await api(app).get('/public/v1/employees').set(bearer(admin)).expect(401);
    await api(app)
      .post('/oauth/token')
      .auth(client.clientId, 'wrong')
      .type('form')
      .send({ grant_type: 'client_credentials' })
      .expect(401);
    await api(app)
      .post('/oauth/token')
      .auth(client.clientId, client.secret)
      .type('form')
      .send({ grant_type: 'password' })
      .expect(400);
    await token(client, app, 'payroll:approve').expect(400);
    const [stored] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(apiClientCredentials).where(eq(apiClientCredentials.clientId, client.id)),
    );
    expect(stored!.secretHash).not.toBe(client.secret);
  });
  it('pages only allowed companies and approved fields under an explicit service principal', async () => {
    const company = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Pagination scope', code: 'PAGE' + seq++ })
        .expect(201)
    ).body.id;
    const scoped = (await postClient({ companyIds: [company] }).expect(201)).body,
      pageToken = (await token(scoped).expect(200)).body.access_token;
    const one = await hire(company),
      two = await hire(company),
      foreign = await hire(b);
    let principal: unknown;
    const service = app.get(PublicDirectory),
      original = service.list.bind(service);
    const spy = vi.spyOn(service, 'list').mockImplementationOnce((...args) => {
      principal = currentPrincipal();
      return original(...args);
    });
    const first = await api(app)
      .get('/public/v1/employees?limit=1')
      .set(bearer(pageToken))
      .expect(200);
    spy.mockRestore();
    expect(principal).toMatchObject({ kind: 'service', id: scoped.id });
    const second = await api(other)
      .get('/public/v1/employees')
      .query({ limit: 1, cursor: first.body.page.next_cursor })
      .set(bearer(pageToken))
      .expect(200);
    expect(new Set([first.body.data[0].id, second.body.data[0].id])).toEqual(
      new Set([one.id, two.id]),
    );
    for (const row of [...first.body.data, ...second.body.data]) {
      expect(Object.keys(row).toSorted()).toEqual(
        [
          'id',
          'company_id',
          'employee_code',
          'display_name',
          'employment_status',
          'job',
        ].toSorted(),
      );
      expect(row.company_id).toBe(company);
    }
    await api(app).get(`/public/v1/employees/${foreign.id}`).set(bearer(pageToken)).expect(404);
    expect(
      (await api(app).get('/public/v1/companies').set(bearer(pageToken)).expect(200)).body.data.map(
        (c: { id: string }) => c.id,
      ),
    ).toEqual([company]);
    await api(app).get('/public/v1/employees?search=Private').set(bearer(pageToken)).expect(400);
    await api(app).get('/public/v1/employees?limit=201').set(bearer(pageToken)).expect(400);
    const otherClient = (await postClient({ companyIds: [b] }).expect(201)).body;
    const otherToken = (await token(otherClient).expect(200)).body.access_token;
    await api(app)
      .get('/public/v1/employees')
      .query({ cursor: first.body.page.next_cursor })
      .set(bearer(otherToken))
      .expect(400);
    const contract = await api(app).get('/public/v1/openapi.json').expect(200);
    expect(contract.body.info.version).toBe('1.0.0');
    expect(contract.body).toEqual(
      JSON.parse(
        await readFile(
          new URL('../../../docs/api/public-v1.openapi.json', import.meta.url),
          'utf8',
        ),
      ),
    );
    expect(contract.body.paths).not.toHaveProperty('/payroll');
    const view = (
      await api(app).get('/tenant/integrations').set(bearer(admin)).expect(200)
    ).body.clients.find((c: { id: string }) => c.id === scoped.id);
    await api(app)
      .patch(`/tenant/integrations/clients/${scoped.id}`)
      .set(bearer(admin))
      .send({
        name: view.name,
        ownerId,
        days: 30,
        scopes: view.scopes,
        fields: [],
        scope: 'selected',
        companyIds: [company],
        version: view.version,
      })
      .expect(200);
    const changed = (await token(scoped).expect(200)).body.access_token;
    await api(app)
      .get('/public/v1/employees')
      .query({ limit: 1, cursor: first.body.page.next_cursor })
      .set(bearer(changed))
      .expect(400);
  });
  it('does not emit unapproved optional fields and rejects private grants', async () => {
    await hire();
    await postClient({ fields: ['bank'] }).expect(400);
    const limited = (await postClient({ fields: [] }).expect(201)).body;
    const t = (await token(limited).expect(200)).body.access_token;
    const response = await api(app).get('/public/v1/employees').set(bearer(t)).expect(200);
    for (const row of response.body.data)
      expect(Object.keys(row).toSorted()).toEqual(['company_id', 'id']);
    const denied = await api(app)
      .get('/public/v1/employees?access_token=not-allowed')
      .set(bearer(t))
      .expect(400);
    expect(denied.body.error.request_id).toBe(denied.headers['x-request-id']);
  });
  it('expires old credentials immediately after zero-overlap rotation and revokes live tokens across instances', async () => {
    const c = (await postClient({}).expect(201)).body,
      old = (await token(c).expect(200)).body.access_token;
    const rotated = (
      await api(app)
        .post(`/tenant/integrations/clients/${c.id}/rotate`)
        .set(bearer(admin))
        .send({ overlapSeconds: 0 })
        .expect(201)
    ).body;
    await token(c).expect(401);
    await api(other).get('/public/v1/companies').set(bearer(old)).expect(401);
    const fresh = (await token({ ...c, secret: rotated.secret }).expect(200)).body.access_token;
    await api(app).delete(`/tenant/integrations/clients/${c.id}`).set(bearer(admin)).expect(200);
    await api(other).get('/public/v1/companies').set(bearer(fresh)).expect(401);
  });
  it('rejects wrong audience and expiry without accepting tokens on internal write routes', async () => {
    const config = app.get<AppConfig>(APP_CONFIG),
      secret = createHash('sha256')
        .update(config.JWT_ACCESS_SECRET + ':public:v1')
        .digest('hex');
    const jwt = new JwtService();
    for (const extra of [
      { audience: 'gp-human', expiresIn: 60 },
      { audience: 'gp-public-v1', expiresIn: -1 },
    ]) {
      const fake = await jwt.signAsync(
        {
          kind: 'service',
          typ: 'service',
          sub: client.id,
          tid: tenantId,
          cid: randomUUID(),
          ver: 1,
          scope: ['employees:read'],
        },
        { secret, keyid: config.JWT_ACCESS_KEY_ID, issuer: 'good-people', ...extra },
      );
      await api(app).get('/public/v1/employees').set(bearer(fake)).expect(401);
    }
    const claims = { ...jwt.decode(access) };
    delete claims.exp;
    const missingExpiry = await jwt.signAsync(claims, { secret, keyid: config.JWT_ACCESS_KEY_ID });
    await api(app).get('/public/v1/employees').set(bearer(missingExpiry)).expect(401);
    await api(app).post('/tenant/payroll/runs').set(bearer(access)).send({}).expect(401);
  });
  it('captures events transactionally and signs the exact minimal body; two senders claim once', async () => {
    const subscription = await subscribe();
    const before = receipts.length;
    const person = await hire();
    await Promise.all([work(app), work(other)]);
    const sent = receipts.slice(before).filter((r) => JSON.parse(r.body).resource.id === person.id);
    expect(sent).toHaveLength(1);
    const receipt = sent[0]!,
      event = JSON.parse(receipt.body);
    expect(event).toMatchObject({
      schema_version: '1',
      type: 'employee.created',
      tenant_id: tenantId,
      resource: { id: person.id, type: 'employee', company_id: a },
    });
    expect(Object.keys(event.resource).toSorted()).toEqual(['id', 'type', 'company_id'].toSorted());
    const h = receipt.headers,
      expected =
        'v1=' +
        createHmac('sha256', subscription.secret)
          .update(
            `v1.${h['gp-key-id']}.${h['gp-timestamp']}.${h['gp-event-id']}.${h['gp-delivery-id']}.${receipt.body}`,
          )
          .digest('hex');
    expect(h['gp-signature']).toBe(expected);
    const bindings = new Map([
      [
        subscription.keyId,
        { secret: subscription.secret, tenantId, subscriptionId: subscription.id },
      ],
    ]);
    expect(verifyWebhook(Buffer.from(receipt.body), h, bindings)).toMatchObject({ id: event.id });
    expect(() => verifyWebhook(Buffer.from(receipt.body + ' '), h, bindings)).toThrow(
      'invalid_webhook',
    );
    expect(() =>
      verifyWebhook(Buffer.from(receipt.body), h, bindings, Number(h['gp-timestamp']) + 301),
    ).toThrow('invalid_webhook');
    expect(() =>
      verifyWebhook(
        Buffer.from(receipt.body),
        { ...h, 'gp-subscription-id': randomUUID() },
        bindings,
      ),
    ).toThrow('invalid_webhook');

    const beforeCount = (
      await runAsTenant(db, tenantId, (tx) => tx.select().from(integrationEvents))
    ).length;
    await expect(
      runAsTenant(db, tenantId, async (tx) => {
        await tx
          .update(employees)
          .set({ fullName: 'Rolled back public edit' })
          .where(eq(employees.id, person.id));
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      (await runAsTenant(db, tenantId, (tx) => tx.select().from(integrationEvents))).length,
    ).toBe(beforeCount);
    await api(app)
      .put(`/tenant/integrations/webhooks/${subscription.id}/enabled`)
      .set(bearer(admin))
      .send({ enabled: false })
      .expect(200);
  });
  it('recovers a lost acknowledgement with the same event ID and supports dead-letter replay and key rotation', async () => {
    const subscription = await subscribe();
    status = 500;
    const person = await hire();
    await work();
    let [delivery] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ d: webhookDeliveries })
        .from(webhookDeliveries)
        .innerJoin(integrationEvents, eq(integrationEvents.id, webhookDeliveries.eventId))
        .where(
          and(
            eq(webhookDeliveries.subscriptionId, subscription.id),
            eq(integrationEvents.resourceId, person.id),
          ),
        ),
    );
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({ nextAttemptAt: new Date(0) })
        .where(eq(webhookDeliveries.id, delivery!.d.id)),
    );
    await work(other);
    [delivery] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ d: webhookDeliveries })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.id, delivery!.d.id)),
    );
    expect(delivery!.d.state).toBe('dead');
    const key = (
      await api(app)
        .post(`/tenant/integrations/webhooks/${subscription.id}/rotate`)
        .set(bearer(admin))
        .expect(201)
    ).body;
    await api(app)
      .post(`/tenant/integrations/webhooks/${subscription.id}/activate-key`)
      .set(bearer(admin))
      .expect(201);
    await api(app)
      .put(`/tenant/integrations/webhooks/${subscription.id}/enabled`)
      .set(bearer(admin))
      .send({ enabled: true })
      .expect(200);
    await api(app)
      .post(`/tenant/integrations/deliveries/${delivery!.d.id}/replay`)
      .set(bearer(admin))
      .send({ reason: 'Receiver repaired and approved' })
      .expect(201);
    status = 200;
    await work();
    const last = receipts.at(-1)!;
    expect(last.headers['gp-key-id']).toBe(key.keyId);
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({
          state: 'leased',
          leaseToken: randomUUID(),
          leaseUntil: new Date(0),
          nextAttemptAt: new Date(0),
          sentAt: null,
        })
        .where(eq(webhookDeliveries.id, delivery!.d.id)),
    );
    await work(other);
    expect(JSON.parse(receipts.at(-1)!.body).id).toBe(JSON.parse(last.body).id);
    expect(receipts.at(-1)!.headers['gp-delivery-id']).toBe(last.headers['gp-delivery-id']);
    await api(app)
      .put(`/tenant/integrations/webhooks/${subscription.id}/enabled`)
      .set(bearer(admin))
      .send({ enabled: false })
      .expect(200);
  });
  it('suppresses queued payloads after client revocation and refuses SSRF targets', async () => {
    for (const target of [
      'http://169.254.169.254/latest/meta-data',
      'https://127.0.0.2/events',
      'https://user:pass@example.com/events',
      'https://example.com/events?token=secret',
    ])
      await api(app)
        .post('/tenant/integrations/webhooks')
        .set(bearer(admin))
        .send({
          clientId: client.id,
          name: 'Rejected target',
          url: target,
          events: ['employee.created'],
        })
        .expect(400);
    const c = (await postClient({}).expect(201)).body,
      sub = await subscribe(c);
    await hire();
    const worker = app.get(WebhookWorker) as unknown as {
      fanout: (tenantId: string) => Promise<void>;
    };
    await worker.fanout(tenantId);
    const before = receipts.length;
    await api(app).delete(`/tenant/integrations/clients/${c.id}`).set(bearer(admin)).expect(200);
    await work();
    expect(receipts.length).toBe(before);
    const rows = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.subscriptionId, sub.id)),
    );
    expect(rows.every((r) => r.state === 'suppressed')).toBe(true);
  });
  it('rechecks owner ceilings, company grants, disablement and explicit review on both instances', async () => {
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({
          name: 'Accountable owner',
          email: `owner-${seq++}@${slug}.test`,
          role: 'hr_officer',
          scopeMode: 'none',
          companyIds: [],
        })
        .expect(201)
    ).body;
    const role = (
      await api(app)
        .post('/tenant/identity/roles')
        .set(bearer(admin))
        .send({
          name: 'Delegated integration owner',
          permissions: ['employees.read', 'attendance.manage'],
          deniedPermissions: [],
          fields: fields(),
        })
        .expect(201)
    ).body;
    const grant = (
      await api(app)
        .post(`/tenant/identity/users/${user.id}/assignments`)
        .set(bearer(admin))
        .send({ roleId: role.id, scope: 'selected', companyIds: [a] })
        .expect(201)
    ).body;
    await postClient({ ownerId: user.id, companyIds: [b] }).expect(403);
    await postClient({ ownerId: user.id, scope: 'all', companyIds: [] }).expect(403);
    const c = (await postClient({ ownerId: user.id }).expect(201)).body;
    const t = (await token(c).expect(200)).body.access_token;
    await api(other).get('/public/v1/employees').set(bearer(t)).expect(200);
    await api(app)
      .patch(`/tenant/users/${user.id}`)
      .set(bearer(admin))
      .send({ disabled: true })
      .expect(200);
    await api(other).get('/public/v1/employees').set(bearer(t)).expect(401);
    await api(app)
      .patch(`/tenant/users/${user.id}`)
      .set(bearer(admin))
      .send({ disabled: false })
      .expect(200);
    await token(c).expect(401);
    const view = (
      await api(app).get('/tenant/integrations').set(bearer(admin)).expect(200)
    ).body.clients.find((row: { id: string }) => row.id === c.id);
    expect(view.reviewRequired).toBe(true);
    await api(app)
      .patch(`/tenant/integrations/clients/${c.id}`)
      .set(bearer(admin))
      .send({
        name: 'Reviewed owner client',
        ownerId: user.id,
        days: 30,
        scopes: view.scopes,
        fields: view.fields,
        scope: 'selected',
        companyIds: [a],
        version: view.version,
      })
      .expect(200);
    const restored = (await token(c).expect(200)).body.access_token;
    await api(app)
      .delete(`/tenant/identity/assignments/${grant.id}`)
      .set(bearer(admin))
      .expect(200);
    await api(other).get('/public/v1/employees').set(bearer(restored)).expect(403);
    const ownRole = (
      await api(app)
        .post('/tenant/identity/roles')
        .set(bearer(admin))
        .send({
          name: 'Own directory owner',
          permissions: ['employees.read'],
          deniedPermissions: [],
          fields: fields(),
        })
        .expect(201)
    ).body;
    await api(app)
      .post(`/tenant/identity/users/${user.id}/assignments`)
      .set(bearer(admin))
      .send({ roleId: ownRole.id, scope: 'selected', companyIds: [a], relationship: 'own' })
      .expect(201);
    await postClient({ ownerId: user.id, scopes: ['employees:read'] }).expect(403);
  });
  it('exports processed historical attendance without raw punches or private day details', async () => {
    const allowed = await hire(),
      foreign = await hire(b);
    await runAsTenant(db, tenantId, (tx) =>
      tx.insert(attendanceDays).values(
        [allowed, foreign].map((e) => ({
          tenantId,
          employeeId: e.id,
          date: '2026-10-15',
          dayType: 'working' as const,
          status: 'present' as const,
          firstIn: new Date('2026-10-15T03:00:00Z'),
          lastOut: new Date('2026-10-15T12:00:00Z'),
          workedMinutes: 480,
          overtimeMinutes: 60,
          flags: ['outside_geofence' as const],
        })),
      ),
    );
    const result = await api(app)
      .get('/public/v1/attendance?date_from=2026-10-01&date_to=2026-10-31')
      .set(bearer(access))
      .expect(200);
    expect(
      result.body.data.some((r: { employee_id: string }) => r.employee_id === allowed.id),
    ).toBe(true);
    for (const row of result.body.data) {
      expect(row.company_id).toBe(a);
      expect(row).toMatchObject({ finalized: true, worked_minutes: 480, overtime_minutes: 60 });
      expect(row).not.toHaveProperty('flags');
      expect(row).not.toHaveProperty('firstIn');
      expect(row).not.toHaveProperty('first_in');
    }
    const narrow = (await token(client, app, 'employees:read').expect(200)).body.access_token;
    await api(app).get('/public/v1/attendance').set(bearer(narrow)).expect(403);
    await api(app)
      .get('/public/v1/attendance?date_from=2025-01-01&date_to=2026-01-01')
      .set(bearer(access))
      .expect(400);
  });
  it('shares rate limits and daily quotas across API instances and returns retry metadata', async () => {
    for (const limit of [{ PUBLIC_RATE_LIMIT: '1' }, { PUBLIC_DAILY_QUOTA: '1' }]) {
      const constrained = await bootApp({
        SECURITY_STORE: 'redis',
        REDIS_URL: app.get<AppConfig>(APP_CONFIG).REDIS_URL,
        SECURITY_NAMESPACE: app.get<AppConfig>(APP_CONFIG).SECURITY_NAMESPACE,
        ...limit,
      });
      try {
        const c = (await postClient({}).expect(201)).body,
          t = (await token(c).expect(200)).body.access_token;
        const okay = await api(other).get('/public/v1/companies').set(bearer(t)).expect(200);
        expect(okay.headers['x-ratelimit-limit']).toBe('120');
        const denied = await api(constrained)
          .get('/public/v1/companies')
          .set(bearer(t))
          .expect(429);
        expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0);
        expect(denied.body.error.code).toBe('rate_limited');
        expect(denied.body.error.request_id).toBe(denied.headers['x-request-id']);
      } finally {
        await constrained.close();
      }
    }
  });
  it('retains unfanned events at queue capacity and never follows receiver redirects', async () => {
    const constrained = await bootApp({
      WEBHOOK_QUEUE_LIMIT: '1',
      WEBHOOK_PRIVATE_HOSTS: '127.0.0.1',
    });
    const c = (await postClient({}).expect(201)).body,
      sub = await subscribe(c);
    try {
      const people = [await hire(), await hire(), await hire()];
      status = 200;
      const before = receipts.length;
      for (let i = 0; i < 4; i++) await work(constrained);
      expect(
        receipts
          .slice(before)
          .filter((r) => people.some((p) => p.id === JSON.parse(r.body).resource.id)),
      ).toHaveLength(3);
      status = 302;
      const person = await hire();
      const start = receipts.length;
      await work(constrained);
      expect(
        receipts.slice(start).filter((r) => JSON.parse(r.body).resource.id === person.id),
      ).toHaveLength(1);
      const [delivery] = await runAsTenant(db, tenantId, (tx) =>
        tx
          .select({ state: webhookDeliveries.state, status: webhookDeliveries.lastStatus })
          .from(webhookDeliveries)
          .innerJoin(integrationEvents, eq(integrationEvents.id, webhookDeliveries.eventId))
          .where(
            and(
              eq(webhookDeliveries.subscriptionId, sub.id),
              eq(integrationEvents.resourceId, person.id),
            ),
          ),
      );
      expect(delivery).toEqual({ state: 'pending', status: 302 });
    } finally {
      status = 200;
      await api(app)
        .put(`/tenant/integrations/webhooks/${sub.id}/enabled`)
        .set(bearer(admin))
        .send({ enabled: false })
        .expect(200);
      await constrained.close();
    }
  });
  it('refuses replay after a transfer or client expiry without ending the administrator session', async () => {
    const c = (await postClient({}).expect(201)).body,
      sub = await subscribe(c),
      person = await hire();
    await (
      app.get(WebhookWorker) as unknown as { fanout: (tenant: string) => Promise<void> }
    ).fanout(tenantId);
    const [delivery] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .innerJoin(integrationEvents, eq(integrationEvents.id, webhookDeliveries.eventId))
        .where(
          and(
            eq(webhookDeliveries.subscriptionId, sub.id),
            eq(integrationEvents.resourceId, person.id),
          ),
        ),
    );
    expect(delivery).toBeDefined();
    await runAsTenant(db, tenantId, async (tx) => {
      await tx
        .update(webhookDeliveries)
        .set({ state: 'dead' })
        .where(eq(webhookDeliveries.id, delivery!.id));
      await tx
        .update(jobAssignments)
        .set({ legalEntityId: b })
        .where(eq(jobAssignments.employeeId, person.id));
    });
    const replay = () =>
      api(app)
        .post(`/tenant/integrations/deliveries/${delivery!.id}/replay`)
        .set(bearer(admin))
        .send({ reason: 'Receiver repair and authority review' });
    await replay().expect(409);
    await runAsTenant(db, tenantId, async (tx) => {
      await tx
        .update(jobAssignments)
        .set({ legalEntityId: a })
        .where(eq(jobAssignments.employeeId, person.id));
      await tx
        .update(apiClients)
        .set({ expiresAt: new Date(0) })
        .where(eq(apiClients.id, c.id));
    });
    await replay().expect(409);
    const overview = await api(app).get('/tenant/integrations').set(bearer(admin)).expect(200);
    expect(overview.body.clients.find((row: { id: string }) => row.id === c.id).expired).toBe(true);
    await api(app)
      .put(`/tenant/integrations/webhooks/${sub.id}/enabled`)
      .set(bearer(admin))
      .send({ enabled: false })
      .expect(200);
  });
  it('keeps captured envelopes immutable and purges expired events with their delivery rows', async () => {
    const c = (await postClient({}).expect(201)).body,
      sub = await subscribe(c),
      person = await hire();
    const [retained] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(integrationEvents).where(eq(integrationEvents.resourceId, person.id)),
    );
    await expect(
      runAsTenant(db, tenantId, (tx) =>
        tx
          .update(integrationEvents)
          .set({ body: '{}' })
          .where(eq(integrationEvents.id, retained!.id)),
      ),
    ).rejects.toThrow();
    const [expired] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .insert(integrationEvents)
        .values({
          tenantId,
          type: 'employee.created',
          resourceType: 'employee',
          resourceId: person.id,
          companyId: a,
          body: retained!.body,
          dedupKey: randomUUID(),
          occurredAt: new Date(0),
          expiresAt: new Date(0),
        })
        .returning(),
    );
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .insert(webhookDeliveries)
        .values({ tenantId, subscriptionId: sub.id, eventId: expired!.id, state: 'dead' }),
    );
    await work();
    expect(
      await runAsTenant(db, tenantId, (tx) =>
        tx.select().from(integrationEvents).where(eq(integrationEvents.id, expired!.id)),
      ),
    ).toHaveLength(0);
    expect(
      await runAsTenant(db, tenantId, (tx) =>
        tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.eventId, expired!.id)),
      ),
    ).toHaveLength(0);
    await api(app)
      .put(`/tenant/integrations/webhooks/${sub.id}/enabled`)
      .set(bearer(admin))
      .send({ enabled: false })
      .expect(200);
  });
  it('keeps public parser and unknown-path errors on the versioned error contract', async () => {
    const unknown = await api(app).get('/public/v1/unknown').set(bearer(access)).expect(404);
    expect(unknown.body.error).toMatchObject({
      code: 'not_found',
      request_id: unknown.headers['x-request-id'],
    });
    const malformed = await api(app).post('/oauth/token').type('json').send('{').expect(400);
    expect(typeof malformed.body.error).toBe('string');
    expect(malformed.body.request_id).toBe(malformed.headers['x-request-id']);
  });
  it('fences an expired tenant transaction and boots a dedicated context without an HTTP server', async () => {
    const jobs = app.get(DurableJobs),
      key = 'transaction:' + randomUUID();
    let ready!: () => void, release!: () => void;
    const started = new Promise<void>((r) => (ready = r)),
      resume = new Promise<void>((r) => (release = r));
    const count = (await runAsTenant(db, tenantId, (tx) => tx.select().from(integrationEvents)))
      .length;
    const first = jobs.run(key, 60000, async () => {
      ready();
      await resume;
      return runAsTenant(app.get<Database>(DB), tenantId, (tx) =>
        tx.update(employees).set({ fullName: 'Stale transaction must not commit' }),
      );
    });
    await started;
    await db
      .update(jobLeases)
      .set({ leaseUntil: new Date(0) })
      .where(eq(jobLeases.key, key));
    release();
    await expect(first).rejects.toThrow('Scheduled job lease has ended');
    expect(
      (await runAsTenant(db, tenantId, (tx) => tx.select().from(integrationEvents))).length,
    ).toBe(count);
    const { createWorker } = await import('../src/worker.js');
    const context = await createWorker({
      DATABASE_URL: testEnv().appUrl,
      BACKGROUND_JOBS: 'off',
      STORAGE_DIR: 'storage',
    });
    try {
      expect(context.get<AppConfig>(APP_CONFIG).PROCESS_ROLE).toBe('worker');
      expect('getHttpServer' in context).toBe(false);
    } finally {
      await context.close();
    }
  });
  it('leases each schedule slot once and fences a stale worker’s direct query after takeover', async () => {
    const jobs = app.get(DurableJobs),
      second = other.get(DurableJobs),
      key = 'acceptance:' + randomUUID();
    let ready!: () => void, release!: () => void;
    const started = new Promise<void>((r) => (ready = r)),
      resume = new Promise<void>((r) => (release = r));
    const effect = 'stale:' + randomUUID();
    const first = jobs.run(key, 60000, async () => {
      ready();
      await resume;
      return app.get<Database>(DB).insert(jobLeases).values({ key: effect });
    });
    await started;
    expect((await second.run(key, 60000, async () => {})).ran).toBe(false);
    await db
      .update(jobLeases)
      .set({ leaseUntil: new Date(0) })
      .where(eq(jobLeases.key, key));
    expect((await second.run(key, 60000, async () => {})).ran).toBe(true);
    release();
    await expect(first).rejects.toMatchObject({
      cause: { message: 'Scheduled job lease has ended' },
    });
    expect((await db.select().from(jobLeases).where(eq(jobLeases.key, effect))).length).toBe(0);
    expect((await jobs.run(key, 60000, async () => {})).ran).toBe(false);
    const ref = app.get(ModuleRef);
    for (const task of SCHEDULED_TASKS) {
      const service = ref.get(task.provider, { strict: false }) as unknown as Record<
        string,
        unknown
      >;
      expect(typeof service[task.method]).toBe('function');
    }
  });
});
