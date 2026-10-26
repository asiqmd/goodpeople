import type {
  PaymentCheckView,
  CostSummary,
  CostTrendPoint,
  ParallelRunsView,
  ReconciliationView,
  SetupChecklist,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { binary, isPdf, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp } from './test-env.js';

describe('payroll reports and parallel runs', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof payrollKit>>;

  beforeAll(async () => {
    app = await bootApp();
    kit = await payrollKit(app);
  });
  afterAll(() => app.close());

  const upload = (runId: string, file: Buffer, name: string, token = kit.admin) =>
    api(app)
      .post(`/tenant/payroll/runs/${runId}/reconciliations`)
      .set(bearer(token))
      .attach('file', file, name);
  const compare = async (id: string, mapping: ReconciliationView['mapping']) =>
    (
      await api(app)
        .post(`/tenant/payroll/reconciliations/${id}/compare`)
        .set(bearer(kit.admin))
        .send(mapping)
        .expect(200)
    ).body as ReconciliationView;

  it('compares a run with the current payroll, person by person', async () => {
    const g = await kit.group();
    const people = [];
    for (let i = 0; i < 3; i++) people.push((await kit.hire(g)).employee);
    const run = await kit.run(g, '2026-06');
    await kit.compute(run.id);
    const [a, b, c] = people.map((p) => p.employeeCode) as [string, string, string];

    // Their sheet has a title above the headings, Bangla digits in one place, B paid Tk 100
    // less, C missing and someone we do not have.
    const sheet = [
      'My Group Textiles — salary June 2026,,,,,,',
      'SL,Emp ID,Name,Basic,Gross Salary,OT Amount,Net Pay',
      `1,${a},Asha,"6,700",12500,0,"১২,৫০০.০০"`,
      `2,${b},Babul,6700,12500,0,12400`,
      `3,X-999,Someone else,6700,12500,0,12500`,
    ].join('\n');
    await upload(run.id, Buffer.from(sheet), 'june.csv', kit.finance).expect(403);
    const draft = (await upload(run.id, Buffer.from(sheet), 'june.csv').expect(201))
      .body as ReconciliationView;
    expect(draft).toMatchObject({ status: 'draft', rows: 3, summary: null });
    expect(draft.mapping).toEqual({
      employeeCode: 'Emp ID',
      name: 'Name',
      columns: { BASIC: 'Basic', GROSS: 'Gross Salary', OVERTIME: 'OT Amount', NET: 'Net Pay' },
    });
    await api(app)
      .post(`/tenant/payroll/reconciliations/${draft.id}/compare`)
      .set(bearer(kit.admin))
      .send({ employeeCode: 'Emp ID', columns: { NET: 'Take home' } })
      .expect(400);

    const result = await compare(draft.id, draft.mapping);
    expect(result).toMatchObject({
      status: 'differences',
      summary: { people: 4, matched: 1, differing: 1, onlyOurs: 1, onlyTheirs: 1 },
    });
    expect(result.differences.find((d) => d.employeeCode === b)).toMatchObject({
      status: 'differs',
      lines: [{ key: 'NET', ours: '12500.00', theirs: '12400.00', difference: '100.00' }],
    });
    expect(result.differences.find((d) => d.employeeCode === 'X-999')).toMatchObject({
      status: 'only_theirs',
      name: 'Someone else',
    });
    expect(result.columns.find((col) => col.key === 'BASIC')).toMatchObject({
      label: 'Basic salary',
      matched: 2,
      differing: 0,
    });
    const differences = await api(app)
      .get(`/tenant/payroll/reconciliations/${draft.id}/file`)
      .set(bearer(kit.finance))
      .expect(200);
    expect(differences.text).toContain(`${b},`);
    expect(differences.text).toContain('Net pay,12500.00,12400.00,100.00');

    // The corrected sheet, as Excel this time: every person matches to the taka.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('June');
    ws.addRow(['Emp ID', 'Name', 'Basic', 'Gross Salary', 'OT Amount', 'Net Pay']);
    for (const code of [a, b, c]) ws.addRow([code, 'x', 6700, 12500, 0, 12500.4]);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    const second = (await upload(run.id, xlsx, 'june.xlsx').expect(201)).body as ReconciliationView;
    // Last time's mapping is proposed again.
    expect(second.mapping).toEqual(draft.mapping);
    const matched = await compare(second.id, second.mapping);
    expect(matched).toMatchObject({
      status: 'matched',
      summary: { people: 3, matched: 3, differing: 0, onlyOurs: 0, onlyTheirs: 0 },
    });

    const parallel = (
      await api(app).get('/tenant/payroll/parallel-runs').set(bearer(kit.finance)).expect(200)
    ).body as ParallelRunsView;
    expect(parallel.required).toBe(3);
    expect(parallel.months.find((m) => m.runId === run.id)).toMatchObject({
      period: '2026-06',
      status: 'matched',
      reconciliationId: second.id,
    });
    const checklist = (await api(app).get('/tenant/setup-checklist').set(bearer(kit.admin)))
      .body as SetupChecklist;
    expect(checklist.steps.map((s) => s.key)).toEqual(
      expect.arrayContaining(['pay_records', 'payment_accounts', 'parallel_runs']),
    );
    expect(checklist.steps.find((s) => s.key === 'parallel_runs')).toMatchObject({ total: 3 });
  });

  it('prints the register and adds up what each month cost', async () => {
    const { admin, finance } = kit;
    const g = await kit.group();
    await kit.hire(g);
    await kit.hire(g, { gross: '100000', staff: true });
    const run = await kit.run(g, '2026-05');
    await kit.compute(run.id);

    const register = await api(app)
      .get(`/tenant/payroll/runs/${run.id}/register?format=csv`)
      .set(bearer(finance))
      .expect(200);
    const [heading, ...rows] = register.text.trim().split('\n');
    expect(heading).toContain('Basic salary');
    expect(heading).toContain('Total earnings');
    expect(heading).toContain('Net pay');
    expect(rows).toHaveLength(2);
    const pdf = await binary(
      api(app)
        .get(`/tenant/payroll/runs/${run.id}/register?format=pdf&language=bn`)
        .set(bearer(finance)),
    ).expect(200);
    expect(isPdf(pdf.body as Buffer)).toBe(true);

    // Only locked runs count towards what a month cost.
    const before = (
      await api(app)
        .get('/tenant/payroll/reports/summary?month=2026-05&by=group')
        .set(bearer(admin))
        .expect(200)
    ).body as CostSummary;
    expect(before.rows.find((r) => r.key === g.id)).toBeUndefined();
    expect(before.unlocked).toBeGreaterThan(0);
    await kit.lock(run.id);
    const summary = (
      await api(app)
        .get('/tenant/payroll/reports/summary?month=2026-05&by=group')
        .set(bearer(admin))
        .expect(200)
    ).body as CostSummary;
    // By id: other tests' pay groups may share the name.
    const row = summary.rows.find((r) => r.key === g.id)!;
    expect(row).toMatchObject({ headcount: 2, previousCost: null });
    expect(Number(row.cost)).toBeCloseTo(Number(row.earnings) + Number(row.employerCost), 2);
    expect(Number(row.gross)).toBe(112500);
    const byUnit = (
      await api(app)
        .get('/tenant/payroll/reports/summary?month=2026-05&by=unit')
        .set(bearer(admin))
        .expect(200)
    ).body as CostSummary;
    expect(byUnit.rows.find((r) => r.label === 'Line 1')).toBeDefined();
    expect(byUnit.total.cost).toBe(summary.total.cost);

    const trend = (
      await api(app)
        .get('/tenant/payroll/reports/trend?to=2026-05&months=3')
        .set(bearer(admin))
        .expect(200)
    ).body as CostTrendPoint[];
    expect(trend.map((p) => p.month)).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(Number(trend[2]!.cost)).toBeGreaterThanOrEqual(Number(row.cost));
    expect(trend[2]!.headcount).toBeGreaterThanOrEqual(2);

    const fund = await api(app)
      .get('/tenant/payroll/reports/pf-register?fiscalYear=2025-26')
      .set(bearer(finance))
      .expect(200);
    expect(fund.text.split('\n')[0]).toContain('Brought forward (own)');
  });

  it('matches the bank’s report on a paid run and prints the statutory registers', async () => {
    const { admin, finance } = kit;
    const g = await kit.group();
    const { employee: banked } = await kit.hire(g);
    const { employee: wallet } = await kit.hire(g);
    await kit.hire(g);
    await api(app)
      .put(`/tenant/employees/${banked.id}/payment-accounts`)
      .set(bearer(admin))
      .send([
        {
          method: 'bank',
          provider: 'Dutch-Bangla Bank',
          branchName: 'Gazipur',
          routingNumber: '090270563',
          accountName: banked.fullName,
          accountNumber: '1234567890456',
          isPrimary: true,
        },
      ])
      .expect(200);
    await api(app)
      .put(`/tenant/employees/${wallet.id}/payment-accounts`)
      .set(bearer(admin))
      .send([{ method: 'mfs', provider: 'bkash', accountNumber: '01712345690', isPrimary: true }])
      .expect(200);
    const run = await kit.run(g, '2026-04');
    await kit.compute(run.id);
    const check = (file: string, name: string, token = admin) =>
      api(app)
        .post(`/tenant/payroll/runs/${run.id}/payment-checks`)
        .set(bearer(token))
        .attach('file', Buffer.from(file), name);
    // Only a locked run has been paid.
    await check('Account No,Amount\n1234567890456,12500', 'returns.csv').expect(409);
    await kit.lock(run.id);
    await check('Account No,Amount\n1234567890456,12500', 'returns.csv', finance).expect(403);
    await check('Name,Amount\nX,1', 'returns.csv').expect(400);

    // A returns file lists only what bounced.
    const returns = (
      await check(
        'Batch SAL-2026-04 returns\nBeneficiary Account No,Amount,Return Reason\n1234567890456,"12,500.00",R02 Account closed',
        'returns.csv',
      ).expect(201)
    ).body as PaymentCheckView;
    expect(returns.summary).toEqual({
      full: false,
      payments: 2,
      credited: 0,
      returned: 1,
      notReported: 0,
      unknown: 0,
    });
    expect(returns.returned).toEqual([
      expect.objectContaining({
        employee: expect.objectContaining({ id: banked.id }),
        channel: 'bank',
        account: '•••• 0456',
        amount: '12500.00',
        code: 'R02',
        reason: 'R02 Account closed',
      }),
    ]);
    // A status report has every payment, and one row that is not ours.
    const status = (
      await check(
        [
          'Account Number,Amount,Status,Remarks',
          '1234567890456,12500,Success,',
          '01712345690,12500,Failed,Wallet limit exceeded',
          '9999999999,100,Success,',
        ].join('\n'),
        'status.csv',
      ).expect(201)
    ).body as PaymentCheckView;
    expect(status.summary).toEqual({
      full: true,
      payments: 2,
      credited: 1,
      returned: 1,
      notReported: 0,
      unknown: 1,
    });
    const listed = (
      await api(app)
        .get(`/tenant/payroll/runs/${run.id}/payment-checks`)
        .set(bearer(finance))
        .expect(200)
    ).body as PaymentCheckView[];
    expect(listed.map((c) => c.id)).toEqual([status.id, returns.id]);
    const returned = await api(app)
      .get(`/tenant/payroll/runs/${run.id}/payment-checks/${status.id}/file`)
      .set(bearer(admin))
      .expect(200);
    expect(returned.text).toContain(`${wallet.employeeCode},`);
    expect(returned.text).toContain('Wallet limit exceeded');

    // Form 38 and Form 34 for the month's workers, and the Form 40 and s.177 statements.
    const wages = await api(app)
      .get(`/tenant/payroll/runs/${run.id}/wage-register?format=csv`)
      .set(bearer(finance))
      .expect(200);
    const [heading, ...rows] = wages.text.trim().split('\n');
    expect(heading).toContain('OT rate per hour');
    expect(rows).toHaveLength(3);
    // Basic 6,700 × 2 ÷ 208 an hour.
    expect(rows.find((r) => r.startsWith(banked.employeeCode))).toContain(',6700.00,');
    expect(rows.find((r) => r.startsWith(banked.employeeCode))).toContain(',64.42,');
    const overtime = await api(app)
      .get(`/tenant/payroll/runs/${run.id}/overtime-register?format=csv`)
      .set(bearer(finance))
      .expect(200);
    expect(overtime.text.split('\n')[0]).toContain('2026-04-01');
    expect(overtime.text.split('\n')[0]).toContain('2026-04-30');
    for (const path of ['wage-register', 'overtime-register']) {
      const pdf = await binary(
        api(app)
          .get(`/tenant/payroll/runs/${run.id}/${path}?format=pdf&language=bn`)
          .set(bearer(finance)),
      ).expect(200);
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
    const advances = await api(app)
      .get('/tenant/payroll/reports/advances-register?fiscalYear=2025-26')
      .set(bearer(finance))
      .expect(200);
    expect(advances.text.split('\n')[0]).toContain('Instalments recovered');
    const quarter = await api(app)
      .get('/tenant/payroll/tax/quarter?fiscalYear=2025-26&quarter=4')
      .set(bearer(finance))
      .expect(200);
    expect(quarter.text.split('\n')[0]).toBe('Employee code,Name,TIN,Salary,Tax deducted,Challans');
    expect(quarter.text).toContain(`${banked.employeeCode},`);
    await api(app)
      .get('/tenant/payroll/tax/quarter?fiscalYear=2025-26&quarter=5')
      .set(bearer(finance))
      .expect(400);
  });
});
