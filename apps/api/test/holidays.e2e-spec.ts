import type { HolidayCalendarView, LeaveBalanceView, OrgSnapshot } from '@gp/shared';
import { addDays } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { api, bearer, bootApp } from './test-env.js';
import { groupHr, leaveTypeId, NEXT_YEAR, rahima, shirin, workingSpan } from './leave-helpers.js';

describe('holiday calendars', () => {
  let app: INestApplication;
  let hr: string;
  let worker: string;
  let manager: string;
  let calendar: HolidayCalendarView;

  beforeAll(async () => {
    app = await bootApp();
    [hr, worker, manager] = await Promise.all([groupHr(app), rahima(app), shirin(app)]);
    const calendars = (await api(app).get('/tenant/holiday-calendars').set(bearer(hr)).expect(200))
      .body;
    calendar = calendars.find((c: HolidayCalendarView) => c.isDefault);
  });
  afterAll(() => app.close());

  it('provisions a default calendar used by every location without its own', () => {
    expect(calendar.name).toBe('Bangladesh public holidays');
    expect(calendar.locations.map((l) => l.name).toSorted()).toEqual([
      'Gazipur Factory',
      'Head Office, Gulshan',
      'Narayanganj Plant',
    ]);
  });

  it('checks the year against the Labour Act festival-holiday rule', async () => {
    const year = (
      await api(app)
        .get(`/tenant/holiday-calendars/${calendar.id}/holidays?year=${NEXT_YEAR}`)
        .set(bearer(worker))
        .expect(200)
    ).body;
    expect(
      year.holidays.find((h: { date: string }) => h.date === `${NEXT_YEAR}-12-16`),
    ).toMatchObject({
      name: 'Victory Day',
      isTentative: false,
    });
    expect(year.festivalDaysRequired).toBe(13);
    expect(year.festivalRule).toMatchObject({ reference: { section: '118' } });
  });

  it('recounts approved leave when a holiday is added and removed, with ledger corrections', async () => {
    const CL = await leaveTypeId(app, worker, 'CL');
    const span = await workingSpan(app, worker, CL, `${NEXT_YEAR}-11-22`, 3);
    const request = (
      await api(app)
        .post('/tenant/me/leave/requests')
        .set(bearer(worker))
        .send({ leaveTypeId: CL, ...span, reason: 'Trip' })
        .expect(201)
    ).body;
    const step = (await api(app).get('/tenant/approvals').set(bearer(manager))).body.find(
      (i: { subjectType: string; request?: { id: string } }) =>
        i.subjectType === 'leave_request' && i.request!.id === request.id,
    ).stepId;
    await api(app)
      .post(`/tenant/approvals/${step}/approve`)
      .set(bearer(manager))
      .send({})
      .expect(201);
    const before = await clBalance();

    // HR declares the middle day a company holiday: the leave now costs 2 days, not 3.
    const added = await api(app)
      .post(`/tenant/holiday-calendars/${calendar.id}/holidays`)
      .set(bearer(hr))
      .send({ date: addDays(span.startDate, 1), name: 'Factory anniversary', kind: 'company' })
      .expect(201);
    expect(added.body.recalculatedRequests).toBe(1);
    expect((await clBalance()).available).toBe(before.available! + 1);

    const removed = await api(app)
      .delete(`/tenant/holidays/${added.body.holiday.id}`)
      .set(bearer(hr))
      .expect(200);
    expect(removed.body.recalculatedRequests).toBe(1);
    expect((await clBalance()).available).toBe(before.available);
  });

  it('imports the Bangladesh template without duplicating dates', async () => {
    const again = await api(app)
      .post(`/tenant/holiday-calendars/${calendar.id}/import-bd`)
      .set(bearer(hr))
      .send({ year: NEXT_YEAR })
      .expect(201);
    expect(again.body.added).toBe(0);
    const later = await api(app)
      .post(`/tenant/holiday-calendars/${calendar.id}/import-bd`)
      .set(bearer(hr))
      .send({ year: 2031 })
      .expect(201);
    expect(later.body).toMatchObject({ added: 6, skipped: 0 });
  });

  it('lets only HR change holidays', async () => {
    await api(app)
      .post(`/tenant/holiday-calendars/${calendar.id}/holidays`)
      .set(bearer(worker))
      .send({ date: `${NEXT_YEAR}-06-01`, name: 'Not allowed', kind: 'company' })
      .expect(403);
  });

  it('gives a location its own calendar and weekly off days', async () => {
    const org = (await api(app).get('/tenant/org').set(bearer(hr))).body as OrgSnapshot;
    const factory = org.locations.find((l) => l.code === 'GZP')!;
    const own = (
      await api(app)
        .post('/tenant/holiday-calendars')
        .set(bearer(hr))
        .send({ name: 'Factory calendar' })
        .expect(201)
    ).body;
    await api(app)
      .patch(`/tenant/locations/${factory.id}`)
      .set(bearer(hr))
      .send({ holidayCalendarId: own.id, weeklyOffDays: [5] })
      .expect(200);
    const mine = (
      await api(app).get(`/tenant/me/holidays?year=${NEXT_YEAR}`).set(bearer(worker)).expect(200)
    ).body;
    expect(mine.calendar.name).toBe('Factory calendar');
    expect(mine.festivalDays).toBe(0);
    await api(app)
      .patch(`/tenant/locations/${factory.id}`)
      .set(bearer(hr))
      .send({ holidayCalendarId: null })
      .expect(200);
  });

  async function clBalance() {
    const balances = (
      await api(app).get(`/tenant/me/leave/balances?year=${NEXT_YEAR}`).set(bearer(worker))
    ).body;
    return balances.find((b: LeaveBalanceView) => b.leaveType.code === 'CL') as LeaveBalanceView;
  }
});
