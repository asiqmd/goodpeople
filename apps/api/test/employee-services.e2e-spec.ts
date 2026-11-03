import {
  announcementReceipts,
  announcements,
  assetIssues,
  companyAssets,
  engagementSurveys,
  hrRequestMessages,
  hrRequests,
  jobAssignments,
  legalEntities,
  notifications,
  recognitions,
  surveyParticipants,
  tenantAuditLog,
  tenantUsers,
} from '@gp/db';
import {
  addDays,
  todayIn,
  type AnnouncementView,
  type AssetView,
  type HrRequestView,
  type SurveyView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { runInTenantContext } from '../src/common/request-context.js';
import { EmployeeServicesJobs } from '../src/modules/employee-services/employee-services-jobs.service.js';
import { recruitmentKit, inDays } from './applications-helpers.js';
import { api, bearer, bootApp, tenantLogin } from './test-env.js';
const engage = '/tenant/engagement',
  services = '/tenant/employee-services';
describe('engagement and private employee services', () => {
  let app: INestApplication, kit: Awaited<ReturnType<typeof recruitmentKit>>;
  beforeAll(async () => {
    app = await bootApp();
    kit = await recruitmentKit(app);
  });
  afterAll(async () => {
    await kit.close();
    await app.close();
  });
  const auth = (token = kit.admin) => bearer(token);
  const surveyInput = () => ({
    legalEntityId: kit.company('MGT'),
    title: `Pulse ${kit.unique()}`,
    titleBn: 'কর্মীদের মতামত',
    description: 'Your answers are anonymous.',
    descriptionBn: 'আপনার উত্তর বেনামি থাকবে।',
    closesAt: inDays(7),
    threshold: 5,
    questions: [{ text: 'I have what I need at work', textBn: 'কাজের প্রয়োজনীয় জিনিস পাই' }],
  });
  async function survey() {
    const input = surveyInput();
    return {
      input,
      row: (await api(app).post(`${engage}/surveys`).set(auth()).send(input).expect(201))
        .body as SurveyView,
    };
  }
  const noticeInput = () => ({
    legalEntityId: kit.company('MGT'),
    title: `Policy ${kit.unique()}`,
    titleBn: 'নীতিমালার নোটিশ',
    body: 'Please read this policy.',
    bodyBn: 'নীতিমালাটি পড়ুন।',
    requiresAcknowledgement: true,
    dueOn: addDays(todayIn(), 2),
    expiresOn: null,
  });
  async function notice() {
    const input = noticeInput();
    return {
      input,
      row: (await api(app).post(`${engage}/announcements`).set(auth()).send(input).expect(201))
        .body as AnnouncementView,
    };
  }
  const response = (id: string, token: string, enps = 10, score = 5) =>
    api(app)
      .post(`${engage}/surveys/${id}/respond`)
      .set(auth(token))
      .send({ enps, scores: [score] });
  async function request() {
    const person = await kit.person();
    const row = (
      await api(app)
        .post(`${services}/requests`)
        .set(auth(person.token))
        .send({
          category: 'letters',
          priority: 'normal',
          subject: 'Private bank letter',
          body: 'Private salary confirmation requested.',
        })
        .expect(201)
    ).body as HrRequestView;
    return { person, row };
  }
  async function asset() {
    const input = {
      legalEntityId: kit.company('MGT'),
      tag: `AS-${kit.unique().toUpperCase()}`,
      name: 'Work laptop',
      nameBn: 'কাজের ল্যাপটপ',
      kind: 'laptop',
      serialNumber: 'TEST-SERIAL',
    };
    return {
      input,
      row: (await api(app).post(`${services}/assets`).set(auth()).send(input).expect(201))
        .body as AssetView,
    };
  }

  it('freezes survey cohorts and wording, stores aggregates only and suppresses until closing and five responses', async () => {
    const people = [];
    for (let i = 0; i < 5; i++) people.push(await kit.person());
    const f = await survey();
    await api(app)
      .patch(`${engage}/surveys/${f.row.id}`)
      .set(auth())
      .send({ ...f.input, title: 'Edited draft pulse' })
      .expect(200);
    await api(app).get(`${engage}/surveys/${f.row.id}`).set(auth(people[0]!.token)).expect(404);
    await api(app).post(`${engage}/surveys/${f.row.id}/publish`).set(auth()).send({}).expect(200);
    const later = await kit.person();
    await response(f.row.id, later.token).expect(404);
    await api(app).patch(`${engage}/surveys/${f.row.id}`).set(auth()).send(f.input).expect(409);
    for (let i = 0; i < people.length; i++)
      await response(f.row.id, people[i]!.token, [0, 6, 7, 9, 10][i], i + 1).expect(200);
    const live = (await api(app).get(`${engage}/surveys/${f.row.id}`).set(auth()).expect(200)).body;
    expect(live.results).toEqual({ suppressed: true, minimum: 5 });
    expect(live).not.toHaveProperty('totals');
    const closed = (
      await api(app)
        .post(`${engage}/surveys/${f.row.id}/close`)
        .set(auth())
        .send({ reason: 'Response period complete' })
        .expect(200)
    ).body as SurveyView;
    expect(closed.results).toMatchObject({
      suppressed: false,
      responses: 5,
      enps: 0,
      promoters: 2,
      passives: 1,
      detractors: 2,
      questions: [{ mean: 3, distribution: [1, 1, 1, 1, 1] }],
    });
    const own = (
      await api(app)
        .get(`${engage}/surveys/${f.row.id}?department=small`)
        .set(auth(people[0]!.token))
        .expect(200)
    ).body;
    expect(own).toMatchObject({ submitted: true, results: null, manage: false });
    const markers = await kit.inTenant((tx) =>
      tx.select().from(surveyParticipants).where(eq(surveyParticipants.surveyId, f.row.id)),
    );
    expect(markers.filter((p) => p.submitted)).toHaveLength(5);
    expect(Object.keys(markers[0]!)).toEqual(
      expect.arrayContaining(['id', 'tenantId', 'surveyId', 'employeeId', 'submitted']),
    );
    expect(Object.keys(markers[0]!)).toHaveLength(5);
  });
  it('serializes duplicate and concurrent anonymous responses without lost counts', async () => {
    const a = await kit.person(),
      b = await kit.person(),
      f = await survey();
    await api(app).post(`${engage}/surveys/${f.row.id}/publish`).set(auth()).send({}).expect(200);
    const results = await Promise.all([
      response(f.row.id, a.token),
      response(f.row.id, a.token),
      response(f.row.id, b.token),
    ]);
    expect(results.map((r) => r.status).toSorted()).toEqual([200, 200, 409]);
    const [stored] = await kit.inTenant((tx) =>
      tx.select().from(engagementSurveys).where(eq(engagementSurveys.id, f.row.id)),
    );
    expect(stored!.totals.enps.reduce((n, v) => n + v, 0)).toBe(2);
    const closed = (
      await api(app)
        .post(`${engage}/surveys/${f.row.id}/close`)
        .set(auth())
        .send({ reason: 'Close small response cohort' })
        .expect(200)
    ).body;
    expect(closed.results).toEqual({ suppressed: true, minimum: 5 });
    await response(f.row.id, b.token).expect(409);
  });
  it('refuses small cohorts, invalid/proxy responses, expired survey responses and unauthorized reports', async () => {
    const [empty] = await kit.inTenant((tx) =>
      tx
        .insert(legalEntities)
        .values({
          tenantId: kit.tenantId,
          name: 'Small cohort company',
          code: `SC-${kit.unique()}`,
        })
        .returning(),
    );
    const small = (
      await api(app)
        .post(`${engage}/surveys`)
        .set(auth())
        .send({ ...surveyInput(), legalEntityId: empty!.id })
        .expect(201)
    ).body;
    await api(app).post(`${engage}/surveys/${small.id}/publish`).set(auth()).send({}).expect(400);
    await api(app)
      .post(`${engage}/surveys`)
      .set(auth())
      .send({ ...surveyInput(), threshold: 4 })
      .expect(400);
    const p = await kit.person(),
      other = await kit.person('MGF'),
      scoped = await kit.staff('hr_officer', ['MGF']),
      f = await survey();
    await api(app).post(`${engage}/surveys/${f.row.id}/publish`).set(auth()).send({}).expect(200);
    await api(app)
      .post(`${engage}/surveys/${f.row.id}/respond`)
      .set(auth(p.token))
      .send({ enps: 10, scores: [5], employeeId: other.employee.id })
      .expect(400);
    await api(app)
      .post(`${engage}/surveys/${f.row.id}/respond`)
      .set(auth(p.token))
      .send({ enps: 10, scores: [] })
      .expect(400);
    await api(app).get(`${engage}/surveys/${f.row.id}`).set(auth(other.token)).expect(404);
    await api(app).get(`${engage}/surveys/${f.row.id}`).set(auth(scoped.token)).expect(404);
    await kit.inTenant((tx) =>
      tx
        .update(engagementSurveys)
        .set({ closesAt: new Date(Date.now() - 1000) })
        .where(eq(engagementSurveys.id, f.row.id)),
    );
    await response(f.row.id, p.token).expect(409);
    expect(
      (await api(app).get(`${engage}/surveys/${f.row.id}`).set(auth()).expect(200)).body.status,
    ).toBe('closed');
  });
  it('publishes fixed policy wording, freezes recipients and records only a person’s own acknowledgement once', async () => {
    const p = await kit.person(),
      f = await notice();
    await api(app)
      .patch(`${engage}/announcements/${f.row.id}`)
      .set(auth())
      .send({ ...f.input, title: 'Edited draft policy' })
      .expect(200);
    await api(app)
      .post(`${engage}/announcements/${f.row.id}/publish`)
      .set(auth())
      .send({})
      .expect(200);
    await api(app)
      .patch(`${engage}/announcements/${f.row.id}`)
      .set(auth())
      .send(f.input)
      .expect(409);
    const later = await kit.person();
    await api(app).get(`${engage}/announcements/${f.row.id}`).set(auth(later.token)).expect(404);
    const replies = await Promise.all(
      [0, 1].map(() =>
        api(app)
          .post(`${engage}/announcements/${f.row.id}/acknowledge`)
          .set(auth(p.token))
          .send({})
          .expect(200),
      ),
    );
    expect(replies[0]!.body.acknowledgedAt).toBe(replies[1]!.body.acknowledgedAt);
    expect(replies[0]!.body.receipts).toBeNull();
    const report = (
      await api(app).get(`${engage}/announcements/${f.row.id}`).set(auth()).expect(200)
    ).body as AnnouncementView;
    expect(
      report.receipts!.find((r) => r.employee.id === p.employee.id)!.acknowledgedAt,
    ).not.toBeNull();
    await api(app)
      .post(`${engage}/announcements/${f.row.id}/retire`)
      .set(auth())
      .send({ reason: 'Replaced with corrected wording' })
      .expect(200);
    await api(app)
      .post(`${engage}/announcements/${f.row.id}/acknowledge`)
      .set(auth(later.token))
      .send({})
      .expect(404);
  });
  it('offers general news to new joiners, but refuses expired policy acknowledgement and cross-company reads', async () => {
    const f = await notice();
    await api(app)
      .post(`${engage}/announcements/${f.row.id}/publish`)
      .set(auth())
      .send({})
      .expect(200);
    const p = await kit.person();
    const news = (
      await api(app)
        .post(`${engage}/announcements`)
        .set(auth())
        .send({ ...noticeInput(), requiresAcknowledgement: false, dueOn: null })
        .expect(201)
    ).body;
    await api(app)
      .post(`${engage}/announcements/${news.id}/publish`)
      .set(auth())
      .send({})
      .expect(200);
    const joiner = await kit.person(),
      other = await kit.person('MGF');
    await api(app).get(`${engage}/announcements/${news.id}`).set(auth(joiner.token)).expect(200);
    await api(app).get(`${engage}/announcements/${news.id}`).set(auth(other.token)).expect(404);
    const policy = await notice();
    await api(app)
      .post(`${engage}/announcements/${policy.row.id}/publish`)
      .set(auth())
      .send({})
      .expect(200);
    await kit.inTenant((tx) =>
      tx
        .update(announcements)
        .set({ expiresOn: addDays(todayIn(), -1) })
        .where(eq(announcements.id, policy.row.id)),
    );
    await api(app)
      .post(`${engage}/announcements/${policy.row.id}/acknowledge`)
      .set(auth(p.token))
      .send({})
      .expect(409);
  });
  it('keeps recognition in-company, forbids self-recognition and retains moderated posts outside the feed', async () => {
    const p = await kit.person(),
      colleague = await kit.person(),
      other = await kit.person('MGF');
    const post = (code: string) =>
      api(app).post(`${engage}/recognition`).set(auth(p.token)).send({
        employeeCode: code,
        value: 'teamwork',
        message: 'Thank you for helping the team.',
      });
    await post(p.employee.employeeCode).expect(400);
    await post(other.employee.employeeCode).expect(404);
    const row = (await post(colleague.employee.employeeCode).expect(201)).body;
    expect(
      (
        await api(app).get(`${engage}/recognition`).set(auth(colleague.token)).expect(200)
      ).body.some((r: { id: string }) => r.id === row.id),
    ).toBe(true);
    await api(app)
      .post(`${engage}/recognition/${row.id}/hide`)
      .set(auth(other.token))
      .send({ reason: 'Not my company' })
      .expect(404);
    const scoped = await kit.staff('hr_officer', ['MGF']);
    await api(app)
      .post(`${engage}/recognition/${row.id}/hide`)
      .set(auth(scoped.token))
      .send({ reason: 'Outside my scope' })
      .expect(404);
    await api(app)
      .post(`${engage}/recognition/${row.id}/hide`)
      .set(auth())
      .send({ reason: 'Moderated after review' })
      .expect(204);
    expect(
      (await api(app).get(`${engage}/recognition`).set(auth(p.token)).expect(200)).body.some(
        (r: { id: string }) => r.id === row.id,
      ),
    ).toBe(false);
    const [stored] = await kit.inTenant((tx) =>
      tx.select().from(recognitions).where(eq(recognitions.id, row.id)),
    );
    expect(stored!.hiddenAt).not.toBeNull();
    expect(stored!.message).toContain('Thank you');
  });
  it('encrypts HR requests and keeps their existence and internal notes from colleagues, managers and other companies', async () => {
    const f = await request(),
      stranger = await kit.person(),
      scoped = await kit.staff('hr_officer', ['MGF']);
    await api(app).get(`${services}/requests/${f.row.id}`).set(auth(stranger.token)).expect(404);
    await api(app).get(`${services}/requests/${f.row.id}`).set(auth(scoped.token)).expect(404);
    await api(app).get(`${services}/requests?scope=all`).set(auth(stranger.token)).expect(403);
    const [stored] = await kit.inTenant((tx) =>
      tx.select().from(hrRequests).where(eq(hrRequests.id, f.row.id)),
    );
    expect(stored!.contentEnc).not.toContain('Private');
    const before = await kit.inTenant((tx) => tx.select().from(notifications));
    const hr = (
      await api(app)
        .post(`${services}/requests/${f.row.id}/replies`)
        .set(auth())
        .send({ body: 'Internal confidential note', internal: true })
        .expect(200)
    ).body;
    expect(hr.messages.at(-1).internal).toBe(true);
    const own = (
      await api(app).get(`${services}/requests/${f.row.id}`).set(auth(f.person.token)).expect(200)
    ).body;
    expect(own.messages).toHaveLength(1);
    expect(own.updatedAt).toBe(f.row.updatedAt);
    expect(JSON.stringify(own)).not.toContain('confidential');
    expect(await kit.inTenant((tx) => tx.select().from(notifications))).toHaveLength(before.length);
    const messages = await kit.inTenant((tx) =>
      tx.select().from(hrRequestMessages).where(eq(hrRequestMessages.requestId, f.row.id)),
    );
    expect(messages[0]!.bodyEnc).not.toContain('confidential');
    await api(app)
      .post(`${services}/requests/${f.row.id}/replies`)
      .set(auth(f.person.token))
      .send({ body: 'Not a staff note', internal: true })
      .expect(403);
  });
  it('assigns only scoped active HR handlers and supports public replies, resolution, own closure and reopening', async () => {
    const f = await request(),
      handler = await kit.staff('hr_officer', ['MGT']),
      other = await kit.staff('hr_officer', ['MGF']);
    const update = (body: object, token = kit.admin) =>
      api(app).patch(`${services}/requests/${f.row.id}`).set(auth(token)).send(body);
    await update({ assigneeId: other.user.id, reason: 'Wrong-company handler' }).expect(400);
    await update({
      assigneeId: handler.user.id,
      status: 'in_progress',
      reason: 'We are preparing your letter.',
    }).expect(200);
    await api(app)
      .post(`${services}/requests/${f.row.id}/replies`)
      .set(auth(handler.token))
      .send({ body: 'The letter is ready for collection.' })
      .expect(200);
    await update(
      { status: 'resolved', reason: 'The requested letter is ready.' },
      f.person.token,
    ).expect(409);
    const resolved = await update(
      { status: 'resolved', reason: 'The requested letter is ready.' },
      handler.token,
    ).expect(200);
    expect(resolved.body.assignee.id).toBe(handler.user.id);
    await update(
      { status: 'closed', reason: 'Received the letter, thank you.' },
      f.person.token,
    ).expect(200);
    await api(app)
      .post(`${services}/requests/${f.row.id}/replies`)
      .set(auth(handler.token))
      .send({ body: 'Closed requests cannot be changed.' })
      .expect(409);
    await update(
      { status: 'open', reason: 'Please correct the issue date.' },
      f.person.token,
    ).expect(200);
    const rows = (
      await api(app).get(`${services}/requests?scope=all`).set(auth(handler.token)).expect(200)
    ).body;
    expect(rows.find((r: { id: string }) => r.id === f.row.id).status).toBe('open');
  });
  it('serializes asset issues, protects own history, records acknowledgements and prevents invalid returns and retirement', async () => {
    const p = await kit.person(),
      second = await kit.person(),
      f = await asset();
    const issue = (code: string) =>
      api(app)
        .post(`${services}/assets/${f.row.id}/issue`)
        .set(auth())
        .send({
          employeeCode: code,
          issuedOn: todayIn(),
          dueOn: addDays(todayIn(), 3),
          condition: 'Good working condition',
        });
    const attempts = await Promise.all([
      issue(p.employee.employeeCode),
      issue(second.employee.employeeCode),
    ]);
    expect(attempts.map((r) => r.status).toSorted()).toEqual([200, 409]);
    const assigned = (attempts.find((r) => r.status === 200)!.body as AssetView).issues[0]!;
    const owner = assigned.employee.id === p.employee.id ? p : second,
      stranger = owner === p ? second : p;
    await api(app)
      .post(`${services}/issues/${assigned.id}/acknowledge`)
      .set(auth(stranger.token))
      .send({})
      .expect(404);
    await api(app).get(`${services}/assets/${f.row.id}`).set(auth(owner.token)).expect(403);
    await api(app)
      .post(`${services}/issues/${assigned.id}/acknowledge`)
      .set(auth(owner.token))
      .send({})
      .expect(200);
    await api(app)
      .post(`${services}/issues/${assigned.id}/acknowledge`)
      .set(auth(owner.token))
      .send({})
      .expect(200);
    await api(app)
      .post(`${services}/assets/${f.row.id}/retire`)
      .set(auth())
      .send({ reason: 'Not returned yet' })
      .expect(409);
    await api(app)
      .post(`${services}/issues/${assigned.id}/return`)
      .set(auth())
      .send({ returnedOn: addDays(todayIn(), -1), condition: 'Good condition' })
      .expect(400);
    await api(app)
      .post(`${services}/issues/${assigned.id}/return`)
      .set(auth())
      .send({ returnedOn: todayIn(), condition: 'Good condition' })
      .expect(200);
    await api(app)
      .post(`${services}/issues/${assigned.id}/return`)
      .set(auth())
      .send({ returnedOn: todayIn(), condition: 'Duplicate return' })
      .expect(409);
    await issue(stranger.employee.employeeCode).expect(200);
    expect(
      (await api(app).get(`${services}/issues/mine`).set(auth(owner.token)).expect(200)).body.some(
        (r: { id: string }) => r.id === assigned.id,
      ),
    ).toBe(true);
    const history = await kit.inTenant((tx) =>
      tx.select().from(assetIssues).where(eq(assetIssues.assetId, f.row.id)),
    );
    expect(history).toHaveLength(2);
  });
  it('refuses future issues and company mismatches, retains retirements, and enforces tenant and read-only boundaries', async () => {
    const f = await asset(),
      other = await kit.person('MGF'),
      scoped = await kit.staff('hr_officer', ['MGF']);
    await api(app)
      .post(`${services}/assets/${f.row.id}/issue`)
      .set(auth())
      .send({
        employeeCode: other.employee.employeeCode,
        issuedOn: todayIn(),
        condition: 'Good condition',
      })
      .expect(400);
    await api(app)
      .post(`${services}/assets/${f.row.id}/issue`)
      .set(auth())
      .send({
        employeeCode: other.employee.employeeCode,
        issuedOn: addDays(todayIn(), 1),
        condition: 'Good condition',
      })
      .expect(400);
    await api(app).get(`${services}/assets/${f.row.id}`).set(auth(scoped.token)).expect(404);
    await api(app)
      .post(`${services}/assets/${f.row.id}/retire`)
      .set(auth())
      .send({ reason: 'Broken before issue' })
      .expect(200);
    const [stored] = await kit.inTenant((tx) =>
      tx.select().from(companyAssets).where(eq(companyAssets.id, f.row.id)),
    );
    expect(stored!.retiredAt).not.toBeNull();
    const foreign = (await tenantLogin(app, 'sponsored-ngo')).accessToken;
    await api(app).get(`${services}/assets/${f.row.id}`).set(auth(foreign)).expect(404);
    const readOnly = (await tenantLogin(app, 'acme-garments')).accessToken;
    await api(app).post(`${services}/assets`).set(auth(readOnly)).send(f.input).expect(403);
    await api(app).post(`${engage}/surveys`).set(auth(readOnly)).send(surveyInput()).expect(403);
  });
  it('keeps private requests with the original HR company after transfer and refuses managers and disabled handlers', async () => {
    const f = await request(),
      manager = await kit.person(),
      hr = await kit.staff('hr_officer', ['MGT']),
      other = await kit.staff('hr_officer', ['MGF']);
    await kit.inTenant((tx) =>
      tx
        .update(jobAssignments)
        .set({ managerId: manager.employee.id })
        .where(eq(jobAssignments.employeeId, f.person.employee.id)),
    );
    await api(app).get(`${services}/requests/${f.row.id}`).set(auth(manager.token)).expect(404);
    await kit.inTenant((tx) =>
      tx
        .update(jobAssignments)
        .set({ legalEntityId: kit.company('MGF'), locationId: null, orgUnitId: null })
        .where(eq(jobAssignments.employeeId, f.person.employee.id)),
    );
    await api(app).get(`${services}/requests/${f.row.id}`).set(auth(other.token)).expect(404);
    await api(app).get(`${services}/requests/${f.row.id}`).set(auth(hr.token)).expect(200);
    await api(app).get(`${services}/requests/${f.row.id}`).set(auth(f.person.token)).expect(200);
    await kit.inTenant((tx) =>
      tx.update(tenantUsers).set({ disabledAt: new Date() }).where(eq(tenantUsers.id, hr.user.id)),
    );
    await api(app)
      .patch(`${services}/requests/${f.row.id}`)
      .set(auth())
      .send({ assigneeId: hr.user.id, reason: 'Cannot assign a disabled handler' })
      .expect(400);
  });
  it('rejects historical asset overlaps, acknowledgement after return and issues of retired inventory', async () => {
    const p = await kit.person(),
      f = await asset();
    const issue = (on: string) =>
      api(app).post(`${services}/assets/${f.row.id}/issue`).set(auth()).send({
        employeeCode: p.employee.employeeCode,
        issuedOn: on,
        condition: 'Historical good condition',
      });
    const issued = (await issue(addDays(todayIn(), -10)).expect(200)).body as AssetView;
    const id = issued.issues[0]!.id;
    await api(app)
      .post(`${services}/issues/${id}/return`)
      .set(auth())
      .send({ returnedOn: addDays(todayIn(), -5), condition: 'Returned intact' })
      .expect(200);
    await issue(addDays(todayIn(), -6)).expect(400);
    await api(app)
      .post(`${services}/issues/${id}/acknowledge`)
      .set(auth(p.token))
      .send({})
      .expect(409);
    await api(app)
      .post(`${services}/assets/${f.row.id}/retire`)
      .set(auth())
      .send({ reason: 'No longer serviceable' })
      .expect(200);
    await issue(todayIn()).expect(409);
  });
  it('deduplicates reminders for the whole anonymous cohort, excludes acknowledged policies and makes no writes on reads', async () => {
    const p = await kit.person(),
      f = await survey(),
      n = await notice();
    await api(app).post(`${engage}/surveys/${f.row.id}/publish`).set(auth()).send({}).expect(200);
    await response(f.row.id, p.token).expect(200);
    await kit.inTenant((tx) =>
      tx
        .update(engagementSurveys)
        .set({ closesAt: new Date(Date.now() + 3600000) })
        .where(eq(engagementSurveys.id, f.row.id)),
    );
    await api(app)
      .post(`${engage}/announcements/${n.row.id}/publish`)
      .set(auth())
      .send({})
      .expect(200);
    await api(app)
      .post(`${engage}/announcements/${n.row.id}/acknowledge`)
      .set(auth(p.token))
      .send({})
      .expect(200);
    const jobs = app.get(EmployeeServicesJobs);
    const first = await runInTenantContext(kit.tenantId, () => jobs.remindTenant());
    const second = await runInTenantContext(kit.tenantId, () => jobs.remindTenant());
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
    const inbox = (await api(app).get('/tenant/notifications').set(auth(p.token)).expect(200)).body;
    expect(
      inbox.items.some(
        (item: { title: string }) => item.title === 'An anonymous survey closes soon',
      ),
    ).toBe(true);
    const before = await kit.inTenant((tx) => tx.select().from(tenantAuditLog));
    await api(app).get(`${engage}/me`).set(auth(p.token)).expect(200);
    await api(app).get(`${services}/me`).set(auth(p.token)).expect(200);
    expect(await kit.inTenant((tx) => tx.select().from(tenantAuditLog))).toHaveLength(
      before.length,
    );
    const receipts = await kit.inTenant((tx) =>
      tx
        .select()
        .from(announcementReceipts)
        .where(eq(announcementReceipts.announcementId, n.row.id)),
    );
    expect(receipts.find((r) => r.employeeId === p.employee.id)!.acknowledgedAt).not.toBeNull();
  });
});
