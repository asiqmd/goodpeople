import {
  createDb,
  payrollRunItems,
  runAsTenant,
  SEED_EMPLOYEE_EMAIL,
  SEED_FINANCE_EMAIL,
  tenants,
} from '@gp/db';
import type {
  ApprovalItem,
  EmployeeAttendanceView,
  EmployeeDetail,
  NotificationInbox,
  OrgSnapshot,
  PayGroupView,
  PayRecordView,
  PayrollRunItemPage,
  PayrollRunItemView,
  PayrollRunView,
  PayslipSummary,
  SalaryStructureView,
} from '@gp/shared';
import { todayIn } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Test } from 'supertest';
import { loginAs } from './leave-helpers.js';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const itemOf = (list: PayrollRunItemView[], employeeId: string) =>
  list.find((i) => i.employee.id === employeeId)!;
const isPdf = (body: Buffer) => body.subarray(0, 4).toString() === '%PDF';
const binary = (req: Test) =>
  req.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

describe('payroll runs', () => {
  let app: INestApplication;
  let admin: string;
  let finance: string;
  let org: OrgSnapshot;
  let rmg: SalaryStructureView;
  let seq = 0;

  beforeAll(async () => {
    app = await bootApp();
    admin = (await tenantLogin(app, 'my-group')).accessToken;
    finance = await loginAs(app, SEED_FINANCE_EMAIL);
    org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200)).body;
    rmg = (
      (await api(app).get('/tenant/payroll/structures').set(bearer(admin)).expect(200))
        .body as SalaryStructureView[]
    ).find((s) => s.code === 'RMG_WORKER')!;
  });
  afterAll(() => app.close());

  const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase();

  async function group(frequency = 'monthly') {
    return (
      await api(app)
        .post('/tenant/payroll/pay-groups')
        .set(bearer(admin))
        .send({ code: `G${unique()}`.slice(0, 30), name: `Test group ${seq}`, frequency })
        .expect(201)
    ).body as PayGroupView;
  }

  /** Hires someone and gives them approved RMG pay in a group (admin proposes, finance approves). */
  async function worker(
    payGroup: PayGroupView,
    { gross = '12500', grade = 'G5', joinedOn = '2026-01-01', login = false } = {},
  ) {
    const code = `R-${unique()}`;
    const email = `${code.toLowerCase()}@example.test`;
    const hired = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: code,
          fullName: `Run Test ${code}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1996-02-14',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${seq++}`.slice(-10) },
          joinedOn,
          job: {
            legalEntityId: ref(org.legalEntities, 'MGT'),
            locationId: ref(org.locations, 'GZP'),
            orgUnitId: ref(org.orgUnits, 'MGT-L1'),
            designationId: ref(org.designations, 'SO'),
            gradeId: ref(org.grades, 'W5'),
            employmentType: 'permanent',
            workerCategory: 'worker',
          },
          ...(login
            ? { portalAccess: { email, role: 'employee', password: testEnv().password } }
            : {}),
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    await pay(hired.id, payGroup, { gross, grade, from: joinedOn });
    const token = login
      ? ((
          await api(app)
            .post('/auth/login')
            .send({ tenant: 'my-group', email, password: testEnv().password })
            .expect(200)
        ).body.accessToken as string)
      : null;
    return { employee: hired, token };
  }

  async function pay(
    employeeId: string,
    payGroup: PayGroupView,
    { gross = '12500', grade = 'G5', from = '2026-01-01' },
  ) {
    const proposed = (
      await api(app)
        .post(`/tenant/employees/${employeeId}/pay`)
        .set(bearer(admin))
        .send({
          effectiveFrom: from,
          structureId: rmg.id,
          payGroupId: payGroup.id,
          amount: gross,
          wageGrade: grade,
          reason: 'Test pay',
        })
        .expect(201)
    ).body as PayRecordView;
    // Without maker-checker the change applies at once.
    if (!proposed.steps[0]) return;
    await api(app)
      .post(`/tenant/approvals/${proposed.steps[0].id}/approve`)
      .set(bearer(finance))
      .send({})
      .expect(201);
  }

  const run = async (payGroup: PayGroupView, month: string) =>
    (
      await api(app)
        .post('/tenant/payroll/runs')
        .set(bearer(admin))
        .send({ payGroupId: payGroup.id, month })
        .expect(201)
    ).body as PayrollRunView;
  const compute = async (id: string) =>
    (await api(app).post(`/tenant/payroll/runs/${id}/compute`).set(bearer(admin)).expect(200))
      .body as PayrollRunView;
  const page = async (id: string, query = '') =>
    (await api(app).get(`/tenant/payroll/runs/${id}/items?${query}`).set(bearer(admin)).expect(200))
      .body as PayrollRunItemPage;
  const items = async (id: string) => (await page(id, 'size=500')).items;

  /** Submits as the admin and approves as the finance officer. */
  async function lock(id: string) {
    const submitted = (
      await api(app).post(`/tenant/payroll/runs/${id}/submit`).set(bearer(admin)).expect(200)
    ).body as PayrollRunView;
    await api(app)
      .post(`/tenant/approvals/${submitted.steps[0]!.id}/approve`)
      .set(bearer(finance))
      .send({})
      .expect(201);
  }

  it('computes a month, needs a second person, locks and publishes payslips', async () => {
    const g = await group();
    const a = await worker(g, { login: true });
    const b = await worker(g, { gross: '14150', grade: 'G2' });
    const joiner = await worker(g, { joinedOn: '2026-08-16' });

    const created = await run(g, '2026-08');
    expect(created).toMatchObject({
      status: 'draft',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      kind: 'regular',
    });
    // Before the seventh working day of September (Fridays off).
    expect(created.paymentDue > '2026-08-31' && created.paymentDue <= '2026-09-12').toBe(true);
    expect(created.paymentDate).toBe(created.paymentDue);
    await api(app)
      .post('/tenant/payroll/runs')
      .set(bearer(admin))
      .send({ payGroupId: g.id, month: '2026-08' })
      .expect(409);

    const computed = await compute(created.id);
    expect(computed).toMatchObject({ status: 'computed', headcount: 3, errors: 0 });
    let list = await items(created.id);
    expect(itemOf(list, a.employee.id)).toMatchObject({ net: '12500.00', status: 'ok' });
    expect(itemOf(list, b.employee.id).net).toBe('14150.00');
    // 16 of 31 days, the lines adding up to the prorated gross.
    expect(itemOf(list, joiner.employee.id)).toMatchObject({
      net: '6452.00',
      variables: { employedDays: 16 },
    });
    expect(computed.totals).toEqual({
      earnings: '33102.00',
      deductions: '0.00',
      net: '33102.00',
      employerCost: '0.00',
    });

    // An advance to recover: the run goes back to draft until computed again.
    await api(app)
      .put(`/tenant/payroll/runs/${created.id}/inputs`)
      .set(bearer(admin))
      .send({
        employeeId: a.employee.id,
        component: 'ADVANCE',
        amount: '2000',
        note: 'August advance',
      })
      .expect(204);
    expect(
      (await api(app).get(`/tenant/payroll/runs/${created.id}`).set(bearer(admin))).body.status,
    ).toBe('draft');
    await api(app).post(`/tenant/payroll/runs/${created.id}/submit`).set(bearer(admin)).expect(409);
    await compute(created.id);
    list = await items(created.id);
    expect(itemOf(list, a.employee.id)).toMatchObject({
      net: '10500.00',
      inputs: { ADVANCE: '2000.00' },
    });

    const submitted = (
      await api(app)
        .post(`/tenant/payroll/runs/${created.id}/submit`)
        .set(bearer(admin))
        .expect(200)
    ).body as PayrollRunView;
    expect(submitted.status).toBe('pending');
    const stepId = submitted.steps[0]!.id;
    const own = await api(app)
      .post(`/tenant/approvals/${stepId}/approve`)
      .set(bearer(admin))
      .send({})
      .expect(403);
    expect(own.body.code).toBe('own_change');
    const inbox = (await api(app).get('/tenant/approvals').set(bearer(finance)).expect(200))
      .body as ApprovalItem[];
    const item = inbox.find((i) => i.subjectType === 'payroll_run' && i.run.id === created.id);
    expect(item).toMatchObject({ kind: 'payroll', run: { headcount: 3 } });
    await api(app)
      .post(`/tenant/approvals/${stepId}/approve`)
      .set(bearer(finance))
      .send({})
      .expect(201);

    const locked = (await api(app).get(`/tenant/payroll/runs/${created.id}`).set(bearer(admin)))
      .body as PayrollRunView;
    expect(locked).toMatchObject({ status: 'locked', decidedBy: expect.any(String) });
    // Locked means locked.
    expect(
      (
        await api(app)
          .post(`/tenant/payroll/runs/${created.id}/compute`)
          .set(bearer(admin))
          .expect(409)
      ).body.code,
    ).toBe('run_not_open');
    await api(app)
      .put(`/tenant/payroll/runs/${created.id}/inputs`)
      .set(bearer(admin))
      .send({ employeeId: a.employee.id, component: 'ARREARS', amount: '1' })
      .expect(409);
    await api(app).post(`/tenant/payroll/runs/${created.id}/cancel`).set(bearer(admin)).expect(409);

    // HR reads payslips at once; the employee only after publishing.
    const itemId = itemOf(list, a.employee.id).id;
    const hrPdf = await binary(
      api(app)
        .get(`/tenant/payroll/runs/${created.id}/items/${itemId}/payslip?language=bn`)
        .set(bearer(admin)),
    ).expect(200);
    expect(isPdf(hrPdf.body as Buffer)).toBe(true);
    expect(
      (await api(app).get('/tenant/me/payslips').set(bearer(a.token!)).expect(200)).body,
    ).toEqual([]);
    await api(app).get(`/tenant/me/payslips/${itemId}`).set(bearer(a.token!)).expect(404);

    await api(app)
      .post(`/tenant/payroll/runs/${created.id}/publish`)
      .set(bearer(admin))
      .expect(200);
    await api(app)
      .post(`/tenant/payroll/runs/${created.id}/publish`)
      .set(bearer(admin))
      .expect(409);
    const mine = (await api(app).get('/tenant/me/payslips').set(bearer(a.token!)).expect(200))
      .body as PayslipSummary[];
    expect(mine).toEqual([
      expect.objectContaining({ itemId, net: '10500.00', periodStart: '2026-08-01' }),
    ]);
    for (const language of ['en', 'bn']) {
      const pdf = await binary(
        api(app).get(`/tenant/me/payslips/${itemId}?language=${language}`).set(bearer(a.token!)),
      ).expect(200);
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
    // Someone else's payslip is not theirs to read.
    await api(app)
      .get(`/tenant/me/payslips/${itemOf(list, b.employee.id).id}`)
      .set(bearer(a.token!))
      .expect(404);
    const told = (await api(app).get('/tenant/notifications').set(bearer(a.token!)).expect(200))
      .body as NotificationInbox;
    expect(told.items[0]).toMatchObject({
      event: 'payslip.published',
      title: 'Your payslip for August 2026 is ready',
    });
    expect(told.items[0]!.body).not.toContain('10');

    // Results are encrypted at rest.
    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
      const [row] = await runAsTenant(db, tenant!.id, (tx) =>
        tx.select().from(payrollRunItems).where(eq(payrollRunItems.id, itemId)),
      );
      expect(row!.resultEnc).toMatch(/^v1:/);
      expect(row!.resultEnc).not.toContain('10500');
    } finally {
      await pool.end();
    }
  });

  it('pays a back-dated raise through an adjustment run', async () => {
    const g = await group();
    const a = await worker(g);
    const b = await worker(g);
    const july = await run(g, '2026-07');
    await compute(july.id);
    await lock(july.id);
    // Adjusting needs a locked regular run, and one adjustment at a time.
    await api(app)
      .post(`/tenant/payroll/runs/${july.id}/adjustments`)
      .set(bearer(admin))
      .send({})
      .expect(201);
    const second = await api(app)
      .post(`/tenant/payroll/runs/${july.id}/adjustments`)
      .set(bearer(admin))
      .send({})
      .expect(409);
    expect(second.body.code).toBe('adjustment_open');
    const open = (
      (await api(app).get('/tenant/payroll/runs').set(bearer(admin))).body as PayrollRunView[]
    ).find((r) => r.parentRunId === july.id)!;
    // With nothing changed, nobody is owed anything.
    expect((await compute(open.id)).headcount).toBe(0);
    await api(app).post(`/tenant/payroll/runs/${open.id}/cancel`).set(bearer(admin)).expect(204);

    // A raise to grade 4 from 1 July, approved after July was paid.
    await pay(a.employee.id, g, { gross: '13025', grade: 'G4', from: '2026-07-01' });
    const adjustment = (
      await api(app)
        .post(`/tenant/payroll/runs/${july.id}/adjustments`)
        .set(bearer(admin))
        .send({ employeeIds: [a.employee.id, b.employee.id] })
        .expect(201)
    ).body as PayrollRunView;
    expect(adjustment).toMatchObject({
      kind: 'adjustment',
      parentRunId: july.id,
      periodStart: '2026-07-01',
    });
    const computed = await compute(adjustment.id);
    expect(computed.headcount).toBe(1);
    const [owed] = await items(adjustment.id);
    expect(owed!.employee.id).toBe(a.employee.id);
    expect(Object.fromEntries(owed!.lines.map((l) => [l.code, l.amount]))).toEqual({
      BASIC: '350.00',
      HOUSE_RENT: '175.00',
    });
    expect(owed!.net).toBe('525.00');
    await lock(adjustment.id);
    // Paid now, so a further adjustment owes nothing more.
    const again = (
      await api(app)
        .post(`/tenant/payroll/runs/${july.id}/adjustments`)
        .set(bearer(admin))
        .send({})
        .expect(201)
    ).body as PayrollRunView;
    expect((await compute(again.id)).headcount).toBe(0);
    expect(
      (
        await api(app)
          .post(`/tenant/payroll/runs/${again.id}/submit`)
          .set(bearer(admin))
          .expect(400)
      ).body.code,
    ).toBe('run_empty');
  });

  it('flags people whose pay changed a lot since last month', async () => {
    const g = await group();
    const a = await worker(g);
    const b = await worker(g);
    const may = await run(g, '2026-05');
    await compute(may.id);
    await lock(may.id);
    const june = await run(g, '2026-06');
    await api(app)
      .put(`/tenant/payroll/runs/${june.id}/inputs`)
      .set(bearer(admin))
      .send({ employeeId: a.employee.id, component: 'FESTIVAL_BONUS', amount: '6700' })
      .expect(204);
    const computed = await compute(june.id);
    expect(computed.flagged).toBe(1);
    const list = await items(june.id);
    expect(itemOf(list, a.employee.id)).toMatchObject({
      flagged: true,
      variance: 'up',
      previousNet: '12500.00',
      variancePercent: 53.6,
    });
    expect(itemOf(list, b.employee.id)).toMatchObject({ flagged: false, variance: 'same' });

    // HR narrows a large run to the people who need a look, a page at a time.
    const flagged = await page(june.id, 'show=flagged');
    expect(flagged).toMatchObject({ total: 1, page: 1, size: 50 });
    expect(flagged.items.map((i) => i.employee.id)).toEqual([a.employee.id]);
    const found = await page(june.id, `search=${b.employee.employeeCode.toLowerCase()}`);
    expect(found.items.map((i) => i.employee.id)).toEqual([b.employee.id]);
    const second = await page(june.id, 'size=1&page=2');
    expect(second).toMatchObject({ total: 2, page: 2 });
    expect(second.items).toHaveLength(1);
    expect((await page(june.id, 'show=errors')).total).toBe(0);
    await api(app)
      .get(`/tenant/payroll/runs/${june.id}/items?size=501`)
      .set(bearer(admin))
      .expect(400);
  });

  it('keeps people with problems out of an approval', async () => {
    const g = await group();
    const a = await worker(g);
    const april = await run(g, '2026-04');
    await api(app)
      .put(`/tenant/payroll/runs/${april.id}/inputs`)
      .set(bearer(admin))
      .send({ employeeId: a.employee.id, component: 'ADVANCE', amount: '20000' })
      .expect(204);
    const computed = await compute(april.id);
    expect(computed.errors).toBe(1);
    expect((await items(april.id))[0]!.problems).toEqual([
      expect.objectContaining({ code: 'negative_net', severity: 'error' }),
    ]);
    expect(
      (
        await api(app)
          .post(`/tenant/payroll/runs/${april.id}/submit`)
          .set(bearer(admin))
          .expect(400)
      ).body.code,
    ).toBe('run_has_errors');

    await api(app)
      .put(`/tenant/payroll/runs/${april.id}/inputs`)
      .set(bearer(admin))
      .send({ employeeId: a.employee.id, component: 'BASIC', amount: '1' })
      .expect(400);
    await api(app).post(`/tenant/payroll/runs/${april.id}/cancel`).set(bearer(admin)).expect(204);
    // A cancelled run frees the month for a new one.
    await run(g, '2026-04');

    const weekly = await group('weekly');
    expect(
      (
        await api(app)
          .post('/tenant/payroll/runs')
          .set(bearer(admin))
          .send({ payGroupId: weekly.id, month: '2026-04' })
          .expect(400)
      ).body.code,
    ).toBe('weekly_runs_later');
  });

  it('reads overtime, absence and missing punches from processed attendance', async () => {
    await api(app)
      .post('/tenant/attendance/process')
      .set(bearer(admin))
      .send({ from: '2026-10-01', to: '2026-10-31' })
      .expect(201);
    const groups = (await api(app).get('/tenant/payroll/pay-groups').set(bearer(admin)))
      .body as PayGroupView[];
    const monthly = groups.find((x) => x.code === 'MONTHLY')!;
    const runs = (await api(app).get('/tenant/payroll/runs').set(bearer(admin)))
      .body as PayrollRunView[];
    const october =
      runs.find(
        (r) =>
          r.payGroup.id === monthly.id &&
          r.periodStart === '2026-10-01' &&
          r.status !== 'cancelled',
      ) ?? (await run(monthly, '2026-10'));
    await compute(october.id);
    const rahima = (await api(app).get('/tenant/employees?search=MG-0005').set(bearer(admin))).body
      .items[0];
    const item = itemOf(await items(october.id), rahima.id);
    // Freshly processed, the run sees the days HR sees, whatever other tests corrected.
    const { range } = (
      await api(app)
        .get(`/tenant/employees/${rahima.id}/attendance?from=2026-10-01&to=2026-10-31`)
        .set(bearer(admin))
        .expect(200)
    ).body as EmployeeAttendanceView;
    const count = (status: string) => range.days.filter((d) => d.status === status).length;
    const absent = count('absent') + count('half_day') / 2;
    const otMinutes = range.days.reduce((sum, d) => sum + d.overtimeMinutes, 0);
    // Seeded: absent on 15 October and working late on 13 October.
    expect(absent).toBeGreaterThanOrEqual(1);
    expect(otMinutes).toBeGreaterThan(0);
    expect(item.variables).toMatchObject({
      absentDays: absent,
      otHours: Math.round((otMinutes / 60) * 100) / 100,
    });
    const lines = Object.fromEntries(item.lines.map((l) => [l.code, l.amount]));
    expect(lines.ABSENCE).toBe(`${Math.round((8500 / 30) * absent)}.00`);
    expect(lines.OVERTIME).toBe(`${Math.round((8500 * 2 * item.variables.otHours) / 208)}.00`);
    const codes = item.problems.map((p) => p.code);
    expect(codes.includes('period_not_over')).toBe(todayIn() <= '2026-10-31');
    // Until 05:00 yesterday is still open for punches, so it may be waiting to be processed.
    const waiting = range.days.filter((d) => d.status === 'pending' && d.date < todayIn());
    expect(codes.includes('not_processed')).toBe(waiting.length > 0);
    expect(codes.includes('missing_punches')).toBe(count('missing_punch') > 0);
  });

  it('shows runs only to payroll roles', async () => {
    const hrOfficer = await (async () => {
      const email = `hro-${unique().toLowerCase()}@example.test`;
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({ name: 'HR officer', email, role: 'hr_officer', password: testEnv().password })
        .expect(201);
      return (
        await api(app)
          .post('/auth/login')
          .send({ tenant: 'my-group', email, password: testEnv().password })
          .expect(200)
      ).body.accessToken as string;
    })();
    await api(app).get('/tenant/payroll/runs').set(bearer(hrOfficer)).expect(403);
    const rahima = await loginAs(app, SEED_EMPLOYEE_EMAIL);
    await api(app).get('/tenant/payroll/runs').set(bearer(rahima)).expect(403);
    await api(app).get('/tenant/me/payslips').set(bearer(rahima)).expect(200);
    const trial = (await tenantLogin(app, 'trial-co')).accessToken;
    await api(app).get('/tenant/me/payslips').set(bearer(trial)).expect(403);
  });

  it('locks at once where maker-checker is off', async () => {
    await api(app)
      .patch('/tenant/payroll/settings')
      .set(bearer(admin))
      .send({ makerChecker: false })
      .expect(200);
    try {
      const g = await group();
      await worker(g);
      const march = await run(g, '2026-03');
      await compute(march.id);
      const submitted = (
        await api(app)
          .post(`/tenant/payroll/runs/${march.id}/submit`)
          .set(bearer(admin))
          .expect(200)
      ).body as PayrollRunView;
      expect(submitted).toMatchObject({ status: 'locked', steps: [] });
    } finally {
      await api(app)
        .patch('/tenant/payroll/settings')
        .set(bearer(admin))
        .send({ makerChecker: true })
        .expect(200);
    }
  });
});
