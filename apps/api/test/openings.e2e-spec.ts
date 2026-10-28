import {
  applications,
  candidates,
  createDb,
  jobOpenings,
  runAsTenant,
  tenantAuditLog,
  tenants,
} from '@gp/db';
import {
  addDays,
  DEFAULT_SCORECARD_CRITERIA,
  todayIn,
  type ApplicationStage,
  type ApprovalItem,
  type EmployeeDetail,
  type JobOpeningApprovalItem,
  type OpeningDetail,
  type OpeningListItem,
  type OpeningView,
  type OrgSnapshot,
  type WorkspaceUserCreated,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { runInTenantContext } from '../src/common/request-context.js';
import { OpeningJobs } from '../src/modules/recruitment/opening-jobs.service.js';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

const BASE = '/tenant/recruitment/openings';
const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const codeOf = (res: { body: { code?: string } }) => res.body.code;

// Each test hires its own people and logins in the seeded my-group workspace and makes its own
// openings, so the tests pass in any order and never count seeded rows.
describe('openings', () => {
  let app: INestApplication;
  let db: ReturnType<typeof createDb>['db'];
  let pool: ReturnType<typeof createDb>['pool'];
  let tenantId: string;
  let admin: string;
  let org: OrgSnapshot;
  let seq = 0;
  const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase();
  const today = todayIn();

  beforeAll(async () => {
    app = await bootApp();
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    admin = (await tenantLogin(app, 'my-group')).accessToken;
    org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200)).body as OrgSnapshot;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    tenantId = tenant!.id;
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  const company = (code: 'MGT' | 'MGF') => ref(org.legalEntities, code);
  const asTenant = <T>(fn: Parameters<typeof runAsTenant<T>>[2]) => runAsTenant(db, tenantId, fn);

  const signIn = async (email: string) =>
    (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;

  /** An employee of My Group Textiles with a login, reporting to `managerId`. */
  async function person(managerId?: string, role = 'employee') {
    const code = `OP-${unique()}`;
    const email = `${code.toLowerCase()}@example.test`;
    const employee = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: code,
          fullName: `Opening Test ${code}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1990-05-01',
          gender: 'female',
          religion: 'islam',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${seq++}`.slice(-10) },
          joinedOn: '2024-01-01',
          job: {
            legalEntityId: company('MGT'),
            locationId: ref(org.locations, 'GZP'),
            orgUnitId: ref(org.orgUnits, 'MGT-L1'),
            designationId: ref(org.designations, 'SO'),
            gradeId: ref(org.grades, 'W5'),
            employmentType: 'permanent',
            workerCategory: 'worker',
            ...(managerId ? { managerId } : {}),
          },
          portalAccess: { email, role, password: testEnv().password },
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    return { id: employee.id, userId: employee.portalUser!.id, token: await signIn(email) };
  }

  /** A login with a role and no employee record, e.g. an HR officer. */
  async function login(role: string) {
    const email = `opening-${role}-${unique().toLowerCase()}@example.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({ name: `Opening ${role}`, email, role, password: testEnv().password })
        .expect(201)
    ).body as WorkspaceUserCreated;
    return { id: user.id, token: await signIn(email) };
  }

  const limit = (userId: string, codes: ('MGT' | 'MGF')[]) =>
    api(app)
      .put(`/tenant/users/${userId}/scopes`)
      .set(bearer(admin))
      .send({ legalEntityIds: codes.map(company) })
      .expect(200);

  const draftBody = (fields: Record<string, unknown> = {}) => ({
    legalEntityId: company('MGT'),
    locationId: ref(org.locations, 'GZP'),
    orgUnitId: ref(org.orgUnits, 'MGT-L1'),
    designationId: ref(org.designations, 'SO'),
    gradeId: ref(org.grades, 'W5'),
    title: `Sewing operators ${unique()}`,
    employmentType: 'probationer',
    headcount: 3,
    budgetMin: '12500',
    budgetMax: '14000',
    justification: 'The winter order adds a shift.',
    ...fields,
  });

  const create = (token: string, fields: Record<string, unknown> = {}) =>
    api(app).post(BASE).set(bearer(token)).send(draftBody(fields));
  const created = async (token: string, fields: Record<string, unknown> = {}) =>
    (await create(token, fields).expect(201)).body as OpeningDetail;
  const detail = async (token: string, id: string) =>
    (await api(app).get(`${BASE}/${id}`).set(bearer(token)).expect(200)).body as OpeningDetail;
  const list = async (token: string, query = '') =>
    (await api(app).get(`${BASE}${query}`).set(bearer(token)).expect(200))
      .body as OpeningListItem[];
  const act = (token: string, id: string, action: string) =>
    api(app).post(`${BASE}/${id}/${action}`).set(bearer(token));
  const post = (token: string, id: string, body: Record<string, unknown>) =>
    api(app).put(`${BASE}/${id}/post`).set(bearer(token)).send(body);
  const inbox = async (token: string) =>
    (await api(app).get('/tenant/approvals').set(bearer(token)).expect(200)).body as ApprovalItem[];
  const itemFor = async (token: string, id: string) =>
    (await inbox(token)).find(
      (i): i is JobOpeningApprovalItem => i.subjectType === 'job_opening' && i.opening.id === id,
    );
  const decide = (token: string, stepId: string, outcome: 'approve' | 'reject', comment?: string) =>
    api(app)
      .post(`/tenant/approvals/${stepId}/${outcome}`)
      .set(bearer(token))
      .send(comment ? { comment } : {});

  /** An opening straight into the database, at any status. */
  async function opening(fields: Partial<typeof jobOpenings.$inferInsert> = {}) {
    const [row] = await asTenant((tx) =>
      tx
        .insert(jobOpenings)
        .values({
          tenantId,
          legalEntityId: company('MGT'),
          locationId: ref(org.locations, 'GZP'),
          title: `Quality inspector ${unique()}`,
          employmentType: 'permanent',
          status: 'approved',
          scorecardCriteria: [...DEFAULT_SCORECARD_CRITERIA],
          ...fields,
        })
        .returning(),
    );
    return row!;
  }

  /** Applications at these stages, each from a new candidate. */
  async function applicants(openingId: string, stages: ApplicationStage[]) {
    await asTenant(async (tx) => {
      for (const stage of stages) {
        const [candidate] = await tx
          .insert(candidates)
          .values({ tenantId, fullName: `Applicant ${unique()}`, source: 'walk_in' })
          .returning({ id: candidates.id });
        await tx
          .insert(applications)
          .values({ tenantId, openingId, candidateId: candidate!.id, stage, source: 'walk_in' });
      }
    });
  }

  it('is drafted by HR, and by a line manager for their own team; others are refused', async () => {
    const hr = await login('hr_officer');
    const lead = await person();
    const report = await person(lead.id);

    const byHr = await created(hr.token, { hiringManagerEmployeeId: lead.id });
    expect(byHr).toMatchObject({
      status: 'draft',
      headcount: 3,
      reason: 'new_position',
      budgetMin: '12500.00',
      budgetMax: '14000.00',
      legalEntity: { id: company('MGT') },
      hiringManager: { id: lead.id },
      replaces: null,
      scorecardCriteria: [...DEFAULT_SCORECARD_CRITERIA],
      createdBy: { id: hr.id },
      steps: [],
      applications: 0,
      actions: ['edit', 'submit', 'cancel'],
    });

    // The line manager is the hiring manager of what they draft, and names nobody else.
    const byLead = await created(lead.token, { headcount: 1 });
    expect(byLead).toMatchObject({
      hiringManager: { id: lead.id },
      createdBy: { id: lead.userId },
    });
    expect(
      codeOf(await create(lead.token, { hiringManagerEmployeeId: report.id }).expect(403)),
    ).toBe('hiring_manager_self');
    const changed = await api(app)
      .patch(`${BASE}/${byLead.id}`)
      .set(bearer(lead.token))
      .send({ headcount: 2, budgetMax: '15000' })
      .expect(200);
    expect(changed.body).toMatchObject({ headcount: 2, budgetMax: '15000.00' });
    expect(
      codeOf(
        await api(app)
          .patch(`${BASE}/${byLead.id}`)
          .set(bearer(lead.token))
          .send({ hiringManagerEmployeeId: report.id })
          .expect(403),
      ),
    ).toBe('hiring_manager_self');

    // Someone with no direct reports drafts nothing and sees neither.
    expect(codeOf(await create(report.token).expect(403))).toBe('role_not_allowed');
    await api(app).get(`${BASE}/${byLead.id}`).set(bearer(report.token)).expect(404);
    expect(await list(report.token)).toEqual([]);

    // The line manager sees what they drafted or hire for; HR sees both.
    const theirs = (await list(lead.token)).map((o) => o.id);
    expect(theirs).toEqual(expect.arrayContaining([byHr.id, byLead.id]));
    expect((await list(hr.token)).map((o) => o.id)).toEqual(
      expect.arrayContaining([byHr.id, byLead.id]),
    );
    // A line manager may not post, even their own.
    await post(lead.token, byLead.id, { postTitleEn: 'x', closesOn: today }).expect(403);

    // Checked as a whole.
    await create(hr.token, { reason: 'replacement' }).expect(400);
    await create(hr.token, { budgetMin: '20000', budgetMax: '15000' }).expect(400);
    const noLogin = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: `OP-${unique()}`,
          fullName: 'No Login',
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1990-05-01',
          gender: 'male',
          religion: 'islam',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${seq++}`.slice(-10) },
          joinedOn: '2024-01-01',
          job: {
            legalEntityId: company('MGT'),
            locationId: ref(org.locations, 'GZP'),
            orgUnitId: ref(org.orgUnits, 'MGT-L1'),
            designationId: ref(org.designations, 'SO'),
            gradeId: ref(org.grades, 'W5'),
            employmentType: 'permanent',
            workerCategory: 'worker',
          },
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    expect(
      codeOf(await create(hr.token, { hiringManagerEmployeeId: noLogin.id }).expect(400)),
    ).toBe('hiring_manager_invalid');
    expect(
      codeOf(await create(hr.token, { locationId: ref(org.locations, 'NRJ') }).expect(400)),
    ).toBe('invalid_reference');
    const replacing = await created(hr.token, {
      reason: 'replacement',
      replacesEmployeeId: noLogin.id,
    });
    expect(replacing.replaces).toMatchObject({ id: noLogin.id, fullName: 'No Login' });
  });

  it("keeps a login limited to some companies to their openings, and outside them it's not found", async () => {
    const foods = await login('hr_officer');
    await limit(foods.id, ['MGF']);
    const hr = await login('hr_officer');
    const textiles = await created(hr.token);

    expect((await list(foods.token)).map((o) => o.id)).not.toContain(textiles.id);
    await api(app).get(`${BASE}/${textiles.id}`).set(bearer(foods.token)).expect(404);
    await act(foods.token, textiles.id, 'cancel').expect(404);
    expect(codeOf(await create(foods.token).expect(403))).toBe('outside_scope');

    const mine = await created(foods.token, {
      legalEntityId: company('MGF'),
      locationId: ref(org.locations, 'NRJ'),
      orgUnitId: ref(org.orgUnits, 'MGF-PROD'),
    });
    expect((await list(foods.token)).map((o) => o.id)).toContain(mine.id);
    expect(
      (await list(hr.token, `?legalEntityId=${company('MGF')}`)).every(
        (o) => o.legalEntity.id === company('MGF'),
      ),
    ).toBe(true);
  });

  it("is approved by the hiring manager's line manager and then HR; rejected, changed and submitted again", async () => {
    const maker = await login('hr_officer');
    const checker = await login('hr_officer');
    const boss = await person();
    const hiring = await person(boss.id);
    const draft = await created(maker.token, { hiringManagerEmployeeId: hiring.id });

    // Nothing is posted or published before approval.
    const postBody = {
      postTitleEn: 'Sewing Machine Operator',
      descriptionEn: 'Hiring.',
      closesOn: addDays(today, 10),
    };
    expect(codeOf(await post(maker.token, draft.id, postBody).expect(409))).toBe(
      'opening_not_approved',
    );
    expect(codeOf(await act(maker.token, draft.id, 'publish').expect(409))).toBe(
      'opening_not_approved',
    );

    const submitted = (await act(maker.token, draft.id, 'submit').expect(200))
      .body as OpeningDetail;
    expect(submitted.status).toBe('pending_approval');
    expect(submitted.steps.map((s) => [s.stepNo, s.kind, s.status])).toEqual([
      [1, 'manager', 'pending'],
      [2, 'hr', 'waiting'],
    ]);
    expect(submitted.steps[0]!.approver).toMatchObject({ id: boss.id });
    expect(codeOf(await act(maker.token, draft.id, 'submit').expect(409))).toBe(
      'opening_not_draft',
    );
    await api(app)
      .patch(`${BASE}/${draft.id}`)
      .set(bearer(maker.token))
      .send({ headcount: 1 })
      .expect(409);

    // The hiring manager does not decide their own; their line manager does.
    expect(await itemFor(hiring.token, draft.id)).toBeUndefined();
    const managerItem = await itemFor(boss.token, draft.id);
    expect(managerItem).toMatchObject({ kind: 'manager', opening: { title: draft.title } });
    // The line manager reads it while deciding, without actions.
    expect((await detail(boss.token, draft.id)).actions).toEqual([]);
    await decide(boss.token, managerItem!.stepId, 'approve').expect(201);

    // HR next, but never the HR login that drafted it.
    expect(await itemFor(maker.token, draft.id)).toBeUndefined();
    const hrItem = await itemFor(checker.token, draft.id);
    expect(hrItem?.kind).toBe('hr');
    expect(codeOf(await decide(maker.token, hrItem!.stepId, 'approve').expect(403))).toBe(
      'own_change',
    );
    await decide(checker.token, hrItem!.stepId, 'reject', 'Budget is too high').expect(201);
    const rejected = await detail(maker.token, draft.id);
    expect(rejected.status).toBe('rejected');
    expect(rejected.actions).toEqual(['edit', 'submit', 'cancel']);
    expect(rejected.steps.at(-1)).toMatchObject({
      status: 'rejected',
      comment: 'Budget is too high',
    });

    // Changed and submitted again: a new round, the old one kept below it.
    await api(app)
      .patch(`${BASE}/${draft.id}`)
      .set(bearer(maker.token))
      .send({ budgetMax: '13500' })
      .expect(200);
    const again = (await act(maker.token, draft.id, 'submit').expect(200)).body as OpeningDetail;
    expect(again.steps.map((s) => [s.kind, s.status])).toEqual([
      ['manager', 'approved'],
      ['hr', 'rejected'],
      ['manager', 'pending'],
      ['hr', 'waiting'],
    ]);
    expect(again.steps.slice(2).map((s) => s.stepNo)).toEqual([1, 2]);
    await decide(boss.token, (await itemFor(boss.token, draft.id))!.stepId, 'approve').expect(201);
    const approved = (
      await decide(
        checker.token,
        (await itemFor(checker.token, draft.id))!.stepId,
        'approve',
      ).expect(201)
    ).body as OpeningView;
    expect(approved).toMatchObject({ id: draft.id, status: 'approved', budgetMax: '13500.00' });
    expect((await detail(maker.token, draft.id)).actions).toEqual(['post', 'publish', 'cancel']);
    expect(
      codeOf(
        await api(app)
          .patch(`${BASE}/${draft.id}`)
          .set(bearer(maker.token))
          .send({ headcount: 1 })
          .expect(409),
      ),
    ).toBe('opening_not_draft');
  });

  it("sends a line manager's own opening to their line manager, then HR", async () => {
    const boss = await person();
    const lead = await person(boss.id);
    await person(lead.id);
    const hr = await login('hr_officer');
    const draft = await created(lead.token);
    const submitted = (await act(lead.token, draft.id, 'submit').expect(200)).body as OpeningDetail;
    expect(submitted.steps.map((s) => [s.kind, s.status, s.approver?.id ?? null])).toEqual([
      ['manager', 'pending', boss.id],
      ['hr', 'waiting', null],
    ]);
    // Their own request: never in their inbox, and refused when tried.
    expect(await itemFor(lead.token, draft.id)).toBeUndefined();
    const step = await itemFor(boss.token, draft.id);
    await decide(lead.token, step!.stepId, 'approve').expect(403);
    await decide(boss.token, step!.stepId, 'approve').expect(201);
    await decide(hr.token, (await itemFor(hr.token, draft.id))!.stepId, 'approve').expect(201);
    // Approved, the post is HR's.
    expect(await detail(lead.token, draft.id)).toMatchObject({ status: 'approved', actions: [] });
  });

  it('lets HR draft for their own report: their draft stands for the line manager, HR decides', async () => {
    const hrLead = await person(undefined, 'hr_officer');
    const hiring = await person(hrLead.id);
    const other = await login('hr_officer');
    const draft = await created(hrLead.token, { hiringManagerEmployeeId: hiring.id });
    const submitted = (await act(hrLead.token, draft.id, 'submit').expect(200))
      .body as OpeningDetail;
    expect(submitted.steps.map((s) => [s.kind, s.status])).toEqual([
      ['manager', 'skipped'],
      ['hr', 'pending'],
    ]);
    expect(await itemFor(hrLead.token, draft.id)).toBeUndefined();
    await decide(other.token, (await itemFor(other.token, draft.id))!.stepId, 'approve').expect(
      201,
    );
    expect((await detail(hrLead.token, draft.id)).status).toBe('approved');
  });

  it('posts an approved opening, publishes, closes, reopens and cancels it, for HR only', async () => {
    const hr = await login('hr_officer');
    const lead = await person();
    const row = await opening({ hiringManagerEmployeeId: lead.id });

    expect(codeOf(await act(hr.token, row.id, 'publish').expect(400))).toBe('post_incomplete');
    // A title without a description in either language is not a post.
    await post(hr.token, row.id, {
      postTitleEn: 'Inspector',
      postTitleBn: 'পরিদর্শক',
      closesOn: today,
    }).expect(400);
    expect(
      codeOf(
        await post(hr.token, row.id, {
          postTitleEn: 'Inspector',
          descriptionEn: 'Checks.',
          closesOn: addDays(today, -1),
        }).expect(400),
      ),
    ).toBe('closes_on_past');
    const posted = (
      await post(hr.token, row.id, {
        postTitleBn: 'মান পরিদর্শক',
        descriptionBn: '- সেলাই পরীক্ষা',
        showSalary: true,
        closesOn: addDays(today, 14),
      }).expect(200)
    ).body as OpeningDetail;
    expect(posted).toMatchObject({
      status: 'approved',
      postTitleBn: 'মান পরিদর্শক',
      postTitleEn: null,
      showSalary: true,
      closesOn: addDays(today, 14),
    });

    expect(codeOf(await act(lead.token, row.id, 'publish').expect(403))).toBe('role_not_allowed');
    const open = (await act(hr.token, row.id, 'publish').expect(200)).body as OpeningDetail;
    expect(open.status).toBe('open');
    expect(open.publishedAt).not.toBeNull();
    expect(open.actions).toEqual(['post', 'close', 'cancel']);
    expect(codeOf(await act(hr.token, row.id, 'publish').expect(409))).toBe('opening_published');
    expect(codeOf(await act(hr.token, row.id, 'reopen').expect(409))).toBe('opening_not_closed');

    const closed = (await act(hr.token, row.id, 'close').expect(200)).body as OpeningDetail;
    expect(closed).toMatchObject({ status: 'closed', actions: ['post', 'reopen', 'cancel'] });
    expect(closed.closedAt).not.toBeNull();
    const reopened = (await act(hr.token, row.id, 'reopen').expect(200)).body as OpeningDetail;
    expect(reopened).toMatchObject({ status: 'open', closedAt: null });

    // Past its closing date it reopens only once the date moves.
    await asTenant((tx) =>
      tx
        .update(jobOpenings)
        .set({ status: 'closed', closesOn: addDays(today, -2) })
        .where(eq(jobOpenings.id, row.id)),
    );
    expect(codeOf(await act(hr.token, row.id, 'reopen').expect(409))).toBe('closes_on_past');
    await post(hr.token, row.id, {
      postTitleBn: 'মান পরিদর্শক',
      descriptionBn: '- সেলাই পরীক্ষা',
      closesOn: addDays(today, 7),
    }).expect(200);
    await act(hr.token, row.id, 'reopen').expect(200);

    const cancelled = (await act(hr.token, row.id, 'cancel').expect(200)).body as OpeningDetail;
    expect(cancelled).toMatchObject({ status: 'cancelled', actions: [] });
    expect(codeOf(await act(hr.token, row.id, 'cancel').expect(409))).toBe('opening_finished');
    expect(
      codeOf(
        await post(hr.token, row.id, {
          postTitleEn: 'x',
          descriptionEn: 'y',
          closesOn: today,
        }).expect(409),
      ),
    ).toBe('opening_finished');

    // Not once someone was hired into it.
    const hiredInto = await opening({ status: 'open', closesOn: addDays(today, 5) });
    await applicants(hiredInto.id, ['hired']);
    expect(codeOf(await act(hr.token, hiredInto.id, 'cancel').expect(409))).toBe(
      'opening_has_hire',
    );
  });

  it('withdraws a pending opening with its approval', async () => {
    const boss = await person();
    const lead = await person(boss.id);
    await person(lead.id);
    const draft = await created(lead.token);
    await act(lead.token, draft.id, 'submit').expect(200);
    expect(await itemFor(boss.token, draft.id)).toBeDefined();
    const withdrawn = (await act(lead.token, draft.id, 'cancel').expect(200)).body as OpeningDetail;
    expect(withdrawn.status).toBe('cancelled');
    expect(withdrawn.steps.map((s) => s.status)).toEqual(['cancelled', 'cancelled']);
    expect(await itemFor(boss.token, draft.id)).toBeUndefined();
  });

  it('closes open jobs past their closing date, every day', async () => {
    const past = await opening({
      status: 'open',
      closesOn: addDays(today, -1),
      publishedAt: new Date(),
    });
    const lastDay = await opening({ status: 'open', closesOn: today, publishedAt: new Date() });
    const jobs = app.get(OpeningJobs);
    const closed = await runInTenantContext(tenantId, () => jobs.closeTenant());
    expect(closed).toContain(past.id);
    expect(closed).not.toContain(lastDay.id);
    const [after] = await asTenant((tx) =>
      tx.select().from(jobOpenings).where(eq(jobOpenings.id, past.id)),
    );
    expect(after).toMatchObject({ status: 'closed' });
    expect(after!.closedAt).not.toBeNull();
    const [entry] = await asTenant((tx) =>
      tx.select().from(tenantAuditLog).where(eq(tenantAuditLog.entityId, past.id)),
    );
    expect(entry).toMatchObject({ action: 'opening.close', actorUserId: null });
    // Running again closes nothing new.
    expect(await runInTenantContext(tenantId, () => jobs.closeTenant())).not.toContain(past.id);
  });

  it('counts applications by stage in the list and on the opening, and filters by status', async () => {
    const hr = await login('hr_officer');
    const row = await opening({
      status: 'open',
      closesOn: addDays(today, 9),
      publishedAt: new Date(),
    });
    await applicants(row.id, ['applied', 'applied', 'screening', 'interview', 'rejected']);

    const item = (await list(hr.token, '?status=open')).find((o) => o.id === row.id);
    expect(item).toMatchObject({
      status: 'open',
      applications: 5,
      counts: {
        applied: 2,
        screening: 1,
        interview: 1,
        offer: 0,
        hired: 0,
        rejected: 1,
        withdrawn: 0,
      },
    });
    expect((await list(hr.token, '?status=draft')).map((o) => o.id)).not.toContain(row.id);
    expect((await detail(hr.token, row.id)).counts).toMatchObject({ applied: 2, rejected: 1 });
  });

  it('audits every change with who made it', async () => {
    const hr = await login('hr_officer');
    const lead = await person();
    const draft = await created(hr.token, { hiringManagerEmployeeId: lead.id });
    await api(app)
      .patch(`${BASE}/${draft.id}`)
      .set(bearer(hr.token))
      .send({ headcount: 4 })
      .expect(200);
    await act(hr.token, draft.id, 'cancel').expect(200);
    const entries = await asTenant((tx) =>
      tx
        .select()
        .from(tenantAuditLog)
        .where(
          and(eq(tenantAuditLog.entityType, 'job_opening'), eq(tenantAuditLog.entityId, draft.id)),
        )
        .orderBy(asc(tenantAuditLog.createdAt)),
    );
    expect(entries.map((e) => [e.action, e.actorUserId])).toEqual([
      ['opening.create', hr.id],
      ['opening.update', hr.id],
      ['opening.cancel', hr.id],
    ]);
    expect(entries[1]).toMatchObject({ before: { headcount: 3 }, after: { headcount: 4 } });
  });
});
