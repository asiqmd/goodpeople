import {
  anomalyFindings,
  attendanceDays,
  attendanceSettings,
  createDb,
  createFieldCipher,
  entitlementGrants,
  jobAssignments,
  payGroups,
  runAsTenant,
  tenantAuditLog,
  tenants,
} from '@gp/db';
import { addDays, emptyFieldPolicy, type AnomalyDefinition } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  latestReviewMonth,
  monthEnd,
  previousMonth,
} from '../src/modules/analytics/anomaly-detector.js';
import { totpAt } from '../src/modules/auth/totp.js';
import { lockedFixture } from './insights-fixtures.js';
import {
  api,
  bearer,
  bootApp,
  platformToken,
  tenantLogin,
  testEnv,
  uniqueSlug,
} from './test-env.js';

const route = '/tenant/analytics/anomalies';
const month = latestReviewMonth();
const earliest = previousMonth(month, 3) + '-01';
const through = monthEnd(month);

describe('explainable anomaly inbox', () => {
  let app: INestApplication;
  let owner: ReturnType<typeof createDb>;
  let tenantId: string,
    slug: string,
    admin: string,
    otherAdmin: string,
    company: string,
    anotherCompany: string;
  let reviewGrant: string;
  const employees: string[] = [];
  const def = (rule: AnomalyDefinition['rule'], companyId = company): AnomalyDefinition =>
    rule === 'assignment_coverage' || rule === 'payroll_movement'
      ? { rule, month }
      : { rule, month, companyId };
  const inbox = (definition: AnomalyDefinition, token = admin, before?: string) =>
    api(app)
      .get(
        route +
          '/inbox' +
          (before ? '/' + before : '') +
          '?' +
          new URLSearchParams(Object.entries(definition)),
      )
      .set(bearer(token));
  const scan = (definition: AnomalyDefinition, token = admin) =>
    api(app)
      .post(route + '/scan')
      .set(bearer(token))
      .send(definition);
  const review = (id: string, action: string, token = admin, reason?: string) =>
    api(app)
      .post(route + '/' + id + '/review')
      .set(bearer(token))
      .send({ action, ...(reason ? { reason } : {}) });

  async function login(email: string, password = testEnv().password) {
    return (await api(app).post('/auth/login').send({ tenant: slug, email, password }).expect(200))
      .body.accessToken as string;
  }

  async function user(role: 'hr_officer' | 'hr_admin') {
    const email = 'review-' + randomUUID() + '@' + slug + '.test';
    const { body } = await api(app)
      .post('/tenant/users')
      .set(bearer(admin))
      .send({
        name: 'Synthetic reviewer',
        email,
        role,
        password: testEnv().password,
      })
      .expect(201);
    return { id: body.id as string, email };
  }

  beforeAll(async () => {
    app = await bootApp();
    owner = createDb(testEnv().ownerUrl);
    slug = uniqueSlug('m4-review');
    const platform = await platformToken(app);
    const email = 'admin@' + slug + '.test';
    const { body } = await api(app)
      .post('/platform/tenants')
      .set(bearer(platform))
      .send({
        name: 'M4 synthetic workspace',
        slug,
        industryTemplate: 'corporate',
        billingMode: 'internal',
        planCode: 'enterprise',
        reason: 'Isolated anomaly review acceptance',
        admin: { name: 'Synthetic administrator', email },
      })
      .expect(201);
    tenantId = body.tenant.id;
    admin = await login(email, body.temporaryPassword);
    const setup = (await api(app).post('/account/mfa/setup').set(bearer(admin)).expect(200)).body;
    await api(app)
      .post('/account/mfa/confirm')
      .set(bearer(admin))
      .send({ code: totpAt(setup.secret, new Date()) })
      .expect(200);
    otherAdmin = await login((await user('hr_admin')).email);
    for (const key of ['analytics', 'analytics_insights'] as const)
      await owner.db
        .insert(entitlementGrants)
        .values({ tenantId, kind: 'feature', key, reason: 'M4 test' });
    await api(app)
      .get(route + '/catalog')
      .set(bearer(admin))
      .expect(403);
    const [grant] = await owner.db
      .insert(entitlementGrants)
      .values({
        tenantId,
        kind: 'feature',
        key: 'anomaly_review',
        reason: 'M4 test',
      })
      .returning({ id: entitlementGrants.id });
    reviewGrant = grant!.id;
    for (const code of ['M4A', 'M4B']) {
      const result = await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(admin))
        .send({
          name: 'Synthetic ' + code,
          code,
        })
        .expect(201);
      if (code === 'M4A') company = result.body.id;
      else anotherCompany = result.body.id;
    }
    for (let i = 0; i < 6; i++) {
      const response = await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: 'M4-' + i,
          fullName: 'Synthetic private name ' + i,
          fatherName: 'Synthetic parent',
          motherName: 'Synthetic parent',
          dateOfBirth: '1990-01-01',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: { line: 'Fixture street', district: 'Gazipur', division: 'dhaka' },
          permanentAddress: { line: 'Fixture street', district: 'Gazipur', division: 'dhaka' },
          identity: { nid: (Date.now() + i).toString().slice(-10) },
          joinedOn: earliest,
          job: { legalEntityId: company, employmentType: 'permanent', workerCategory: 'worker' },
        })
        .expect(201);
      employees.push(response.body.employee.id);
    }
    await runAsTenant(owner.db, tenantId, async (tx) => {
      await tx
        .insert(attendanceSettings)
        .values({ tenantId, trackingFrom: earliest, processedThrough: through })
        .onConflictDoUpdate({
          target: attendanceSettings.tenantId,
          set: { trackingFrom: earliest, processedThrough: through },
        });
      const rows: (typeof attendanceDays.$inferInsert)[] = [];
      for (let date = earliest; date <= through; date = addDays(date, 1))
        for (const employeeId of employees)
          rows.push({
            tenantId,
            employeeId,
            date,
            dayType: 'working',
            status: 'present',
            workedMinutes: date.startsWith(month) ? 740 : 360,
          });
      await tx.insert(attendanceDays).values(rows);
      const [group] = await tx
        .insert(payGroups)
        .values({
          tenantId,
          legalEntityId: company,
          code: 'M4-FIXTURE',
          name: 'Synthetic M4 payroll',
          frequency: 'monthly',
        })
        .returning({ id: payGroups.id });
      const cipher = createFieldCipher(testEnv().fieldKey);
      for (let offset = 3; offset >= 0; offset--)
        await lockedFixture(
          tx,
          cipher,
          tenantId,
          group!.id,
          previousMonth(month, offset),
          employees,
        );
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await owner?.pool.end();
  });

  it('deduplicates scans, requires the reviewer, and records actual correction evidence', async () => {
    const definition = def('attendance_processing');
    const cutoff = (date: string) =>
      runAsTenant(owner.db, tenantId, (tx) =>
        tx.update(attendanceSettings).set({ processedThrough: date }),
      );
    await cutoff(addDays(through, -1));
    try {
      const scans = await Promise.all([scan(definition), scan(definition)]);
      expect(scans.every((r) => r.status === 200 || r.status === 409)).toBe(true);
      const first = scans.find((r) => r.status === 200)?.body;
      expect(first).toMatchObject({
        findingId: expect.any(String),
        evaluation: {
          state: 'detected',
          version: 'anomaly.v1',
          sourceVersion: 'insight.v1',
          evidence: {
            kind: 'processing',
            expected: through,
            processedThrough: addDays(through, -1),
          },
        },
      });
      const id = first.findingId;
      await scan(definition)
        .expect(200)
        .expect((r) => expect(r.body.findingId).toBe(id));
      await inbox(definition)
        .expect(200)
        .expect('Cache-Control', 'private, no-store')
        .expect((r) => {
          expect(r.body.findings).toHaveLength(1);
          expect(r.body.findings[0].status).toBe('open');
        });
      await inbox(definition, admin, id)
        .expect(200)
        .expect((r) => expect(r.body.findings).toEqual([]));
      await review(id, 'claim')
        .expect(200)
        .expect((r) => expect(r.body.ownedByMe).toBe(true));
      await review(id, 'acknowledge', otherAdmin).expect(403);
      await review(id, 'resolve').expect(409);
      await review(id, 'acknowledge')
        .expect(200)
        .expect((r) => expect(r.body.status).toBe('acknowledged'));
      await cutoff(through);
      await review(id, 'dismiss', admin, 'Synthetic stale evidence').expect(409);
      await scan(definition)
        .expect(200)
        .expect((r) => expect(r.body.evaluation.state).toBe('clear'));
      await review(id, 'resolve')
        .expect(200)
        .expect((r) => {
          expect(r.body).toMatchObject({
            status: 'resolved',
            supersededAt: expect.any(String),
            resolution: { sourceRevision: expect.any(String) },
          });
          expect(r.body.resolution.sourceRevision).not.toBe(first.evaluation.sourceRevision);
        });
      const actions = await runAsTenant(owner.db, tenantId, (tx) =>
        tx
          .select({ action: tenantAuditLog.action })
          .from(tenantAuditLog)
          .where(eq(tenantAuditLog.entityId, id)),
      );
      expect(actions.map((a) => a.action).toSorted()).toEqual([
        'anomaly.acknowledge',
        'anomaly.claim',
        'anomaly.detect',
        'anomaly.resolve',
        'anomaly.supersede',
      ]);
      await cutoff(addDays(through, -1));
      await scan(definition)
        .expect(200)
        .expect((r) => expect(r.body.findingId).toBe(id));
      await inbox(definition)
        .expect(200)
        .expect((r) =>
          expect(r.body.findings).toMatchObject([{ id, status: 'open', supersededAt: null }]),
        );
    } finally {
      await cutoff(through);
    }
  });

  it('detects both assignment issues without emitting employee identities', async () => {
    const definition = def('assignment_coverage');
    await scan(definition)
      .expect(200)
      .expect((r) => expect(r.body.evaluation.state).toBe('clear'));
    const overlap = await runAsTenant(owner.db, tenantId, async (tx) => {
      await tx
        .update(jobAssignments)
        .set({ effectiveTo: addDays(through, -1) })
        .where(eq(jobAssignments.employeeId, employees[0]!));
      const [row] = await tx
        .insert(jobAssignments)
        .values({
          tenantId,
          employeeId: employees[1]!,
          legalEntityId: company,
          event: 'transfer',
          effectiveFrom: month + '-01',
          effectiveTo: through,
          employmentType: 'permanent',
          workerCategory: 'worker',
        })
        .returning({ id: jobAssignments.id });
      return row!.id;
    });
    try {
      const { body } = await scan(definition).expect(200);
      expect(body.evaluation.evidence).toEqual({
        kind: 'assignments',
        issues: ['missing_assignment', 'overlapping_assignments'],
      });
      expect(JSON.stringify(body)).not.toContain(employees[0]);
      expect(JSON.stringify(body)).not.toContain('Synthetic private name');
    } finally {
      await runAsTenant(owner.db, tenantId, async (tx) => {
        await tx
          .update(jobAssignments)
          .set({ effectiveTo: null })
          .where(eq(jobAssignments.employeeId, employees[0]!));
        await tx.delete(jobAssignments).where(eq(jobAssignments.id, overlap));
      });
    }
  });

  it('explains recorded movement, protects evidence and enforces scoped and revoked roles', async () => {
    const definition = def('attendance_movement');
    const { body } = await scan(definition).expect(200);
    const id = body.findingId as string;
    expect(body.evaluation).toMatchObject({
      state: 'detected',
      evidence: { observed: '4440.00', baseline: '2160.00', difference: '2280.00' },
    });
    await scan(def('payroll_movement'), otherAdmin).expect(404);
    await scan(def('payroll_movement'))
      .expect(200)
      .expect((r) =>
        expect(r.body.evaluation.evidence).toMatchObject({
          observed: '633.00',
          baseline: '633.00',
          unit: 'BDT',
        }),
      );
    await review(id, 'claim').expect(200);
    await review(id, 'dismiss').expect(400);
    await review(id, 'dismiss', admin, 'Synthetic schedule variance').expect(200);
    const [stored] = await runAsTenant(owner.db, tenantId, (tx) =>
      tx.select().from(anomalyFindings).where(eq(anomalyFindings.id, id)),
    );
    expect(stored!.evidenceEnc).not.toContain('4440');
    expect(stored!.reasonEnc).not.toContain('Synthetic schedule variance');
    const reader = await user('hr_officer');
    const { body: role } = await api(app)
      .post('/tenant/identity/roles')
      .set(bearer(admin))
      .send({
        name: 'Anomaly source reader',
        permissions: ['analytics.view', 'employees.read', 'attendance.manage'],
        fields: emptyFieldPolicy(),
      })
      .expect(201);
    const { body: assignment } = await api(app)
      .post('/tenant/identity/users/' + reader.id + '/assignments')
      .set(bearer(admin))
      .send({
        roleId: role.id,
        scope: 'selected',
        companyIds: [company],
        relationship: 'all',
      })
      .expect(201);
    const token = await login(reader.email);
    await inbox(definition, token)
      .expect(200)
      .expect((r) => {
        expect(r.body.canReview).toBe(false);
        expect(r.body.findings[0].reason).toBe('Synthetic schedule variance');
      });
    await inbox(def('attendance_movement', anotherCompany), token).expect(404);
    await inbox(def('assignment_coverage'), token).expect(404);
    await scan(definition, token).expect(403);
    await api(app)
      .delete('/tenant/identity/assignments/' + assignment.id)
      .set(bearer(admin))
      .expect(200);
    await inbox(definition, token).expect(403);

    const outside = await tenantLogin(app, 'sponsored-ngo');
    await review(id, 'claim', outside.accessToken).expect(403);
    const appDb = createDb(testEnv().appUrl);
    try {
      const rows = await runAsTenant(appDb.db, randomUUID(), (tx) =>
        tx.select().from(anomalyFindings),
      );
      expect(rows).toEqual([]);
    } finally {
      await appDb.pool.end();
    }
  });

  it('allows inbox reads only in read-only mode and hides findings immediately on entitlement removal', async () => {
    await owner.db.update(tenants).set({ status: 'read_only' }).where(eq(tenants.id, tenantId));
    try {
      await inbox(def('attendance_processing'))
        .expect(200)
        .expect((r) => expect(r.body.canReview).toBe(false));
      await scan(def('attendance_processing')).expect(403);
    } finally {
      await owner.db.update(tenants).set({ status: 'active' }).where(eq(tenants.id, tenantId));
    }
    await owner.db
      .delete(entitlementGrants)
      .where(and(eq(entitlementGrants.tenantId, tenantId), eq(entitlementGrants.id, reviewGrant)));
    try {
      await inbox(def('attendance_processing')).expect(403);
    } finally {
      const [grant] = await owner.db
        .insert(entitlementGrants)
        .values({
          tenantId,
          kind: 'feature',
          key: 'anomaly_review',
          reason: 'Restore M4 test opt-in',
        })
        .returning({ id: entitlementGrants.id });
      reviewGrant = grant!.id;
    }
  });
});
