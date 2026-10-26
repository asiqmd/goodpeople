import {
  createDb,
  runAsTenant,
  tenantAuditLog,
  tenants,
  timesheetEntries,
  timesheets,
} from '@gp/db';
import {
  todayIn,
  type AllocationView,
  type CostSummary,
  type DonorView,
  type PayGroupView,
  type ProjectCostReport,
  type ProjectListItem,
  type ProjectTimesheetRef,
  type ProjectView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { rahima } from './leave-helpers.js';
import { binary, isPdf, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp, testEnv } from './test-env.js';

/** A journal row's debit less its credit. */
const amount = (r: string[]) => Number(r[5] || 0) - Number(r[6] || 0);
const may = (n: number) => `2026-05-${String(n).padStart(2, '0')}`;
const near = (actual: number, expected: number, within = 0.02) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(within);

// Each test makes its own donors, projects, people and pay groups, and locks payroll for
// months no other test here uses, so the tests pass in any order.
describe('projects', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof payrollKit>>;
  let tenantId: string;

  beforeAll(async () => {
    app = await bootApp();
    kit = await payrollKit(app);
    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
      tenantId = tenant!.id;
    } finally {
      await pool.end();
    }
  });
  afterAll(() => app.close());

  const as = () => bearer(kit.admin);
  const entity = (code: string) => kit.org.legalEntities.find((e) => e.code === code)!.id;

  async function donor(fields: Record<string, unknown> = {}) {
    return (
      await api(app)
        .post('/tenant/donors')
        .set(as())
        .send({ code: `D-${kit.unique()}`, name: 'Friends of the Delta', country: 'gb', ...fields })
        .expect(201)
    ).body as DonorView;
  }
  async function project(fields: Record<string, unknown> = {}) {
    return (
      await api(app)
        .post('/tenant/projects')
        .set(as())
        .send({
          legalEntityId: entity('MGT'),
          code: `PR-${kit.unique()}`,
          name: 'Clean water for Gazipur',
          startsOn: '2026-01-01',
          ...fields,
        })
        .expect(201)
    ).body as ProjectView;
  }
  const allocate = (projectId: string, body: Record<string, unknown>, status = 201) =>
    api(app).post(`/tenant/projects/${projectId}/allocations`).set(as()).send(body).expect(status);
  const allocationsOf = async (projectId: string) =>
    (await api(app).get(`/tenant/projects/${projectId}/allocations`).set(as()).expect(200))
      .body as AllocationView[];
  const costs = async (projectId: string, from: string, to: string) =>
    (
      await api(app)
        .get(`/tenant/projects/${projectId}/costs?from=${from}&to=${to}`)
        .set(as())
        .expect(200)
    ).body as ProjectCostReport;
  async function lockedRun(group: PayGroupView, month: string) {
    const run = await kit.run(group, month);
    await kit.compute(run.id);
    await kit.lock(run.id);
    return run;
  }
  /** What each person cost in a run: earnings and the employer's costs. */
  const costOf = async (runId: string, employeeId: string) => {
    const item = await kit.itemOf(runId, employeeId);
    return { earnings: Number(item.earnings), employerCost: Number(item.employerCost) };
  };

  it('keeps donors and projects with unique codes, for those who manage projects', async () => {
    const d = await donor();
    expect(d).toMatchObject({ country: 'GB', isActive: true });
    await api(app)
      .post('/tenant/donors')
      .set(as())
      .send({ code: d.code, name: 'Another' })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('donor_code_taken'));
    const renamed = (
      await api(app)
        .patch(`/tenant/donors/${d.id}`)
        .set(as())
        .send({ name: 'Delta Trust', isActive: false })
        .expect(200)
    ).body as DonorView;
    expect(renamed).toMatchObject({ name: 'Delta Trust', isActive: false });
    const donors = (await api(app).get('/tenant/donors').set(as()).expect(200)).body as DonorView[];
    expect(donors.find((x) => x.id === d.id)?.name).toBe('Delta Trust');

    const p = await project({
      nameBn: 'গাজীপুরে নিরাপদ পানি',
      donorId: d.id,
      grantReference: 'GR-2026-117',
      fd6ApprovalNo: 'NGOAB/FD-6/2026/451',
      fd6ApprovedOn: '2025-12-20',
      endsOn: '2027-12-31',
      approvedBudget: '5000000',
      staffBudget: '2000000',
      note: 'Phase one',
    });
    expect(p).toMatchObject({
      legalEntity: { id: entity('MGT') },
      donor: { id: d.id, code: d.code },
      grantReference: 'GR-2026-117',
      fd6ApprovalNo: 'NGOAB/FD-6/2026/451',
      fd6ApprovedOn: '2025-12-20',
      startsOn: '2026-01-01',
      endsOn: '2027-12-31',
      approvedBudget: '5000000.00',
      staffBudget: '2000000.00',
      status: 'active',
    });
    await api(app)
      .post('/tenant/projects')
      .set(as())
      .send({ legalEntityId: entity('MGT'), code: p.code, name: 'Copy', startsOn: '2026-01-01' })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('project_code_taken'));
    await api(app)
      .post('/tenant/projects')
      .set(as())
      .send({
        legalEntityId: entity('MGT'),
        code: `PR-${kit.unique()}`,
        name: 'Backwards',
        startsOn: '2026-05-01',
        endsOn: '2026-04-30',
      })
      .expect(400)
      .expect((res) => expect(res.body.issues[0].path).toBe('endsOn'));
    await api(app)
      .patch(`/tenant/projects/${p.id}`)
      .set(as())
      .send({ endsOn: '2025-12-31' })
      .expect(400);
    await api(app)
      .patch(`/tenant/projects/${p.id}`)
      .set(as())
      .send({ legalEntityId: '00000000-0000-4000-8000-000000000000' })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('legal_entity_unknown'));
    const moved = (
      await api(app)
        .patch(`/tenant/projects/${p.id}`)
        .set(as())
        .send({ legalEntityId: entity('MGF'), name: 'Clean water, phase one', donorId: null })
        .expect(200)
    ).body as ProjectView;
    expect(moved).toMatchObject({ legalEntity: { id: entity('MGF') }, donor: null });
    const list = (await api(app).get('/tenant/projects').set(as()).expect(200))
      .body as ProjectListItem[];
    expect(list.find((x) => x.id === p.id)).toMatchObject({
      name: 'Clean water, phase one',
      people: 0,
      monthCost: '0.00',
    });

    // Finance manages projects too; an employee does not.
    await api(app).get('/tenant/projects').set(bearer(kit.finance)).expect(200);
    const employee = await rahima(app);
    await api(app).get('/tenant/projects').set(bearer(employee)).expect(403);

    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const audit = await runAsTenant(db, tenantId, (tx) =>
        tx.select().from(tenantAuditLog).where(eq(tenantAuditLog.entityId, p.id)),
      );
      expect(audit.map((a) => a.action).toSorted()).toEqual([
        'projects.project.create',
        'projects.project.update',
      ]);
    } finally {
      await pool.end();
    }
  });

  it('refuses shares over 100%, outside the project or on a closed project', async () => {
    const g = await kit.group();
    const { employee } = await kit.hire(g);
    const a = await project({ endsOn: '2026-12-31' });
    const b = await project();

    const first = (
      await allocate(a.id, { employeeId: employee.id, percent: 60, fromOn: '2026-01-01' })
    ).body as AllocationView;
    // Without an end, a share runs to the end of the project.
    expect(first).toMatchObject({ percent: '60.00', costKind: 'programme', toOn: '2026-12-31' });
    const over = await allocate(
      b.id,
      { employeeId: employee.id, percent: '50', fromOn: '2026-03-01' },
      409,
    );
    expect(over.body.code).toBe('allocation_over_100');
    await allocate(b.id, {
      employeeId: employee.id,
      percent: '40',
      costKind: 'admin',
      fromOn: '2026-03-01',
    });
    for (const range of [
      { fromOn: '2025-12-01', toOn: '2026-01-31' },
      { fromOn: '2026-11-01', toOn: '2027-01-31' },
    ]) {
      const outside = await allocate(a.id, { employeeId: employee.id, percent: 1, ...range }, 400);
      expect(outside.body.code).toBe('allocation_outside_project');
    }

    // Ending the first share on 30 June makes room from July.
    const ended = (
      await api(app)
        .post(`/tenant/allocations/${first.id}/end`)
        .set(as())
        .send({ toOn: '2026-06-30' })
        .expect(200)
    ).body as AllocationView;
    expect(ended.toOn).toBe('2026-06-30');
    await allocate(b.id, { employeeId: employee.id, percent: 60, fromOn: '2026-07-01' });
    const mine = (
      await api(app).get(`/tenant/allocations?employeeId=${employee.id}`).set(as()).expect(200)
    ).body as AllocationView[];
    expect(mine.map((x) => [x.project.code, x.percent, x.fromOn, x.toOn])).toEqual([
      [a.code, '60.00', '2026-01-01', '2026-06-30'],
      [b.code, '40.00', '2026-03-01', null],
      [b.code, '60.00', '2026-07-01', null],
    ]);

    // A share that has started is ended, not removed; one still to come can be removed.
    await api(app)
      .delete(`/tenant/allocations/${first.id}`)
      .set(as())
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('allocation_started'));
    const { employee: other } = await kit.hire(g);
    const later = (
      await allocate(b.id, { employeeId: other.id, percent: 10, fromOn: '2030-01-01' })
    ).body as AllocationView;
    await api(app).delete(`/tenant/allocations/${later.id}`).set(as()).expect(204);

    // Closing ends the shares still running and removes those still to come.
    const running = (
      await allocate(b.id, { employeeId: other.id, percent: 50, fromOn: '2026-01-01' })
    ).body as AllocationView;
    await allocate(b.id, { employeeId: other.id, percent: 25, fromOn: '2031-01-01' });
    const closed = (await api(app).post(`/tenant/projects/${b.id}/close`).set(as()).expect(200))
      .body as ProjectView;
    const today = todayIn();
    expect(closed).toMatchObject({ status: 'closed', endsOn: today });
    const left = await allocationsOf(b.id);
    expect(left.find((x) => x.id === running.id)?.toOn).toBe(today);
    expect(left.some((x) => x.fromOn === '2031-01-01')).toBe(false);
    const refused = await allocate(
      b.id,
      { employeeId: other.id, percent: 10, fromOn: '2026-02-01', toOn: '2026-02-28' },
      409,
    );
    expect(refused.body.code).toBe('project_closed');
    // Its period still holds its shares.
    await api(app)
      .patch(`/tenant/projects/${b.id}`)
      .set(as())
      .send({ startsOn: '2026-02-01' })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('allocation_outside_project'));
  });

  it('charges a share starting mid-month by its days, and splits the journal by project', async () => {
    const g = await kit.group();
    const { employee: shared } = await kit.hire(g);
    const { employee: unit } = await kit.hire(g);
    const water = await project();
    const health = await project({ name: 'Mother and child health' });
    // 60% from 16 June is 15 of June's 30 days: 30%. 40% all month: 40%. The rest, 30%, stays
    // with the person's unit.
    await allocate(water.id, { employeeId: shared.id, percent: 60, fromOn: '2026-06-16' });
    await allocate(health.id, {
      employeeId: shared.id,
      percent: 40,
      costKind: 'admin',
      fromOn: '2026-06-01',
    });
    const run = await lockedRun(g, '2026-06');
    const pay = await costOf(run.id, shared.id);
    const cost = pay.earnings + pay.employerCost;
    // June is posted by these shares now: they can neither grow nor end within it.
    const late = await allocate(
      health.id,
      { employeeId: shared.id, percent: 10, fromOn: '2026-06-20', toOn: '2026-07-31' },
      409,
    );
    expect(late.body.code).toBe('allocation_pay_locked');
    const waterShare = (await allocationsOf(water.id)).find((a) => a.employee.id === shared.id)!;
    const ended = await api(app)
      .post(`/tenant/allocations/${waterShare.id}/end`)
      .set(as())
      .send({ toOn: '2026-06-25' })
      .expect(409);
    expect(ended.body.code).toBe('allocation_pay_locked');
    await api(app)
      .post(`/tenant/allocations/${waterShare.id}/end`)
      .set(as())
      .send({ toOn: '2026-07-15' })
      .expect(200);

    const journal = (
      await api(app).get(`/tenant/payroll/runs/${run.id}/files/journal`).set(as()).expect(200)
    ).text;
    const [heading, ...lines] = journal.trim().split('\n');
    expect(heading).toBe('Date,Account,Cost centre,Project,Description,Debit,Credit,Reference');
    const rows = lines.map((r) => r.split(','));
    const debit = rows.reduce((s, r) => s + Number(r[5] || 0), 0);
    const credit = rows.reduce((s, r) => s + Number(r[6] || 0), 0);
    expect(debit).toBeCloseTo(credit, 2);
    // Salary expense adds up to the people's whole cost, split or not.
    const expense = rows.filter((r) => r[1] === '5100');
    const whole = await costOf(run.id, unit.id);
    expect(expense.reduce((s, r) => s + amount(r), 0)).toBeCloseTo(
      cost + whole.earnings + whole.employerCost,
      2,
    );
    const charged = (code: string) =>
      expense.filter((r) => r[3] === code).reduce((s, r) => s + amount(r), 0);
    near(charged(water.code), cost * 0.3);
    near(charged(health.code), cost * 0.4);
    expect(new Set(rows.map((r) => r[3]))).toEqual(new Set(['', water.code, health.code]));
    // What is owed is not split.
    expect(rows.filter((r) => r[1] === '2100').every((r) => r[3] === '')).toBe(true);

    // The cost summary by project: the same split, the rest under no project.
    const summary = (
      await api(app)
        .get('/tenant/payroll/reports/summary?month=2026-06&by=project')
        .set(as())
        .expect(200)
    ).body as CostSummary;
    const row = (key: string) => summary.rows.find((r) => r.key === key)!;
    expect(row(water.id)).toMatchObject({ label: `${water.code} · ${water.name}`, headcount: 1 });
    near(Number(row(water.id).cost), cost * 0.3);
    near(Number(row(health.id).cost), cost * 0.4);
    expect(row('none')).toMatchObject({ label: 'Not charged to a project' });
    expect(row('none').headcount).toBeGreaterThanOrEqual(2);
    const byUnit = (
      await api(app)
        .get('/tenant/payroll/reports/summary?month=2026-06&by=unit')
        .set(as())
        .expect(200)
    ).body as CostSummary;
    expect(summary.total.cost).toBe(byUnit.total.cost);
    expect(summary.total.headcount).toBe(byUnit.total.headcount);

    // The project's month: one person, 0.3 of a full-time post, charged on the plan.
    const report = await costs(water.id, '2026-06', '2026-06');
    expect(report.months[0]).toMatchObject({
      month: '2026-06',
      people: 1,
      fte: '0.30',
      basis: { timesheet: 0, planned: 1 },
      unlocked: false,
      admin: '0.00',
    });
    near(Number(report.months[0]!.earnings), pay.earnings * 0.3);
    expect(report.months[0]!.programme).toBe(report.months[0]!.total);
    expect((await costs(health.id, '2026-06', '2026-06')).months[0]).toMatchObject({
      fte: '0.40',
      programme: '0.00',
    });
  });

  it('charges on an approved timesheet over the plan, and makes the donor schedule', async () => {
    const g = await kit.group();
    const { employee } = await kit.hire(g);
    const d = await donor({ name: 'Delta Health Fund' });
    const main = await project({
      donorId: d.id,
      grantReference: 'DHF-88',
      fd6ApprovalNo: 'FD6-2026-12',
      fd6ApprovedOn: '2025-12-15',
    });
    const side = await project({ name: 'Side work' });
    await allocate(main.id, { employeeId: employee.id, percent: 100, fromOn: '2026-01-01' });
    // May's approved timesheet: 48 hours on the main project, 16 on the side one (no planned
    // share there) and 16 not on any project.
    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    let sheetId: string;
    try {
      sheetId = await runAsTenant(db, tenantId, async (tx) => {
        const [sheet] = await tx
          .insert(timesheets)
          .values({
            tenantId,
            employeeId: employee.id,
            month: '2026-05-01',
            status: 'approved',
            submittedAt: new Date('2026-06-01T04:00:00Z'),
            decidedAt: new Date('2026-06-02T04:00:00Z'),
          })
          .returning();
        await tx.insert(timesheetEntries).values(
          [
            ...[3, 4, 5, 6, 7, 10].map((n) => ({ projectId: main.id, date: may(n) })),
            ...[11, 12].map((n) => ({ projectId: side.id, date: may(n) })),
            ...[13, 14].map((n) => ({ projectId: null, date: may(n) })),
          ].map((e) => ({
            ...e,
            tenantId,
            timesheetId: sheet!.id,
            employeeId: employee.id,
            hours: '8',
          })),
        );
        return sheet!.id;
      });
    } finally {
      await pool.end();
    }
    const run = await lockedRun(g, '2026-05');
    const pay = await costOf(run.id, employee.id);

    const report = await costs(main.id, '2026-05', '2026-05');
    expect(report.months[0]).toMatchObject({
      people: 1,
      fte: '0.60',
      basis: { timesheet: 1, planned: 0 },
    });
    near(Number(report.months[0]!.earnings), pay.earnings * 0.6);
    expect((await costs(side.id, '2026-05', '2026-05')).months[0]).toMatchObject({
      fte: '0.20',
      basis: { timesheet: 1, planned: 0 },
    });

    const sheets = (
      await api(app)
        .get(`/tenant/projects/${main.id}/timesheets?from=2026-05&to=2026-05`)
        .set(as())
        .expect(200)
    ).body as ProjectTimesheetRef[];
    expect(sheets).toEqual([
      expect.objectContaining({
        id: sheetId!,
        employee: expect.objectContaining({ id: employee.id }),
        month: '2026-05',
        hours: '80.00',
        projectHours: '48.00',
      }),
    ]);

    const schedule = await api(app)
      .get(`/tenant/projects/${main.id}/donor-report?from=2026-04&to=2026-05&format=csv`)
      .set(as())
      .expect(200);
    expect(schedule.headers['content-type']).toContain('text/csv');
    const [heading, ...rows] = schedule.text.trim().split('\n');
    expect(heading).toBe(
      'Employee code,Name,Designation,Month,Basis,Share %,Hours on project,Gross charged,Employer cost charged,Total charged',
    );
    expect(rows).toHaveLength(1);
    const cells = rows[0]!.split(',');
    expect(cells.slice(0, 7)).toEqual([
      employee.employeeCode,
      employee.fullName,
      expect.any(String),
      '2026-05',
      'timesheet',
      '60.00',
      '48.00',
    ]);
    near(Number(cells[7]), pay.earnings * 0.6);
    expect(Number(cells[9])).toBeCloseTo(Number(cells[7]) + Number(cells[8]), 2);
    expect(Number(cells[9])).toBeCloseTo(Number(report.months[0]!.total), 2);

    for (const language of ['en', 'bn']) {
      const pdf = await binary(
        api(app)
          .get(
            `/tenant/projects/${main.id}/donor-report?from=2026-05&to=2026-05&format=pdf&language=${language}`,
          )
          .set(as())
          .expect(200),
      );
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
  });

  it('adds up a project against its budgets and warns when administration passes the cap', async () => {
    const g = await kit.group();
    const { employee } = await kit.hire(g);
    // The cap is 20% of the approved 50,000: 10,000 (FDVA 2016 s.6).
    const p = await project({
      startsOn: '2026-02-01',
      approvedBudget: '50000',
      staffBudget: '30000',
      fd6ApprovalNo: 'FD6-2026-30',
    });
    await allocate(p.id, {
      employeeId: employee.id,
      percent: 50,
      costKind: 'admin',
      fromOn: '2026-02-01',
    });
    const feb = await lockedRun(g, '2026-02');
    const mar = await lockedRun(g, '2026-03');
    // April is worked out but not locked yet, so not counted.
    const apr = await kit.run(g, '2026-04');
    await kit.compute(apr.id);
    const monthly = async (runId: string) => {
      const c = await costOf(runId, employee.id);
      return (c.earnings + c.employerCost) / 2;
    };
    const spent = (await monthly(feb.id)) + (await monthly(mar.id));

    const report = await costs(p.id, '2026-03', '2026-04');
    expect(report.months.map((m) => [m.month, m.people, m.unlocked])).toEqual([
      ['2026-03', 1, false],
      ['2026-04', 0, true],
    ]);
    near(Number(report.total.total), await monthly(mar.id));
    // Since the start: February too.
    near(Number(report.cumulative.total), spent);
    expect(report.cumulative.admin).toBe(report.cumulative.total);
    expect(report.cumulative).toMatchObject({ staffBudget: '30000.00', overStaffBudget: false });
    expect(report.adminCap).toMatchObject({
      percent: 20,
      cap: '10000.00',
      approvedBudget: '50000.00',
      over: spent > 10000,
      reference: {
        act: 'Foreign Donations (Voluntary Activities) Regulation Act 2016',
        section: '6',
      },
      status: 'needs_review',
    });
    expect(spent).toBeGreaterThan(10000);
    near(report.adminCap!.used, (spent / 50000) * 100, 0.01);

    // A warning, never a block: more administration can still be charged.
    const { employee: more } = await kit.hire(g);
    await allocate(p.id, {
      employeeId: more.id,
      percent: 10,
      costKind: 'admin',
      fromOn: '2026-05-01',
    });
  });
});
