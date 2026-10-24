import type { ApprovalItem, LeaveBalanceView, LeaveRequestView } from '@gp/shared';
import { addDays, todayIn, weekdayOf } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { api, bearer, bootApp, tenantLogin } from './test-env.js';
import { groupHr, leaveTypeId, NEXT_YEAR, rahima, shirin, workingSpan } from './leave-helpers.js';

const balanceOf = (balances: LeaveBalanceView[], code: string) =>
  balances.find((b) => b.leaveType.code === code)!;

describe('leave', () => {
  let app: INestApplication;
  let hr: string;
  let worker: string; // Rahima, a sewing operator on Line 1
  let manager: string; // Shirin, her line supervisor
  let CL: string;
  let AL: string;
  let SL: string;
  let ML: string;

  beforeAll(async () => {
    app = await bootApp();
    [hr, worker, manager] = await Promise.all([groupHr(app), rahima(app), shirin(app)]);
    [CL, AL, SL, ML] = await Promise.all([
      leaveTypeId(app, worker, 'CL'),
      leaveTypeId(app, worker, 'AL'),
      leaveTypeId(app, worker, 'SL'),
      leaveTypeId(app, worker, 'ML'),
    ]);
  });
  afterAll(() => app.close());

  const balances = async (token: string, year: number) =>
    (await api(app).get(`/tenant/me/leave/balances?year=${year}`).set(bearer(token)).expect(200))
      .body as LeaveBalanceView[];
  const apply = (token: string, body: object) =>
    api(app).post('/tenant/me/leave/requests').set(bearer(token)).send(body);
  const inbox = async (token: string) =>
    (await api(app).get('/tenant/approvals').set(bearer(token)).expect(200)).body as ApprovalItem[];
  const calendarCodes = async (token: string) =>
    (
      await api(app)
        .get('/tenant/leave/calendar?from=2026-11-01&to=2026-11-30')
        .set(bearer(token))
        .expect(200)
    ).body.entries.map((e: { employee: { employeeCode: string } }) => e.employee.employeeCode);
  const stepFor = async (token: string, requestId: string) =>
    (await inbox(token)).find((i) => i.request.id === requestId)!.stepId;

  it('provisions the Bangladesh leave types at their statutory values', async () => {
    const types = (await api(app).get('/tenant/leave/types').set(bearer(hr)).expect(200)).body;
    const byCode = Object.fromEntries(types.map((t: { code: string }) => [t.code, t]));
    expect(byCode.CL).toMatchObject({
      daysPerYear: 10,
      statutoryKey: 'casual',
      carryForwardMax: 0,
    });
    expect(byCode.SL).toMatchObject({ daysPerYear: 14, statutoryKey: 'sick' });
    expect(byCode.AL).toMatchObject({
      accrual: 'earned',
      carryForwardMax: 40,
      minServiceDays: 365,
    });
    expect(byCode.ML).toMatchObject({
      maxDaysPerRequest: 120,
      gender: 'female',
      countsOffDays: true,
    });
  });

  it('publishes the rules with their versions and legal references', async () => {
    const rules = (await api(app).get('/tenant/rules').set(bearer(worker)).expect(200)).body;
    const maternity = rules.filter((r: { key: string }) => r.key === 'leave.maternity.days');
    expect(maternity.map((r: { value: number }) => r.value)).toEqual([112, 120]);
    expect(maternity[1]).toMatchObject({ from: '2025-11-17', status: 'needs_review' });
  });

  it('computes balances: the seeded casual leave Rahima took in 2026', async () => {
    const cl = balanceOf(await balances(worker, 2026), 'CL');
    expect(cl).toMatchObject({ entitlement: 10, taken: 2, available: 8 });
  });

  it('earns annual leave from last year’s work and carries forward only from go-live', async () => {
    const goLive = Number(todayIn().slice(0, 4)); // the seed creates the workspace today
    const first = balanceOf(await balances(worker, goLive), 'AL');
    // Rahima joined in 2020, but leave taken before the workspace went live was never
    // recorded here, so nothing carries into the first year; HR enters opening balances.
    expect(first.entitlement).toBeGreaterThan(15);
    expect(first.carriedForward).toBe(0);
    const next = balanceOf(await balances(worker, goLive + 1), 'AL');
    expect(next.carriedForward).toBe(Math.min(40, first.available!));
  });

  it('runs apply → manager approval, then reverses the balance on cancel', async () => {
    // Other test files share the database, so compare with the balance before we start.
    const before = balanceOf(await balances(worker, NEXT_YEAR), 'CL');
    const span = await workingSpan(app, worker, CL, `${NEXT_YEAR}-02-01`, 2);
    const applied = await apply(worker, {
      leaveTypeId: CL,
      ...span,
      reason: 'Wedding in the family',
    }).expect(201);
    const request = applied.body as LeaveRequestView;
    expect(request).toMatchObject({ status: 'pending', days: 2 });
    expect(request.steps).toEqual([
      expect.objectContaining({ kind: 'manager', status: 'pending' }),
    ]);
    expect(balanceOf(await balances(worker, NEXT_YEAR), 'CL')).toMatchObject({
      pending: before.pending + 2,
      available: before.available! - 2,
    });

    const item = (await inbox(manager)).find((i) => i.request.id === request.id)!;
    expect(item.balance).toMatchObject({ available: before.available! - 2 });
    const approved = await api(app)
      .post(`/tenant/approvals/${item.stepId}/approve`)
      .set(bearer(manager))
      .send({ comment: 'Enjoy' })
      .expect(201);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.steps[0]).toMatchObject({
      status: 'approved',
      comment: 'Enjoy',
      decidedBy: 'Shirin Akter',
    });
    expect(balanceOf(await balances(worker, NEXT_YEAR), 'CL')).toMatchObject({
      taken: before.taken + 2,
      pending: before.pending,
      available: before.available! - 2,
    });

    const cancelled = await api(app)
      .post(`/tenant/leave/requests/${request.id}/cancel`)
      .set(bearer(worker))
      .expect(201);
    expect(cancelled.body.status).toBe('cancelled');
    expect(balanceOf(await balances(worker, NEXT_YEAR), 'CL')).toMatchObject({
      taken: before.taken,
      available: before.available,
    });
  });

  it('goes through manager then HR for annual leave', async () => {
    const span = await workingSpan(app, worker, AL, `${NEXT_YEAR}-03-01`, 3);
    const request = (
      await apply(worker, { leaveTypeId: AL, ...span, reason: 'Home visit' }).expect(201)
    ).body;
    await api(app)
      .post(`/tenant/approvals/${await stepFor(manager, request.id)}/approve`)
      .set(bearer(manager))
      .send({})
      .expect(201);

    const afterManager = (
      await api(app).get('/tenant/me/leave/requests').set(bearer(worker))
    ).body.find((r: LeaveRequestView) => r.id === request.id);
    expect(afterManager.status).toBe('pending');
    expect(afterManager.steps.map((s: { status: string }) => s.status)).toEqual([
      'approved',
      'pending',
    ]);
    expect(await inbox(worker)).toEqual([]);

    const done = await api(app)
      .post(`/tenant/approvals/${await stepFor(hr, request.id)}/approve`)
      .set(bearer(hr))
      .send({})
      .expect(201);
    expect(done.body.status).toBe('approved');

    // Overlapping the approved leave is refused.
    const overlap = await apply(worker, { leaveTypeId: CL, ...span, reason: 'Again' }).expect(400);
    expect(overlap.body.message).toMatch(/^Overlaps leave already requested/);
  });

  it('ends the chain on rejection', async () => {
    const span = await workingSpan(app, worker, SL, `${NEXT_YEAR}-04-01`, 1);
    const request = (
      await apply(worker, { leaveTypeId: SL, ...span, reason: 'Check-up' }).expect(201)
    ).body;
    const rejected = await api(app)
      .post(`/tenant/approvals/${await stepFor(manager, request.id)}/reject`)
      .set(bearer(manager))
      .send({ comment: 'Line is short-staffed that day' })
      .expect(201);
    expect(rejected.body.status).toBe('rejected');
    expect(balanceOf(await balances(worker, NEXT_YEAR), 'SL')).toMatchObject({
      pending: 0,
      available: 14,
    });
  });

  it('skips weekly offs and holidays in the day count', async () => {
    const victoryDay = `${NEXT_YEAR}-12-16`;
    const from = addDays(victoryDay, -1);
    const to = addDays(victoryDay, 1);
    const fridays = [from, victoryDay, to].filter(
      (d) => d !== victoryDay && weekdayOf(d) === 5,
    ).length;
    const preview = await api(app)
      .post('/tenant/me/leave/preview')
      .set(bearer(worker))
      .send({ leaveTypeId: CL, startDate: from, endDate: to })
      .expect(201);
    expect(preview.body.days).toBe(3 - 1 - fridays);
    expect(preview.body.excluded).toContainEqual({
      date: victoryDay,
      reason: 'holiday',
      name: 'Victory Day',
    });
  });

  it('refuses leave beyond the balance', async () => {
    const { available } = balanceOf(await balances(worker, NEXT_YEAR), 'CL');
    const res = await apply(worker, {
      leaveTypeId: CL,
      startDate: `${NEXT_YEAR}-11-01`,
      endDate: `${NEXT_YEAR}-11-20`,
      reason: 'Long holiday',
    }).expect(400);
    expect(res.body).toMatchObject({ code: 'leave_not_allowed' });
    expect(res.body.message).toContain(`Only ${available} days available.`);
  });

  it('applies the statutory maternity days, counting calendar days', async () => {
    const tooLong = await apply(worker, {
      leaveTypeId: ML,
      startDate: `${NEXT_YEAR}-07-01`,
      endDate: addDays(`${NEXT_YEAR}-07-01`, 124),
      reason: 'Maternity',
    }).expect(400);
    expect(tooLong.body.message).toMatch(/At most 120 days per request/);
    const ok = await apply(worker, {
      leaveTypeId: ML,
      startDate: `${NEXT_YEAR}-07-01`,
      endDate: addDays(`${NEXT_YEAR}-07-01`, 119),
      reason: 'Maternity',
    }).expect(201);
    expect(ok.body).toMatchObject({ days: 120, status: 'pending' });
    expect(ok.body.steps).toEqual([expect.objectContaining({ kind: 'hr', status: 'pending' })]);
  });

  it('refuses maternity leave for a male employee, even when HR applies', async () => {
    const people = (await api(app).get('/tenant/employees?search=MG-0001').set(bearer(hr))).body
      .items;
    const res = await api(app)
      .post(`/tenant/employees/${people[0].id}/leave/requests`)
      .set(bearer(hr))
      .send({
        leaveTypeId: ML,
        startDate: `${NEXT_YEAR}-08-01`,
        endDate: `${NEXT_YEAR}-08-10`,
        reason: 'Test',
      })
      .expect(400);
    expect(res.body.message).toMatch(/only for female employees/);
  });

  it('routes to HR when the only approver has no login, instead of auto-approving', async () => {
    // Shirin's own manager (Kamal) has no workspace login.
    const span = await workingSpan(app, manager, CL, `${NEXT_YEAR}-05-01`, 1);
    const request = (
      await apply(manager, { leaveTypeId: CL, ...span, reason: 'Personal' }).expect(201)
    ).body;
    expect(request.status).toBe('pending');
    expect(
      request.steps.map((s: { kind: string; status: string }) => `${s.kind}:${s.status}`),
    ).toEqual(['manager:skipped', 'hr:pending']);
  });

  it('counts what is waiting, for the navigation badge', async () => {
    for (const token of [manager, hr, worker]) {
      const { count } = (
        await api(app).get('/tenant/approvals/count').set(bearer(token)).expect(200)
      ).body;
      expect(count).toBe((await inbox(token)).length);
    }
  });

  it('lets only the assigned approver decide', async () => {
    const pending = (await inbox(manager)).find(
      (i) => i.request.employee.employeeCode === 'MG-0006',
    )!;
    const res = await api(app)
      .post(`/tenant/approvals/${pending.stepId}/approve`)
      .set(bearer(worker))
      .send({})
      .expect(403);
    expect(res.body.message).toBe('This approval is not yours to decide');
  });

  it('refuses a casual leave policy below the Labour Act, quoting the section', async () => {
    const res = await api(app)
      .patch(`/tenant/leave/types/${CL}`)
      .set(bearer(hr))
      .send({ daysPerYear: 8 })
      .expect(400);
    expect(res.body.code).toBe('below_statutory_minimum');
    expect(res.body.issues[0].message).toMatch(/at least 10 days.*s\.115/);
    await api(app)
      .patch(`/tenant/leave/types/${CL}`)
      .set(bearer(hr))
      .send({ daysPerYear: 12 })
      .expect(200);
    expect(balanceOf(await balances(worker, NEXT_YEAR), 'CL').entitlement).toBe(12);
    await api(app)
      .patch(`/tenant/leave/types/${CL}`)
      .set(bearer(hr))
      .send({ daysPerYear: 10 })
      .expect(200);
  });

  it('records HR adjustments with a note', async () => {
    const people = (await api(app).get('/tenant/employees?search=MG-0005').set(bearer(hr))).body
      .items;
    const before = balanceOf(await balances(worker, NEXT_YEAR), 'CL');
    const summary = await api(app)
      .post(`/tenant/employees/${people[0].id}/leave/adjustments`)
      .set(bearer(hr))
      .send({ leaveTypeId: CL, year: NEXT_YEAR, days: 1.5, note: 'Worked on a festival holiday' })
      .expect(201);
    expect(balanceOf(summary.body.balances, 'CL')).toMatchObject({
      adjustments: before.adjustments + 1.5,
      available: before.available! + 1.5,
    });
    expect(summary.body.ledger[0]).toMatchObject({ kind: 'adjustment', days: 1.5 });
  });

  it('shows a manager their reports, and a worker only their own unit', async () => {
    // Seeded pending leave in November 2026: Anjali (Line 1) and Mitu (Line 2), both Shirin's reports.
    expect(await calendarCodes(manager)).toEqual(expect.arrayContaining(['MG-0006', 'MG-0007']));
    const seenByRahima = await calendarCodes(worker);
    expect(seenByRahima).toContain('MG-0006');
    expect(seenByRahima).not.toContain('MG-0007');
  });

  it("keeps another workspace's leave out of reach", async () => {
    const ngo = (await tenantLogin(app, 'sponsored-ngo')).accessToken;
    expect(
      (await api(app).get('/tenant/leave/requests').set(bearer(ngo)).expect(200)).body,
    ).toEqual([]);
    expect(await inbox(ngo)).toEqual([]);
  });
});
