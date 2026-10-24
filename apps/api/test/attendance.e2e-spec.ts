import type {
  ApprovalItem,
  AttendanceDayView,
  AttendanceRangeView,
  EmployeeAttendanceView,
  RegularizationApprovalItem,
} from '@gp/shared';
import { addDays, todayIn } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { api, bearer, bootApp } from './test-env.js';
import { groupHr, leaveTypeId, rahima, shirin } from './leave-helpers.js';

// The seed tracks attendance from 1 October 2026 and has device punches for 1–23 October:
// the Gazipur factory on the 08:00–17:00 day shift, Narayanganj on a day/night roster.

const GAZIPUR = { latitude: 24.0023, longitude: 90.3474 };

/** A local Dhaka time as an instant. */
const dhaka = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`).toISOString();

describe('attendance', () => {
  let app: INestApplication;
  let hr: string;
  let worker: string; // Rahima, MG-0005, sewing operator
  let manager: string; // Shirin, MG-0004, her line supervisor
  const ids = new Map<string, string>();

  beforeAll(async () => {
    app = await bootApp();
    [hr, worker, manager] = await Promise.all([groupHr(app), rahima(app), shirin(app)]);
    const people = (
      await api(app).get('/tenant/employees?search=MG-00&pageSize=100').set(bearer(hr)).expect(200)
    ).body.items as { id: string; employeeCode: string }[];
    for (const p of people) ids.set(p.employeeCode, p.id);
  });
  afterAll(() => app.close());

  const employeeDays = async (code: string, from: string, to = from) =>
    (
      await api(app)
        .get(`/tenant/employees/${ids.get(code)}/attendance?from=${from}&to=${to}`)
        .set(bearer(hr))
        .expect(200)
    ).body as EmployeeAttendanceView;
  const dayOf = async (code: string, date: string): Promise<AttendanceDayView> =>
    (await employeeDays(code, date)).range.days[0]!;
  const inbox = async (token: string) =>
    (await api(app).get('/tenant/approvals').set(bearer(token)).expect(200)).body as ApprovalItem[];
  const regularizationStep = async (token: string, id: string) =>
    (await inbox(token)).find(
      (i): i is RegularizationApprovalItem =>
        i.subjectType === 'regularization' && i.regularization.id === id,
    )!;

  const settings = (k: object) =>
    api(app).patch('/tenant/attendance/settings').set(bearer(hr)).send(k).expect(200);

  it('turns device punches into days: late, overtime, absence and a missing punch', async () => {
    const { range } = await employeeDays('MG-0005', '2026-10-01', '2026-10-23');
    // Other tests approve leave on the 15th and the missing punch on the 20th.
    expect(range.totals).toMatchObject({ late: 1, overtimeMinutes: 120 });
    expect(range.totals.present).toBeGreaterThanOrEqual(17);
    const day = (date: string) => range.days.find((d) => d.date === date)!;
    expect(day('2026-10-06')).toMatchObject({ lateMinutes: 22, flags: ['late'] });
    expect(day('2026-10-13').overtimeMinutes).toBe(120);
    expect(day('2026-10-09')).toMatchObject({ dayType: 'weekly_off', status: 'off' });
    expect(['absent', 'on_leave']).toContain(day('2026-10-15').status);
    expect(['missing_punch', 'present']).toContain(day('2026-10-20').status);
  });

  it('keeps a night shift’s morning out-punch with the night it started', async () => {
    // Narayanganj's roster: day shifts 1–6 October, off on the 7th, nights from the 8th.
    const night = await dayOf('MG-0008', '2026-10-08');
    expect(night).toMatchObject({
      status: 'present',
      shift: { code: 'F-NIGHT' },
      shiftSource: 'roster',
    });
    expect(night.firstIn! < dhaka('2026-10-08', '20:05')).toBe(true);
    expect(night.lastOut! > dhaka('2026-10-09', '05:00')).toBe(true);
    // A rostered night on a Friday is a working day, and the rostered day off is not.
    expect((await dayOf('MG-0008', '2026-10-09')).dayType).toBe('working');
    expect((await dayOf('MG-0008', '2026-10-07')).dayType).toBe('weekly_off');
  });

  it('punches from the app only inside the geofence, and not twice in a minute', async () => {
    const punch = (body: object) =>
      api(app).post('/tenant/me/attendance/punch').set(bearer(worker)).send(body);
    const outside = await punch({ source: 'web', latitude: 24.1, longitude: 90.3474 }).expect(400);
    expect(outside.body.code).toBe('outside_geofence');
    expect((await punch({ source: 'web' }).expect(400)).body.code).toBe('location_required');

    const before = (
      await api(app).get('/tenant/me/attendance/today').set(bearer(worker)).expect(200)
    ).body;
    const after = (await punch({ source: 'mobile', ...GAZIPUR, accuracyM: 12 }).expect(201)).body;
    expect(after.punches.length).toBe(before.punches.length + 1);
    expect(after.punches.at(-1)).toMatchObject({ source: 'mobile', insideGeofence: true });
    expect(after.nextDirection).not.toBe(before.nextDirection);
    expect((await punch({ source: 'web', ...GAZIPUR }).expect(409)).body.code).toBe('too_soon');
  });

  it('refuses app punches when HR turns them off', async () => {
    await settings({ selfPunch: 'off' });
    try {
      const res = await api(app)
        .post('/tenant/me/attendance/punch')
        .set(bearer(worker))
        .send({ source: 'web', ...GAZIPUR })
        .expect(403);
      expect(res.body.code).toBe('self_punch_disabled');
    } finally {
      await settings({ selfPunch: 'geofenced' });
    }
  });

  it('lets HR add a missed punch and void a wrong one, keeping both on record', async () => {
    // Anjali left at 12:30 on 8 October: a half day.
    expect((await dayOf('MG-0006', '2026-10-08')).status).toBe('half_day');
    const punch = (
      await api(app)
        .post(`/tenant/employees/${ids.get('MG-0006')}/attendance/punches`)
        .set(bearer(hr))
        .send({ date: '2026-10-08', time: '17:02', reason: 'Signed the gate register' })
        .expect(201)
    ).body;
    expect((await dayOf('MG-0006', '2026-10-08')).status).toBe('present');

    await api(app)
      .post(`/tenant/attendance/punches/${punch.id}/void`)
      .set(bearer(hr))
      .send({ reason: 'Entered on the wrong day' })
      .expect(201);
    const view = await employeeDays('MG-0006', '2026-10-08');
    expect(view.range.days[0]!.status).toBe('half_day');
    expect(view.punches.find((p) => p.id === punch.id)).toMatchObject({
      voided: true,
      note: 'Entered on the wrong day',
    });
    await api(app)
      .post(`/tenant/employees/${ids.get('MG-0006')}/attendance/punches`)
      .set(bearer(worker))
      .send({ date: '2026-10-08', time: '17:02', reason: 'Not HR' })
      .expect(403);
  });

  it('approves a missed exit punch through the supervisor’s inbox', async () => {
    // Seeded: Rahima's exit on 20 October was not read; Shirin has it to approve.
    const item = (await inbox(manager)).find(
      (i): i is RegularizationApprovalItem =>
        i.subjectType === 'regularization' && i.regularization.date === '2026-10-20',
    )!;
    expect(item.day?.status).toBe('missing_punch');
    const decided = (
      await api(app)
        .post(`/tenant/approvals/${item.stepId}/approve`)
        .set(bearer(manager))
        .send({ comment: 'Reader was faulty that week' })
        .expect(201)
    ).body;
    expect(decided).toMatchObject({ status: 'approved', outTime: '17:06' });
    const day = await dayOf('MG-0005', '2026-10-20');
    expect(day).toMatchObject({ status: 'present', lastOut: dhaka('2026-10-20', '17:06') });
    expect(day.flags).toContain('regularized');
  });

  it('takes one pending correction a day, within the window, and lets it be cancelled', async () => {
    const today = todayIn();
    const date = addDays(today, -2);
    const ask = (body: object) =>
      api(app)
        .post('/tenant/me/attendance/regularizations')
        .set(bearer(worker))
        .send({ kind: 'missed_punch', reason: 'Card reader was down', ...body });
    expect((await ask({ date: addDays(today, 1), inTime: '08:00' }).expect(400)).body.code).toBe(
      'future_day',
    );
    expect((await ask({ date: addDays(today, -45), inTime: '08:00' }).expect(400)).body.code).toBe(
      'outside_window',
    );
    const first = (await ask({ date, outTime: '17:30' }).expect(201)).body;
    expect(first.status).toBe('pending');
    expect((await ask({ date, outTime: '17:40' }).expect(409)).body.code).toBe('already_pending');

    await api(app)
      .post(`/tenant/attendance/regularizations/${first.id}/cancel`)
      .set(bearer(worker))
      .expect(201);
    expect((await regularizationStep(manager, first.id)) ?? null).toBeNull();
    const second = (await ask({ date, outTime: '17:35' }).expect(201)).body;
    const step = await regularizationStep(manager, second.id);
    const rejected = (
      await api(app)
        .post(`/tenant/approvals/${step.stepId}/reject`)
        .set(bearer(manager))
        .send({ comment: 'The gate log shows no exit at that time' })
        .expect(201)
    ).body;
    expect(rejected.status).toBe('rejected');
  });

  it('sends a correction to HR when the manager has no login, and counts on-duty days', async () => {
    // Shirin's own manager has no workspace login, so HR decides.
    const date = addDays(todayIn(), -3);
    const request = (
      await api(app)
        .post('/tenant/me/attendance/regularizations')
        .set(bearer(manager))
        .send({ date, kind: 'on_duty', reason: 'Buyer audit at the Narayanganj plant' })
        .expect(201)
    ).body;
    expect(
      request.steps.map((s: { kind: string; status: string }) => `${s.kind}:${s.status}`),
    ).toEqual(['manager:skipped', 'hr:pending']);
    const step = await regularizationStep(hr, request.id);
    await api(app)
      .post(`/tenant/approvals/${step.stepId}/approve`)
      .set(bearer(hr))
      .send({})
      .expect(201);
    const day = await dayOf('MG-0004', date);
    expect(day.status).toBe('present');
    expect(day.flags).toContain('on_duty');
  });

  it('shows approved leave on attendance, even for a past day', async () => {
    // Shirin's sick leave goes to HR, as her own manager has no login.
    const SL = await leaveTypeId(app, manager, 'SL');
    const request = (
      await api(app)
        .post('/tenant/me/leave/requests')
        .set(bearer(manager))
        .send({ leaveTypeId: SL, startDate: '2026-10-12', endDate: '2026-10-12', reason: 'Fever' })
        .expect(201)
    ).body;
    expect((await dayOf('MG-0004', '2026-10-12')).status).toBe('present');
    const step = (await inbox(hr)).find(
      (i) => i.subjectType === 'leave_request' && i.request.id === request.id,
    )!;
    await api(app)
      .post(`/tenant/approvals/${step.stepId}/approve`)
      .set(bearer(hr))
      .send({})
      .expect(201);
    const day = await dayOf('MG-0004', '2026-10-12');
    expect(day).toMatchObject({ status: 'on_leave', leave: { requestId: request.id, code: 'SL' } });
  });

  it('accepts an Edge Agent’s punches once, keeps strangers aside and links them by PIN', async () => {
    const agent = (
      await api(app)
        .post('/tenant/attendance/agents')
        .set(bearer(hr))
        .send({ name: 'Gazipur test PC' })
        .expect(201)
    ).body;
    expect(agent.token).toMatch(/^gpe\./);
    const upload = (token: string, punches: object[]) =>
      api(app).post('/edge/v1/punches').set(bearer(token)).send({ punches });
    const batch = [
      {
        deviceSerial: 'TEST-ZK-1',
        vendor: 'zkteco',
        deviceUserId: '1006',
        punchedAt: '2026-10-22T06:30:00+06:00',
        direction: 'in',
      },
      {
        deviceSerial: 'TEST-ZK-1',
        vendor: 'zkteco',
        deviceUserId: '9999',
        punchedAt: '2026-10-22T07:00:00+06:00',
      },
    ];

    await upload('gpe.not-a-token', batch).expect(401);
    expect((await upload(agent.token, batch).expect(200)).body).toEqual({
      accepted: 2,
      duplicates: 0,
      unmatched: 1,
    });
    expect((await upload(agent.token, batch).expect(200)).body).toMatchObject({
      accepted: 0,
      duplicates: 2,
    });
    expect((await dayOf('MG-0006', '2026-10-22')).firstIn).toBe(dhaka('2026-10-22', '06:30'));

    const devices = (await api(app).get('/tenant/attendance/devices').set(bearer(hr))).body;
    expect(
      devices.find((d: { serialNumber: string }) => d.serialNumber === 'TEST-ZK-1'),
    ).toMatchObject({
      vendor: 'zkteco',
      agent: { name: 'Gazipur test PC' },
    });
    const unmatched = (await api(app).get('/tenant/attendance/unmatched').set(bearer(hr))).body;
    expect(unmatched.map((u: { deviceUserId: string }) => u.deviceUserId)).toContain('9999');

    const beat = await api(app)
      .post('/edge/v1/heartbeat')
      .set(bearer(agent.token))
      .send({ agentVersion: '0.1.0', queued: 0, devices: [] })
      .expect(200);
    expect(beat.body.agentId).toBe(agent.id);

    await api(app).post(`/tenant/attendance/agents/${agent.id}/revoke`).set(bearer(hr)).expect(201);
    await upload(agent.token, batch).expect(401);
  });

  it('claims a device user’s waiting punches when HR sets their PIN', async () => {
    // MG-0010 is enrolled on the Gazipur device as 1010, but HR never entered it.
    expect((await dayOf('MG-0010', '2026-10-01')).status).toBe('absent');
    const res = await api(app)
      .patch(`/tenant/employees/${ids.get('MG-0010')}/attendance-profile`)
      .set(bearer(hr))
      .send({ attendancePin: '1010' })
      .expect(200);
    expect(res.body.linkedPunches).toBe(38);
    expect((await dayOf('MG-0010', '2026-10-01')).status).toBe('present');
    await api(app)
      .patch(`/tenant/employees/${ids.get('MG-0006')}/attendance-profile`)
      .set(bearer(hr))
      .send({ attendancePin: '1010' })
      .expect(409);
  });

  it('refuses shifts outside the Labour Act and reprocesses when someone moves shift', async () => {
    const shift = (body: object) =>
      api(app)
        .post('/tenant/attendance/shifts')
        .set(bearer(hr))
        .send({ name: 'Early', breakMinutes: 60, ...body });
    const long = await shift({ code: 'T-LONG', startTime: '07:00', endTime: '18:00' }).expect(400);
    expect(long.body.code).toBe('statutory_limit');
    expect(long.body.issues[0].message).toMatch(/s\.100/);
    const noRest = await shift({
      code: 'T-REST',
      startTime: '07:00',
      endTime: '15:00',
      breakMinutes: 15,
    }).expect(400);
    expect(noRest.body.issues[0].message).toMatch(/60 minutes.*s\.101/);

    const early = (
      await shift({ code: 'T-EARLY', startTime: '07:00', endTime: '16:00' }).expect(201)
    ).body;
    await api(app)
      .post('/tenant/attendance/shift-assignments')
      .set(bearer(hr))
      .send({ employeeIds: [ids.get('MG-0003')], shiftId: early.id, effectiveFrom: '2026-10-19' })
      .expect(201);
    const view = await employeeDays('MG-0003', '2026-10-18', '2026-10-22');
    expect(view.shifts.map((s) => s.shift.code)).toEqual(['T-EARLY', 'F-DAY']);
    expect(view.range.days[0]!.shift?.code).toBe('F-DAY');
    // His usual 07:48–07:59 arrival is now late.
    expect(view.range.days.filter((d) => d.flags.includes('late')).length).toBe(4);
    const summary = (
      await api(app).get('/tenant/attendance/summary?month=2026-10').set(bearer(hr)).expect(200)
    ).body;
    const row = summary.rows.find(
      (r: { employee: { employeeCode: string } }) => r.employee.employeeCode === 'MG-0003',
    );
    expect(row.totals.late).toBe(4);
  });

  it('rosters days off and shifts over the assignment, and clears them again', async () => {
    const from = addDays(todayIn(), 10);
    const to = addDays(from, 1);
    const shifts = (await api(app).get('/tenant/attendance/shifts').set(bearer(hr))).body;
    const night = shifts.find((s: { code: string }) => s.code === 'F-NIGHT');
    const employeeIds = [ids.get('MG-0007')];
    await api(app)
      .post('/tenant/attendance/roster')
      .set(bearer(hr))
      .send({ employeeIds, from, to, pattern: [null, night.id] })
      .expect(201);
    const roster = async () =>
      (
        await api(app)
          .get(`/tenant/attendance/roster?from=${from}&to=${to}`)
          .set(bearer(hr))
          .expect(200)
      ).body.rows.find(
        (r: { employee: { employeeCode: string } }) => r.employee.employeeCode === 'MG-0007',
      ).days;
    expect(await roster()).toMatchObject([
      { shift: null, source: 'roster', dayType: 'weekly_off' },
      { shift: { code: 'F-NIGHT' }, source: 'roster' },
    ]);
    await api(app)
      .post('/tenant/attendance/roster/clear')
      .set(bearer(hr))
      .send({ employeeIds, from, to })
      .expect(201);
    expect((await roster()).every((d: { source: string }) => d.source === 'assignment')).toBe(true);
  });

  it('keeps the default shift in use', async () => {
    const shifts = (await api(app).get('/tenant/attendance/shifts').set(bearer(hr))).body;
    const general = shifts.find((s: { isDefault: boolean }) => s.isDefault);
    await api(app)
      .patch(`/tenant/attendance/shifts/${general.id}`)
      .set(bearer(hr))
      .send({ isActive: false })
      .expect(400);
  });

  it('shows a supervisor her team’s day and HR everyone’s', async () => {
    const daily = async (token: string) =>
      (
        await api(app)
          .get('/tenant/attendance/daily?date=2026-10-21')
          .set(bearer(token))
          .expect(200)
      ).body;
    const team = await daily(manager);
    const codes = team.rows.map(
      (r: { employee: { employeeCode: string } }) => r.employee.employeeCode,
    );
    expect(codes).toEqual(expect.arrayContaining(['MG-0004', 'MG-0005', 'MG-0007']));
    expect(codes).not.toContain('MG-0001');
    expect(
      team.rows.find(
        (r: { employee: { employeeCode: string } }) => r.employee.employeeCode === 'MG-0007',
      ).day.status,
    ).toBe('absent');
    const everyone = await daily(hr);
    expect(everyone.rows.length).toBeGreaterThan(team.rows.length);
    expect(everyone.counts.present).toBeGreaterThan(0);
    // An employee cannot read HR's reports.
    await api(app).get('/tenant/attendance/summary?month=2026-10').set(bearer(worker)).expect(403);
  });

  it('stores processed days for payroll, and HR can reprocess a range', async () => {
    const res = await api(app)
      .post('/tenant/attendance/process')
      .set(bearer(hr))
      .send({ from: '2026-10-01', to: '2026-10-23' })
      .expect(201);
    expect(res.body.days).toBeGreaterThan(200);
    const summary = (
      await api(app).get('/tenant/attendance/summary?month=2026-10').set(bearer(hr)).expect(200)
    ).body;
    const head = summary.rows.find(
      (r: { employee: { employeeCode: string } }) => r.employee.employeeCode === 'MG-0001',
    );
    expect(head.totals.present).toBeGreaterThan(10);
    expect(head.weeksOverLimit).toBe(0);
  });

  it('gives my month with totals', async () => {
    const view = (
      await api(app)
        .get('/tenant/me/attendance?from=2026-10-01&to=2026-10-31')
        .set(bearer(worker))
        .expect(200)
    ).body as AttendanceRangeView;
    expect(view.days.length).toBe(31);
    expect(view.timeZone).toBe('Asia/Dhaka');
    expect(view.totals.present).toBeGreaterThanOrEqual(17);
  });
});
