import type {
  GratuityProvision,
  PayrollRunView,
  PfStatement,
  SettlementCase,
  WppfYearView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { binary, isPdf, line, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp } from './test-env.js';

describe('leaving and the funds', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof payrollKit>>;

  beforeAll(async () => {
    app = await bootApp();
    kit = await payrollKit(app);
  });
  afterAll(() => app.close());

  const separate = async (
    employeeId: string,
    body: { type: string; noticeDate: string; lastWorkingDay: string },
  ) =>
    api(app)
      .post(`/tenant/employees/${employeeId}/separations`)
      .set(bearer(kit.admin))
      .send({ ...body, reason: 'Settlement test' })
      .expect(201);
  const settle = async (separationId: string) =>
    (
      await api(app)
        .post('/tenant/payroll/settlements')
        .set(bearer(kit.admin))
        .send({ separationId })
        .expect(201)
    ).body as PayrollRunView;

  it('settles a termination: notice, gratuity over compensation, leave, the fund paid out', async () => {
    const { admin } = kit;
    const before = (await api(app).get('/tenant/payroll/settings').set(bearer(admin)).expect(200))
      .body.pfEnabled as boolean;
    await api(app)
      .patch('/tenant/payroll/settings')
      .set(bearer(admin))
      .send({ pfEnabled: true, pfEmployeeRate: '7', pfEmployerRate: '7' })
      .expect(200);
    try {
      const g = await kit.group();
      const { employee } = await kit.hire(g, { joinedOn: '2019-03-01' });
      const { employee: stayer } = await kit.hire(g, { joinedOn: '2024-01-01' });
      await api(app)
        .post('/tenant/payroll/pf/members')
        .set(bearer(admin))
        .send({ employeeIds: [employee.id], joinedOn: '2026-01-01' })
        .expect(200);
      for (const account of ['own', 'employer']) {
        await api(app)
          .post(`/tenant/payroll/pf/members/${employee.id}/entries`)
          .set(bearer(admin))
          .send({ date: '2026-01-01', kind: 'opening', account, amount: '10000' })
          .expect(201);
      }
      // Sixty days' notice of the 120 a permanent worker is owed.
      const separation = (
        await separate(employee.id, {
          type: 'termination',
          noticeDate: '2026-08-01',
          lastWorkingDay: '2026-09-30',
        })
      ).body as { id: string };
      const run = await settle(separation.id);
      expect(run).toMatchObject({ kind: 'settlement', periodStart: '2026-09-01' });
      await api(app)
        .post('/tenant/payroll/settlements')
        .set(bearer(admin))
        .send({ separationId: separation.id })
        .expect(409);

      await kit.compute(run.id);
      const item = await kit.itemOf(run.id, employee.id);
      expect(item.status).toBe('ok');
      expect(line(item, 'BASIC')).toBe('6700.00');
      // 6,700 ÷ 30 a day: 60 days of notice; gratuity counts 7 years 7 months as 8 years
      // (240 days), more than 7 completed years of compensation (210 days), so it replaces it.
      expect(line(item, 'NOTICE_PAY')).toBe('13400.00');
      expect(line(item, 'GRATUITY')).toBe('53600.00');
      expect(line(item, 'SEPARATION_BENEFIT')).toBeUndefined();
      expect(line(item, 'PF_EMPLOYEE')).toBe('469.00');
      const working = item.settlement!;
      expect(working).toMatchObject({
        serviceYears: 7,
        serviceMonths: 91,
        wageBasis: 'last_month',
        monthlyWage: '6700.00',
        notice: { requiredDays: 120, servedDays: 60, shortDays: 60, owedBy: 'employer' },
        providentFund: { own: '10469.00', employer: '10469.00', total: '20938.00' },
      });
      expect(working.benefits).toEqual([
        expect.objectContaining({ code: 'GRATUITY', years: 8, daysPerYear: 30, days: 240 }),
      ]);
      expect(line(item, 'LEAVE_ENCASHMENT') ?? '0.00').toBe(working.leave.amount);
      // Thirty working days after the last day (s.30).
      expect(working.dueBy > '2026-10-30').toBe(true);

      // The month's regular run leaves the leaver to the settlement.
      const september = await kit.run(g, '2026-09');
      await kit.compute(september.id);
      expect((await kit.items(september.id)).map((i) => i.employee.id)).toEqual([stayer.id]);

      const cases = (
        await api(app).get('/tenant/payroll/settlements').set(bearer(admin)).expect(200)
      ).body as SettlementCase[];
      expect(cases.find((c) => c.separationId === separation.id)).toMatchObject({
        type: 'termination',
        run: { id: run.id, status: 'computed', net: item.net },
      });

      await kit.lock(run.id);
      const statement = (
        await api(app)
          .get(`/tenant/payroll/pf/members/${employee.id}`)
          .set(bearer(admin))
          .expect(200)
      ).body as PfStatement;
      expect(statement.balance.total).toBe('0.00');
      const pdf = await binary(
        api(app)
          .get(`/tenant/payroll/runs/${run.id}/items/${item.id}/payslip?language=bn`)
          .set(bearer(admin)),
      ).expect(200);
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    } finally {
      await api(app)
        .patch('/tenant/payroll/settings')
        .set(bearer(admin))
        .send({ pfEnabled: before })
        .expect(200);
    }
  });

  it('recovers notice a resigning worker did not serve', async () => {
    const g = await kit.group();
    const { employee } = await kit.hire(g, { joinedOn: '2025-01-01' });
    const separation = (
      await separate(employee.id, {
        type: 'resignation',
        noticeDate: '2026-09-10',
        lastWorkingDay: '2026-09-30',
      })
    ).body as { id: string };
    const run = await settle(separation.id);
    await kit.compute(run.id);
    const item = await kit.itemOf(run.id, employee.id);
    // 40 of 60 days not served; gratuity (1 year 9 months: 2 years, 60 days) beats the
    // resignation benefit (7 days for the one completed year).
    expect(line(item, 'NOTICE_RECOVERY')).toBe('8933.00');
    expect(line(item, 'GRATUITY')).toBe('13400.00');
    expect(item.settlement!.notice.owedBy).toBe('employee');
  });

  it('provides for gratuity month by month', async () => {
    const g = await kit.group();
    const { employee } = await kit.hire(g, { joinedOn: '2020-01-01' });
    const provision = (
      await api(app)
        .get('/tenant/payroll/gratuity?asOf=2026-09-30&page=1')
        .set(bearer(kit.finance))
        .expect(200)
    ).body as GratuityProvision;
    expect(provision).toMatchObject({ asOf: '2026-09-30', previousAsOf: '2026-08-31' });
    expect(Number(provision.change)).toBeCloseTo(
      Number(provision.total) - Number(provision.previousTotal),
      2,
    );
    const file = await api(app)
      .get('/tenant/payroll/gratuity/file?asOf=2026-09-30')
      .set(bearer(kit.finance))
      .expect(200);
    // 6 years 9 months count as 7: 210 days at 6,700 ÷ 30.
    expect(file.text).toContain(
      `${employee.employeeCode},${employee.fullName},2020-01-01,7,6700.00,210,46900.00`,
    );
  });

  it('shares the participation fund equally, less tax at source', async () => {
    const { admin } = kit;
    const year = (
      await api(app)
        .post('/tenant/payroll/wppf')
        .set(bearer(admin))
        .send({
          accountingYear: '2025-26',
          yearStart: '2025-07-01',
          yearEnd: '2026-06-30',
          netProfit: '10000000',
        })
        .expect(201)
    ).body as WppfYearView;
    // 5%, 80:10:10, and from the 2025 amendment all of the participation fund in cash.
    expect(year.amounts).toEqual({
      netProfit: '10000000.00',
      fund: '500000.00',
      participation: '400000.00',
      welfare: '50000.00',
      foundation: '50000.00',
      cash: '400000.00',
      invested: '0.00',
    });
    await api(app)
      .post('/tenant/payroll/wppf')
      .set(bearer(admin))
      .send({
        accountingYear: '2025-26',
        yearStart: '2025-07-01',
        yearEnd: '2026-06-30',
        netProfit: '1',
      })
      .expect(409);

    const g = await kit.group();
    const { employee: veteran } = await kit.hire(g, { joinedOn: '2024-01-01' });
    const { employee: recent } = await kit.hire(g, { joinedOn: '2025-09-01' });
    // Four months in the year and in service: not yet a beneficiary.
    await kit.hire(g, { joinedOn: '2026-03-01' });
    await api(app)
      .post(`/tenant/payroll/wppf/${year.id}/runs`)
      .set(bearer(admin))
      .send({ payGroupId: g.id, paymentDate: '2026-06-01' })
      .expect(400);
    const run = (
      await api(app)
        .post(`/tenant/payroll/wppf/${year.id}/runs`)
        .set(bearer(admin))
        .send({ payGroupId: g.id, paymentDate: '2026-10-15' })
        .expect(201)
    ).body as PayrollRunView;
    expect(run).toMatchObject({ kind: 'wppf', paymentDue: '2027-03-30' });
    await api(app)
      .post(`/tenant/payroll/wppf/${year.id}/runs`)
      .set(bearer(admin))
      .send({ payGroupId: g.id, paymentDate: '2026-10-15' })
      .expect(409);

    const view = (
      (await api(app).get('/tenant/payroll/wppf').set(bearer(admin)).expect(200))
        .body as WppfYearView[]
    ).find((y) => y.id === year.id)!;
    expect(Number(view.share)).toBe(Math.floor(400000 / view.beneficiaries));
    await kit.compute(run.id);
    const items = await kit.items(run.id);
    expect(items.map((i) => i.employee.id).toSorted()).toEqual([veteran.id, recent.id].toSorted());
    const share = new Set(items.map((i) => line(i, 'WPPF')));
    expect([...share]).toEqual([view.share]);
    // 10% at source on payouts (Income Tax Act s.88).
    expect(line(items[0]!, 'WPPF_TDS')).toBe(Math.round(Number(view.share) * 0.1).toFixed(2));

    await kit.lock(run.id);
    const journal = (
      await api(app)
        .get(`/tenant/payroll/runs/${run.id}/files/journal`)
        .set(bearer(admin))
        .expect(200)
    ).text;
    // The payout settles what the fund owes; the tax is owed onward.
    expect(journal).toContain(',2300,');
    expect(journal).toContain(',2110,');
  });
});
