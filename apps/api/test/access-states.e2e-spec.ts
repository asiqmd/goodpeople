import type { INestApplication } from '@nestjs/common';
import { createDb, entitlementGrants, tenants } from '@gp/db';
import { and, eq } from 'drizzle-orm';
import { api, bearer, bootApp, platformToken, tenantLogin, testEnv } from './test-env.js';

describe('access states and entitlements on seeded tenants', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(() => app.close());

  it('an overdue paid tenant can read but not write', async () => {
    const { accessToken } = await tenantLogin(app, 'acme-garments');
    const access = await api(app).get('/tenant/access').set(bearer(accessToken)).expect(200);
    expect(access.body.access).toMatchObject({
      accessState: 'read_only',
      reason: 'payment_overdue',
      subscriptionChecked: true,
    });
    await api(app).get('/tenant/legal-entities').set(bearer(accessToken)).expect(200);
    const write = await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(accessToken))
      .send({ name: 'Acme Washing Ltd' })
      .expect(403);
    expect(write.body.code).toBe('tenant_read_only');
  });

  it('blocks a module outside the plan until a Super Admin grants it', async () => {
    const { accessToken } = await tenantLogin(app, 'trial-co');
    const blocked = await api(app).get('/tenant/payroll/runs').set(bearer(accessToken)).expect(403);
    expect(blocked.body.code).toBe('feature_not_in_plan');

    const superAdmin = await platformToken(app);
    const list = await api(app).get('/platform/tenants').set(bearer(superAdmin)).expect(200);
    const trial = list.body.find((t: { slug: string }) => t.slug === 'trial-co');
    await api(app)
      .post(`/platform/tenants/${trial.id}/grants`)
      .set(bearer(superAdmin))
      .send({ kind: 'feature', key: 'payroll', reason: 'Payroll preview during the trial' })
      .expect(201);

    try {
      await api(app).get('/tenant/payroll/runs').set(bearer(accessToken)).expect(200);
    } finally {
      // Other files rely on the trial staying without payroll.
      const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
      await db
        .delete(entitlementGrants)
        .where(and(eq(entitlementGrants.tenantId, trial.id), eq(entitlementGrants.key, 'payroll')));
      await pool.end();
    }
  });

  it("enforces the plan's legal entity limit", async () => {
    const { accessToken } = await tenantLogin(app, 'trial-co');
    const res = await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(accessToken))
      .send({ name: 'Trial Co Second Ltd' })
      .expect(403);
    expect(res.body.code).toBe('limit_reached');
  });

  it('a suspended tenant cannot sign in, even an internal one', async () => {
    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    const { accessToken } = await tenantLogin(app, 'sponsored-ngo');
    await db.update(tenants).set({ status: 'suspended' }).where(eq(tenants.slug, 'sponsored-ngo'));
    try {
      const existing = await api(app).get('/tenant/access').set(bearer(accessToken)).expect(403);
      expect(existing.body.code).toBe('tenant_suspended');
      const login = await api(app)
        .post('/auth/login')
        .send({
          tenant: 'sponsored-ngo',
          email: 'admin@sponsored-ngo.test',
          password: testEnv().password,
        })
        .expect(403);
      expect(login.body.code).toBe('tenant_suspended');
    } finally {
      await db.update(tenants).set({ status: 'active' }).where(eq(tenants.slug, 'sponsored-ngo'));
      await pool.end();
    }
  });
});
