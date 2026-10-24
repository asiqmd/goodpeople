import { createDb, hashPassword, platformUsers } from '@gp/db';
import type { AssignCompanyInput } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';

const company = (overrides: Partial<AssignCompanyInput> = {}) => {
  const slug = overrides.slug ?? uniqueSlug('assigned');
  return {
    name: 'Assigned Company',
    slug,
    industryTemplate: 'corporate',
    billingMode: 'complimentary',
    planCode: 'enterprise',
    reason: 'Sponsored by the founders for the pilot',
    admin: { name: 'Assigned Admin', email: `admin@${slug}.test` },
    ...overrides,
  };
};

describe('Super Admin "Assign company" (subscription bypass)', () => {
  let app: INestApplication;
  let superAdmin: string;
  beforeAll(async () => {
    app = await bootApp();
    superAdmin = await platformToken(app);
  });
  afterAll(() => app.close());

  async function assign(body: object) {
    return api(app).post('/platform/tenants').set(bearer(superAdmin)).send(body);
  }

  async function signInAsAdmin(slug: string, password: string) {
    const res = await api(app)
      .post('/auth/login')
      .send({ tenant: slug, email: `admin@${slug}.test`, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  it('gives a complimentary company every module with no subscription at all', async () => {
    const res = await assign(company());
    expect(res.status).toBe(201);
    expect(res.body.tenant.billingMode).toBe('complimentary');
    expect(res.body.tenant.access).toMatchObject({
      accessState: 'full',
      subscriptionChecked: false,
    });
    expect(res.body.temporaryPassword).toEqual(expect.any(String));

    const token = await signInAsAdmin(res.body.tenant.slug, res.body.temporaryPassword);
    const access = await api(app).get('/tenant/access').set(bearer(token)).expect(200);
    expect(access.body.access.features).toContain('payroll');
    await api(app).get('/tenant/payroll/runs').set(bearer(token)).expect(200, []);
    await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(token))
      .send({ name: 'Assigned Company Ltd' })
      .expect(201);
  });

  it('records who assigned the company and why in the audit log', async () => {
    const res = await assign(company({ reason: 'Board approved sponsorship #42' }));
    const audit = await api(app)
      .get(`/platform/audit?tenantId=${res.body.tenant.id}`)
      .set(bearer(superAdmin))
      .expect(200);
    expect(audit.body[0]).toMatchObject({
      action: 'tenant.assign',
      actorEmail: testEnv().superAdminEmail,
      reason: 'Board approved sponsorship #42',
      after: expect.objectContaining({ billingMode: 'complimentary', planCode: 'enterprise' }),
    });
  });

  it('requires a reason', async () => {
    const res = await assign(company({ reason: '' }));
    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual([expect.objectContaining({ path: 'reason' })]);
  });

  it('rejects a workspace slug that is already taken', async () => {
    await assign(company({ slug: 'my-group' })).then((res) => expect(res.status).toBe(409));
  });

  it('turns a complimentary company read-only once the admin-set expiry passes', async () => {
    const res = await assign(
      company({ accessExpiresAt: '2020-01-01T00:00:00Z', admin: undefined as never }),
    );
    expect(res.status).toBe(400); // admin is required

    const expired = await assign(company({ accessExpiresAt: '2020-01-01T00:00:00Z' }));
    expect(expired.body.tenant.access).toMatchObject({
      accessState: 'read_only',
      reason: 'complimentary_expired',
    });
    const token = await signInAsAdmin(expired.body.tenant.slug, expired.body.temporaryPassword);
    await api(app).get('/tenant/legal-entities').set(bearer(token)).expect(200);
    const write = await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(token))
      .send({ name: 'Blocked Ltd' })
      .expect(403);
    expect(write.body.code).toBe('tenant_read_only');
  });

  it('applies the limits the admin sets, even below the plan', async () => {
    const res = await assign(company({ limits: { max_legal_entities: 1 } }));
    expect(res.body.tenant.access.limits.max_legal_entities).toBe(1);
    const token = await signInAsAdmin(res.body.tenant.slug, res.body.temporaryPassword);
    await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(token))
      .send({ name: 'First Ltd' })
      .expect(201);
    const second = await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(token))
      .send({ name: 'Second Ltd' })
      .expect(403);
    expect(second.body.code).toBe('limit_reached');
  });

  it('switches a paid company with no subscription to complimentary, auditing before and after', async () => {
    const paid = await assign(company({ billingMode: 'paid', planCode: 'growth' }));
    expect(paid.body.tenant.access).toMatchObject({
      accessState: 'read_only',
      reason: 'no_subscription',
    });

    const updated = await api(app)
      .patch(`/platform/tenants/${paid.body.tenant.id}/billing`)
      .set(bearer(superAdmin))
      .send({ billingMode: 'complimentary', reason: 'Waived for the NGO pilot' })
      .expect(200);
    expect(updated.body.access).toMatchObject({ accessState: 'full', subscriptionChecked: false });
    expect(updated.body.bypassReason).toBe('Waived for the NGO pilot');

    const audit = await api(app)
      .get(`/platform/audit?tenantId=${paid.body.tenant.id}`)
      .set(bearer(superAdmin))
      .expect(200);
    expect(audit.body[0]).toMatchObject({
      action: 'tenant.billing.update',
      before: expect.objectContaining({ billingMode: 'paid', accessState: 'read_only' }),
      after: expect.objectContaining({ billingMode: 'complimentary' }),
    });
  });

  it('lets other platform staff read but only a Super Admin assign', async () => {
    const env = testEnv();
    const { db, pool } = createDb(env.ownerUrl, { max: 1 });
    const email = `${uniqueSlug('ops')}@goodpeople.test`;
    await db.insert(platformUsers).values({
      email,
      name: 'Platform Ops',
      passwordHash: await hashPassword(env.password),
      role: 'platform_ops',
    });
    await pool.end();

    const ops = await platformToken(app, email);
    await api(app).get('/platform/tenants').set(bearer(ops)).expect(200);
    const res = await api(app)
      .post('/platform/tenants')
      .set(bearer(ops))
      .send(company())
      .expect(403);
    expect(res.body.code).toBe('super_admin_only');
  });

  it('keeps workspace users out of the platform API', async () => {
    const login = await api(app)
      .post('/auth/login')
      .send({ tenant: 'my-group', email: 'admin@my-group.test', password: testEnv().password });
    const res = await api(app)
      .get('/platform/tenants')
      .set(bearer(login.body.accessToken))
      .expect(403);
    expect(res.body.code).toBe('platform_only');
  });
});
