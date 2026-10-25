import {
  complianceAlerts,
  createDb,
  notifications,
  runAsTenant,
  tenants,
  type Database,
} from '@gp/db';
import {
  addDays,
  addMonths,
  todayIn,
  type CheckOffReport,
  type CommitteeView,
  type EmployeeDetail,
  type EstablishmentStatusView,
  type LegalEntityView,
  type LocationView,
  type RelationsStatusView,
  type TradeUnionView,
  type UnionBulkResult,
  type UnionListView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq, like } from 'drizzle-orm';
import { line, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp, testEnv } from './test-env.js';

const address = { line: 'Ashulia', district: 'Dhaka', division: 'dhaka' };

const requirement = (e: EstablishmentStatusView, kind: string) =>
  e.requirements.find((r) => r.kind === kind)!;

// Each test makes its own company (or union and pay group), so the tests pass in any order.
describe('committees and trade unions', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof payrollKit>>;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let tenantId: string;
  let nid = 0;
  const today = todayIn();

  beforeAll(async () => {
    app = await bootApp();
    kit = await payrollKit(app);
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    [{ id: tenantId }] = (await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, 'my-group'))) as [{ id: string }];
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const as = () => bearer(kit.admin);
  const get = async <T>(path: string) =>
    (await api(app).get(`/tenant/relations${path}`).set(as()).expect(200)).body as T;
  const post = (path: string, body: unknown = {}) =>
    api(app)
      .post(`/tenant/relations${path}`)
      .set(as())
      .send(body as object);
  const patch = (path: string, body: unknown) =>
    api(app)
      .patch(`/tenant/relations${path}`)
      .set(as())
      .send(body as object);
  const check = async () => (await post('/check').expect(200)).body;
  const alertsOf = (subjectId: string) =>
    runAsTenant(db, tenantId, (tx) =>
      tx.select().from(complianceAlerts).where(eq(complianceAlerts.subjectId, subjectId)),
    );
  const told = (key: string) =>
    runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(like(notifications.dedupeKey, `compliance.alert:${key}%`)),
    );
  const establishment = async (id: string) =>
    (await get<RelationsStatusView>('/status')).establishments.find(
      (e) => e.id === id,
    ) as EstablishmentStatusView;

  async function company() {
    return (
      await api(app)
        .post('/tenant/legal-entities')
        .set(as())
        .send({ name: `Relations Knit ${kit.unique()}` })
        .expect(201)
    ).body as LegalEntityView;
  }

  async function hire(
    legalEntityId: string,
    {
      gender = 'female',
      staff = false,
      locationId,
    }: { gender?: string; staff?: boolean; locationId?: string } = {},
  ) {
    const code = `RL-${kit.unique()}`;
    return (
      await api(app)
        .post('/tenant/employees')
        .set(as())
        .send({
          employeeCode: code,
          fullName: `Relations ${code}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1992-03-01',
          gender,
          religion: 'islam',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}`.slice(-10) + String(nid++ % 1000).padStart(3, '0') },
          joinedOn: '2024-01-01',
          job: {
            legalEntityId,
            ...(locationId ? { locationId } : {}),
            employmentType: 'permanent',
            workerCategory: staff ? 'staff' : 'worker',
          },
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
  }

  async function committee(body: Record<string, unknown>) {
    return (await post('/committees', { name: `Committee ${kit.unique()}`, ...body }).expect(201))
      .body as CommitteeView;
  }

  it('raises a missing complaint committee, and resolves it once the committee is formed', async () => {
    const entity = await company();
    const women = [
      await hire(entity.id),
      await hire(entity.id),
      await hire(entity.id, { staff: true }),
    ];
    const man = await hire(entity.id, { gender: 'male', staff: true });

    // Two workers and two staff: a complaint committee for all four (s.332A), no
    // participation or safety committee below 50 workers.
    let status = await establishment(entity.id);
    expect(status).toMatchObject({ workers: 2, employees: 4, location: null });
    expect(requirement(status, 'participation')).toMatchObject({
      required: false,
      workforce: 2,
      minWorkers: 50,
      checks: [],
    });
    const missing = requirement(status, 'complaint');
    expect(missing).toMatchObject({ required: true, workforce: 4, committee: null, ok: false });
    expect(missing.rule!.reference.section).toBe('332A');
    expect(missing.checks.map((c) => [c.code, c.result])).toEqual([['formed', 'fail']]);

    await check();
    const [raised] = await alertsOf(entity.id);
    expect(raised).toMatchObject({
      kind: 'committee_missing',
      status: 'open',
      periodStart: today,
      employeeId: null,
      value: 1,
    });
    expect((raised!.detail as { missing: { kind: string }[] }).missing).toEqual([
      expect.objectContaining({ kind: 'complaint', workforce: 4 }),
    ]);
    const key = `committee_missing:${entity.id}:${today}`;
    const sent = (await told(key)).length;
    expect(sent).toBeGreaterThan(0);
    // Checking again changes nothing and tells nobody twice.
    await check();
    expect(await alertsOf(entity.id)).toHaveLength(1);
    expect(await told(key)).toHaveLength(sent);

    // Five members, a woman chairing and women the majority; one from an NGO outside.
    const formed = await committee({
      kind: 'complaint',
      legalEntityId: entity.id,
      formedOn: addDays(today, -10),
    });
    expect(formed.endsOn).toBeNull();
    const add = (body: Record<string, unknown>) =>
      post(`/committees/${formed.id}/members`, {
        side: 'employer',
        selection: 'nominated',
        fromOn: formed.formedOn,
        ...body,
      }).expect(201);
    await add({ employeeCode: women[0]!.employeeCode, role: 'chair' });
    await add({ employeeId: women[1]!.id, side: 'worker', selection: 'elected' });
    await add({ employeeId: women[2]!.id });
    await add({ employeeId: man.id });
    await post(`/committees/${formed.id}/members`, {
      employeeId: man.id,
      side: 'employer',
      selection: 'nominated',
      fromOn: formed.formedOn,
    }).expect(409);
    const view = (await add({ name: 'Rehana Akter (Karmojibi Nari)' })).body as CommitteeView;
    expect(view.memberList).toHaveLength(5);
    expect(view.memberList.at(-1)).toMatchObject({ employee: null, gender: null, current: true });
    expect(view.checks.map((c) => [c.code, c.result])).toEqual([
      ['in_term', 'ok'],
      ['size', 'ok'],
      ['woman_chair', 'ok'],
      ['women_majority', 'ok'],
    ]);

    status = await establishment(entity.id);
    expect(requirement(status, 'complaint')).toMatchObject({
      ok: true,
      committee: { id: formed.id, members: 5 },
    });
    expect((await check()).resolved).toBeGreaterThanOrEqual(1);
    expect(await alertsOf(entity.id)).toEqual([
      expect.objectContaining({ kind: 'committee_missing', status: 'resolved' }),
    ]);

    // A member who leaves makes the committee too small again.
    const ended = (
      await post(`/committees/${formed.id}/members/${view.memberList[3]!.id}/end`, {
        toOn: addDays(today, -1),
      }).expect(200)
    ).body as CommitteeView;
    expect(ended.checks.find((c) => c.code === 'size')).toMatchObject({
      result: 'fail',
      value: 4,
      min: 5,
      max: 5,
    });
  });

  it('flags a participation committee whose meeting is overdue and whose minutes are late', async () => {
    const entity = await company();
    const formedOn = addMonths(today, -5);
    const formed = await committee({ kind: 'participation', legalEntityId: entity.id, formedOn });
    // Two years unless the committee's own end is given (s.205).
    expect(formed.endsOn).toBe(addDays(addMonths(formedOn, 24), -1));
    expect(formed.nextMeetingDue).toBe(addMonths(formedOn, 2));
    expect(formed.checks.find((c) => c.code === 'meetings')).toMatchObject({
      result: 'fail',
      date: addMonths(formedOn, 2),
    });

    await check();
    expect(await alertsOf(formed.id)).toEqual([
      expect.objectContaining({
        kind: 'committee_meeting_overdue',
        status: 'open',
        periodStart: addMonths(formedOn, 2),
      }),
    ]);
    expect(await told(`committee_meeting_overdue:${formed.id}`)).not.toHaveLength(0);

    // Meetings are recorded once held, and not before the committee existed.
    await post(`/committees/${formed.id}/meetings`, { heldOn: addDays(today, 1) })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('date_in_future'));
    await post(`/committees/${formed.id}/meetings`, { heldOn: addDays(formedOn, -1) })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('meeting_before_formed'));

    const heldOn = addDays(today, -10);
    const met = (
      await post(`/committees/${formed.id}/meetings`, {
        heldOn,
        agenda: 'Canteen, drinking water, the fire drill',
        attendees: 6,
        decisions: [{ text: 'Fix the fans in the canteen', dueOn: addDays(today, 20) }],
      }).expect(201)
    ).body as CommitteeView;
    const meeting = met.meetings[0]!;
    expect(meeting).toMatchObject({ heldOn, minutesDueOn: addDays(heldOn, 7), minutesLate: true });
    expect(meeting.decisions).toEqual([
      { text: 'Fix the fans in the canteen', dueOn: addDays(today, 20), done: false },
    ]);
    expect(met.lastMeetingOn).toBe(heldOn);
    expect(met.nextMeetingDue).toBe(addMonths(heldOn, 2));

    await check();
    let alerts = await alertsOf(formed.id);
    expect(alerts.find((a) => a.kind === 'committee_meeting_overdue')!.status).toBe('resolved');
    expect(alerts.find((a) => a.kind === 'committee_minutes_late')).toMatchObject({
      status: 'open',
      periodStart: heldOn,
      value: 10,
      limit: 7,
    });

    // Sent late: the alert is done with, the record still shows they were late.
    const sent = (
      await patch(`/committees/${formed.id}/meetings/${meeting.id}`, {
        minutesSentOn: addDays(today, -1),
        minutes: 'Fans to be fixed by maintenance; water tested monthly.',
      }).expect(200)
    ).body as CommitteeView;
    expect(sent.meetings[0]).toMatchObject({
      minutesSentOn: addDays(today, -1),
      minutesLate: true,
    });
    expect(sent.checks.find((c) => c.code === 'minutes')).toMatchObject({
      result: 'fail',
      value: 1,
    });
    await check();
    alerts = await alertsOf(formed.id);
    expect(alerts.every((a) => a.status === 'resolved')).toBe(true);

    const done = (
      await patch(`/committees/${formed.id}/meetings/${meeting.id}/decisions/0`, {
        done: true,
      }).expect(200)
    ).body as CommitteeView;
    expect(done.meetings[0]!.decisions[0]!.done).toBe(true);
    await patch(`/committees/${formed.id}/meetings/${meeting.id}/decisions/3`, {
      done: true,
    }).expect(404);

    // The minutes are records: a committee that met cannot be deleted.
    await api(app)
      .delete(`/tenant/relations/committees/${formed.id}`)
      .set(as())
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('committee_has_meetings'));
  });

  it('says when a term has ended, until the committee is formed again', async () => {
    const entity = await company();
    const old = await committee({
      kind: 'safety',
      legalEntityId: entity.id,
      formedOn: addMonths(today, -36),
    });
    const endedOn = addDays(addMonths(today, -12), -1);
    expect(old).toMatchObject({ endsOn: endedOn, inTerm: false, nextMeetingDue: null });
    expect(old.checks.find((c) => c.code === 'in_term')).toMatchObject({
      result: 'fail',
      date: endedOn,
    });

    await check();
    expect(await alertsOf(old.id)).toEqual([
      expect.objectContaining({
        kind: 'committee_term_ended',
        status: 'open',
        periodStart: addDays(endedOn, 1),
      }),
    ]);

    const renewed = await committee({
      kind: 'safety',
      legalEntityId: entity.id,
      formedOn: addMonths(today, -1),
    });
    expect(renewed.inTerm).toBe(true);
    await check();
    expect((await alertsOf(old.id))[0]!.status).toBe('resolved');
    expect(await alertsOf(renewed.id)).toEqual([]);
    const status = await establishment(entity.id);
    expect(requirement(status, 'safety').committee!.id).toBe(renewed.id);

    // A committee without meetings can go; it is the law's term that matters, not ours.
    const changed = (
      await patch(`/committees/${renewed.id}`, { formedOn: addMonths(today, -2) }).expect(200)
    ).body as CommitteeView;
    expect(changed.endsOn).toBe(addDays(addMonths(addMonths(today, -2), 24), -1));
    await api(app).delete(`/tenant/relations/committees/${renewed.id}`).set(as()).expect(204);
    await check();
    expect((await alertsOf(old.id))[0]!.status).toBe('open');
  });

  it('treats a site with its own committee as an establishment of its own', async () => {
    const entity = await company();
    const site = (
      await api(app)
        .post('/tenant/locations')
        .set(as())
        .send({
          legalEntityId: entity.id,
          code: `S${kit.unique()}`,
          name: 'Unit 2',
          kind: 'factory',
        })
        .expect(201)
    ).body as LocationView;
    await hire(entity.id, { locationId: site.id });
    await hire(entity.id, { locationId: site.id, staff: true });
    await hire(entity.id);

    const other = await company();
    await post('/committees', {
      kind: 'complaint',
      legalEntityId: other.id,
      locationId: site.id,
      name: 'Wrong company',
      formedOn: today,
    })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('location_other_company'));

    await committee({
      kind: 'complaint',
      legalEntityId: entity.id,
      locationId: site.id,
      formedOn: today,
    });
    const status = (await get<RelationsStatusView>('/status')).establishments;
    const atSite = status.find((e) => e.id === site.id)!;
    expect(atSite).toMatchObject({ workers: 1, employees: 2, location: { id: site.id } });
    expect(requirement(atSite, 'complaint')).toMatchObject({ required: true, workforce: 2 });
    expect(requirement(atSite, 'participation')).toMatchObject({ coveredByCompany: true });
    // The company's row counts the person not at that site.
    const rest = status.find((e) => e.id === entity.id)!;
    expect(rest).toMatchObject({ workers: 2, employees: 3 });
    expect(requirement(rest, 'complaint')).toMatchObject({
      required: true,
      workforce: 1,
      committee: null,
    });
  });

  it('keeps unions: one bargaining agent per company, members and their consent', async () => {
    const entity = await company();
    const people = [await hire(entity.id), await hire(entity.id), await hire(entity.id)];
    const union = (body: Record<string, unknown>) =>
      post('/unions', { legalEntityId: entity.id, name: `Union ${kit.unique()}`, ...body });

    const cba = (
      await union({
        isCba: true,
        checkOff: true,
        monthlySubscription: '50',
        registrationNo: 'DHA-2211',
      }).expect(201)
    ).body as TradeUnionView;
    // The 2025 table: 20 members for an establishment of up to 300 workers (s.179).
    expect(cba.threshold).toMatchObject({ workers: 3, required: 20, members: 0, ok: false });
    expect(cba.threshold.rule.reference.section).toBe('179');
    await union({ isCba: true })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('cba_exists'));
    await union({ checkOff: true }).expect(400);
    const second = (await union({}).expect(201)).body as TradeUnionView;
    await patch(`/unions/${second.id}`, { isCba: true })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('cba_exists'));
    await patch(`/unions/${second.id}`, { checkOff: true })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('subscription_required'));

    const joined = (
      await post(`/unions/${cba.id}/members`, {
        employeeCode: people[0]!.employeeCode,
        role: 'president',
        joinedOn: '2026-01-05',
        checkOffConsentOn: '2026-01-05',
      }).expect(201)
    ).body as TradeUnionView;
    expect(joined).toMatchObject({ members: 1, consenting: 1 });
    const bulk = (
      await post(`/unions/${cba.id}/members/bulk`, {
        employeeCodes: [
          people[1]!.employeeCode,
          people[2]!.employeeCode.toLowerCase(),
          'NOPE-1',
          people[0]!.employeeCode,
        ],
        joinedOn: '2026-02-01',
      }).expect(201)
    ).body as UnionBulkResult;
    expect(bulk).toEqual({
      added: 2,
      skipped: [
        { code: 'NOPE-1', reason: 'not_found' },
        { code: people[0]!.employeeCode, reason: 'already_member' },
      ],
    });

    // One union at a time (s.193), and only people of the union's own company.
    await post(`/unions/${second.id}/members`, { employeeId: people[1]!.id, joinedOn: today })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('member_of_another_union'));
    const g = await kit.group();
    const { employee: elsewhere } = await kit.hire(g);
    await post(`/unions/${second.id}/members`, { employeeId: elsewhere.id, joinedOn: today })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('member_other_company'));

    let view = await get<TradeUnionView>(`/unions/${cba.id}`);
    expect(view).toMatchObject({ members: 3, consenting: 1 });
    const member = view.memberList.find((m) => m.employee.id === people[1]!.id)!;
    view = (
      await patch(`/unions/${cba.id}/members/${member.id}`, {
        checkOffConsentOn: '2026-03-01',
      }).expect(200)
    ).body as TradeUnionView;
    expect(view.consenting).toBe(2);
    view = (
      await post(`/unions/${cba.id}/members/${member.id}/end`, {
        leftOn: addDays(today, -1),
      }).expect(200)
    ).body as TradeUnionView;
    expect(view).toMatchObject({ members: 2, consenting: 1 });
    expect(view.memberList.find((m) => m.id === member.id)).toMatchObject({ current: false });

    // At most three unions in an establishment: a fourth is shown as over the limit.
    await union({}).expect(201);
    const fourth = (await union({}).expect(201)).body as TradeUnionView;
    const counts = (await get<UnionListView>('/unions')).counts.find(
      (c) => c.legalEntity.id === entity.id,
    );
    expect(counts).toMatchObject({ unions: 4, max: 3, over: true });
    await api(app).delete(`/tenant/relations/unions/${cba.id}`).set(as()).expect(409);
    await api(app).delete(`/tenant/relations/unions/${fourth.id}`).set(as()).expect(204);

    // Committees and unions are for those who handle compliance.
    await api(app).get('/tenant/relations/unions').set(bearer(kit.finance)).expect(403);
  });

  it('deducts the subscription with consent only, and reports the month’s check-off', async () => {
    const g = await kit.group();
    const { employee: consenting } = await kit.hire(g);
    const { employee: direct } = await kit.hire(g);
    const legalEntityId = kit.org.legalEntities.find((e) => e.code === 'MGT')!.id;
    const union = (
      await post('/unions', {
        legalEntityId,
        name: `Garment Sramik Union ${kit.unique()}`,
        registrationNo: 'BJ-4471',
        checkOff: true,
        monthlySubscription: '30',
      }).expect(201)
    ).body as TradeUnionView;
    await post(`/unions/${union.id}/members`, {
      employeeId: consenting.id,
      joinedOn: '2026-01-01',
      checkOffConsentOn: '2026-01-01',
    }).expect(201);
    await post(`/unions/${union.id}/members`, {
      employeeId: direct.id,
      joinedOn: '2026-01-01',
    }).expect(201);

    const run = await kit.run(g, '2026-04');
    await kit.compute(run.id);
    expect(line(await kit.itemOf(run.id, consenting.id), 'UNION_SUB')).toBe('30.00');
    expect(Number(line(await kit.itemOf(run.id, direct.id), 'UNION_SUB') ?? 0)).toBe(0);

    const report = (q = '') =>
      get<CheckOffReport>(`/check-off?month=2026-04&unionId=${union.id}${q}`);
    const before = await report();
    expect(before.rows).toEqual([
      expect.objectContaining({
        employee: expect.objectContaining({ id: consenting.id }),
        deducted: null,
      }),
    ]);
    expect(before.unlockedRuns).toBeGreaterThan(0);

    await kit.lock(run.id);
    const after = await report();
    const depositDueOn = addDays(run.paymentDate, 15);
    expect(after.rows).toEqual([
      expect.objectContaining({
        union: { id: union.id, name: union.name },
        checkOffConsentOn: '2026-01-01',
        subscription: '30.00',
        deducted: '30.00',
        runId: run.id,
        payGroup: g.name,
        paymentDate: run.paymentDate,
        depositDueOn,
      }),
    ]);
    expect(after.unions).toEqual([
      {
        union: { id: union.id, name: union.name, registrationNo: 'BJ-4471' },
        members: 1,
        expected: '30.00',
        deducted: '30.00',
        depositDueOn,
        payDirectly: 1,
      },
    ]);
    expect(after.rule.reference.section).toBe('204');

    const file = await api(app)
      .get(`/tenant/relations/check-off/csv?month=2026-04&unionId=${union.id}`)
      .set(as())
      .expect(200)
      .expect('content-type', /text\/csv/);
    const [heading, ...rows] = file.text.trim().split('\n');
    expect(heading).toContain('Deposit due');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(consenting.employeeCode);
    expect(rows[0]).toContain(depositDueOn);
    await api(app).get('/tenant/relations/check-off?month=2026-13').set(as()).expect(400);
  });
});
