import {
  attendanceDays,
  createDb,
  createFieldCipher,
  entitlementGrants,
  insightJobs,
  learningEnrolments,
  leaveLedger,
  payrollRunItems,
  payrollRuns,
  runAsTenant,
  savedInsights,
  tenants,
  tenantUsers,
  type Database,
} from '@gp/db';
import {
  addDays,
  emptyFieldPolicy,
  todayIn,
  type InsightDefinition,
  type InsightView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { runInTenantContext } from '../src/common/request-context.js';
import { InsightJobsService } from '../src/modules/analytics/insight-jobs.service.js';
import { totpAt } from '../src/modules/auth/totp.js';
import { lockedFixture, seedInsightRecords } from './insights-fixtures.js';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';

const base = '/tenant/analytics';
const month = addDays(todayIn('Asia/Dhaka').slice(0, 7) + '-01', -1).slice(0, 7);
const cipher = () => createFieldCipher(testEnv().fieldKey);
const query = (definition: InsightDefinition) =>
  new URLSearchParams(Object.entries(definition)).toString();

describe('Phase 6 M2 operating and financial insight', () => {
  let app: INestApplication, owner: ReturnType<typeof createDb>, db: Database;
  let tenantId: string, slug: string, admin: string, actorId: string, a: string, b: string;
  let fixture: Awaited<ReturnType<typeof seedInsightRecords>>;
  const people: string[] = [];
  let otherPerson: string;
  const def = (kind: InsightDefinition['kind'], companyId = a): InsightDefinition =>
    kind === 'payroll' ? { kind, month } : { kind, month, companyId };
  const read = async (definition: InsightDefinition, token = admin) =>
    (
      await api(app)
        .get(base + '/insight?' + query(definition))
        .set(bearer(token))
        .expect(200)
    ).body as InsightView;
  const save = async (definition: InsightDefinition, token = admin) =>
    (
      await api(app)
        .post(base + '/saved-insights')
        .set(bearer(token))
        .send(definition)
        .expect(201)
    ).body.id as string;
  const queue = (reportId: string, requestId: string, token = admin) =>
    api(app)
      .post(base + '/saved-insights/' + reportId + '/jobs')
      .set(bearer(token))
      .send({ requestId });
  const file = (job: string, token = admin) =>
    api(app)
      .get(base + '/insight-files/' + job)
      .set(bearer(token));
  const tick = () => runInTenantContext(tenantId, () => app.get(InsightJobsService).runTenant());

  async function mfa(token: string) {
    const setup = (await api(app).post('/account/mfa/setup').set(bearer(token)).expect(200)).body;
    await api(app)
      .post('/account/mfa/confirm')
      .set(bearer(token))
      .send({ code: totpAt(setup.secret, new Date()) })
      .expect(200);
  }

  async function reader(
    options: {
      permissions?: string[];
      scope?: 'all' | 'selected';
      relationship?: 'all' | 'direct_reports';
      pay?: 'read';
      mfa?: boolean;
      deniedPermissions?: string[];
    } = {},
  ) {
    const email = 'reader-' + randomUUID() + '@' + slug + '.test';
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({
          name: 'Synthetic report reader',
          email,
          role: 'hr_officer',
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
    if (options.mfa) await mfa(session.accessToken);
    const fields = emptyFieldPolicy();
    if (options.pay) fields.pay.read = true;
    const role = (
      await api(app)
        .post('/tenant/identity/roles')
        .set(bearer(admin))
        .send({
          name: email.slice(0, 40),
          permissions: options.permissions ?? [
            'analytics.view',
            'employees.read',
            'attendance.manage',
          ],
          deniedPermissions: options.deniedPermissions ?? [],
          fields,
        })
        .expect(201)
    ).body;
    const assignment = (
      await api(app)
        .post('/tenant/identity/users/' + user.id + '/assignments')
        .set(bearer(admin))
        .send({
          roleId: role.id,
          scope: options.scope ?? 'selected',
          companyIds: options.scope === 'all' ? [] : [a],
          relationship: options.relationship ?? 'all',
        })
        .expect(201)
    ).body;
    return {
      userId: user.id as string,
      token: session.accessToken as string,
      refreshToken: session.refreshToken as string,
      assignment: assignment.id as string,
    };
  }

  async function hire(company: string, index: number) {
    return (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: 'M2-' + index,
          fullName: 'Synthetic private person ' + index,
          fatherName: 'Synthetic parent',
          motherName: 'Synthetic parent',
          dateOfBirth: '1990-01-01',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: { line: 'Fixture street', district: 'Gazipur', division: 'dhaka' },
          permanentAddress: { line: 'Fixture street', district: 'Gazipur', division: 'dhaka' },
          identity: { nid: (Date.now() + index).toString().slice(-10) },
          joinedOn: month + '-01',
          job: { legalEntityId: company, employmentType: 'permanent', workerCategory: 'worker' },
        })
        .expect(201)
    ).body.employee.id as string;
  }

  beforeAll(async () => {
    app = await bootApp();
    owner = createDb(testEnv().ownerUrl);
    db = owner.db;
    slug = uniqueSlug('m2-insight');
    const platform = await platformToken(app);
    const created = (
      await api(app)
        .post('/platform/tenants')
        .set(bearer(platform))
        .send({
          name: 'M2 synthetic workspace',
          slug,
          industryTemplate: 'corporate',
          billingMode: 'internal',
          planCode: 'enterprise',
          reason: 'Isolated M2 acceptance',
          admin: { name: 'Synthetic administrator', email: 'admin@' + slug + '.test' },
        })
        .expect(201)
    ).body;
    tenantId = created.tenant.id;
    admin = (
      await api(app)
        .post('/auth/login')
        .send({
          tenant: slug,
          email: 'admin@' + slug + '.test',
          password: created.temporaryPassword,
        })
        .expect(200)
    ).body.accessToken;
    await mfa(admin);
    await db
      .insert(entitlementGrants)
      .values({ tenantId, kind: 'feature', key: 'analytics', reason: 'M1 fixture' });
    await api(app)
      .get(base + '/insight-catalog')
      .set(bearer(admin))
      .expect(403);
    await db
      .insert(entitlementGrants)
      .values({ tenantId, kind: 'feature', key: 'analytics_insights', reason: 'M2 fixture' });
    const [login] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ id: tenantUsers.id })
        .from(tenantUsers)
        .where(eq(tenantUsers.email, 'admin@' + slug + '.test')),
    );
    actorId = login!.id;
    a = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Insight A', code: 'IA' })
        .expect(201)
    ).body.id;
    b = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({ name: 'Insight B', code: 'IB' })
        .expect(201)
    ).body.id;
    await api(app)
      .get(base + '/catalog')
      .set(bearer(admin))
      .expect(200);
    for (let i = 0; i < 6; i++) people.push(await hire(a, i));
    otherPerson = await hire(b, 7);
    fixture = await runAsTenant(db, tenantId, async (tx) => {
      const result = await seedInsightRecords(tx, {
        tenantId,
        actorId,
        company: a,
        people,
        month,
        cipher: cipher(),
      });
      await tx.insert(attendanceDays).values({
        tenantId,
        employeeId: otherPerson,
        date: month + '-05',
        dayType: 'working',
        status: 'present',
        workedMinutes: 415,
      });
      return result;
    });
  }, 60_000);

  afterEach(async () => {
    if (db && tenantId) await runAsTenant(db, tenantId, (tx) => tx.delete(insightJobs));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.pool.end();
  });

  it('reconciles processed work, posted leave and explicit completed learning', async () => {
    const expected = {
      attendance: { worked_days: '6', worked_minutes: '2700' },
      leave: { net_leave_days: '6.0' },
      learning: { assigned: '6', completed: '6' },
    };
    for (const kind of ['attendance', 'leave', 'learning'] as const) {
      const view = await read(def(kind));
      expect(view.points[0]).toMatchObject({ state: 'recorded', values: expected[kind] });
      expect(JSON.stringify(view)).not.toContain(people[0]);
      expect(view.sourceRevision).toHaveLength(64);
    }
    expect((await read(def('attendance', b))).points[0]).toMatchObject({
      state: 'suppressed',
      values: {},
    });
  });

  it('restates leave activity after a reversal and learning withholds both sides of a small complement', async () => {
    const before = await read(def('leave'));
    const [reversal] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .insert(leaveLedger)
        .values({
          tenantId,
          employeeId: people[0]!,
          leaveTypeId: fixture.leaveType,
          requestId: fixture.firstRequest,
          leaveYear: Number(month.slice(0, 4)),
          kind: 'reversal',
          days: 0.5,
          createdAt: new Date(month + '-22T09:00:00Z'),
        })
        .returning({ id: leaveLedger.id }),
    );
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(learningEnrolments)
        .set({ status: 'absent' })
        .where(
          and(
            eq(learningEnrolments.sessionId, fixture.learningSession),
            eq(learningEnrolments.employeeId, people[0]!),
          ),
        ),
    );
    try {
      const after = await read(def('leave'));
      expect(after.points[0]?.values.net_leave_days).toBe('5.5');
      expect(after.sourceRevision).not.toBe(before.sourceRevision);
      expect((await read(def('learning'))).points[0]).toMatchObject({
        state: 'suppressed',
        values: {},
      });
    } finally {
      await runAsTenant(db, tenantId, async (tx) => {
        await tx.delete(leaveLedger).where(eq(leaveLedger.id, reversal!.id));
        await tx
          .update(learningEnrolments)
          .set({ status: 'attended' })
          .where(
            and(
              eq(learningEnrolments.sessionId, fixture.learningSession),
              eq(learningEnrolments.employeeId, people[0]!),
            ),
          );
      });
    }
  });

  it('matches the existing locked trend and excludes fund and cancelled payouts', async () => {
    const view = await read(def('payroll'));
    expect(view.points).toHaveLength(6);
    expect(view.points.at(-1)).toMatchObject({
      month,
      country: 'BD',
      currency: 'BDT',
      state: 'recorded',
      values: { employer_cost: '633.00' },
    });
    expect(view.points[0]).toMatchObject({
      state: 'unavailable',
      issue: 'no_locked_runs',
      values: {},
    });
    const trend = (
      await api(app)
        .get('/tenant/payroll/reports/trend?to=' + month + '&months=6')
        .set(bearer(admin))
        .expect(200)
    ).body;
    expect(view.points.at(-1)?.values.employer_cost).toBe(trend.at(-1).cost);
  });

  it('withholds the entire month after a one-person locked adjustment', async () => {
    const run = await runAsTenant(db, tenantId, (tx) =>
      lockedFixture(tx, cipher(), tenantId, fixture.group, month, people.slice(0, 1), 'adjustment'),
    );
    try {
      expect((await read(def('payroll'))).points.at(-1)).toMatchObject({
        state: 'suppressed',
        values: {},
      });
    } finally {
      await runAsTenant(db, tenantId, (tx) =>
        tx.delete(payrollRuns).where(eq(payrollRuns.id, run)),
      );
    }
  });

  it('reports inconsistent sealed payroll items as incomplete', async () => {
    const [item] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(payrollRunItems).where(eq(payrollRunItems.runId, fixture.run)).limit(1),
    );
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(payrollRunItems)
        .set({ resultEnc: 'broken-test-ciphertext' })
        .where(eq(payrollRunItems.id, item!.id)),
    );
    try {
      expect((await read(def('payroll'))).points.at(-1)).toMatchObject({
        state: 'incomplete',
        issue: 'reconciliation',
        values: {},
      });
    } finally {
      await runAsTenant(db, tenantId, (tx) =>
        tx
          .update(payrollRunItems)
          .set({ resultEnc: item!.resultEnc })
          .where(eq(payrollRunItems.id, item!.id)),
      );
    }
  });

  it('withholds unsupported country context without converting or combining currencies', async () => {
    const [run] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(payrollRuns).where(eq(payrollRuns.id, fixture.run)),
    );
    const [unsupported] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .insert(payrollRuns)
        .values({
          ...run!,
          id: undefined,
          kind: 'adjustment',
          parentRunId: fixture.run,
          statutoryContext: {
            country: 'AE',
            currency: 'AED',
            regime: 'AE_MAINLAND',
            calendar: 'gregorian',
          },
        })
        .returning({ id: payrollRuns.id }),
    );
    try {
      expect((await read(def('payroll'))).points.at(-1)).toMatchObject({
        country: null,
        currency: null,
        state: 'unavailable',
        issue: 'context',
        values: {},
      });
    } finally {
      await runAsTenant(db, tenantId, (tx) =>
        tx.delete(payrollRuns).where(eq(payrollRuns.id, unsupported!.id)),
      );
    }
  });

  it('rejects free-form periods, dimensions and payroll company filters', async () => {
    await api(app)
      .get(base + '/insight?' + query(def('payroll')) + '&companyId=' + a)
      .set(bearer(admin))
      .expect(400);
    await api(app)
      .get(base + '/insight?' + query(def('attendance')) + '&site=' + randomUUID())
      .set(bearer(admin))
      .expect(400);
    await api(app)
      .get(base + '/insight?kind=payroll&month=' + todayIn('Asia/Dhaka').slice(0, 7))
      .set(bearer(admin))
      .expect(400);
    await api(app)
      .get(base + '/insight-catalog')
      .expect(401);
  });

  it('requires intersecting source company rights and full relationships', async () => {
    const aReader = await reader();
    expect((await read(def('attendance'), aReader.token)).points[0]?.values.worked_minutes).toBe(
      '2700',
    );
    await api(app)
      .get(base + '/insight?' + query(def('attendance', b)))
      .set(bearer(aReader.token))
      .expect(404);
    await api(app)
      .get(base + '/insight?' + query(def('leave')))
      .set(bearer(aReader.token))
      .expect(404);
    const manager = await reader({
      permissions: ['analytics.view', 'employees.read'],
      relationship: 'direct_reports',
    });
    await api(app)
      .get(base + '/insight?' + query(def('attendance')))
      .set(bearer(manager.token))
      .expect(404);
  });

  it('separates payroll read and export field permission', async () => {
    const permissions = ['analytics.view', 'employees.read', 'payroll.view'];
    const denied = await reader({ permissions, scope: 'all', mfa: true });
    await api(app)
      .get(base + '/insight?' + query(def('payroll')))
      .set(bearer(denied.token))
      .expect(403);
    const readOnly = await reader({ permissions, scope: 'all', mfa: true, pay: 'read' });
    expect((await read(def('payroll'), readOnly.token)).points.at(-1)?.values.employer_cost).toBe(
      '633.00',
    );
    const report = await save(def('payroll'), readOnly.token);
    await queue(report, randomUUID(), readOnly.token).expect(403);
  });

  it('generates once through the worker, encrypts CSV and rejects stale or expired downloads', async () => {
    const report = await save(def('attendance'));
    expect(await save(def('attendance'))).toBe(report);
    const id = randomUUID();
    await queue(report, id).expect(202);
    await queue(report.toUpperCase(), id).expect(202);
    await file(id).expect(409);
    await tick();
    const csv = await file(id).expect(200).expect('Cache-Control', 'private, no-store');
    expect(csv.text).toContain(',worked_minutes,2700,recorded,');
    expect(csv.text).not.toContain('Synthetic private person');
    const [stored] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(insightJobs).where(eq(insightJobs.id, id)),
    );
    expect(stored?.ciphertext).toBeTruthy();
    expect(Buffer.from(stored!.ciphertext!, 'base64').includes(Buffer.from('worked_minutes'))).toBe(
      false,
    );
    await tick();
    const [replayed] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(insightJobs).where(eq(insightJobs.id, id)),
    );
    expect(replayed?.ciphertext).toBe(stored?.ciphertext);
    const outsider = await reader();
    await file(id, outsider.token).expect(404);
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(attendanceDays)
        .set({ workedMinutes: 480 })
        .where(eq(attendanceDays.employeeId, people[0]!)),
    );
    try {
      await file(id).expect(409);
    } finally {
      await runAsTenant(db, tenantId, (tx) =>
        tx
          .update(attendanceDays)
          .set({ workedMinutes: 450 })
          .where(eq(attendanceDays.employeeId, people[0]!)),
      );
    }
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(insightJobs)
        .set({ expiresAt: new Date(0) })
        .where(eq(insightJobs.id, id)),
    );
    await file(id).expect(404);
    await tick();
    expect(
      await runAsTenant(db, tenantId, (tx) =>
        tx.select().from(insightJobs).where(eq(insightJobs.id, id)),
      ),
    ).toHaveLength(0);
  });

  it('cancels queued work when the owner logs out and denies a different session family', async () => {
    const user = await reader();
    const report = await save(def('attendance'), user.token);
    const id = randomUUID();
    await queue(report, id, user.token).expect(202);
    await api(app).post('/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
    await tick();
    const [job] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(insightJobs).where(eq(insightJobs.id, id)),
    );
    expect(job).toMatchObject({ status: 'cancelled', ciphertext: null });
    await file(id, user.token).expect(401);
    await file(id).expect(404);
  });

  it('accepts normal session rotation and cancels work after a scoped role is revoked', async () => {
    const user = await reader();
    const report = await save(def('attendance'), user.token);
    const ready = randomUUID();
    await queue(report, ready, user.token).expect(202);
    const rotated = (
      await api(app).post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200)
    ).body.accessToken as string;
    await tick();
    await file(ready, rotated).expect(200);
    const pending = randomUUID();
    await queue(report, pending, rotated).expect(202);
    await api(app)
      .delete('/tenant/identity/assignments/' + user.assignment)
      .set(bearer(admin))
      .expect(200);
    await tick();
    const [job] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(insightJobs).where(eq(insightJobs.id, pending)),
    );
    expect(job).toMatchObject({ status: 'cancelled', ciphertext: null });
    await file(ready, rotated).expect(403);
  });

  it('permits only the bounded technical export write in a read-only workspace', async () => {
    const report = await save(def('attendance'));
    await db.update(tenants).set({ status: 'read_only' }).where(eq(tenants.id, tenantId));
    try {
      await api(app)
        .post(base + '/saved-insights')
        .set(bearer(admin))
        .send(def('leave'))
        .expect(403);
      await api(app)
        .delete(base + '/saved-insights/' + report)
        .set(bearer(admin))
        .expect(403);
      const id = randomUUID();
      await queue(report, id).expect(202);
      await tick();
      await file(id).expect(200);
    } finally {
      await db.update(tenants).set({ status: 'active' }).where(eq(tenants.id, tenantId));
    }
  });

  it('isolates saved definitions and generated artifacts at the database boundary', async () => {
    const report = await save(def('leave'));
    const id = randomUUID();
    await queue(report, id).expect(202);
    await tick();
    const appDb = createDb(testEnv().appUrl);
    try {
      const none = await runAsTenant(appDb.db, randomUUID(), async (tx) => [
        await tx.select().from(savedInsights).where(eq(savedInsights.id, report)),
        await tx.select().from(insightJobs).where(eq(insightJobs.id, id)),
      ]);
      expect(none).toEqual([[], []]);
    } finally {
      await appDb.pool.end();
    }
  });
});
