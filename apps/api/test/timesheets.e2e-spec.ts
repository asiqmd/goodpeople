import {
  attendanceDays,
  createDb,
  employeeAllocations,
  jobAssignments,
  notifications,
  projects,
  runAsTenant,
  tenants,
} from '@gp/db';
import {
  type ApprovalItem,
  type PayGroupView,
  type TimesheetApprovalItem,
  type TimesheetEntriesResult,
  type TimesheetListView,
  type TimesheetPrefillResult,
  type TimesheetView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { runInTenantContext } from '../src/common/request-context.js';
import { TimesheetJobs } from '../src/modules/timesheets/timesheet-jobs.service.js';
import { binary, isPdf, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp, testEnv } from './test-env.js';

const ME = '/tenant/timesheets/me';

const hoursOn = (sheet: TimesheetView, date: string, projectId: string | null) =>
  sheet.entries.find((e) => e.date === date && e.projectId === projectId)?.hours;

// Each test hires its own people in the seeded my-group workspace and makes its own projects
// (straight into the database, as the projects screens are another area's), so the tests pass
// in any order.
describe('timesheets', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof payrollKit>>;
  let db: ReturnType<typeof createDb>['db'];
  let pool: ReturnType<typeof createDb>['pool'];
  let tenantId: string;
  let payGroup: PayGroupView;

  beforeAll(async () => {
    app = await bootApp();
    kit = await payrollKit(app);
    payGroup = await kit.group();
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    tenantId = tenant!.id;
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  const entity = (code: 'MGT' | 'MGF') => kit.org.legalEntities.find((e) => e.code === code)!.id;
  const asTenant = <T>(fn: Parameters<typeof runAsTenant<T>>[2]) => runAsTenant(db, tenantId, fn);

  async function project(fields: Partial<typeof projects.$inferInsert> = {}) {
    const [row] = await asTenant((tx) =>
      tx
        .insert(projects)
        .values({
          tenantId,
          legalEntityId: entity('MGT'),
          code: `PRJ-${kit.unique()}`,
          name: 'Safe water for Kurigram',
          startsOn: '2024-01-01',
          ...fields,
        })
        .returning(),
    );
    return row!;
  }
  const allocate = (
    employeeId: string,
    projectId: string,
    percent: string,
    fromOn = '2024-01-01',
  ) =>
    asTenant((tx) =>
      tx.insert(employeeAllocations).values({ tenantId, employeeId, projectId, percent, fromOn }),
    );
  const worked = (employeeId: string, date: string, minutes: number, dayType = 'working') =>
    asTenant((tx) =>
      tx.insert(attendanceDays).values({
        tenantId,
        employeeId,
        date,
        dayType: dayType as 'working',
        status: 'present',
        workedMinutes: minutes,
      }),
    );
  const reportsTo = (employeeId: string, managerId: string) =>
    asTenant((tx) =>
      tx.update(jobAssignments).set({ managerId }).where(eq(jobAssignments.employeeId, employeeId)),
    );
  async function person(group = payGroup) {
    const { employee, token } = await kit.hire(group, { login: true });
    return { id: employee.id, token: token! };
  }

  const mine = async (token: string, month: string) =>
    (await api(app).get(`${ME}?month=${month}`).set(bearer(token)).expect(200))
      .body as TimesheetView;
  const save = (token: string, month: string, entries: object[]) =>
    api(app).put(`${ME}/entries`).set(bearer(token)).send({ month, entries });
  const saved = async (token: string, month: string, entries: object[]) =>
    (await save(token, month, entries).expect(200)).body as TimesheetEntriesResult;
  const submit = (token: string, month: string) =>
    api(app).post(`${ME}/submit`).set(bearer(token)).send({ month, declaration: true });
  const inbox = async (token: string) =>
    (await api(app).get('/tenant/approvals').set(bearer(token)).expect(200)).body as ApprovalItem[];
  const itemFor = async (token: string, id: string) =>
    (await inbox(token)).find(
      (i): i is TimesheetApprovalItem => i.subjectType === 'timesheet' && i.timesheet.id === id,
    );

  it("saves entries once per client id, within a day's 24 hours, on their company's projects", async () => {
    const month = '2026-06';
    const { id, token } = await person();
    const water = await project();
    const closed = await project({ status: 'closed' });
    const foods = await project({ legalEntityId: entity('MGF') });

    const empty = await mine(token, month);
    expect(empty).toMatchObject({ id: null, status: 'draft', needed: false, editable: true });
    expect(empty.days).toHaveLength(30);
    const chargeable = empty.projects.filter((p) => p.chargeable).map((p) => p.id);
    expect(chargeable).toContain(water.id);
    expect(empty.projects.map((p) => p.id)).not.toContain(foods.id);

    const first = randomUUID();
    const result = await saved(token, month, [
      { clientId: first, date: '2026-06-02', projectId: water.id, hours: 6 },
      { date: '2026-06-02', projectId: null, hours: '2' },
      { date: '2026-06-02', projectId: foods.id, hours: 1 },
      { date: '2026-07-01', projectId: water.id, hours: 1 },
      { date: '2026-06-02', projectId: closed.id, hours: 1 },
      { date: '2026-06-02', projectId: randomUUID(), hours: 1 },
      { date: '2026-06-03', projectId: water.id, hours: 16 },
      { date: '2026-06-03', projectId: null, hours: 8.5 },
    ]);
    expect(result.accepted.map((a) => a.outcome)).toEqual(['saved', 'saved', 'saved']);
    expect(result.refused.map((r) => r.code)).toEqual([
      'project_other_company',
      'date_outside_month',
      'project_inactive',
      'project_unknown',
      'day_over_24_hours',
    ]);
    expect(result.timesheet.id).not.toBeNull();
    expect(result.timesheet.totalHours).toBe('24.00');
    expect(result.timesheet.totals).toEqual([
      expect.objectContaining({
        project: expect.objectContaining({ id: water.id }),
        hours: '22.00',
        percent: '91.67',
      }),
      expect.objectContaining({ project: null, hours: '2.00', percent: '8.33' }),
    ]);
    expect(result.timesheet.days.find((d) => d.date === '2026-06-03')?.hours).toBe('16.00');

    // A resend of an entry already saved changes nothing, even with other hours.
    const again = await saved(token, month, [
      { clientId: first, date: '2026-06-02', projectId: water.id, hours: 9 },
    ]);
    expect(again.accepted[0]?.outcome).toBe('duplicate');
    expect(hoursOn(again.timesheet, '2026-06-02', water.id)).toBe('6.00');

    // The cell is updated in place; zero hours removes it.
    const changed = await saved(token, month, [
      { date: '2026-06-02', projectId: water.id, hours: 7.25, note: 'Field visit' },
      { date: '2026-06-02', projectId: null, hours: 0 },
    ]);
    expect(changed.accepted.map((a) => a.outcome)).toEqual(['saved', 'removed']);
    expect(changed.timesheet.entries.filter((e) => e.date === '2026-06-02')).toEqual([
      expect.objectContaining({ projectId: water.id, hours: '7.25', note: 'Field visit' }),
    ]);

    // Someone else's client id is not theirs to use.
    const other = await person();
    const taken = await saved(other.token, month, [
      { clientId: first, date: '2026-06-02', projectId: null, hours: 1 },
    ]);
    expect(taken.refused[0]?.code).toBe('client_id_taken');

    const tooMany = await save(token, month, [{ date: '2026-06-04', projectId: null, hours: 25 }]);
    expect(tooMany.status).toBe(400);
    expect(await mine(token, month)).toMatchObject({ id: result.timesheet.id });
    expect(id).toBe(result.timesheet.employee.id);
  });

  it('prefills days with attendance by the planned split, leaving off days and entered ones', async () => {
    const month = '2026-05';
    const { id, token } = await person();
    const water = await project();
    const school = await project({ name: 'Schools in Bhola' });
    await allocate(id, water.id, '60');
    await allocate(id, school.id, '25');

    const blank = await mine(token, month);
    expect(blank.needed).toBe(true);
    expect(blank.projects.slice(0, 2).map((p) => p.plannedPercent)).toEqual(
      expect.arrayContaining(['60.00', '25.00']),
    );
    const working = blank.days.filter((d) => !d.offDay && !d.holiday);
    const off = blank.days.find((d) => d.offDay)!;
    const [plain, entered] = [working[0]!.date, working[1]!.date];
    await worked(id, plain, 480);
    await worked(id, entered, 480);
    await worked(id, off.date, 300, 'weekly_off');
    await saved(token, month, [{ date: entered, projectId: water.id, hours: 3 }]);

    const filled = (
      await api(app).post(`${ME}/prefill`).set(bearer(token)).send({ month }).expect(200)
    ).body as TimesheetPrefillResult;
    expect(filled.days).toBe(1);
    const sheet = filled.timesheet;
    expect(sheet.days.find((d) => d.date === plain)?.workedHours).toBe('8.00');
    expect(hoursOn(sheet, plain, water.id)).toBe('4.80');
    expect(hoursOn(sheet, plain, school.id)).toBe('2.00');
    expect(hoursOn(sheet, plain, null)).toBe('1.20');
    expect(sheet.entries.filter((e) => e.date === entered)).toHaveLength(1);
    expect(sheet.entries.filter((e) => e.date === off.date)).toHaveLength(0);

    const twice = (
      await api(app).post(`${ME}/prefill`).set(bearer(token)).send({ month }).expect(200)
    ).body as TimesheetPrefillResult;
    expect(twice.days).toBe(0);
  });

  it('goes to the line manager with the declaration; rejected comes back to correct', async () => {
    const month = '2026-04';
    const manager = await person();
    const worker = await person();
    const stranger = await person();
    await reportsTo(worker.id, manager.id);
    const water = await project();
    await allocate(worker.id, water.id, '100');
    await saved(worker.token, month, [
      { date: '2026-04-06', projectId: water.id, hours: 6 },
      { date: '2026-04-06', projectId: null, hours: 2 },
    ]);

    await api(app)
      .post(`${ME}/submit`)
      .set(bearer(worker.token))
      .send({ month, declaration: false })
      .expect(400);
    const sent = (await submit(worker.token, month).expect(200)).body as TimesheetView;
    expect(sent).toMatchObject({ status: 'submitted', editable: false });
    expect(sent.submittedAt).not.toBeNull();
    expect(sent.steps.map((s) => `${s.kind}:${s.status}`)).toEqual(['manager:pending']);

    const locked = await save(worker.token, month, [
      { date: '2026-04-07', projectId: null, hours: 1 },
    ]).expect(409);
    expect(locked.body.code).toBe('timesheet_locked');
    await api(app).post(`${ME}/prefill`).set(bearer(worker.token)).send({ month }).expect(409);
    expect((await submit(worker.token, month).expect(409)).body.code).toBe('timesheet_locked');

    const item = await itemFor(manager.token, sent.id!);
    expect(item?.timesheet).toMatchObject({ month, totalHours: '8.00' });
    expect(item?.timesheet.totals).toEqual([
      expect.objectContaining({ hours: '6.00', percent: '75.00', plannedPercent: '100.00' }),
      expect.objectContaining({ project: null, percent: '25.00' }),
    ]);
    // Their own request never reaches them, and others cannot read it.
    expect(await itemFor(worker.token, sent.id!)).toBeUndefined();
    await api(app).get(`/tenant/timesheets/${sent.id}`).set(bearer(manager.token)).expect(200);
    await api(app).get(`/tenant/timesheets/${sent.id}`).set(bearer(stranger.token)).expect(404);

    await api(app)
      .post(`/tenant/approvals/${item!.stepId}/reject`)
      .set(bearer(manager.token))
      .send({ comment: 'The 6th was a training day' })
      .expect(201);
    const rejected = await mine(worker.token, month);
    expect(rejected).toMatchObject({ status: 'rejected', editable: true });
    expect(rejected.steps[0]).toMatchObject({
      status: 'rejected',
      comment: 'The 6th was a training day',
    });

    await saved(worker.token, month, [{ date: '2026-04-06', projectId: water.id, hours: 4 }]);
    const again = (await submit(worker.token, month).expect(200)).body as TimesheetView;
    expect(again.steps.map((s) => `${s.stepNo}:${s.status}`)).toEqual(['1:pending']);
    const second = await itemFor(manager.token, sent.id!);
    await api(app)
      .post(`/tenant/approvals/${second!.stepId}/approve`)
      .set(bearer(manager.token))
      .send({})
      .expect(201);
    const approved = await mine(worker.token, month);
    expect(approved).toMatchObject({
      status: 'approved',
      editable: false,
      decidedBy: { id: manager.id },
      totalHours: '6.00',
    });
    expect(approved.decidedAt).not.toBeNull();
  });

  it('lists the month for those who manage projects, with hours per project and the PDF', async () => {
    const month = '2026-03';
    const planned = await person();
    const done = await person();
    const water = await project();
    await allocate(planned.id, water.id, '50');
    await saved(done.token, month, [
      { date: '2026-03-02', projectId: water.id, hours: 5 },
      { date: '2026-03-03', projectId: water.id, hours: 3 },
    ]);
    // Nobody above them signs in, so HR decides.
    const sent = (await submit(done.token, month).expect(200)).body as TimesheetView;
    expect(sent.steps.map((s) => `${s.kind}:${s.status}`)).toEqual([
      'manager:skipped',
      'hr:pending',
    ]);

    const list = (
      await api(app).get(`/tenant/timesheets?month=${month}`).set(bearer(kit.admin)).expect(200)
    ).body as TimesheetListView;
    expect(list.projects.map((p) => p.id)).toContain(water.id);
    expect(list.rows.find((r) => r.employee.id === planned.id)).toMatchObject({
      id: null,
      status: null,
      needed: true,
      totalHours: '0.00',
      totals: [expect.objectContaining({ hours: '0.00', plannedPercent: '50.00' })],
    });
    expect(list.rows.find((r) => r.employee.id === done.id)).toMatchObject({
      id: sent.id,
      status: 'submitted',
      needed: false,
      totalHours: '8.00',
      totals: [expect.objectContaining({ hours: '8.00', percent: '100.00' })],
    });
    await api(app).get(`/tenant/timesheets?month=${month}`).set(bearer(done.token)).expect(403);
    await api(app).get(`/tenant/timesheets/${sent.id}`).set(bearer(kit.admin)).expect(200);

    for (const [token, language] of [
      [done.token, 'en'],
      [kit.admin, 'bn'],
    ] as const) {
      const pdf = await binary(
        api(app).get(`/tenant/timesheets/${sent.id}/pdf?language=${language}`).set(bearer(token)),
      ).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
  });

  it("reopens to a draft with a reason, but not once the month's pay is locked", async () => {
    const group = await kit.group();
    const { id, token } = await person(group);
    const water = await project();
    await allocate(id, water.id, '100');
    const approveAsHr = async (sheetId: string) => {
      const item = await itemFor(kit.admin, sheetId);
      await api(app)
        .post(`/tenant/approvals/${item!.stepId}/approve`)
        .set(bearer(kit.admin))
        .send({})
        .expect(201);
    };

    await saved(token, '2026-02', [{ date: '2026-02-02', projectId: water.id, hours: 8 }]);
    const open = (await submit(token, '2026-02').expect(200)).body as TimesheetView;
    await approveAsHr(open.id!);
    const reopened = (
      await api(app)
        .post(`/tenant/timesheets/${open.id}/reopen`)
        .set(bearer(kit.admin))
        .send({ reason: 'Hours on the 2nd belong to another grant' })
        .expect(200)
    ).body as TimesheetView;
    expect(reopened).toMatchObject({
      status: 'draft',
      editable: true,
      decidedAt: null,
      note: 'Hours on the 2nd belong to another grant',
    });
    const draft = await api(app)
      .post(`/tenant/timesheets/${open.id}/reopen`)
      .set(bearer(kit.admin))
      .send({ reason: 'Again' })
      .expect(409);
    expect(draft.body.code).toBe('timesheet_draft');
    await api(app)
      .post(`/tenant/timesheets/${open.id}/reopen`)
      .set(bearer(token))
      .send({ reason: 'Mine' })
      .expect(403);

    await saved(token, '2026-01', [{ date: '2026-01-05', projectId: water.id, hours: 8 }]);
    const january = (await submit(token, '2026-01').expect(200)).body as TimesheetView;
    await approveAsHr(january.id!);
    const run = await kit.run(group, '2026-01');
    await kit.compute(run.id);
    await kit.lock(run.id);
    const refused = await api(app)
      .post(`/tenant/timesheets/${january.id}/reopen`)
      .set(bearer(kit.admin))
      .send({ reason: 'Too late' })
      .expect(409);
    expect(refused.body.code).toBe('timesheet_month_locked');

    // Once pay is locked, the month's split is posted: no approving or sending it any more.
    await saved(token, '2026-03', [{ date: '2026-03-02', projectId: water.id, hours: 8 }]);
    const march = (await submit(token, '2026-03').expect(200)).body as TimesheetView;
    await saved(token, '2026-04', [{ date: '2026-04-01', projectId: water.id, hours: 8 }]);
    for (const month of ['2026-03', '2026-04']) {
      const locked = await kit.run(group, month);
      await kit.compute(locked.id);
      await kit.lock(locked.id);
    }
    const pending = await itemFor(kit.admin, march.id!);
    const late = await api(app)
      .post(`/tenant/approvals/${pending!.stepId}/approve`)
      .set(bearer(kit.admin))
      .send({})
      .expect(409);
    expect(late.body.code).toBe('timesheet_month_locked');
    expect((await submit(token, '2026-04').expect(409)).body.code).toBe('timesheet_month_locked');
  });

  it('reminds people charged to a project last month once, unless they submitted', async () => {
    const late = await person();
    const prompt = await person();
    const water = await project();
    await allocate(late.id, water.id, '40', '2025-11-10');
    await allocate(prompt.id, water.id, '40', '2025-11-10');
    await saved(prompt.token, '2025-11', [{ date: '2025-11-12', projectId: water.id, hours: 7 }]);
    await submit(prompt.token, '2025-11').expect(200);

    const jobs = app.get(TimesheetJobs);
    await runInTenantContext(tenantId, () => jobs.remindTenant(new Date('2025-12-03T06:00:00Z')));
    await runInTenantContext(tenantId, () => jobs.remindTenant(new Date('2025-12-04T06:00:00Z')));
    expect(
      await runInTenantContext(tenantId, () => jobs.remindTenant(new Date('2025-12-10T06:00:00Z'))),
    ).toBe(0);

    const sent = await asTenant((tx) =>
      tx
        .select({ employeeId: notifications.employeeId, data: notifications.data })
        .from(notifications)
        .where(
          and(
            eq(notifications.event, 'timesheet.due'),
            inArray(notifications.employeeId, [late.id, prompt.id]),
          ),
        ),
    );
    expect(sent).toEqual([{ employeeId: late.id, data: { month: '2025-11' } }]);
  });
});
