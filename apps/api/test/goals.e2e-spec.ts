import {
  attendanceDays,
  createDb,
  goals,
  orgUnits,
  productionEntries,
  productionOperations,
  reviewCycles,
  runAsTenant,
  tenants,
  type Tx,
} from '@gp/db';
import {
  DEFAULT_COMPETENCIES,
  type CycleStatus,
  type EmployeeDetail,
  type GoalDetail,
  type GoalView,
  type MyGoals,
  type NotificationInbox,
  type OrgSnapshot,
  type Page,
  type TeamGoals,
  type UnitGoals,
  type WorkspaceUserCreated,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { runInTenantContext } from '../src/common/request-context.js';
import { GoalJobs } from '../src/modules/goals/goal-jobs.service.js';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

// Goals and KPIs in the seeded my-group workspace. Each test makes its own people, managers,
// units and cycles with unique values, and asserts only on its own rows.

type Company = 'MGT' | 'MGF';
const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const march = (d: number) => `2025-03-${String(d).padStart(2, '0')}`;
/** 21 days present, 2 absent, one on leave and a half day. */
const marchStatus = (d: number) =>
  d <= 21 ? 'present' : d <= 23 ? 'absent' : d === 24 ? 'on_leave' : 'half_day';

describe('goals and KPIs', () => {
  let app: INestApplication;
  let admin: string;
  let org: OrgSnapshot;
  let tenantId: string;
  let close: () => Promise<void>;
  let inTenant: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  let seq = 0;
  const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

  beforeAll(async () => {
    app = await bootApp();
    admin = (await tenantLogin(app, 'my-group')).accessToken;
    org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200)).body as OrgSnapshot;
    const { db, pool } = createDb(testEnv().ownerUrl, { max: 2 });
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    tenantId = tenant!.id;
    inTenant = (fn) => runAsTenant(db, tenantId, fn);
    close = () => pool.end();
  });
  afterAll(async () => {
    await close();
    await app.close();
  });

  const signIn = async (email: string) =>
    (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;

  /** An employee, with a login unless `login` is false. */
  async function person(
    fields: {
      company?: Company;
      managerId?: string;
      orgUnitId?: string;
      login?: boolean;
      name?: string;
    } = {},
  ) {
    const company = fields.company ?? 'MGT';
    const employeeCode = `GL-${unique().toUpperCase()}`;
    const email = `${employeeCode.toLowerCase()}@example.test`;
    const place =
      company === 'MGT'
        ? { locationId: ref(org.locations, 'GZP'), orgUnitId: ref(org.orgUnits, 'MGT-L1') }
        : { locationId: ref(org.locations, 'NRJ'), orgUnitId: ref(org.orgUnits, 'MGF-PROD') };
    const employee = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode,
          fullName: fields.name ?? `Goal Test ${employeeCode}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1992-05-10',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${seq++}`.slice(-10) },
          joinedOn: '2024-01-01',
          job: {
            legalEntityId: ref(org.legalEntities, company),
            ...place,
            ...(fields.orgUnitId ? { orgUnitId: fields.orgUnitId } : {}),
            ...(fields.managerId ? { managerId: fields.managerId } : {}),
            designationId: ref(org.designations, 'SO'),
            gradeId: ref(org.grades, 'W5'),
            employmentType: 'permanent',
            workerCategory: 'worker',
          },
          ...(fields.login === false
            ? {}
            : { portalAccess: { email, role: 'employee', password: testEnv().password } }),
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    return {
      id: employee.id,
      name: employee.fullName,
      token: fields.login === false ? '' : await signIn(email),
    };
  }

  /** A manager with a report, and the manager's own manager. */
  async function team(fields: { company?: Company; orgUnitId?: string } = {}) {
    const head = await person(fields);
    const manager = await person({ ...fields, managerId: head.id });
    const member = await person({ ...fields, managerId: manager.id });
    const peer = await person({ ...fields, managerId: manager.id });
    return { head, manager, member, peer };
  }

  /** A workspace login without an employee record, limited to companies when given. */
  async function staff(role: string, companies?: Company[]) {
    const email = `gl-staff-${unique()}@example.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({ name: `Goals ${role}`, email, role, password: testEnv().password })
        .expect(201)
    ).body as WorkspaceUserCreated;
    if (companies) {
      await api(app)
        .put(`/tenant/users/${user.id}/scopes`)
        .set(bearer(admin))
        .send({ legalEntityIds: companies.map((c) => ref(org.legalEntities, c)) })
        .expect(200);
    }
    return { id: user.id, token: await signIn(email) };
  }

  /** A line of its own under Sewing, so its records are only this test's. */
  const unit = async (company: Company = 'MGT') => {
    const code = `GL-${unique().toUpperCase()}`;
    const [row] = await inTenant((tx) =>
      tx
        .insert(orgUnits)
        .values({
          tenantId,
          legalEntityId: ref(org.legalEntities, company),
          parentId: company === 'MGT' ? ref(org.orgUnits, 'MGT-SEW') : null,
          kind: 'line',
          code,
          name: `Line ${code}`,
        })
        .returning(),
    );
    return row!;
  };

  /** A review cycle, written straight to the table (the cycles API is built alongside). */
  const cycle = async (status: CycleStatus = 'draft', legalEntityIds: string[] = []) => {
    const [row] = await inTenant((tx) =>
      tx
        .insert(reviewCycles)
        .values({
          tenantId,
          name: `Annual review ${unique()}`,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          legalEntityIds,
          competencies: [...DEFAULT_COMPETENCIES],
          goalsDueOn: '2026-12-15',
          status,
        })
        .returning(),
    );
    return row!;
  };

  const objective = (fields: Record<string, unknown> = {}) => ({
    title: `Cut rework on line ${unique()}`,
    kind: 'objective',
    keyResults: [{ text: 'Train two operators on the new machine' }, { text: 'Halve alterations' }],
    ...fields,
  });
  const kpi = (fields: Record<string, unknown> = {}) => ({
    title: `Defects per hundred ${unique()}`,
    kind: 'kpi',
    measureUnit: '%',
    target: 2,
    direction: 'lower',
    ...fields,
  });

  const create = (token: string, body: Record<string, unknown>) =>
    api(app).post('/tenant/performance/goals').set(bearer(token)).send(body);
  const created = async (token: string, body: Record<string, unknown>) =>
    (await create(token, body).expect(201)).body as GoalDetail;
  const read = (token: string, id: string) =>
    api(app).get(`/tenant/performance/goals/${id}`).set(bearer(token));
  const detail = async (token: string, id: string) =>
    (await read(token, id).expect(200)).body as GoalDetail;
  const patch = (token: string, id: string, body: Record<string, unknown>) =>
    api(app).patch(`/tenant/performance/goals/${id}`).set(bearer(token)).send(body);
  const post = (token: string, path: string, body: Record<string, unknown> = {}) =>
    api(app).post(`/tenant/performance/goals${path}`).set(bearer(token)).send(body);
  const mine = async (token: string) =>
    (await api(app).get('/tenant/performance/goals/mine').set(bearer(token)).expect(200))
      .body as MyGoals;
  const teamOf = async (token: string, query = '') =>
    (await api(app).get(`/tenant/performance/goals/team${query}`).set(bearer(token)).expect(200))
      .body as TeamGoals;

  it('lets the person and their managers draft goals, and nobody else find them', async () => {
    const line = await unit();
    const { head, manager, member, peer } = await team({ orgUnitId: line.id });
    // On the same line but outside the person's line of management.
    const colleague = await person({ orgUnitId: line.id });
    const stranger = await person({ company: 'MGF' });

    const own = await created(member.token, objective());
    expect(own).toMatchObject({
      employee: { id: member.id },
      orgUnit: null,
      status: 'draft',
      kind: 'objective',
      progress: 0,
      keyResults: [
        { text: 'Train two operators on the new machine', done: false },
        { text: 'Halve alterations', done: false },
      ],
      can: { edit: true, agree: false, submit: true, checkin: true },
    });
    // The manager, and the manager's manager, draft for the person.
    const byManager = await created(manager.token, { ...kpi(), employeeId: member.id });
    expect(byManager).toMatchObject({
      employee: { id: member.id },
      status: 'draft',
      measureUnit: '%',
      target: '2.00',
      direction: 'lower',
      source: 'manual',
      can: { agree: true, submit: false },
    });
    await created(head.token, { ...objective(), employeeId: member.id });

    // The person edits their draft; a KPI field sent with an objective is not kept.
    const edited = (
      await patch(member.token, own.id, {
        title: 'Cut rework on line 1',
        description: 'Fewer garments back from finishing',
        measureUnit: 'pieces',
      }).expect(200)
    ).body as GoalDetail;
    expect(edited).toMatchObject({
      title: 'Cut rework on line 1',
      description: 'Fewer garments back from finishing',
      measureUnit: null,
    });

    // A peer under the same manager, a colleague on the same line, and someone in the other
    // company find nothing.
    for (const outsider of [peer, colleague, stranger]) {
      await read(outsider.token, own.id).expect(404);
      await patch(outsider.token, own.id, { title: 'Not mine to change' }).expect(404);
      await create(outsider.token, { ...objective(), employeeId: member.id }).expect(404);
      await post(outsider.token, `/${own.id}/checkins`, { note: 'Looks fine' }).expect(404);
    }
    // The person may not draft for their manager.
    await create(member.token, { ...objective(), employeeId: manager.id }).expect(404);

    const my = await mine(member.token);
    expect(my.employee?.id).toBe(member.id);
    expect(my.manager?.id).toBe(manager.id);
    expect(my.managesPeople).toBe(false);
    expect(my.goals.map((g) => g.id)).toContain(own.id);
    expect(my.goals.map((g) => g.id)).toContain(byManager.id);

    const managed = await teamOf(manager.token);
    expect(managed.people.map((p) => p.employee.id).toSorted()).toEqual(
      [member.id, peer.id].toSorted(),
    );
    expect(managed.people.find((p) => p.employee.id === member.id)!.goals).toHaveLength(3);
    expect(managed.toAgree).toBe(3);
    // The head sees the people below the manager too, with their manager named.
    const below = await teamOf(head.token);
    expect(below.people.find((p) => p.employee.id === member.id)?.manager?.id).toBe(manager.id);
    expect((await teamOf(member.token)).people).toEqual([]);
    expect((await teamOf(colleague.token)).people).toEqual([]);
    const colleagueSees = await api(app)
      .get(`/tenant/performance/goals/people?search=${encodeURIComponent(member.name)}`)
      .set(bearer(colleague.token))
      .expect(200);
    expect(colleagueSees.body).toEqual([]);

    // Fields that do not hold together are refused by field.
    const noTarget = await create(member.token, kpi({ target: null })).expect(400);
    expect(noTarget.body).toMatchObject({ code: 'goal_target_required' });
    expect(noTarget.body.issues[0].path).toBe('target');
    const backwards = await create(
      member.token,
      objective({ startsOn: '2026-06-01', dueOn: '2026-05-31' }),
    ).expect(400);
    expect(backwards.body.code).toBe('goal_dates_order');
  });

  it('agrees a cycle’s goals only when their weights make 100%, and sends changed ones back', async () => {
    const { manager, member } = await team();
    const review = await cycle('active');
    const inCycle = { cycleId: review.id };
    const first = await created(member.token, objective({ ...inCycle, weight: 50 }));
    const second = await created(member.token, kpi({ ...inCycle, weight: 30 }));
    const third = await created(member.token, objective({ ...inCycle, weight: 10 }));
    // A cycle's dates are the goals' dates unless they have their own.
    expect(first).toMatchObject({
      startsOn: '2026-01-01',
      dueOn: '2026-12-31',
      weight: '50.00',
      cycle: { id: review.id, status: 'active' },
    });

    // Submitting tells the manager.
    const submitted = await post(member.token, '/submit', { cycleId: review.id }).expect(200);
    expect(submitted.body).toEqual({ goals: 3, notified: 1 });
    const inbox = (
      await api(app).get('/tenant/notifications').set(bearer(manager.token)).expect(200)
    ).body as NotificationInbox;
    expect(inbox.items).toContainEqual(
      expect.objectContaining({
        event: 'performance.task',
        title: `Goals to agree for ${member.name}`,
        body: expect.stringContaining(`sent 3 draft goals for ${review.name} for you to agree.`),
        link: `/workspace/performance/goals?tab=team&cycle=${review.id}`,
      }),
    );
    // Submitting the same drafts again tells nobody twice.
    expect((await post(member.token, '/submit', { cycleId: review.id }).expect(200)).body).toEqual({
      goals: 3,
      notified: 0,
    });

    // Nobody agrees their own goals.
    expect((await post(member.token, `/${first.id}/agree`).expect(403)).body.code).toBe(
      'agree_own_goals',
    );
    const agreed = (await post(manager.token, `/${first.id}/agree`).expect(200)).body as GoalDetail;
    expect(agreed).toMatchObject({ status: 'agreed', agreedBy: expect.any(String) });
    expect(agreed.agreedAt).not.toBeNull();
    await post(manager.token, `/${second.id}/agree`).expect(200);
    // The last draft would leave the agreed weights at 90%.
    const short = await post(manager.token, `/${third.id}/agree`).expect(409);
    expect(short.body.code).toBe('goal_weights_total');
    expect(short.body.message).toContain('90%');

    await patch(member.token, third.id, { weight: 20 }).expect(200);
    const all = await post(manager.token, '/agree', {
      employeeId: member.id,
      cycleId: review.id,
    }).expect(200);
    expect((all.body as GoalView[]).map((g) => [g.id, g.status])).toEqual([[third.id, 'agreed']]);
    expect(
      (
        await post(manager.token, '/agree', { employeeId: member.id, cycleId: review.id }).expect(
          409,
        )
      ).body.code,
    ).toBe('no_draft_goals');

    // Changing an agreed goal's substance sends it back; its description alone does not.
    const described = (
      await patch(member.token, second.id, { description: 'From the QC log' }).expect(200)
    ).body as GoalDetail;
    expect(described.status).toBe('agreed');
    const retitled = (
      await patch(member.token, first.id, { title: 'Cut rework on every line' }).expect(200)
    ).body as GoalDetail;
    expect(retitled).toMatchObject({ status: 'draft', agreedAt: null, agreedBy: null });
    const reweighted = (await patch(member.token, second.id, { target: 1.5 }).expect(200))
      .body as GoalDetail;
    expect(reweighted.status).toBe('draft');
    await post(manager.token, '/agree', { employeeId: member.id, cycleId: review.id }).expect(200);

    // Agreed weights never pass 100%, and every goal in a cycle needs a weight to be agreed.
    const extra = await created(member.token, objective({ ...inCycle, weight: 10 }));
    expect((await post(manager.token, `/${extra.id}/agree`).expect(409)).body.code).toBe(
      'goal_weights_over',
    );
    const unweighted = await created(member.token, objective(inCycle));
    expect((await post(manager.token, `/${unweighted.id}/agree`).expect(409)).body.code).toBe(
      'goal_weight_required',
    );
    // Outside a cycle no weights are needed.
    const loose = await created(member.token, objective());
    expect((await post(manager.token, `/${loose.id}/agree`).expect(200)).body.status).toBe(
      'agreed',
    );

    // Only open cycles take goals; once a cycle moves on, its goals stay as rated.
    const closed = await cycle('calibration');
    expect(
      (await create(member.token, objective({ cycleId: closed.id })).expect(400)).body.code,
    ).toBe('goal_cycle_not_open');
    await inTenant((tx) =>
      tx.update(reviewCycles).set({ status: 'calibration' }).where(eq(reviewCycles.id, review.id)),
    );
    expect((await patch(member.token, extra.id, { weight: 5 }).expect(409)).body.code).toBe(
      'goal_cycle_closed',
    );
  });

  it('moves progress with check-ins, and closes goals as completed or dropped', async () => {
    const { manager, member } = await team();
    const goal = await created(
      member.token,
      objective({
        keyResults: [
          { text: 'Train operators' },
          { text: 'Fix the needle guard' },
          { text: 'Halve alterations' },
          { text: 'Daily quality huddle' },
        ],
      }),
    );
    const two = (
      await post(member.token, `/${goal.id}/checkins`, { done: [0, 1], note: 'Two down' }).expect(
        201,
      )
    ).body as GoalDetail;
    expect(two.progress).toBe(50);
    expect(two.keyResults.map((k) => k.done)).toEqual([true, true, false, false]);
    expect(two.checkins[0]).toMatchObject({
      progress: 50,
      note: 'Two down',
      author: expect.any(String),
    });

    const plain = await created(member.token, objective({ keyResults: [] }));
    const forty = (await post(manager.token, `/${plain.id}/checkins`, { progress: 40 }).expect(201))
      .body as GoalDetail;
    expect(forty.progress).toBe(40);

    const defects = await created(member.token, kpi());
    const high = (await post(member.token, `/${defects.id}/checkins`, { value: 4 }).expect(201))
      .body as GoalDetail;
    expect(high).toMatchObject({ currentValue: '4.00', progress: 50 });
    const low = (await post(manager.token, `/${defects.id}/checkins`, { value: 1.5 }).expect(201))
      .body as GoalDetail;
    expect(low).toMatchObject({ currentValue: '1.50', progress: 100 });
    expect(low.checkins.map((c) => c.value)).toEqual(['1.50', '4.00']);
    expect((await post(member.token, `/${defects.id}/checkins`, {}).expect(400)).body.code).toBe(
      'goal_checkin_empty',
    );

    // The person may not complete their own goal; the manager does, and then it is closed.
    await post(manager.token, `/${defects.id}/agree`).expect(200);
    expect((await post(member.token, `/${defects.id}/complete`).expect(403)).body.code).toBe(
      'agree_own_goals',
    );
    const done = (
      await post(manager.token, `/${defects.id}/complete`, { note: 'Held all quarter' }).expect(200)
    ).body as GoalDetail;
    expect(done).toMatchObject({ status: 'completed', can: { edit: false, checkin: false } });
    expect(
      (await post(member.token, `/${defects.id}/checkins`, { value: 3 }).expect(409)).body.code,
    ).toBe('goal_closed');

    const dropped = (
      await post(manager.token, `/${plain.id}/drop`, {
        note: 'The style moved to another line',
      }).expect(200)
    ).body as GoalDetail;
    expect(dropped).toMatchObject({
      status: 'dropped',
      dropNote: 'The style moved to another line',
    });
    await post(member.token, `/${goal.id}/drop`, { note: 'Merged into the line goal' }).expect(200);
  });

  it('reads an attendance rate and output against target from the records', async () => {
    const line = await unit();
    const supervisor = await person({ orgUnitId: line.id });
    const worker = await person({ orgUnitId: line.id, managerId: supervisor.id, login: false });
    const other = await person({ orgUnitId: line.id, managerId: supervisor.id, login: false });

    // March 2025: 21 days present, 2 absent, one on leave and a half day; weekly offs and a
    // Friday worked do not count.
    const days: (typeof attendanceDays.$inferInsert)[] = [];
    for (let d = 1; d <= 25; d++) {
      days.push({
        tenantId,
        employeeId: worker.id,
        date: march(d),
        dayType: 'working',
        status: marchStatus(d),
        leaveDays: d === 24 ? 1 : 0,
      });
    }
    for (const d of [26, 27, 28]) {
      days.push({
        tenantId,
        employeeId: worker.id,
        date: march(d),
        dayType: 'weekly_off',
        status: 'off',
      });
    }
    days.push({
      tenantId,
      employeeId: worker.id,
      date: march(29),
      dayType: 'weekly_off',
      status: 'present',
    });
    // Outside the goal's period.
    days.push({
      tenantId,
      employeeId: worker.id,
      date: '2025-04-01',
      dayType: 'working',
      status: 'absent',
    });
    // The other worker on the line: every day present.
    for (let d = 1; d <= 25; d++) {
      days.push({
        tenantId,
        employeeId: other.id,
        date: march(d),
        dayType: 'working',
        status: 'present',
      });
    }
    await inTenant((tx) => tx.insert(attendanceDays).values(days));

    const attendance = await created(supervisor.token, {
      title: 'Attendance in March',
      kind: 'kpi',
      source: 'attendance_rate',
      target: 95,
      direction: 'lower',
      measureUnit: 'days',
      startsOn: '2025-03-01',
      dueOn: '2025-03-31',
      employeeId: worker.id,
    });
    // Present 21½ of 24 working days: 89.58%, which is 94% of a 95% target.
    expect(attendance).toMatchObject({
      measureUnit: '%',
      direction: 'higher',
      currentValue: '89.58',
      progress: 94,
      reading: {
        source: 'attendance_rate',
        from: '2025-03-01',
        to: '2025-03-31',
        presentDays: 21.5,
        workingDays: 24,
        people: 1,
      },
    });
    // Its value is never typed.
    const typed = await post(supervisor.token, `/${attendance.id}/checkins`, { value: 100 }).expect(
      400,
    );
    expect(typed.body.code).toBe('goal_value_from_records');
    await post(supervisor.token, `/${attendance.id}/checkins`, {
      note: 'Two days off sick',
    }).expect(201);

    // A KPI from the records needs a start date.
    const undated = await create(supervisor.token, {
      title: 'Attendance',
      kind: 'kpi',
      source: 'attendance_rate',
      target: 95,
      employeeId: worker.id,
    }).expect(400);
    expect(undated.body.code).toBe('goal_start_required');

    // Production: 280 pieces against day targets of 300; work without a target is left out.
    const [sewing, ironing] = await inTenant((tx) =>
      tx
        .insert(productionOperations)
        .values([
          { tenantId, code: `GL-SEW-${unique()}`, name: 'Side seam', dailyTarget: 100 },
          { tenantId, code: `GL-IRN-${unique()}`, name: 'Ironing' },
        ])
        .returning(),
    );
    const entry = (
      employeeId: string,
      date: string,
      operation: typeof sewing,
      quantity: number,
    ) => ({
      tenantId,
      employeeId,
      operationId: operation!.id,
      date,
      quantity,
      dailyTarget: operation!.dailyTarget,
      orgUnitId: line.id,
    });
    await inTenant((tx) =>
      tx
        .insert(productionEntries)
        .values([
          entry(worker.id, '2025-03-03', sewing, 90),
          entry(worker.id, '2025-03-04', sewing, 110),
          entry(worker.id, '2025-03-05', sewing, 80),
          entry(worker.id, '2025-03-05', ironing, 500),
          entry(other.id, '2025-03-03', sewing, 120),
          entry(worker.id, '2025-04-02', sewing, 10),
        ]),
    );
    const output = await created(supervisor.token, {
      title: 'Output in March',
      kind: 'kpi',
      source: 'production_target',
      target: 100,
      startsOn: '2025-03-01',
      dueOn: '2025-03-31',
      employeeId: worker.id,
    });
    expect(output).toMatchObject({
      currentValue: '93.33',
      progress: 93,
      reading: { source: 'production_target', pieces: 280, target: 300, people: 1 },
    });

    // A unit's KPI from the records adds up its people.
    const lineOutput = await created(supervisor.token, {
      title: 'Line output in March',
      kind: 'kpi',
      source: 'production_target',
      target: 100,
      startsOn: '2025-03-01',
      dueOn: '2025-03-31',
      orgUnitId: line.id,
    });
    expect(lineOutput).toMatchObject({
      employee: null,
      orgUnit: { id: line.id },
      status: 'agreed',
      weight: null,
      currentValue: '100.00',
      progress: 100,
      reading: { pieces: 400, target: 400, people: 2 },
    });
    const lineAttendance = await created(supervisor.token, {
      title: 'Line attendance in March',
      kind: 'kpi',
      source: 'attendance_rate',
      target: 95,
      startsOn: '2025-03-01',
      dueOn: '2025-03-31',
      orgUnitId: line.id,
    });
    // 21½ + 25 days present of 24 + 25 working days.
    expect(lineAttendance.reading).toMatchObject({ presentDays: 46.5, workingDays: 49, people: 2 });
    expect(lineAttendance.currentValue).toBe('94.90');

    // Saving the goal stored its value. When the records change, reading the goal shows the
    // new value but writes nothing; the daily job stores it.
    const stored = async () =>
      (await inTenant((tx) => tx.select().from(goals).where(eq(goals.id, attendance.id))))[0]!;
    const before = await stored();
    expect(before).toMatchObject({ currentValue: '89.58', progress: 94 });
    await inTenant((tx) =>
      tx
        .update(attendanceDays)
        .set({ status: 'present' })
        .where(
          and(eq(attendanceDays.employeeId, worker.id), eq(attendanceDays.date, '2025-03-22')),
        ),
    );
    const again = await detail(supervisor.token, attendance.id);
    expect(again.reading).toMatchObject({ presentDays: 22.5, workingDays: 24 });
    expect(again).toMatchObject({ currentValue: '93.75', progress: 99 });
    await api(app).get('/tenant/performance/goals/mine').set(bearer(supervisor.token)).expect(200);
    await teamOf(supervisor.token);
    expect(await stored()).toEqual(before);

    const jobs = app.get(GoalJobs);
    expect(await runInTenantContext(tenantId, () => jobs.refreshTenant())).toBeGreaterThan(0);
    const afterJob = await stored();
    expect(afterJob).toMatchObject({ currentValue: '93.75', progress: 99 });
    expect(afterJob.updatedAt).toEqual(before.updatedAt);
    // Running it again leaves the goal as it is.
    await runInTenantContext(tenantId, () => jobs.refreshTenant());
    expect(await stored()).toEqual(afterJob);
  });

  it('sets unit goals people align theirs with', async () => {
    const line = await unit();
    const manager = await person();
    const member = await person({ orgUnitId: line.id, managerId: manager.id });
    const colleague = await person();
    const elsewhere = await person({ company: 'MGF' });
    const hr = await staff('hr_officer');

    // A manager with people on the line sets its goals; a colleague in the company only reads them.
    const lineGoal = await created(manager.token, objective({ orgUnitId: line.id }));
    expect(lineGoal).toMatchObject({
      orgUnit: { id: line.id },
      status: 'agreed',
      can: { edit: true },
    });
    expect(
      (await create(colleague.token, objective({ orgUnitId: line.id })).expect(403)).body.code,
    ).toBe('goal_unit_not_yours');
    expect((await detail(colleague.token, lineGoal.id)).can.edit).toBe(false);
    await read(elsewhere.token, lineGoal.id).expect(404);
    // HR sets goals for the section above the line.
    const sectionGoal = await created(hr.token, kpi({ orgUnitId: ref(org.orgUnits, 'MGT-SEW') }));

    const managerGoal = await created(manager.token, objective());
    // The form for a new goal offers what it may serve.
    const choices = (path: string, token: string) =>
      api(app).get(`/tenant/performance/goals/choices${path}`).set(bearer(token));
    const forLine = (await choices(`?orgUnitId=${line.id}`, manager.token).expect(200)).body;
    expect(forLine).toMatchObject({ employee: null, orgUnit: { id: line.id } });
    expect(forLine.alignTo.map((g: GoalView) => g.id)).toContain(sectionGoal.id);
    await choices(`?orgUnitId=${line.id}`, colleague.token).expect(403);
    await choices(`?employeeId=${member.id}`, colleague.token).expect(404);
    const forMember = (await choices('', member.token).expect(200)).body;
    expect(forMember.employee.id).toBe(member.id);
    const my = await mine(member.token);
    expect(my.alignTo.map((g) => g.id)).toEqual(
      expect.arrayContaining([lineGoal.id, sectionGoal.id, managerGoal.id]),
    );
    const aligned = await created(member.token, objective({ parentGoalId: lineGoal.id }));
    expect(aligned.parent).toEqual({ id: lineGoal.id, title: lineGoal.title });
    expect(aligned.parentGoal?.id).toBe(lineGoal.id);
    const servesManager = await created(member.token, objective({ parentGoalId: managerGoal.id }));
    // The manager's own goal is named, but its page is the manager's.
    expect(servesManager.parent?.id).toBe(managerGoal.id);
    expect(servesManager.parentGoal).toBeNull();
    const notTheirs = await create(
      member.token,
      objective({ parentGoalId: (await created(colleague.token, objective())).id }),
    ).expect(400);
    expect(notTheirs.body.code).toBe('goal_parent_not_allowed');
    // The line's goal serves the section's.
    await patch(manager.token, lineGoal.id, { parentGoalId: sectionGoal.id }).expect(200);

    // Those who lead the person see what serves the unit's goal; a colleague does not.
    expect((await detail(manager.token, lineGoal.id)).children.map((c) => c.id)).toEqual([
      aligned.id,
    ]);
    expect((await detail(colleague.token, lineGoal.id)).children).toEqual([]);

    const units = (
      await api(app).get('/tenant/performance/goals/units').set(bearer(manager.token)).expect(200)
    ).body as UnitGoals;
    expect(units.units.find((u) => u.unit.id === line.id)).toMatchObject({
      canWrite: true,
      goals: [expect.objectContaining({ id: lineGoal.id })],
    });
    const seen = (
      await api(app).get('/tenant/performance/goals/units').set(bearer(elsewhere.token)).expect(200)
    ).body as UnitGoals;
    expect(seen.units.map((u) => u.unit.id)).not.toContain(line.id);
  });

  it('keeps an HR login limited to one company to that company’s goals', async () => {
    const hr = await staff('hr_officer', ['MGT']);
    const here = await person();
    const there = await person({ company: 'MGF' });
    const hereGoal = await created(admin, { ...objective(), employeeId: here.id });
    const thereGoal = await created(admin, { ...objective(), employeeId: there.id });
    const thereUnit = await created(admin, objective({ orgUnitId: ref(org.orgUnits, 'MGF-QC') }));

    expect((await detail(hr.token, hereGoal.id)).can).toMatchObject({ agree: true, edit: true });
    await read(hr.token, thereGoal.id).expect(404);
    await read(hr.token, thereUnit.id).expect(404);
    await create(hr.token, { ...objective(), employeeId: there.id }).expect(404);
    await post(hr.token, `/${thereGoal.id}/agree`).expect(404);
    await post(hr.token, '/agree', { employeeId: there.id, cycleId: null }).expect(404);
    expect((await post(hr.token, `/${hereGoal.id}/agree`).expect(200)).body.status).toBe('agreed');

    const list = async (query: string) =>
      (
        (await api(app).get(`/tenant/performance/goals?${query}`).set(bearer(hr.token)).expect(200))
          .body as Page<GoalView>
      ).items.map((g) => g.id);
    expect(await list(`employeeId=${here.id}`)).toEqual([hereGoal.id]);
    expect(await list(`employeeId=${there.id}`)).toEqual([]);
    const people = (
      await api(app)
        .get(`/tenant/performance/goals/people?search=${encodeURIComponent(there.name)}`)
        .set(bearer(hr.token))
        .expect(200)
    ).body;
    expect(people).toEqual([]);

    // Everyone's goals are for performance.manage only.
    expect(
      (await api(app).get('/tenant/performance/goals').set(bearer(here.token)).expect(403)).body
        .code,
    ).toBe('role_not_allowed');
  });
});
