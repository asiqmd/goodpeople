import { SEED_FINANCE_EMAIL } from '@gp/db';
import type {
  ApprovalItem,
  EmployeeDetail,
  LoanView,
  NotificationInbox,
  OrgSnapshot,
  PayBatchPreview,
  PayBatchView,
  PayGroupView,
  PayRecordView,
  PayrollRunItemPage,
  PayrollRunItemView,
  PayrollRunView,
  PfStatement,
  SalaryStructureView,
  TaxDeclarationView,
  TaxYearView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import type { Test } from 'supertest';
import { loginAs } from './leave-helpers.js';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const isPdf = (body: Buffer) => body.subarray(0, 4).toString() === '%PDF';
const binary = (req: Test) =>
  req.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });
const line = (item: PayrollRunItemView, code: string) =>
  item.lines.find((l) => l.code === code)?.amount;

describe('tax, provident fund, loans, increments and bonuses', () => {
  let app: INestApplication;
  let admin: string;
  let finance: string;
  let org: OrgSnapshot;
  let structures: SalaryStructureView[];
  let seq = 0;

  beforeAll(async () => {
    app = await bootApp();
    admin = (await tenantLogin(app, 'my-group')).accessToken;
    finance = await loginAs(app, SEED_FINANCE_EMAIL);
    org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200)).body;
    structures = (await api(app).get('/tenant/payroll/structures').set(bearer(admin)).expect(200))
      .body;
  });
  afterAll(() => app.close());

  const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase();
  const structure = (code: string) => structures.find((s) => s.code === code)!;

  async function group() {
    return (
      await api(app)
        .post('/tenant/payroll/pay-groups')
        .set(bearer(admin))
        .send({ code: `B${unique()}`.slice(0, 30), name: `Benefits ${seq}`, frequency: 'monthly' })
        .expect(201)
    ).body as PayGroupView;
  }

  /** Approves a waiting step as the finance officer. */
  const approve = (stepId: string) =>
    api(app).post(`/tenant/approvals/${stepId}/approve`).set(bearer(finance)).send({}).expect(201);

  async function hire(
    payGroup: PayGroupView,
    {
      gross = '12500',
      staff = false,
      joinedOn = '2024-01-01',
      religion = 'islam',
      tin = false,
      login = false,
    } = {},
  ) {
    const code = `T-${unique()}`;
    const email = `${code.toLowerCase()}@example.test`;
    const employee = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: code,
          fullName: `Benefit Test ${code}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1990-05-01',
          gender: 'male',
          religion,
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: {
            nid: `${Date.now()}${seq++}`.slice(-10),
            ...(tin ? { tin: `${Date.now()}${seq++}`.slice(-12) } : {}),
          },
          joinedOn,
          job: {
            legalEntityId: ref(org.legalEntities, 'MGT'),
            locationId: ref(org.locations, 'GZP'),
            orgUnitId: ref(org.orgUnits, 'MGT-L1'),
            designationId: ref(org.designations, 'SO'),
            gradeId: ref(org.grades, 'W5'),
            employmentType: 'permanent',
            workerCategory: staff ? 'staff' : 'worker',
          },
          ...(login
            ? { portalAccess: { email, role: 'employee', password: testEnv().password } }
            : {}),
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    const proposed = (
      await api(app)
        .post(`/tenant/employees/${employee.id}/pay`)
        .set(bearer(admin))
        .send({
          effectiveFrom: joinedOn,
          structureId: structure(staff ? 'STAFF' : 'RMG_WORKER').id,
          payGroupId: payGroup.id,
          amount: gross,
          ...(staff ? {} : { wageGrade: 'G5' }),
          reason: 'Test pay',
        })
        .expect(201)
    ).body as PayRecordView;
    await approve(proposed.steps[0]!.id);
    const token = login
      ? ((
          await api(app)
            .post('/auth/login')
            .send({ tenant: 'my-group', email, password: testEnv().password })
            .expect(200)
        ).body.accessToken as string)
      : null;
    return { employee, token };
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
  const items = async (id: string) =>
    (
      (
        await api(app)
          .get(`/tenant/payroll/runs/${id}/items?size=500`)
          .set(bearer(admin))
          .expect(200)
      ).body as PayrollRunItemPage
    ).items;
  const itemOf = async (runId: string, employeeId: string) =>
    (await items(runId)).find((i) => i.employee.id === employeeId)!;
  async function lock(id: string) {
    const submitted = (
      await api(app).post(`/tenant/payroll/runs/${id}/submit`).set(bearer(admin)).expect(200)
    ).body as PayrollRunView;
    await approve(submitted.steps[0]!.id);
  }

  it('deducts salary tax from the year projected, with openings, declarations and a certificate', async () => {
    const g = await group();
    const { employee, token } = await hire(g, { gross: '100000', staff: true, login: true });
    // July to September came from the old payroll.
    await api(app)
      .put(`/tenant/employees/${employee.id}/tax/opening`)
      .set(bearer(admin))
      .send({ fiscalYear: '2026-27', salary: '300000', tax: '11250' })
      .expect(200);
    const october = await run(g, '2026-10');
    await compute(october.id);
    let item = await itemOf(october.id, employee.id);
    // 1,200,000 for the year → Tk 45,000; 33,750 left over October and eight more months.
    expect(item.tax).toMatchObject({ salary: 1_200_000, tax: 45_000, thisMonth: '3750.00' });
    expect(line(item, 'TAX')).toBe('3750.00');
    expect(item.problems.map((p) => p.code)).toContain('tin_missing');

    // A declared investment counts until payroll verifies it; then what payroll accepted.
    const declared = (
      await api(app)
        .put('/tenant/me/tax/declaration?fiscalYear=2026-27')
        .set(bearer(token!))
        .send({ items: [{ kind: 'dps', declared: '100000' }], submit: true })
        .expect(200)
    ).body as TaxDeclarationView;
    expect(declared).toMatchObject({ status: 'submitted', declared: '100000.00' });
    await compute(october.id);
    item = await itemOf(october.id, employee.id);
    // Rebate 10% of 100,000 → 35,000 a year; (35,000 − 11,250) ÷ 9.
    expect(item.tax).toMatchObject({ rebate: 10_000, tax: 35_000, thisMonth: '2639.00' });
    const list = (
      await api(app)
        .get('/tenant/payroll/tax/declarations?fiscalYear=2026-27')
        .set(bearer(admin))
        .expect(200)
    ).body as TaxDeclarationView[];
    expect(list.some((d) => d.employee.id === employee.id)).toBe(true);
    await api(app)
      .post(`/tenant/employees/${employee.id}/tax/declaration/verify?fiscalYear=2026-27`)
      .set(bearer(admin))
      .send({ verified: ['150000'] })
      .expect(400);
    await api(app)
      .post(`/tenant/employees/${employee.id}/tax/declaration/verify?fiscalYear=2026-27`)
      .set(bearer(admin))
      .send({ verified: ['80000'] })
      .expect(200);
    const again = await api(app)
      .put('/tenant/me/tax/declaration?fiscalYear=2026-27')
      .set(bearer(token!))
      .send({ items: [{ kind: 'dps', declared: '120000' }], submit: true })
      .expect(409);
    expect(again.body.code).toBe('declaration_verified');
    await compute(october.id);
    item = await itemOf(october.id, employee.id);
    expect(item.tax).toMatchObject({ rebate: 8_000, thisMonth: '2861.00' });

    // A disability raises the threshold to Tk 5.25 lakh.
    await api(app)
      .put(`/tenant/employees/${employee.id}/tax/profile`)
      .set(bearer(admin))
      .send({ disabled: true, freedomFighter: false, disabledDependants: 0, area: null })
      .expect(200);
    await compute(october.id);
    expect((await itemOf(october.id, employee.id)).tax!.threshold).toBe(525_000);
    await api(app)
      .put(`/tenant/employees/${employee.id}/tax/profile`)
      .set(bearer(admin))
      .send({ disabled: false, freedomFighter: false, disabledDependants: 0, area: null })
      .expect(200);
    await compute(october.id);

    await lock(october.id);
    const runTax = (
      await api(app).get(`/tenant/payroll/runs/${october.id}/tax`).set(bearer(admin)).expect(200)
    ).body;
    expect(runTax).toMatchObject({ tax: '2861.00', people: 1, deposit: null });
    await api(app)
      .put(`/tenant/payroll/runs/${october.id}/tax-deposit`)
      .set(bearer(admin))
      .send({ challanNo: 'A-2026-10-0042', depositedOn: '2026-11-12', amount: '2861' })
      .expect(200);

    // November's projection starts from what was paid.
    const november = await run(g, '2026-11');
    await compute(november.id);
    const nov = await itemOf(november.id, employee.id);
    expect(nov.tax).toMatchObject({ deductedBefore: '14111.00', monthsLeft: 8 });

    const year = (
      await api(app)
        .get(`/tenant/employees/${employee.id}/tax?fiscalYear=2026-27`)
        .set(bearer(admin))
        .expect(200)
    ).body as TaxYearView;
    expect(year).toMatchObject({
      salary: '400000.00',
      tax: '14111.00',
      opening: { salary: '300000.00', tax: '11250.00' },
      months: [{ month: '2026-10-01', tax: '2861.00', challanNo: 'A-2026-10-0042' }],
      declaration: { status: 'verified', verified: '80000.00' },
    });
    for (const [path, who] of [
      [`/tenant/employees/${employee.id}/tax/certificate?fiscalYear=2026-27&language=bn`, admin],
      ['/tenant/me/tax/certificate?fiscalYear=2026-27', token!],
    ] as const) {
      const pdf = await binary(api(app).get(path).set(bearer(who))).expect(200);
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
    // The employee reads only their own year.
    await api(app).get(`/tenant/employees/${employee.id}/tax`).set(bearer(token!)).expect(403);
    const register = await api(app)
      .get('/tenant/payroll/tax/register?fiscalYear=2026-27')
      .set(bearer(admin))
      .expect(200);
    expect(register.text).toContain(`${employee.employeeCode},`);
    expect(register.text.split('\n')[0]).toBe('Employee code,Name,TIN,Salary,Tax deducted');
  });

  it('runs the provident fund: contributions, interest, a loan from it and leaving', async () => {
    const before = (await api(app).get('/tenant/payroll/settings').set(bearer(admin)).expect(200))
      .body.pfEnabled as boolean;
    await api(app)
      .patch('/tenant/payroll/settings')
      .set(bearer(admin))
      .send({ pfEnabled: true, pfEmployeeRate: '7', pfEmployerRate: '7' })
      .expect(200);
    try {
      const g = await group();
      const { employee } = await hire(g, { joinedOn: '2025-01-01' });
      const { employee: other } = await hire(g, { joinedOn: '2025-01-01' });
      const joined = (
        await api(app)
          .post('/tenant/payroll/pf/members')
          .set(bearer(admin))
          .send({ employeeIds: [employee.id], joinedOn: '2026-01-01' })
          .expect(200)
      ).body;
      expect(joined).toEqual({ joined: 1 });

      const january = await run(g, '2026-01');
      await compute(january.id);
      const item = await itemOf(january.id, employee.id);
      expect(line(item, 'PF_EMPLOYEE')).toBe('469.00');
      expect(line(item, 'PF_EMPLOYER')).toBe('469.00');
      expect(line(await itemOf(january.id, other.id), 'PF_EMPLOYEE')).toBeUndefined();
      await lock(january.id);

      let statement = (
        await api(app)
          .get(`/tenant/payroll/pf/members/${employee.id}`)
          .set(bearer(admin))
          .expect(200)
      ).body as PfStatement;
      expect(statement.balance).toMatchObject({
        own: '469.00',
        employer: '469.00',
        total: '938.00',
      });
      expect(statement.entries.map((e) => [e.kind, e.account, e.amount])).toEqual([
        ['contribution', 'own', '469.00'],
        ['contribution', 'employer', '469.00'],
      ]);

      // A loan from the fund: no more than the member's own money, approved by another person.
      await api(app)
        .post('/tenant/payroll/loans')
        .set(bearer(admin))
        .send({
          employeeId: employee.id,
          kind: 'pf_loan',
          principal: '1000',
          installment: '200',
          startMonth: '2026-02',
          reason: 'Medical',
        })
        .expect(400);
      const loan = (
        await api(app)
          .post('/tenant/payroll/loans')
          .set(bearer(admin))
          .send({
            employeeId: employee.id,
            kind: 'pf_loan',
            principal: '400',
            installment: '200',
            startMonth: '2026-02',
            reason: 'Medical',
          })
          .expect(201)
      ).body as LoanView;
      await approve(loan.steps[0]!.id);
      const february = await run(g, '2026-02');
      await compute(february.id);
      expect(line(await itemOf(february.id, employee.id), 'PF_LOAN')).toBe('200.00');
      await lock(february.id);
      statement = (
        await api(app)
          .get(`/tenant/payroll/pf/members/${employee.id}`)
          .set(bearer(admin))
          .expect(200)
      ).body;
      // 938 + 938 contributed, 400 lent out, 200 back.
      expect(statement.balance).toMatchObject({ own: '738.00', employer: '938.00' });

      // Interest once a year, on each account's balance on the date: the loan went out today,
      // after the date, so the own account earns on 1,138.
      const interest = (
        await api(app)
          .post('/tenant/payroll/pf/interest')
          .set(bearer(admin))
          .send({ date: '2026-06-30', percent: '10' })
          .expect(200)
      ).body;
      expect(interest.members).toBeGreaterThanOrEqual(1);
      await api(app)
        .post('/tenant/payroll/pf/interest')
        .set(bearer(admin))
        .send({ date: '2026-06-30', percent: '10' })
        .expect(409);
      statement = (
        await api(app)
          .get(`/tenant/payroll/pf/members/${employee.id}`)
          .set(bearer(admin))
          .expect(200)
      ).body;
      expect(statement.balance).toMatchObject({ own: '852.00', employer: '1032.00' });

      // Leaving after 1.5 years: none of the employer's share is vested yet.
      statement = (
        await api(app)
          .post(`/tenant/payroll/pf/members/${employee.id}/leave`)
          .set(bearer(admin))
          .send({ leftOn: '2026-07-31' })
          .expect(200)
      ).body;
      expect(statement).toMatchObject({
        leftOn: '2026-07-31',
        balance: { own: '852.00', employer: '0.00', vestedPercent: 0, payable: '852.00' },
      });
      expect(statement.entries.find((e) => e.kind === 'forfeited')).toMatchObject({
        date: '2026-07-31',
        account: 'employer',
        amount: '-1032.00',
      });
    } finally {
      await api(app)
        .patch('/tenant/payroll/settings')
        .set(bearer(admin))
        .send({ pfEnabled: before })
        .expect(200);
    }
  });

  it('recovers an advance in installments once a second person approves it', async () => {
    const g = await group();
    const { employee } = await hire(g);
    const advance = (
      await api(app)
        .post('/tenant/payroll/loans')
        .set(bearer(admin))
        .send({
          employeeId: employee.id,
          kind: 'advance',
          principal: '5000',
          installment: '2500',
          startMonth: '2026-03',
          reason: 'Eid advance',
        })
        .expect(201)
    ).body as LoanView;
    expect(advance).toMatchObject({ status: 'pending', outstanding: '5000.00' });
    const own = await api(app)
      .post(`/tenant/approvals/${advance.steps[0]!.id}/approve`)
      .set(bearer(admin))
      .send({})
      .expect(403);
    expect(own.body.code).toBe('own_change');
    const inbox = (await api(app).get('/tenant/approvals').set(bearer(finance)).expect(200))
      .body as ApprovalItem[];
    expect(inbox.some((i) => i.subjectType === 'loan' && i.loan.id === advance.id)).toBe(true);
    await approve(advance.steps[0]!.id);

    // Not before its first month.
    const february = await run(g, '2026-02');
    await compute(february.id);
    expect(line(await itemOf(february.id, employee.id), 'ADVANCE')).toBeUndefined();
    const march = await run(g, '2026-03');
    await compute(march.id);
    expect(line(await itemOf(march.id, employee.id), 'ADVANCE')).toBe('2500.00');
    await lock(march.id);
    let loan = (
      await api(app).get(`/tenant/payroll/loans/${advance.id}`).set(bearer(admin)).expect(200)
    ).body as LoanView;
    expect(loan).toMatchObject({ status: 'active', repaid: '2500.00', outstanding: '2500.00' });

    await api(app)
      .post(`/tenant/payroll/loans/${advance.id}/repay`)
      .set(bearer(admin))
      .send({ amount: '3000', date: '2026-04-05' })
      .expect(400);
    loan = (
      await api(app)
        .post(`/tenant/payroll/loans/${advance.id}/repay`)
        .set(bearer(admin))
        .send({ amount: '2500', date: '2026-04-05', note: 'Paid in cash' })
        .expect(200)
    ).body;
    expect(loan).toMatchObject({ status: 'closed', outstanding: '0.00' });
    const april = await run(g, '2026-04');
    await compute(april.id);
    expect(line(await itemOf(april.id, employee.id), 'ADVANCE')).toBeUndefined();
  });

  it('gives an increment of basic to many people in one approval', async () => {
    const g = await group();
    const { employee } = await hire(g, { joinedOn: '2024-01-01' });
    const { employee: recent } = await hire(g, { joinedOn: '2026-06-01' });
    const body = {
      effectiveFrom: '2026-12-01',
      basis: 'basic',
      percent: '5',
      payGroupIds: [g.id],
      reason: 'Annual increment',
    };
    const preview = (
      await api(app)
        .post('/tenant/payroll/increments/preview')
        .set(bearer(admin))
        .send(body)
        .expect(200)
    ).body as PayBatchPreview;
    expect(preview.lines).toEqual([
      expect.objectContaining({
        employee: expect.objectContaining({ id: employee.id }),
        basicBefore: '6700.00',
        basicAfter: '7035.00',
        grossBefore: '12500.00',
        grossAfter: '13002.00',
      }),
    ]);
    expect(preview.skipped).toContainEqual(
      expect.objectContaining({
        employee: expect.objectContaining({ id: recent.id }),
        reason: 'not_eligible',
      }),
    );
    const batch = (
      await api(app).post('/tenant/payroll/increments').set(bearer(admin)).send(body).expect(201)
    ).body as PayBatchView;
    expect(batch).toMatchObject({ status: 'pending', people: 1 });
    expect(
      (await api(app).post('/tenant/payroll/increments').set(bearer(admin)).send(body).expect(409))
        .body.code,
    ).toBe('batch_pending');
    // Someone in a waiting batch has a change pending, so no other change is proposed for them.
    await api(app)
      .post(`/tenant/employees/${employee.id}/pay`)
      .set(bearer(admin))
      .send({
        effectiveFrom: '2026-12-01',
        structureId: structure('RMG_WORKER').id,
        payGroupId: g.id,
        amount: '14000',
        wageGrade: 'G5',
        reason: 'Promotion',
      })
      .expect(409);
    await approve(batch.steps[0]!.id);
    const pay = (
      await api(app).get(`/tenant/employees/${employee.id}/pay`).set(bearer(admin)).expect(200)
    ).body;
    // In force from December; today it is still the old pay.
    expect(pay.history[0]).toMatchObject({
      effectiveFrom: '2026-12-01',
      status: 'approved',
      gross: '13002.00',
    });
  });

  it('pays a festival bonus to those of the festival’s religion with a year’s service', async () => {
    const g = await group();
    const { employee: muslim, token } = await hire(g, { joinedOn: '2024-01-01', login: true });
    const { employee: hindu } = await hire(g, { joinedOn: '2024-01-01', religion: 'hinduism' });
    const { employee: recent } = await hire(g, { joinedOn: '2026-06-01' });
    const bonus = (
      await api(app)
        .post('/tenant/payroll/runs/bonus')
        .set(bearer(admin))
        .send({
          payGroupId: g.id,
          festival: 'Eid-ul-Fitr 2027',
          festivalBn: 'ঈদুল ফিতর ২০২৭',
          religions: ['islam'],
          cutOff: '2027-03-08',
        })
        .expect(201)
    ).body as PayrollRunView;
    expect(bonus).toMatchObject({
      kind: 'bonus',
      bonus: { festival: 'Eid-ul-Fitr 2027', percentOfBasic: 100 },
    });
    expect((await compute(bonus.id)).headcount).toBe(1);
    const [paid] = await items(bonus.id);
    expect(paid).toMatchObject({ employee: { id: muslim.id }, net: '6700.00' });
    expect(paid!.lines.map((l) => l.code)).toEqual(['FESTIVAL_BONUS']);
    expect([hindu.id, recent.id]).not.toContain(paid!.employee.id);
    await lock(bonus.id);
    await api(app).post(`/tenant/payroll/runs/${bonus.id}/publish`).set(bearer(admin)).expect(200);
    const told = (await api(app).get('/tenant/notifications').set(bearer(token!)).expect(200))
      .body as NotificationInbox;
    expect(told.items[0]).toMatchObject({ title: 'Your payslip for Eid-ul-Fitr 2027 is ready' });
    const pdf = await binary(
      api(app).get(`/tenant/me/payslips/${paid!.id}?language=bn`).set(bearer(token!)),
    ).expect(200);
    expect(isPdf(pdf.body as Buffer)).toBe(true);
  });

  it('says when the law requires a fund, and keeps its pages to payroll roles', async () => {
    const settings = (await api(app).get('/tenant/payroll/settings').set(bearer(admin)).expect(200))
      .body;
    expect(settings).toMatchObject({
      autoTax: true,
      pfRequired: { threshold: 100, required: false, permanentWorkers: expect.any(Number) },
    });
    const rahima = await loginAs(app, 'rahima@my-group.test');
    await api(app).get('/tenant/payroll/loans').set(bearer(rahima)).expect(403);
    await api(app).get('/tenant/payroll/pf/members').set(bearer(rahima)).expect(403);
    await api(app).get('/tenant/me/loans').set(bearer(rahima)).expect(200);
    await api(app).get('/tenant/me/pf').set(bearer(rahima)).expect(200);
    await api(app).get('/tenant/me/tax').set(bearer(rahima)).expect(200);
  });
});
