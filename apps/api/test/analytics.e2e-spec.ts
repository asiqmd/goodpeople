import {
  createDb,
  entitlementGrants,
  tenants,
  legalEntities,
  locations,
  companyLegalProfiles,
  employees,
  jobAssignments,
  runAsTenant,
  type Database,
} from '@gp/db';
import {
  addDays,
  addMonths,
  todayIn,
  emptyFieldPolicy,
  type WorkforceView,
  type AnalyticsCatalog,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';
import { totpAt } from '../src/modules/auth/totp.js';
import { TenantDb } from '../src/db/db.module.js';

const values = (v: WorkforceView) => v.metrics.map((m) => m.value);
describe('Phase 6 M1 authorized workforce analytics', () => {
  let app: INestApplication,
    other: INestApplication,
    owner: ReturnType<typeof createDb>,
    db: Database;
  let tenantId: string,
    admin: string,
    slug: string,
    a: string,
    b: string,
    site: string,
    foreign: string;
  let readerAId: string;
  let first: string,
    moved: string,
    left: string,
    workerB: string,
    manager: string,
    readerA: string,
    employee: string,
    seq = 0;
  const asOf = addDays(todayIn().slice(0, 7) + '-01', -1),
    month = asOf.slice(0, 7),
    from = month + '-01';
  const before = addMonths(from, -1),
    transfer = month + '-15';
  const path = (q = '') => '/tenant/analytics/workforce?asOf=' + asOf + q;
  const get = async (token = admin, q = '') =>
    (await api(app).get(path(q)).set(bearer(token)).expect(200)).body as WorkforceView;
  async function signIn(email: string, password = testEnv().password) {
    return (await api(app).post('/auth/login').send({ tenant: slug, email, password }).expect(200))
      .body.accessToken as string;
  }
  async function login(assignedRole = 'hr_officer') {
    const email = `analytics-${seq++}@${slug}.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({
          name: 'Analytics fixture user',
          email,
          role: assignedRole,
          password: testEnv().password,
        })
        .expect(201)
    ).body;
    const session = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: slug, email, password: testEnv().password })
        .expect(200)
    ).body;
    return {
      user,
      token: session.accessToken as string,
      refreshToken: session.refreshToken as string,
    };
  }
  async function role(permissions: string[], deniedPermissions: string[] = []) {
    return (
      await api(app)
        .post('/tenant/identity/roles')
        .set(bearer(admin))
        .send({
          name: 'Analytics role ' + seq++,
          permissions,
          deniedPermissions,
          fields: emptyFieldPolicy(),
        })
        .expect(201)
    ).body.id as string;
  }
  const assign = async (user: string, roleId: string, companyIds: string[], relationship = 'all') =>
    (
      await api(app)
        .post('/tenant/identity/users/' + user + '/assignments')
        .set(bearer(admin))
        .send({ roleId, scope: 'selected', companyIds, relationship })
        .expect(201)
    ).body;
  async function hire(company: string, joinedOn = from, userId?: string, managerId?: string) {
    const id = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: 'AN-' + seq++,
          fullName: 'Private employee name ' + seq,
          fatherName: 'Private father',
          motherName: 'Private mother',
          dateOfBirth: '1990-01-01',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: { line: 'Private home', district: 'Gazipur', division: 'dhaka' },
          permanentAddress: { line: 'Private home', district: 'Gazipur', division: 'dhaka' },
          identity: { nid: `${Date.now()}${seq}`.slice(-10) },
          joinedOn,
          job: {
            legalEntityId: company,
            ...(company === a ? { locationId: site } : {}),
            employmentType: 'permanent',
            workerCategory: 'worker',
            ...(managerId ? { managerId } : {}),
          },
        })
        .expect((res) => {
          if (res.status !== 201) throw new Error('Hire fixture: ' + JSON.stringify(res.body));
        })
        .expect(201)
    ).body.employee.id as string;
    if (userId)
      await runAsTenant(db, tenantId, (tx) =>
        tx.update(employees).set({ userId }).where(eq(employees.id, id)),
      );
    return id;
  }
  beforeAll(async () => {
    app = await bootApp();
    other = await bootApp();
    owner = createDb(testEnv().ownerUrl, { max: 3 });
    db = owner.db;
    slug = uniqueSlug('analytics');
    const platform = await platformToken(app);
    const created = (
      await api(app)
        .post('/platform/tenants')
        .set(bearer(platform))
        .send({
          name: 'Analytics isolated fixture',
          slug,
          industryTemplate: 'corporate',
          billingMode: 'internal',
          planCode: 'enterprise',
          reason: 'Explicit non-production M1 acceptance',
          admin: { name: 'Analytics administrator', email: 'admin@' + slug + '.test' },
        })
        .expect(201)
    ).body;
    tenantId = created.tenant.id;
    admin = await signIn('admin@' + slug + '.test', created.temporaryPassword);
    await api(app).get('/tenant/analytics/catalog').set(bearer(admin)).expect(403);
    await db.insert(entitlementGrants).values({
      tenantId,
      kind: 'feature',
      key: 'analytics',
      reason: 'Explicit isolated M1 test opt-in',
    });
    const mfa = (await api(app).post('/account/mfa/setup').set(bearer(admin)).expect(200)).body;
    await api(app)
      .post('/account/mfa/confirm')
      .set(bearer(admin))
      .send({ code: totpAt(mfa.secret, new Date()) })
      .expect(200);
    a = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Analytics A', code: 'ANA' })
        .expect(201)
    ).body.id;
    b = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Analytics B', code: 'ANB' })
        .expect(201)
    ).body.id;
    site = (
      await api(app)
        .post('/tenant/locations')
        .set(bearer(admin))
        .send({ legalEntityId: a, code: 'AN-SITE', name: 'Analytics site', kind: 'head_office' })
        .expect(201)
    ).body.id;
    first = await hire(a, before);
    moved = await hire(b);
    left = await hire(a);
    workerB = await hire(b);
    await runAsTenant(db, tenantId, async (tx) => {
      const [old] = await tx
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.employeeId, moved));
      // Represent pre-existing transfer history without disabling the current transfer
      // guard or executing a new cross-employer business transfer. Import older history
      // after the current assignment, as a historical fixture only.
      await tx
        .update(jobAssignments)
        .set({ effectiveFrom: transfer, event: 'transfer' })
        .where(eq(jobAssignments.id, old!.id));
      await tx.insert(jobAssignments).values({
        tenantId,
        employeeId: moved,
        event: 'hire',
        effectiveFrom: from,
        effectiveTo: addDays(transfer, -1),
        legalEntityId: a,
        locationId: site,
        employmentType: 'permanent',
        workerCategory: 'worker',
      });
      await tx
        .update(employees)
        .set({ separatedOn: month + '-10' })
        .where(eq(employees.id, left));
    });
    const restricted = await login();
    readerA = restricted.token;
    readerAId = restricted.user.id;
    const both = await role(['analytics.view', 'employees.read']);
    await assign(restricted.user.id, both, [a]);
    const unpriv = await login('employee');
    employee = unpriv.token;
    manager = await hire(a, before, restricted.user.id);
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(jobAssignments)
        .set({ managerId: manager })
        .where(and(eq(jobAssignments.employeeId, first), eq(jobAssignments.legalEntityId, a))),
    );
    const [foreignTenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    foreign = (
      await runAsTenant(db, foreignTenant!.id, (tx) =>
        tx.select({ id: legalEntities.id }).from(legalEntities),
      )
    )[0]!.id;
  });
  afterAll(async () => {
    await owner?.pool.end();
    await app?.close();
    await other?.close();
  });
  it('returns exact company and group counts with a scoped catalog and provenance', async () => {
    const v = await get();
    expect(values(v)).toEqual([4, 3, 1]);
    expect(v.companies.find((c) => c.id === a)!.metrics.map((m) => m.value)).toEqual([2, 2, 1]);
    expect(v.companies.find((c) => c.id === b)!.metrics.map((m) => m.value)).toEqual([2, 1, 0]);
    expect(v.sourceRevision).toMatch(/^[0-9a-f]{64}$/);
    expect(v.period).toEqual({ from, through: asOf });
    expect(v.cache).toBe('none');
    expect(v.metrics.every((m) => m.state === 'current')).toBe(true);
    const c = (await api(app).get('/tenant/analytics/catalog').set(bearer(readerA)).expect(200))
      .body as AnalyticsCatalog;
    expect(c.companies.map((x) => x.id)).toEqual([a]);
    expect(c.locations.map((x) => x.id)).toEqual([site]);
  });
  it('reconciles complete history with the existing group dashboard without changing it', async () => {
    const old = (
      await api(app)
        .get('/tenant/group/dashboard?month=' + month)
        .set(bearer(admin))
        .expect(200)
    ).body;
    expect(values(await get())).toEqual([
      old.group.headcount,
      old.group.joiners,
      old.group.leavers,
    ]);
  });
  it('returns a measured zero for an empty valid authorized company', async () => {
    const empty = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Empty analytics employer', code: 'EMPTY' })
        .expect(201)
    ).body.id;
    expect(values(await get(admin, '&companyIds=' + empty))).toEqual([0, 0, 0]);
  });
  it('requires analytics and source permissions in the same company', async () => {
    const u = await login();
    await assign(u.user.id, await role(['analytics.view']), [a]);
    await assign(u.user.id, await role(['employees.read']), [b]);
    await api(app).get(path()).set(bearer(u.token)).expect(403);
  });
  it('does not grant ordinary employees, platform credentials or anonymous callers access', async () => {
    const platform = await platformToken(app);
    await api(app).get(path()).set(bearer(employee)).expect(403);
    await api(app).get(path()).expect(401);
    await api(app).get(path()).set(bearer(platform)).expect(403);
  });
  it('returns only company A, including authorized A history after a transfer to B', async () => {
    const v = await get(readerA);
    expect(v.companies.map((c) => c.id)).toEqual([a]);
    expect(values(v)).toEqual([2, 2, 1]);
    await api(app)
      .get(path('&companyIds=' + b))
      .set(bearer(readerA))
      .expect(404);
    await api(app)
      .get(path('&companyIds=' + foreign))
      .set(bearer(admin))
      .expect(404);
  });
  it('applies explicit company denial even with an allow grant', async () => {
    const u = await login();
    await assign(u.user.id, await role(['analytics.view', 'employees.read']), [a, b]);
    await assign(u.user.id, await role([], ['analytics.view']), [b]);
    expect((await get(u.token)).companies.map((c) => c.id)).toEqual([a]);
  });
  it('narrows site selection and never returns a forbidden site/company combination', async () => {
    const v = await get(admin, '&locationId=' + site);
    expect(v.companies.map((c) => c.id)).toEqual([a]);
    expect(values(v)).toEqual([2, 2, 1]);
    await api(app)
      .get(path('&companyIds=' + b + '&locationId=' + site))
      .set(bearer(admin))
      .expect(404);
  });
  it('uses an explicitly selected site clock, not UTC or the company default', async () => {
    await runAsTenant(db, tenantId, (tx) =>
      tx.update(locations).set({ timeZone: 'America/New_York' }).where(eq(locations.id, site)),
    );
    try {
      const day = todayIn('America/New_York');
      const v = (
        await api(app)
          .get('/tenant/analytics/workforce?locationId=' + site)
          .set(bearer(admin))
          .expect(200)
      ).body as WorkforceView;
      expect(v.asOf).toBe(day);
      expect(v.companies[0]!.timeZone).toBe('America/New_York');
      expect(v.companies[0]!.timeZoneSource).toBe('site');
      await api(app)
        .get('/tenant/analytics/workforce?locationId=' + site + '&asOf=' + addDays(day, 1))
        .set(bearer(admin))
        .expect(400);
    } finally {
      await runAsTenant(db, tenantId, (tx) =>
        tx.update(locations).set({ timeZone: 'Asia/Dhaka' }).where(eq(locations.id, site)),
      );
    }
  });
  it('returns unavailable rather than zero for a gap in versioned company context', async () => {
    // Legal profiles are immutable except closing a version. Keep that protection and
    // represent an historical gap using two valid versions, without overwriting either.
    await runAsTenant(db, tenantId, async (tx) => {
      await tx
        .update(companyLegalProfiles)
        .set({ effectiveTo: '1900-01-30' })
        .where(eq(companyLegalProfiles.legalEntityId, a));
      await tx.insert(companyLegalProfiles).values({
        tenantId,
        legalEntityId: a,
        countryCode: 'BD',
        regime: 'BD_PRIVATE',
        currency: 'BDT',
        effectiveFrom: '1900-02-01',
        businessTimeZone: 'Asia/Dhaka',
        calendar: 'gregorian',
        reviewStatus: 'existing_bd',
        reason: 'Historical missing-context fixture; original version is retained',
      });
    });
    const v = (
      await api(app)
        .get('/tenant/analytics/workforce?asOf=1900-01-31&companyIds=' + a)
        .set(bearer(admin))
        .expect(200)
    ).body as WorkforceView;
    expect(values(v)).toEqual([null, null, null]);
    expect(v.metrics.every((m) => m.state === 'unavailable')).toBe(true);
  });
  it('uses current manager relationships and intersects source/analytics relationships', async () => {
    const u = await login();
    await runAsTenant(db, tenantId, (tx) =>
      tx.update(employees).set({ userId: u.user.id }).where(eq(employees.id, manager)),
    );
    try {
      const both = await role(['analytics.view', 'employees.read']);
      await assign(u.user.id, both, [a], 'direct_reports');
      const v = await get(u.token);
      expect(values(v)).toEqual([1, 0, 0]);
      expect(v.scope).toBe('relationship');
      await runAsTenant(db, tenantId, (tx) =>
        tx.update(employees).set({ separatedOn: asOf }).where(eq(employees.id, first)),
      );
      try {
        expect(values(await get(u.token))).toEqual([0, 0, 0]);
      } finally {
        await runAsTenant(db, tenantId, (tx) =>
          tx.update(employees).set({ separatedOn: null }).where(eq(employees.id, first)),
        );
      }
    } finally {
      await runAsTenant(db, tenantId, (tx) =>
        tx.update(employees).set({ userId: readerAId }).where(eq(employees.id, manager)),
      );
    }
  });
  it('does not let a past manager relationship expose former reports', async () => {
    const u = await login();
    const own = await hire(a, before, u.user.id),
      child = await hire(a, before, undefined, own);
    try {
      const [current] = await runAsTenant(db, tenantId, (tx) =>
        tx.select().from(jobAssignments).where(eq(jobAssignments.employeeId, child)),
      );
      await runAsTenant(db, tenantId, (tx) =>
        tx
          .update(jobAssignments)
          .set({ effectiveTo: asOf })
          .where(eq(jobAssignments.id, current!.id)),
      );
      await assign(
        u.user.id,
        await role(['analytics.view', 'employees.read']),
        [a],
        'direct_reports',
      );
      expect(values(await get(u.token))).toEqual([0, 0, 0]);
    } finally {
      await runAsTenant(db, tenantId, async (tx) => {
        await tx.delete(employees).where(eq(employees.id, child));
        await tx.delete(employees).where(eq(employees.id, own));
      });
    }
  });
  it('keeps historical gaps incomplete instead of guessing a company', async () => {
    const [j] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(jobAssignments).where(eq(jobAssignments.employeeId, first)),
    );
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(jobAssignments)
        .set({ effectiveFrom: addDays(asOf, 1) })
        .where(eq(jobAssignments.id, j!.id)),
    );
    try {
      const v = await get(readerA);
      expect(v.metrics[0]!.value).toBeNull();
      expect(v.metrics[0]!.issues).toContain('missing_assignment');
    } finally {
      await runAsTenant(db, tenantId, (tx) =>
        tx
          .update(jobAssignments)
          .set({ effectiveFrom: j!.effectiveFrom })
          .where(eq(jobAssignments.id, j!.id)),
      );
    }
  });
  it('restates a new revision for backdated corrections', async () => {
    const beforeView = await get(readerA);
    await runAsTenant(db, tenantId, (tx) =>
      tx.update(employees).set({ joinedOn: from }).where(eq(employees.id, first)),
    );
    try {
      const after = await get(readerA);
      expect(after.metrics[1]!.value).toBe(beforeView.metrics[1]!.value! + 1);
      expect(after.sourceRevision).not.toBe(beforeView.sourceRevision);
    } finally {
      await runAsTenant(db, tenantId, (tx) =>
        tx.update(employees).set({ joinedOn: before }).where(eq(employees.id, first)),
      );
    }
  });
  it('does not change a company-A revision for unrelated company-B personal changes', async () => {
    const v = await get(readerA);
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(employees)
        .set({ fullName: 'Another private name' })
        .where(eq(employees.id, workerB)),
    );
    expect((await get(readerA)).sourceRevision).toBe(v.sourceRevision);
    expect(JSON.stringify(v)).not.toMatch(
      /Private employee|Private home|mobilePhone|dateOfBirth|salary|bankAccount/,
    );
  });
  it('honors live revocation on a second API instance', async () => {
    const u = await login();
    const assignment = await assign(u.user.id, await role(['analytics.view', 'employees.read']), [
      a,
    ]);
    await get(u.token);
    await api(app)
      .delete('/tenant/identity/assignments/' + assignment.id)
      .set(bearer(admin))
      .expect(200);
    await api(other).get(path()).set(bearer(u.token)).expect(403);
  });
  it('honors session logout immediately on another instance', async () => {
    const u = await login('hr_admin');
    await get(u.token);
    await api(app).post('/auth/logout').send({ refreshToken: u.refreshToken }).expect(204);
    await api(other).get(path()).set(bearer(u.token)).expect(401);
  });
  it.each([
    '&employeeId=x',
    '&sql=select+1',
    '&asOf=9999-01-01',
    '&locationId=unknown',
    '&asOf=2026-02-30',
  ])('rejects invalid, duplicate or unsupported query %s', async (q) => {
    await api(app).get(path(q)).set(bearer(admin)).expect(400);
  });
  it('fences authority inside a bounded repeatable-read source transaction', async () => {
    const tenantDb = app.get(TenantDb),
      run = tenantDb.run.bind(tenantDb);
    let isolation = '';
    const spy = vi.spyOn(tenantDb, 'run').mockImplementation((fn, snapshot) =>
      run(async (tx) => {
        if (snapshot) {
          const r = await tx.execute(sql`show transaction_isolation`);
          isolation = String(r.rows[0]!.transaction_isolation);
        }
        return fn(tx);
      }, snapshot),
    );
    try {
      await get();
      expect(isolation).toBe('repeatable read');
    } finally {
      spy.mockRestore();
    }
  });
  it('keeps current-day values provisional and blocks source reads on suspension', async () => {
    const v = (await api(app).get('/tenant/analytics/workforce').set(bearer(admin)).expect(200))
      .body as WorkforceView;
    expect(v.metrics.some((m) => m.state === 'provisional')).toBe(true);
    await db.update(tenants).set({ status: 'suspended' }).where(eq(tenants.id, tenantId));
    try {
      await api(app).get(path()).set(bearer(admin)).expect(403);
    } finally {
      await db.update(tenants).set({ status: 'active' }).where(eq(tenants.id, tenantId));
    }
  });
});
