import { createDb, maternityPayments, runAsTenant, tenantAuditLog, tenants } from '@gp/db';
import {
  addDays,
  addMonths,
  todayIn,
  type EmployeeDetail,
  type LeaveRequestView,
  type MaternityCaseSummary,
  type MaternityCaseView,
  type NotificationInbox,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { runInTenantContext } from '../src/common/request-context.js';
import { MaternityJobs } from '../src/modules/maternity/maternity-jobs.service.js';
import { leaveTypeId, NEXT_YEAR } from './leave-helpers.js';
import { binary, isPdf, line, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp, testEnv } from './test-env.js';

const CASES = '/tenant/maternity/cases';
const AVERAGE = { averageDailyWage: '500', averageReason: 'Joined from a sister unit' };

const partsOf = (c: MaternityCaseView) =>
  c.parts.map((p) => ({
    part: p.part,
    days: p.days,
    amount: p.amount,
    status: p.status,
    dueOn: p.dueOn,
  }));

// Each test hires the women it needs in the seeded my-group workspace, in its own pay group.
describe('maternity benefit', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof payrollKit>>;
  let admin: string;
  let tenantId: string;
  let ML: string;

  beforeAll(async () => {
    app = await bootApp();
    kit = await payrollKit(app);
    admin = kit.admin;
    ML = await leaveTypeId(app, admin, 'ML');
    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
      tenantId = tenant!.id;
    } finally {
      await pool.end();
    }
  });
  afterAll(() => app.close());

  async function women(n: number, joinedOn = '2024-01-01') {
    const g = await kit.group();
    const out: EmployeeDetail[] = [];
    for (let i = 0; i < n; i++) out.push((await kit.hire(g, { joinedOn })).employee);
    return { group: g, women: out };
  }

  const open = (body: object) => api(app).post(CASES).set(bearer(admin)).send(body);
  const opened = async (body: object) => (await open(body).expect(201)).body as MaternityCaseView;
  const dates = (id: string, body: object) =>
    api(app).patch(`${CASES}/${id}/dates`).set(bearer(admin)).send(body);
  const pay = (id: string, part: number, body: object) =>
    api(app).post(`${CASES}/${id}/parts/${part}/payment`).set(bearer(admin)).send(body);
  /** HR applies maternity leave for her and approves it. */
  async function maternityLeave(employeeId: string, startDate: string, endDate: string) {
    const request = (
      await api(app)
        .post(`/tenant/employees/${employeeId}/leave/requests`)
        .set(bearer(admin))
        .send({ leaveTypeId: ML, startDate, endDate, reason: 'Maternity' })
        .expect(201)
    ).body as LeaveRequestView;
    if (request.status === 'pending') {
      await api(app)
        .post(`/tenant/approvals/${request.steps[0]!.id}/approve`)
        .set(bearer(admin))
        .send({})
        .expect(201);
    }
    return request;
  }

  it('pays no benefit under six months of service', async () => {
    const {
      women: [rina],
    } = await women(1, '2026-06-01');
    const body = {
      employeeId: rina!.id,
      noticeOn: '2026-09-01',
      expectedDeliveryOn: '2026-11-15',
      survivingChildren: 0,
      paymentOption: 'before_and_after',
    };
    const c = await opened(body);
    // 167 days from joining to the expected delivery; the Act asks for 180 (s.46).
    expect(c).toMatchObject({
      status: 'open',
      eligible: false,
      benefitDays: 120,
      total: null,
      next: null,
      parts: [],
      eligibility: {
        reasons: ['short_service'],
        service: { days: 167, ok: false, rule: { value: 180, reference: { section: '47' } } },
        children: { ok: true },
      },
    });
    // One open case at a time, and only for a woman.
    expect((await open(body).expect(409)).body.code).toBe('maternity_case_open');
    const man = (await api(app).get('/tenant/employees?search=MG-0001').set(bearer(admin))).body
      .items[0];
    const refused = await open({ ...body, employeeId: man.id }).expect(400);
    expect(refused.body.code).toBe('maternity_women_only');
  });

  it('pays no benefit from two surviving children, but her leave is still allowed', async () => {
    const {
      women: [mitu],
    } = await women(1);
    const start = `${NEXT_YEAR}-03-01`;
    const leave = await maternityLeave(mitu!.id, start, addDays(start, 119));
    expect(leave.days).toBe(120);
    const c = await opened({
      employeeId: mitu!.id,
      leaveRequestId: leave.id,
      noticeOn: todayIn(),
      expectedDeliveryOn: addDays(start, 60),
      survivingChildren: 2,
      nomineeName: 'Hasina Begum',
      nomineeRelation: 'Mother',
      paymentOption: 'after_birth_at_once',
    });
    expect(c).toMatchObject({
      eligible: false,
      parts: [],
      average: null,
      leaveRequest: { id: leave.id, days: 120 },
      eligibility: {
        reasons: ['surviving_children'],
        service: { ok: true },
        children: { surviving: 2, ok: false, rule: { value: 2, reference: { section: '46' } } },
      },
    });
    // Nothing to pay, so the case can be closed at once.
    const closed = (
      await api(app).post(`${CASES}/${c.id}/close`).set(bearer(admin)).send({}).expect(200)
    ).body as MaternityCaseView;
    expect(closed.status).toBe('closed');
  });

  it('works the average daily wage out from locked payroll (s.48)', async () => {
    const {
      group,
      women: [nasrin],
    } = await women(1, '2025-01-01');
    for (const month of ['2026-06', '2026-07', '2026-08']) {
      const run = await kit.run(group, month);
      await kit.compute(run.id);
      await kit.lock(run.id);
    }
    const c = await opened({
      employeeId: nasrin!.id,
      noticeOn: '2026-09-10',
      expectedDeliveryOn: '2026-11-01',
      survivingChildren: 1,
      paymentOption: 'before_and_after',
    });
    // June, July and August: Tk 37,500 over 92 days (attendance was not tracked yet, so
    // every day employed counts as worked).
    expect(c.average).toMatchObject({
      source: 'payroll',
      windowStart: '2026-06-01',
      windowEnd: '2026-08-31',
      wages: '37500.00',
      workedDays: 92,
      averageDailyWage: '407.61',
      missingMonths: [],
      reason: null,
      rule: { key: 'maternity.average_wage_months', value: 3, reference: { section: '48' } },
    });
    expect(c.average!.months.map((m) => [m.periodStart, m.wages, m.workedDays])).toEqual([
      ['2026-06-01', '12500.00', 30],
      ['2026-07-01', '12500.00', 31],
      ['2026-08-01', '12500.00', 31],
    ]);
    // The certificate came with the notice on Thursday 10 September; Friday is the weekly off.
    expect(partsOf(c)).toEqual([
      { part: 1, days: 60, amount: '24457.00', status: 'overdue', dueOn: '2026-09-14' },
      { part: 2, days: 60, amount: '24457.00', status: 'waiting', dueOn: null },
    ]);
    expect(c).toMatchObject({ total: '48914.00', next: { part: 1, status: 'overdue' } });

    // HR cannot type over an average that locked pay gives.
    const typed = await api(app)
      .post(`${CASES}/${c.id}/average`)
      .set(bearer(admin))
      .send({ averageDailyWage: '600', reason: 'A different figure' })
      .expect(409);
    expect(typed.body.code).toBe('maternity_average_from_payroll');

    // Amounts are encrypted at rest.
    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const rows = await runAsTenant(db, tenantId, (tx) =>
        tx.select().from(maternityPayments).where(eq(maternityPayments.caseId, c.id)),
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.amountEnc).toMatch(/^v1:/);
        expect(row.amountEnc).not.toContain('24457');
      }
    } finally {
      await pool.end();
    }
  });

  it('asks for the average by hand only when no pay is locked', async () => {
    const {
      women: [shila],
    } = await women(1);
    const body = {
      employeeId: shila!.id,
      noticeOn: '2026-08-02',
      expectedDeliveryOn: '2026-09-20',
      survivingChildren: 0,
      paymentOption: 'before_and_after',
    };
    expect((await open(body).expect(400)).body.code).toBe('maternity_average_needed');
    const c = await opened({ ...body, ...AVERAGE });
    expect(c.average).toMatchObject({
      source: 'entered',
      averageDailyWage: '500.00',
      reason: 'Joined from a sister unit',
      missingMonths: ['2026-05', '2026-06', '2026-07'],
    });
    const again = await api(app).post(`${CASES}/${c.id}/average`).set(bearer(admin)).send({});
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('maternity_no_locked_pay');
  });

  it('schedules each payment option, with due dates from proof of birth (s.47(4))', async () => {
    const {
      women: [a, b, cc],
    } = await women(3);
    const common = {
      noticeOn: '2026-08-02',
      expectedDeliveryOn: '2026-09-20',
      survivingChildren: 1,
      ...AVERAGE,
    };
    const before = await opened({
      ...common,
      employeeId: a!.id,
      paymentOption: 'before_and_after',
    });
    const twoParts = await opened({
      ...common,
      employeeId: b!.id,
      paymentOption: 'after_birth_two_parts',
    });
    const atOnce = await opened({
      ...common,
      employeeId: cc!.id,
      paymentOption: 'after_birth_at_once',
    });
    // (a) the days before the delivery are due 3 working days after the certificate (Sunday 2
    // August); everything else waits for proof of birth.
    expect(partsOf(before).map((p) => [p.part, p.status, p.dueOn])).toEqual([
      [1, 'overdue', '2026-08-05'],
      [2, 'waiting', null],
    ]);
    expect(partsOf(twoParts).map((p) => p.status)).toEqual(['waiting', 'waiting']);
    expect(partsOf(atOnce)).toEqual([
      { part: 1, days: 120, amount: '60000.00', status: 'waiting', dueOn: null },
    ]);

    // Delivered on Friday 18 September, proof on Sunday 27 September.
    const birth = { deliveredOn: '2026-09-18', proofOn: '2026-09-27' };
    const proofFirst = await dates(before.id, { deliveredOn: null, proofOn: '2026-09-27' }).expect(
      400,
    );
    expect(proofFirst.body.code).toBe('validation_failed');
    const a2 = (await dates(before.id, birth).expect(200)).body as MaternityCaseView;
    const b2 = (await dates(twoParts.id, birth).expect(200)).body as MaternityCaseView;
    const c2 = (await dates(atOnce.id, birth).expect(200)).body as MaternityCaseView;
    expect(a2.parts.map((p) => p.dueOn)).toEqual(['2026-08-05', '2026-09-30']);
    // (b) the rest within eight weeks of the proof.
    expect(b2.parts.map((p) => [p.basis, p.amount, p.dueOn])).toEqual([
      ['proof', '30000.00', '2026-09-30'],
      ['after_proof', '30000.00', '2026-11-22'],
    ]);
    expect(c2.parts.map((p) => p.dueOn)).toEqual(['2026-09-30']);
    expect(c2).toMatchObject({
      proofDeadline: '2026-12-18',
      proofLate: false,
      // s.50: six months before the delivery to 60 days after it.
      protection: {
        from: '2026-03-18',
        to: '2026-11-17',
        rules: [{ value: 6 }, { value: 60 }],
      },
    });
    // A revised expected delivery moves the certificate's part.
    const revised = (
      await dates(before.id, { ...birth, expectedDeliveryOn: '2026-10-15' }).expect(200)
    ).body as MaternityCaseView;
    // 60 days before 15 October is 16 August, a Sunday.
    expect(revised.parts[0]!.dueOn).toBe('2026-08-19');
  });

  it('loses the parts that wait for proof of birth when it is late (s.47)', async () => {
    const {
      women: [a, b],
    } = await women(2);
    const common = {
      noticeOn: '2026-03-10',
      expectedDeliveryOn: '2026-05-05',
      deliveredOn: '2026-05-01',
      survivingChildren: 0,
      ...AVERAGE,
    };
    // Proof on 15 August, after the deadline of 1 August.
    const late = await opened({
      ...common,
      employeeId: a!.id,
      proofOn: '2026-08-15',
      paymentOption: 'before_and_after',
    });
    expect(late).toMatchObject({ proofDeadline: '2026-08-01', proofLate: true });
    expect(partsOf(late).map((p) => [p.part, p.status, p.dueOn])).toEqual([
      [1, 'overdue', '2026-03-14'],
      [2, 'lost', null],
    ]);
    expect(
      (await pay(late.id, 2, { paidOn: '2026-08-16', method: 'cash' }).expect(409)).body.code,
    ).toBe('maternity_part_lost');
    // Lost parts do not hold the case open once the rest is paid.
    expect(
      (await api(app).post(`${CASES}/${late.id}/close`).set(bearer(admin)).send({}).expect(409))
        .body.code,
    ).toBe('maternity_parts_unpaid');
    await pay(late.id, 1, { paidOn: '2026-03-12', method: 'cash' }).expect(200);
    await api(app).post(`${CASES}/${late.id}/close`).set(bearer(admin)).send({}).expect(200);

    // No proof at all, three months after the delivery: all of it is lost.
    const never = await opened({
      ...common,
      employeeId: b!.id,
      paymentOption: 'after_birth_at_once',
    });
    expect(partsOf(never)).toEqual([
      { part: 1, days: 120, amount: '60000.00', status: 'lost', dueOn: null },
    ]);
    expect(never.next).toBeNull();
  });

  it('records each part paid, and audits it', async () => {
    const {
      women: [joya],
    } = await women(1);
    const c = await opened({
      employeeId: joya!.id,
      noticeOn: '2026-08-02',
      expectedDeliveryOn: '2026-09-20',
      deliveredOn: '2026-09-18',
      proofOn: '2026-09-27',
      survivingChildren: 0,
      paymentOption: 'after_birth_two_parts',
      ...AVERAGE,
    });
    expect(
      (await pay(c.id, 1, { paidOn: addDays(todayIn(), 1), method: 'cash' }).expect(400)).body.code,
    ).toBe('maternity_future_date');
    const paid = (
      await pay(c.id, 1, { paidOn: '2026-09-29', method: 'cash', reference: 'V-101' }).expect(200)
    ).body as MaternityCaseView;
    expect(paid.parts[0]).toMatchObject({
      status: 'paid',
      paidOn: '2026-09-29',
      method: 'cash',
      reference: 'V-101',
      paidBy: expect.any(String),
    });
    expect(paid.next).toMatchObject({ part: 2, dueOn: '2026-11-22' });
    expect(
      (await pay(c.id, 1, { paidOn: '2026-09-29', method: 'cash' }).expect(409)).body.code,
    ).toBe('maternity_part_paid');
    // Paid at this average: it no longer changes, and the case cannot be cancelled.
    expect(
      (
        await api(app)
          .post(`${CASES}/${c.id}/average`)
          .set(bearer(admin))
          .send({ averageDailyWage: '450', reason: 'A late correction' })
          .expect(409)
      ).body.code,
    ).toBe('maternity_part_paid');
    expect(
      (
        await api(app)
          .post(`${CASES}/${c.id}/cancel`)
          .set(bearer(admin))
          .send({ reason: 'Opened by mistake' })
          .expect(409)
      ).body.code,
    ).toBe('maternity_part_paid');
    await pay(c.id, 2, { paidOn: '2026-10-20', method: 'mfs', reference: 'BK8XK2' }).expect(200);
    const closed = (
      await api(app)
        .post(`${CASES}/${c.id}/close`)
        .set(bearer(admin))
        .send({ note: 'Both parts paid' })
        .expect(200)
    ).body as MaternityCaseView;
    expect(closed).toMatchObject({ status: 'closed', next: null, note: 'Both parts paid' });
    expect((await dates(c.id, { deliveredOn: null, proofOn: null }).expect(409)).body.code).toBe(
      'maternity_case_closed',
    );
    const list = (await api(app).get(`${CASES}?status=closed`).set(bearer(admin)).expect(200))
      .body as MaternityCaseSummary[];
    expect(list.find((x) => x.id === c.id)).toMatchObject({ total: '60000.00', status: 'closed' });

    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const entries = await runAsTenant(db, tenantId, (tx) =>
        tx
          .select()
          .from(tenantAuditLog)
          .where(
            and(eq(tenantAuditLog.entityId, c.id), eq(tenantAuditLog.action, 'maternity.pay')),
          ),
      );
      expect(entries.map((e) => (e.after as { part: number }).part).toSorted()).toEqual([1, 2]);
    } finally {
      await pool.end();
    }
  });

  it('prints the statement in English and Bangla', async () => {
    const {
      women: [lipi],
    } = await women(1);
    const c = await opened({
      employeeId: lipi!.id,
      noticeOn: '2026-08-02',
      expectedDeliveryOn: '2026-09-20',
      deliveredOn: '2026-09-18',
      survivingChildren: 0,
      nomineeName: 'Rokeya Khatun',
      nomineeRelation: 'Sister',
      paymentOption: 'before_and_after',
      ...AVERAGE,
    });
    await pay(c.id, 1, { paidOn: '2026-08-04', method: 'bank', reference: 'TRX-55' }).expect(200);
    for (const language of ['en', 'bn']) {
      const pdf = await binary(
        api(app).get(`${CASES}/${c.id}/statement?language=${language}`).set(bearer(admin)),
      ).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
  });

  it('reminds HR of a part falling due and of missing proof of birth, once', async () => {
    const {
      women: [due, waiting],
    } = await women(2);
    const today = todayIn();
    const soon = await opened({
      employeeId: due!.id,
      noticeOn: today,
      expectedDeliveryOn: addDays(today, 50),
      survivingChildren: 0,
      paymentOption: 'before_and_after',
      ...AVERAGE,
    });
    expect(soon.parts[0]).toMatchObject({ status: 'due', dueOn: expect.any(String) });
    const expected = addDays(addMonths(today, -2), -1);
    const noProof = await opened({
      employeeId: waiting!.id,
      noticeOn: addMonths(today, -4),
      expectedDeliveryOn: expected,
      survivingChildren: 0,
      paymentOption: 'after_birth_at_once',
      ...AVERAGE,
    });
    expect(noProof.parts[0]!.status).toBe('waiting');

    const jobs = app.get(MaternityJobs);
    await runInTenantContext(tenantId, () => jobs.remindTenant());
    await runInTenantContext(tenantId, () => jobs.remindTenant());
    const inbox = (await api(app).get('/tenant/notifications').set(bearer(admin)).expect(200))
      .body as NotificationInbox;
    const about = (id: string) =>
      inbox.items.filter((n) => n.link === `/workspace/leave/maternity/${id}`);
    expect(about(soon.id)).toEqual([
      expect.objectContaining({
        event: 'maternity.payment_due',
        title: `Maternity benefit due for ${due!.fullName}`,
      }),
    ]);
    expect(about(soon.id)[0]!.body).toContain('Tk 30,000');
    expect(about(noProof.id)).toEqual([
      expect.objectContaining({
        event: 'compliance.alert',
        title: `Proof of birth missing for ${waiting!.fullName}`,
      }),
    ]);
  });

  it('leaves her linked maternity leave unpaid in payroll while the case stands', async () => {
    const {
      group,
      women: [withCase, without],
    } = await women(2);
    const leave = await maternityLeave(withCase!.id, '2026-10-05', '2026-10-14');
    await maternityLeave(without!.id, '2026-10-05', '2026-10-14');
    const c = await opened({
      employeeId: withCase!.id,
      noticeOn: '2026-10-04',
      expectedDeliveryOn: '2026-12-03',
      survivingChildren: 0,
      paymentOption: 'before_and_after',
      ...AVERAGE,
    });
    // Linked later, from the case.
    const linked = (
      await api(app)
        .put(`${CASES}/${c.id}/leave`)
        .set(bearer(admin))
        .send({ leaveRequestId: leave.id })
        .expect(200)
    ).body as MaternityCaseView;
    expect(linked.leaveRequest).toMatchObject({ id: leave.id, days: 10, status: 'approved' });
    // Someone else's leave cannot be linked.
    const theirLeave = await maternityLeave(
      without!.id,
      `${NEXT_YEAR}-02-01`,
      `${NEXT_YEAR}-02-10`,
    );
    const other = await api(app)
      .put(`${CASES}/${c.id}/leave`)
      .set(bearer(admin))
      .send({ leaveRequestId: theirLeave.id })
      .expect(400);
    expect(other.body.code).toBe('maternity_leave_invalid');

    // Every day of the month processed, as payroll needs once the month is over.
    await api(app)
      .post('/tenant/attendance/process')
      .set(bearer(admin))
      .send({ from: '2026-10-01', to: '2026-10-31' })
      .expect(201);
    const run = await kit.run(group, '2026-10');
    await kit.compute(run.id);
    const mine = await kit.itemOf(run.id, withCase!.id);
    // Ten days at the gross for each day: 12,500 ÷ 30 × 10.
    expect(mine.variables.unpaidLeaveDays).toBe(10);
    expect(line(mine, 'UNPAID_LEAVE')).toBe('4167.00');
    const theirs = await kit.itemOf(run.id, without!.id);
    expect(theirs.variables.unpaidLeaveDays).toBe(0);
    expect(line(theirs, 'UNPAID_LEAVE')).toBeUndefined();

    // Cancelled, the case no longer stands in for wages.
    await api(app)
      .post(`${CASES}/${c.id}/cancel`)
      .set(bearer(admin))
      .send({ reason: 'She chose to work on' })
      .expect(200);
    await kit.compute(run.id);
    expect(line(await kit.itemOf(run.id, withCase!.id), 'UNPAID_LEAVE')).toBeUndefined();
  });
});
