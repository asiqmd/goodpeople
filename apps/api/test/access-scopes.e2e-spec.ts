import { complianceAlerts, createDb, runAsTenant, tenants, type Database } from '@gp/db';
import {
  addDays,
  addMonths,
  todayIn,
  type AdolescentsView,
  type ApprovalItem,
  type ComplianceAlertPage,
  type DocumentView,
  type EmployeeDetail,
  type EmployeeListItem,
  type LeaveCalendarView,
  type LeavePreview,
  type LifecycleOverview,
  type OrgSnapshot,
  type Page,
  type SeparationView,
  type TeamDayView,
  type UserEntityScopeView,
  type WorkspaceUserCreated,
  type WorkspaceUserListItem,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { leaveTypeId, NEXT_YEAR, onOrAfter } from './leave-helpers.js';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

const PDF = Buffer.from('%PDF-1.4\n% a scoped document\n%%EOF\n');
const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const outside = (res: { body: { code?: string } }) => expect(res.body.code).toBe('outside_scope');

// Each test hires its own people in My Group Textiles (MGT) and My Group Foods (MGF) and makes
// its own HR logins, so the tests pass in any order.
describe('access scopes', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let admin: string;
  let tenantId: string;
  let org: OrgSnapshot;
  let seq = 0;
  const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase();
  const today = todayIn();

  beforeAll(async () => {
    app = await bootApp();
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    admin = (await tenantLogin(app, 'my-group')).accessToken;
    org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200)).body;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    tenantId = tenant!.id;
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  const company = (code: 'MGT' | 'MGF') => ref(org.legalEntities, code);

  async function login(role: string) {
    const email = `scope-${unique().toLowerCase()}@example.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({ name: `Scoped ${role}`, email, role, password: testEnv().password })
        .expect(201)
    ).body as WorkspaceUserCreated;
    const token = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;
    return { user, token };
  }

  const limit = (userId: string, codes: ('MGT' | 'MGF')[], token = admin) =>
    api(app)
      .put(`/tenant/users/${userId}/scopes`)
      .set(bearer(token))
      .send({ legalEntityIds: codes.map(company) });

  /** An HR officer who looks after My Group Foods only. */
  async function foodsOfficer() {
    const officer = await login('hr_officer');
    await limit(officer.user.id, ['MGF']).expect(200);
    return officer;
  }

  const jobIn = (code: 'MGT' | 'MGF') =>
    code === 'MGT'
      ? {
          legalEntityId: company('MGT'),
          locationId: ref(org.locations, 'GZP'),
          orgUnitId: ref(org.orgUnits, 'MGT-L1'),
        }
      : {
          legalEntityId: company('MGF'),
          locationId: ref(org.locations, 'NRJ'),
          orgUnitId: ref(org.orgUnits, 'MGF-PROD'),
        };

  type Fields = Record<string, unknown>;

  function hireBody(code: 'MGT' | 'MGF', prefix: string, job: Fields = {}, person: Fields = {}) {
    const employeeCode = `${prefix}-${code}-${unique()}`;
    return {
      employeeCode,
      fullName: `Scope Test ${employeeCode}`,
      fatherName: 'Abdul Karim',
      motherName: 'Hosne Ara',
      dateOfBirth: '1994-04-12',
      gender: 'female',
      mobilePhone: '01812345678',
      presentAddress: address,
      permanentAddress: address,
      identity: { nid: `${Date.now()}${seq++}`.slice(-10) },
      joinedOn: '2025-01-01',
      ...person,
      job: {
        ...jobIn(code),
        designationId: ref(org.designations, 'SO'),
        gradeId: ref(org.grades, 'W5'),
        employmentType: 'permanent',
        workerCategory: 'worker',
        ...job,
      },
    };
  }

  async function hire(code: 'MGT' | 'MGF', prefix: string, job?: Fields, person?: Fields) {
    return (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send(hireBody(code, prefix, job, person))
        .expect(201)
    ).body.employee as EmployeeDetail;
  }

  /** One of each company, sharing a code prefix only this test uses. */
  async function pair(job?: Fields, person?: Fields) {
    const prefix = `S${unique()}`;
    return {
      prefix,
      foods: await hire('MGF', prefix, job, person),
      textiles: await hire('MGT', prefix, job, person),
    };
  }

  const codesOf = async (token: string, search: string) =>
    (
      (
        await api(app)
          .get(`/tenant/employees?search=${search}&pageSize=100`)
          .set(bearer(token))
          .expect(200)
      ).body as Page<EmployeeListItem>
    ).items.map((e) => e.employeeCode);

  // ── Managing scopes ────────────────────────────────────────────────────────

  it('limits a login to chosen companies, shows them to admins, and clears them', async () => {
    const officer = await login('hr_officer');
    const set = (await limit(officer.user.id, ['MGF']).expect(200)).body as UserEntityScopeView;
    expect(set).toEqual({
      userId: officer.user.id,
      legalEntities: [expect.objectContaining({ id: company('MGF'), code: 'MGF' })],
    });
    expect(
      (await api(app).get(`/tenant/users/${officer.user.id}/scopes`).set(bearer(admin)).expect(200))
        .body,
    ).toEqual(set);
    const users = (await api(app).get('/tenant/users').set(bearer(admin)).expect(200))
      .body as WorkspaceUserListItem[];
    expect(users.find((u) => u.id === officer.user.id)!.legalEntityIds).toEqual([company('MGF')]);

    const cleared = (
      await api(app)
        .put(`/tenant/users/${officer.user.id}/scopes`)
        .set(bearer(admin))
        .send({ legalEntityIds: [] })
        .expect(200)
    ).body as UserEntityScopeView;
    expect(cleared.legalEntities).toEqual([]);
  });

  it('never limits a workspace admin, refuses other workspaces’ companies and needs users.manage', async () => {
    const me = (await api(app).get('/account').set(bearer(admin)).expect(200)).body as {
      id: string;
    };
    const adminRefused = await limit(me.id, ['MGF']).expect(400);
    expect(adminRefused.body.code).toBe('scope_not_for_admin');

    const officer = await login('hr_officer');
    const unknown = await api(app)
      .put(`/tenant/users/${officer.user.id}/scopes`)
      .set(bearer(admin))
      .send({ legalEntityIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(400);
    expect(unknown.body.code).toBe('unknown_company');

    // An HR admin manages people but not logins.
    const hrAdmin = await login('hr_admin');
    await api(app)
      .get(`/tenant/users/${officer.user.id}/scopes`)
      .set(bearer(hrAdmin.token))
      .expect(403);
    await limit(officer.user.id, ['MGF'], hrAdmin.token).expect(403);

    // Made a workspace admin, a limited login sees every company again.
    await limit(officer.user.id, ['MGF']).expect(200);
    await api(app)
      .patch(`/tenant/users/${officer.user.id}`)
      .set(bearer(admin))
      .send({ role: 'tenant_admin' })
      .expect(200);
    const after = (
      await api(app).get(`/tenant/users/${officer.user.id}/scopes`).set(bearer(admin)).expect(200)
    ).body as UserEntityScopeView;
    expect(after.legalEntities).toEqual([]);
  });

  // ── People ─────────────────────────────────────────────────────────────────

  it('shows a limited HR login only its companies’ people and refuses changes outside them', async () => {
    const { prefix, foods, textiles } = await pair();
    const officer = await foodsOfficer();
    const as = bearer(officer.token);

    expect(await codesOf(officer.token, prefix)).toEqual([foods.employeeCode]);
    await api(app).get(`/tenant/employees/${foods.id}`).set(as).expect(200);
    await api(app).get(`/tenant/employees/${textiles.id}`).set(as).expect(404);
    await api(app).get(`/tenant/employees/${textiles.id}/job-history`).set(as).expect(404);

    outside(
      await api(app)
        .patch(`/tenant/employees/${textiles.id}`)
        .set(as)
        .send({ spouseName: 'Rafiq' })
        .expect(403),
    );
    outside(
      await api(app).put(`/tenant/employees/${textiles.id}/nominees`).set(as).send([]).expect(403),
    );
    outside(
      await api(app).post('/tenant/employees').set(as).send(hireBody('MGT', prefix)).expect(403),
    );
    // Moving someone of theirs into a company they do not look after.
    outside(
      await api(app)
        .post(`/tenant/employees/${foods.id}/job-changes`)
        .set(as)
        .send({
          event: 'transfer',
          effectiveFrom: addDays(today, 1),
          reason: 'Moves to textiles',
          changes: jobIn('MGT'),
        })
        .expect(403),
    );
    await api(app).post('/tenant/employees').set(as).send(hireBody('MGF', prefix)).expect(201);
    await api(app)
      .patch(`/tenant/employees/${foods.id}`)
      .set(as)
      .send({ spouseName: 'Rafiq' })
      .expect(200);

    // Cleared, the same login sees both companies again.
    await limit(officer.user.id, []).expect(200);
    expect(await codesOf(officer.token, prefix)).toEqual(
      expect.arrayContaining([foods.employeeCode, textiles.employeeCode]),
    );
    await api(app).get(`/tenant/employees/${textiles.id}`).set(as).expect(200);
  });

  it('leaves an unlimited HR login seeing every company', async () => {
    const { prefix, foods, textiles } = await pair();
    const officer = await login('hr_officer');
    expect((await codesOf(officer.token, prefix)).toSorted()).toEqual(
      [foods.employeeCode, textiles.employeeCode].toSorted(),
    );
  });

  const entitiesOf = async (token: string) =>
    (
      (await api(app).get('/tenant/org').set(bearer(token)).expect(200)).body as OrgSnapshot
    ).legalEntities
      .map((e) => e.id)
      .toSorted();

  it('offers a limited login only its companies in the org lists', async () => {
    const officer = await foodsOfficer();
    expect(await entitiesOf(officer.token)).toEqual([company('MGF')]);
    const unlimited = await login('hr_officer');
    expect(await entitiesOf(unlimited.token)).toEqual(
      expect.arrayContaining([company('MGF'), company('MGT')]),
    );
  });

  it('limits the attendance and leave team lists', async () => {
    const { foods, textiles } = await pair();
    const officer = await foodsOfficer();
    const unlimited = await login('hr_officer');

    const daily = async (token: string) =>
      (
        (
          await api(app)
            .get(`/tenant/attendance/daily?date=${today}`)
            .set(bearer(token))
            .expect(200)
        ).body as TeamDayView
      ).rows.map((r) => r.employee.id);
    const limited = await daily(officer.token);
    expect(limited).toContain(foods.id);
    expect(limited).not.toContain(textiles.id);
    expect(await daily(unlimited.token)).toEqual(expect.arrayContaining([foods.id, textiles.id]));

    const casual = await leaveTypeId(app, admin, 'CL');
    const day = await clearDay(foods.id, casual);
    for (const person of [foods, textiles]) {
      await api(app)
        .post(`/tenant/employees/${person.id}/leave/requests`)
        .set(bearer(admin))
        .send({ leaveTypeId: casual, startDate: day, endDate: day, reason: 'Family visit' })
        .expect(201);
    }
    const calendar = async (token: string) =>
      (
        (
          await api(app)
            .get(`/tenant/leave/calendar?from=${day}&to=${day}`)
            .set(bearer(token))
            .expect(200)
        ).body as LeaveCalendarView
      ).entries.map((e) => e.employee.id);
    const away = await calendar(officer.token);
    expect(away).toContain(foods.id);
    expect(away).not.toContain(textiles.id);
    expect(await calendar(unlimited.token)).toEqual(
      expect.arrayContaining([foods.id, textiles.id]),
    );
  });

  it("limits HR's pages for one person, the leave and correction lists and the HR approvals", async () => {
    const { foods, textiles } = await pair();
    const officer = await foodsOfficer();
    const from = `${today.slice(0, 7)}-01`;
    for (const path of [
      `leave?year=${today.slice(0, 4)}`,
      `attendance?from=${from}&to=${today}`,
      'service-book',
    ]) {
      await api(app)
        .get(`/tenant/employees/${foods.id}/${path}`)
        .set(bearer(officer.token))
        .expect(200);
      await api(app)
        .get(`/tenant/employees/${textiles.id}/${path}`)
        .set(bearer(officer.token))
        .expect(404);
    }

    // Neither has a manager, so each request waits for HR.
    const casual = await leaveTypeId(app, admin, 'CL');
    const day = await clearDay(foods.id, casual);
    const requests: Record<string, string> = {};
    for (const person of [foods, textiles]) {
      requests[person.id] = (
        await api(app)
          .post(`/tenant/employees/${person.id}/leave/requests`)
          .set(bearer(admin))
          .send({ leaveTypeId: casual, startDate: day, endDate: day, reason: 'Family visit' })
          .expect(201)
      ).body.id;
    }
    const listed = (
      (await api(app).get('/tenant/leave/requests').set(bearer(officer.token)).expect(200))
        .body as { id: string }[]
    ).map((r) => r.id);
    expect(listed).toContain(requests[foods.id]);
    expect(listed).not.toContain(requests[textiles.id]);

    const inbox = (token: string) =>
      api(app)
        .get('/tenant/approvals')
        .set(bearer(token))
        .expect(200)
        .then((res) =>
          (res.body as ApprovalItem[]).flatMap((i) =>
            i.subjectType === 'leave_request'
              ? [{ step: i.stepId, of: i.request.employee.id }]
              : [],
          ),
        );
    const mine = await inbox(officer.token);
    expect(mine.map((i) => i.of)).toContain(foods.id);
    expect(mine.map((i) => i.of)).not.toContain(textiles.id);
    // The other company's step is still there for an HR login that is not limited.
    const all = await inbox(admin);
    const theirs = all.find((i) => i.of === textiles.id)!;
    await api(app)
      .post(`/tenant/approvals/${theirs.step}/approve`)
      .set(bearer(officer.token))
      .send({})
      .expect(403);
  });

  /** A working day next year that a one-day request counts as one day. */
  async function clearDay(employeeId: string, typeId: string) {
    const monday = onOrAfter(`${NEXT_YEAR}-03-01`, 1);
    for (let week = 0; week < 20; week++) {
      const d = addDays(monday, 7 * week);
      const preview = (
        await api(app)
          .post(`/tenant/employees/${employeeId}/leave/preview`)
          .set(bearer(admin))
          .send({ leaveTypeId: typeId, startDate: d, endDate: d })
          .expect(201)
      ).body as LeavePreview;
      if (preview.days === 1) return d;
    }
    throw new Error('No clear working day');
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  it('limits documents to the companies looked after', async () => {
    const { foods, textiles } = await pair();
    const officer = await foodsOfficer();
    const as = bearer(officer.token);
    const upload = (employeeId: string, token = admin) =>
      api(app)
        .post(`/tenant/employees/${employeeId}/documents`)
        .set(bearer(token))
        .attach('file', PDF, 'licence.pdf')
        .field('category', 'other')
        .field('title', 'Trade licence copy')
        .field('expiresOn', addDays(today, 3));
    const foodsDoc = (await upload(foods.id).expect(201)).body as DocumentView;
    const textilesDoc = (await upload(textiles.id).expect(201)).body as DocumentView;

    const expiring = (
      (await api(app).get('/tenant/documents/expiring?days=10').set(as).expect(200))
        .body as DocumentView[]
    ).map((d) => d.id);
    expect(expiring).toContain(foodsDoc.id);
    expect(expiring).not.toContain(textilesDoc.id);
    expect(
      (await api(app).get(`/tenant/employees/${textiles.id}/documents`).set(as).expect(200)).body,
    ).toEqual([]);
    await api(app).get(`/tenant/documents/${foodsDoc.id}/file`).set(as).expect(200);
    await api(app).get(`/tenant/documents/${textilesDoc.id}/file`).set(as).expect(404);
    await api(app)
      .patch(`/tenant/documents/${textilesDoc.id}`)
      .set(as)
      .send({ title: 'Renamed' })
      .expect(404);
    await api(app).delete(`/tenant/documents/${textilesDoc.id}`).set(as).expect(404);
    expect((await upload(textiles.id, officer.token).expect(403)).body.code).toBe('outside_scope');
    // Still there for HR who sees every company.
    await api(app).get(`/tenant/documents/${textilesDoc.id}/file`).set(bearer(admin)).expect(200);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  it('limits separations and probation to the companies looked after', async () => {
    const { foods, textiles } = await pair();
    const officer = await foodsOfficer();
    const as = bearer(officer.token);
    const separation = {
      type: 'termination',
      noticeDate: today,
      lastWorkingDay: addDays(today, 60),
      reason: 'Position closed',
    };
    const separate = (employeeId: string, token = admin) =>
      api(app)
        .post(`/tenant/employees/${employeeId}/separations`)
        .set(bearer(token))
        .send(separation);
    const leaving = (await separate(foods.id).expect(201)).body as SeparationView;
    const other = (await separate(textiles.id).expect(201)).body as SeparationView;

    const listed = (
      (await api(app).get('/tenant/separations').set(as).expect(200)).body as SeparationView[]
    ).map((s) => s.id);
    expect(listed).toContain(leaving.id);
    expect(listed).not.toContain(other.id);
    expect(
      (await api(app).get(`/tenant/employees/${textiles.id}/separations`).set(as).expect(200)).body,
    ).toEqual([]);
    const overview = (await api(app).get('/tenant/lifecycle').set(as).expect(200))
      .body as LifecycleOverview;
    expect(overview.separations.map((s) => s.id)).toContain(leaving.id);
    expect(overview.separations.map((s) => s.id)).not.toContain(other.id);

    await api(app).post(`/tenant/separations/${other.id}/cancel`).set(as).expect(404);
    await api(app).post(`/tenant/separations/${leaving.id}/cancel`).set(as).expect(201);

    // Staff on probation that ends within the month, so it is listed.
    const probationers = await pair(
      {
        designationId: ref(org.designations, 'HRE'),
        employmentType: 'probationer',
        workerCategory: 'staff',
      },
      { joinedOn: addDays(today, -170) },
    );
    const due = (await api(app).get('/tenant/lifecycle').set(as).expect(200))
      .body as LifecycleOverview;
    const ids = due.probations.map((p) => p.employee.id);
    expect(ids).toContain(probationers.foods.id);
    expect(ids).not.toContain(probationers.textiles.id);
    const until = due.probations.find((p) => p.employee.id === probationers.foods.id)!.latestEnd;
    const extend = (employeeId: string) =>
      api(app)
        .post(`/tenant/employees/${employeeId}/probation/extend`)
        .set(as)
        .send({ until, reason: 'Work could not be judged in time' });
    expect((await extend(probationers.textiles.id).expect(403)).body.code).toBe('outside_scope');
    await extend(probationers.foods.id).expect(201);
    const refused = await separate(probationers.textiles.id, officer.token).expect(403);
    expect(refused.body.code).toBe('outside_scope');
  });

  // ── Compliance ─────────────────────────────────────────────────────────────

  it('limits compliance alerts and boards to the companies looked after', async () => {
    const { foods, textiles } = await pair();
    const officer = await foodsOfficer();
    const as = bearer(officer.token);
    // A period of its own, so the alerts are this test's alone.
    const period = addDays('2001-01-01', seq);
    const [foodsAlert, textilesAlert, foodsCompany, textilesCompany] = await runAsTenant(
      db,
      tenantId,
      (tx) =>
        tx
          .insert(complianceAlerts)
          .values([
            ...[foods, textiles].map((e) => ({
              tenantId,
              kind: 'daily_hours' as const,
              subjectId: e.id,
              employeeId: e.id,
              periodStart: period,
              periodEnd: period,
              value: 720,
              limit: 600,
            })),
            ...(['MGF', 'MGT'] as const).map((code) => ({
              tenantId,
              kind: 'committee_missing' as const,
              subjectId: company(code),
              periodStart: period,
              periodEnd: period,
              value: 0,
              limit: 1,
            })),
          ])
          .returning({ id: complianceAlerts.id }),
    );
    const alerts = async (token: string) =>
      (
        (
          await api(app)
            .get(`/tenant/compliance/alerts?from=${period}&to=${period}&pageSize=100`)
            .set(bearer(token))
            .expect(200)
        ).body as ComplianceAlertPage
      ).items.map((a) => a.id);
    expect((await alerts(officer.token)).toSorted()).toEqual(
      [foodsAlert!.id, foodsCompany!.id].toSorted(),
    );
    expect(await alerts(admin)).toEqual(
      expect.arrayContaining([textilesAlert!.id, textilesCompany!.id]),
    );
    await api(app)
      .post(`/tenant/compliance/alerts/${textilesAlert!.id}/acknowledge`)
      .set(as)
      .send({ note: 'Seen by the foods HR' })
      .expect(404);
    await api(app)
      .post(`/tenant/compliance/alerts/${foodsAlert!.id}/acknowledge`)
      .set(as)
      .send({ note: 'Seen by the foods HR' })
      .expect(201);

    const consent = (employeeId: string) =>
      api(app)
        .put(`/tenant/compliance/night-work/${employeeId}`)
        .set(as)
        .send({ consentFrom: today });
    expect((await consent(textiles.id).expect(403)).body.code).toBe('outside_scope');
    await consent(foods.id).expect(200);
    const night = (
      (await api(app).get('/tenant/compliance/night-work').set(as).expect(200)).body as {
        rows: { employee: { id: string } }[];
      }
    ).rows.map((r) => r.employee.id);
    expect(night).toContain(foods.id);
    await api(app)
      .put(`/tenant/compliance/night-work/${textiles.id}`)
      .set(bearer(admin))
      .send({ consentFrom: today })
      .expect(200);
    const nightAgain = (
      (await api(app).get('/tenant/compliance/night-work').set(as).expect(200)).body as {
        rows: { employee: { id: string } }[];
      }
    ).rows.map((r) => r.employee.id);
    expect(nightAgain).not.toContain(textiles.id);

    const minors = await pair({}, { dateOfBirth: addMonths(today, -12 * 16) });
    const adolescents = (
      (await api(app).get('/tenant/compliance/adolescents').set(as).expect(200))
        .body as AdolescentsView
    ).rows.map((r) => r.employee.id);
    expect(adolescents).toContain(minors.foods.id);
    expect(adolescents).not.toContain(minors.textiles.id);
  });

  it('limits maternity cases and trade unions to the companies looked after', async () => {
    const { prefix, foods, textiles } = await pair();
    const { token } = await foodsOfficer();
    const as = bearer(token);
    const caseFor = async (employeeId: string) =>
      (
        await api(app)
          .post('/tenant/maternity/cases')
          .set(bearer(admin))
          .send({
            employeeId,
            noticeOn: today,
            expectedDeliveryOn: addDays(today, 60),
            survivingChildren: 0,
            paymentOption: 'before_and_after',
            averageDailyWage: '500',
            averageReason: 'Joined recently',
          })
          .expect(201)
      ).body as { id: string; employee: { id: string } };
    const foodsCase = await caseFor(foods.id);
    const textilesCase = await caseFor(textiles.id);

    const cases = (
      (await api(app).get('/tenant/maternity/cases').set(as).expect(200)).body as {
        id: string;
      }[]
    ).map((c) => c.id);
    expect(cases).toContain(foodsCase.id);
    expect(cases).not.toContain(textilesCase.id);
    await api(app).get(`/tenant/maternity/cases/${foodsCase.id}`).set(as).expect(200);
    await api(app).get(`/tenant/maternity/cases/${textilesCase.id}`).set(as).expect(404);
    await api(app)
      .post(`/tenant/maternity/cases/${textilesCase.id}/cancel`)
      .set(as)
      .send({ reason: 'Not ours' })
      .expect(404);
    const candidates = (
      (await api(app).get(`/tenant/maternity/candidates?search=${prefix}`).set(as).expect(200))
        .body as { id: string }[]
    ).map((c) => c.id);
    expect(candidates).toEqual([foods.id]);

    const union = async (code: 'MGT' | 'MGF', employeeId: string) => {
      const created = (
        await api(app)
          .post('/tenant/relations/unions')
          .set(bearer(admin))
          .send({ legalEntityId: company(code), name: `Scope union ${unique()}`, isCba: false })
          .expect(201)
      ).body as { id: string };
      await api(app)
        .post(`/tenant/relations/unions/${created.id}/members`)
        .set(bearer(admin))
        .send({ employeeId, joinedOn: today })
        .expect(201);
      return created.id;
    };
    const foodsUnion = await union('MGF', foods.id);
    const textilesUnion = await union('MGT', textiles.id);
    const unions = (
      (await api(app).get('/tenant/relations/unions').set(as).expect(200)).body as {
        unions: { id: string }[];
      }
    ).unions.map((u) => u.id);
    expect(unions).toContain(foodsUnion);
    expect(unions).not.toContain(textilesUnion);
    await api(app).get(`/tenant/relations/unions/${foodsUnion}`).set(as).expect(200);
    await api(app).get(`/tenant/relations/unions/${textilesUnion}`).set(as).expect(404);
    await api(app)
      .patch(`/tenant/relations/unions/${textilesUnion}`)
      .set(as)
      .send({ note: 'Not ours' })
      .expect(404);
    outside(
      await api(app)
        .post('/tenant/relations/unions')
        .set(as)
        .send({ legalEntityId: company('MGT'), name: `Scope union ${unique()}`, isCba: false })
        .expect(403),
    );
  });
});
