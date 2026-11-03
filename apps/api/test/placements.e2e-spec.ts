import { createDb, platformUsers, hashPassword } from '@gp/db';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { api, bearer, bootApp, platformToken, uniqueSlug, testEnv } from './test-env.js';
import { totpAt } from '../src/modules/auth/totp.js';
const keys = generateKeyPairSync('ed25519'),
  pub = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
describe('new dedicated placement control plane', () => {
  let app: INestApplication,
    admin: string,
    lastSlug = '',
    seq = 0;
  const create = () =>
    api(app)
      .post('/platform/placements')
      .set(bearer(admin))
      .send({
        name: 'Dedicated sandbox',
        slug: (lastSlug = uniqueSlug('dedicated')),
        customerId: 'Customer sandbox',
        installationId: randomUUID(),
        region: 'BD private primary',
        routeKey: 'dedicated_' + seq++,
        apiOrigin: 'https://api.pilot.example',
        webOrigin: 'https://people.pilot.example',
        proofPublicKey: pub,
        residency: {
          primary: 'BD private primary',
          replicas: 'None',
          backups: 'Customer encrypted offsite',
          logs: 'Customer local',
          support: 'Time-bound approved access',
          notifications: 'Disabled',
          integrations: 'Disabled',
        },
        reason: 'Approved new dedicated pilot; no existing tenant relocation',
      });
  beforeAll(async () => {
    app = await bootApp();
    const fixture = createDb(testEnv().ownerUrl);
    const email = uniqueSlug('placement-admin') + '@example.test';
    try {
      await fixture.db.insert(platformUsers).values({
        email,
        name: 'Placement test operator',
        role: 'super_admin',
        passwordHash: await hashPassword(testEnv().password),
      });
    } finally {
      await fixture.pool.end();
    }
    admin = await platformToken(app, email);
    const setup = (await api(app).post('/account/mfa/setup').set(bearer(admin)).expect(200)).body;
    await api(app)
      .post('/account/mfa/confirm')
      .set(bearer(admin))
      .send({ code: totpAt(setup.secret, new Date()) })
      .expect(200);
  });
  afterAll(async () => {
    await app?.close();
  });
  it('keeps a new placement pending until a bound, fresh installation receipt is verified', async () => {
    const created = (await create().expect(201)).body;
    const rows = (await api(app).get('/platform/placements').set(bearer(admin)).expect(200)).body;
    const row = rows.find((p: { id: string }) => p.id === created.id);
    expect(row.status).toBe('provisioning');
    const claims = {
      customer_id: 'Customer sandbox',
      mode: 'dedicated',
      installation_id: created.installationId,
      tenant_id: created.tenantId,
      challenge: created.challenge,
      api_origin: 'https://api.pilot.example',
      web_origin: 'https://people.pilot.example',
      license_id: randomUUID(),
      release: '5.3.0',
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 600000).toISOString(),
      database_fingerprint: 'a'.repeat(64),
    };
    const receipt = (extra = {}) => {
      const payload = Buffer.from(JSON.stringify({ ...claims, ...extra })).toString('base64url'),
        body = 'gpready1.' + payload;
      return body + '.' + sign(null, Buffer.from(body), keys.privateKey).toString('base64url');
    };
    const activate = (proof: string) =>
      api(app).post(`/platform/placements/${created.id}/activate`).set(bearer(admin)).send({
        receipt: proof,
        reason: 'Operator confirmed offline readiness and local recovery tests',
      });
    await activate(receipt({ tenant_id: randomUUID() })).expect(400);
    await activate(receipt({ expires_at: new Date(0).toISOString() })).expect(400);
    await activate(receipt()).expect(201);
    expect(
      (await api(app).get('/installation/route').query({ workspace: lastSlug }).expect(200)).body,
    ).toEqual({
      kind: 'dedicated',
      webOrigin: 'https://people.pilot.example',
      apiOrigin: 'https://api.pilot.example',
    });
    await activate(receipt()).expect(409);
    expect(
      (await api(app).get('/platform/placements').set(bearer(admin)).expect(200)).body.find(
        (p: { id: string }) => p.id === created.id,
      ).status,
    ).toBe('active');
  });
  it('does not accept a live tenant or caller-supplied database connection string', async () => {
    const body = {
      name: 'Blocked',
      slug: uniqueSlug('blocked'),
      customerId: 'Blocked tenant',
      tenantId: randomUUID(),
      installationId: randomUUID(),
      routeKey: 'postgres://user:secret@host/db',
      apiOrigin: 'https://api.pilot.example',
      webOrigin: 'https://people.pilot.example',
      proofPublicKey: pub,
      region: 'BD',
      reason: 'Attempted existing tenant relocation',
    };
    await api(app).post('/platform/placements').set(bearer(admin)).send(body).expect(400);
  });
  it('rejects non-platform callers without exposing proof keys or database credentials', async () => {
    await api(app).get('/platform/placements').expect(401);
    const rows = (await api(app).get('/platform/placements').set(bearer(admin)).expect(200)).body;
    for (const row of rows) {
      expect(row).not.toHaveProperty('proofPublicKey');
      expect(JSON.stringify(row)).not.toContain('postgres://');
    }
  });
});
