import { createDb, runAsTenant, tenantAuditLog, tenants } from '@gp/db';
import type { DisbursementView } from '@gp/shared';
import { and, eq } from 'drizzle-orm';
import type { INestApplication } from '@nestjs/common';
import { binary, isPdf, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp, testEnv } from './test-env.js';

describe('paying a locked run', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof payrollKit>>;

  beforeAll(async () => {
    app = await bootApp();
    kit = await payrollKit(app);
  });
  afterAll(() => app.close());

  it('splits pay across accounts, makes the files and the cash sheet, and records payment', async () => {
    const { admin, finance } = kit;
    const g = await kit.group();
    const { employee: banked } = await kit.hire(g);
    const { employee: wallet } = await kit.hire(g);
    const { employee: cash } = await kit.hire(g);
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
          accountNumber: '1234567890123',
          isPrimary: true,
        },
        {
          method: 'mfs',
          provider: 'bkash',
          accountNumber: '01712345678',
          isPrimary: false,
          splitAmount: '3000',
        },
      ])
      .expect(200);
    await api(app)
      .put(`/tenant/employees/${wallet.id}/payment-accounts`)
      .set(bearer(admin))
      .send([{ method: 'mfs', provider: 'nagad', accountNumber: '01812345679', isPrimary: true }])
      .expect(200);

    const run = await kit.run(g, '2026-08');
    await kit.compute(run.id);
    // Only a locked run is paid.
    await api(app)
      .get(`/tenant/payroll/runs/${run.id}/disbursement`)
      .set(bearer(admin))
      .expect(409);
    await kit.lock(run.id);

    const summary = (
      await api(app)
        .get(`/tenant/payroll/runs/${run.id}/disbursement`)
        .set(bearer(finance))
        .expect(200)
    ).body as DisbursementView;
    expect(summary).toMatchObject({
      people: 3,
      total: '37500.00',
      paidOn: null,
      late: null,
      problems: [],
    });
    expect(summary.channels.map((c) => [c.channel, c.people, c.amount])).toEqual([
      ['bank', 1, '9500.00'],
      ['bkash', 1, '3000.00'],
      ['cash', 1, '12500.00'],
      ['nagad', 1, '12500.00'],
    ]);

    // Files with account numbers are for those who run payroll, and leave an audit trace.
    await api(app)
      .get(`/tenant/payroll/runs/${run.id}/files/bank`)
      .set(bearer(finance))
      .expect(403);
    const bank = await api(app)
      .get(`/tenant/payroll/runs/${run.id}/files/bank`)
      .set(bearer(admin))
      .expect(200);
    expect(bank.text.split('\n')[0]).toContain('Routing number');
    expect(bank.text).toContain(
      `${banked.employeeCode},${banked.fullName},Dutch-Bangla Bank,Gazipur,090270563,1234567890123,9500.00,SAL-2026-08`,
    );
    expect(bank.text).not.toContain(cash.employeeCode);
    const bkash = await api(app)
      .get(`/tenant/payroll/runs/${run.id}/files/wallet/bkash`)
      .set(bearer(admin))
      .expect(200);
    expect(bkash.text).toContain('01712345678,3000.00');
    const nagad = await api(app)
      .get(`/tenant/payroll/runs/${run.id}/files/wallet/nagad`)
      .set(bearer(admin))
      .expect(200);
    expect(nagad.text).toContain('01812345679,12500.00');
    for (const path of ['files/cash-sheet?language=bn', 'files/bank-advice?language=en']) {
      const pdf = await binary(
        api(app).get(`/tenant/payroll/runs/${run.id}/${path}`).set(bearer(finance)),
      ).expect(200);
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
      const traces = await runAsTenant(db, tenant!.id, (tx) =>
        tx
          .select()
          .from(tenantAuditLog)
          .where(
            and(
              eq(tenantAuditLog.action, 'payroll.run.payment_file'),
              eq(tenantAuditLog.entityId, run.id),
            ),
          ),
      );
      expect(traces.map((t) => (t.after as { channel: string }).channel).toSorted()).toEqual([
        'bank',
        'bkash',
        'nagad',
      ]);
    } finally {
      await pool.end();
    }

    // Paid after the deadline: s.123 asks for wages within seven working days.
    const late = (
      await api(app)
        .post(`/tenant/payroll/runs/${run.id}/paid`)
        .set(bearer(admin))
        .send({ paidOn: '2026-09-30' })
        .expect(200)
    ).body as DisbursementView;
    expect(late).toMatchObject({ paidOn: '2026-09-30', late: true });
    const onTime = (
      await api(app)
        .post(`/tenant/payroll/runs/${run.id}/paid`)
        .set(bearer(admin))
        .send({ paidOn: summary.paymentDue })
        .expect(200)
    ).body as DisbursementView;
    expect(onTime.late).toBe(false);
  });

  it('exports a journal that balances, by account and unit', async () => {
    const { admin } = kit;
    const g = await kit.group();
    await kit.hire(g, { gross: '100000', staff: true });
    await kit.hire(g);
    const run = await kit.run(g, '2026-07');
    await kit.compute(run.id);
    const worker = (await kit.items(run.id)).find((i) => i.net === '12500.00')!;
    await api(app)
      .put(`/tenant/payroll/runs/${run.id}/inputs`)
      .set(bearer(admin))
      .send({ employeeId: worker.employee.id, component: 'ADVANCE', amount: '1000' })
      .expect(204);
    await kit.compute(run.id);
    await kit.lock(run.id);
    const journal = (
      await api(app)
        .get(`/tenant/payroll/runs/${run.id}/files/journal`)
        .set(bearer(admin))
        .expect(200)
    ).text;
    const [heading, ...lines] = journal.trim().split('\n');
    expect(heading).toBe('Date,Account,Cost centre,Project,Description,Debit,Credit,Reference');
    const rows = lines.map((r) => r.split(','));
    const debit = rows.reduce((s, r) => s + Number(r[5] || 0), 0);
    const credit = rows.reduce((s, r) => s + Number(r[6] || 0), 0);
    expect(debit).toBeGreaterThan(0);
    expect(debit).toBeCloseTo(credit, 2);
    const accounts = new Set(rows.map((r) => r[1]));
    // Salary expense, net pay owed, tax owed (the staff member pays tax), the advance recovered.
    expect([...accounts]).toEqual(expect.arrayContaining(['5100', '2100', '2110', '1410']));
    expect(rows.every((r) => r[2] === 'MGT-L1')).toBe(true);
    // Nobody here is on a project, so nothing is charged to one.
    expect(rows.every((r) => r[3] === '')).toBe(true);
  });
});
