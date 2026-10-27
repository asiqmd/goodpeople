import {
  complianceAlerts,
  createDb,
  employees,
  notifications,
  runAsTenant,
  SEED_MANAGER_EMAIL,
  tenantAuditLog,
  tenants,
  tenantUsers,
  type Database,
} from '@gp/db';
import {
  addDays,
  addMonths,
  ROLE_PERMISSIONS,
  ASSIGNABLE_TENANT_ROLES,
  todayIn,
  type AdolescentsView,
  type ComplianceAlertPage,
  type ComplianceAlertView,
  type ComplianceCheckResult,
  type ComplianceOverview,
  type ComplianceSettingsView,
  type EmployeeAttendanceView,
  type EmployeeDetail,
  type HoursBoardView,
  type NightWorkRow,
  type NightWorkView,
  type OrgSnapshot,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray, isNull, like } from 'drizzle-orm';
import { weekStartOf } from '../src/modules/compliance/checker.js';
import { groupHr, loginAs } from './leave-helpers.js';
import { api, bearer, bootApp, testEnv } from './test-env.js';

const PDF = Buffer.from('%PDF-1.4\n% a certificate of fitness\n%%EOF\n');
const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const sum = (values: number[]) => values.reduce((n, v) => n + v, 0);

// Every test hires the people it needs in the seeded my-group workspace and records their
// punches as HR would, so the tests pass in any order. New hires work the default 09:00–18:00
// shift at the Gazipur factory, where Friday is the weekly holiday.
describe('compliance', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let hr: string;
  let org: OrgSnapshot;
  let tenantId: string;
  let seq = 0;
  const today = todayIn();
  /** Saturday to Friday, all in the past. */
  const lastWeek = addDays(weekStartOf(today), -7);
  const weekBefore = addDays(lastWeek, -7);

  beforeAll(async () => {
    app = await bootApp();
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    hr = await groupHr(app);
    org = (await api(app).get('/tenant/org').set(bearer(hr)).expect(200)).body;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    tenantId = tenant!.id;
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  async function hire(
    person: { gender?: string; dateOfBirth?: string; joinedOn?: string } = {},
    job: Record<string, unknown> = {},
  ): Promise<EmployeeDetail> {
    seq += 1;
    const code = `C-${Date.now().toString(36)}-${seq}`;
    const res = await api(app)
      .post('/tenant/employees')
      .set(bearer(hr))
      .send({
        employeeCode: code,
        fullName: `Compliance Test ${code}`,
        fatherName: 'Abdul Karim',
        motherName: 'Hosne Ara',
        dateOfBirth: '1994-04-12',
        gender: 'male',
        mobilePhone: '01812345678',
        presentAddress: address,
        permanentAddress: address,
        identity: { nid: `${Date.now()}${seq}`.slice(-10) },
        joinedOn: '2025-01-01',
        ...person,
        job: {
          legalEntityId: ref(org.legalEntities, 'MGT'),
          locationId: ref(org.locations, 'GZP'),
          orgUnitId: ref(org.orgUnits, 'MGT-L1'),
          designationId: ref(org.designations, 'SO'),
          gradeId: ref(org.grades, 'W5'),
          employmentType: 'permanent',
          workerCategory: 'worker',
          ...job,
        },
      })
      .expect(201);
    return res.body.employee as EmployeeDetail;
  }

  const punch = async (employeeId: string, date: string, time: string) =>
    (
      await api(app)
        .post(`/tenant/employees/${employeeId}/attendance/punches`)
        .set(bearer(hr))
        .send({ date, time, reason: 'From the gate register' })
        .expect(201)
    ).body as { id: string };
  /** In at `from` and out at `to` (the next morning when `to` is earlier). */
  const work = async (employeeId: string, date: string, from: string, to: string) => [
    await punch(employeeId, date, from),
    await punch(employeeId, to > from ? date : addDays(date, 1), to),
  ];
  const daysOf = async (employeeId: string, from: string, to: string) =>
    (
      (
        await api(app)
          .get(`/tenant/employees/${employeeId}/attendance?from=${from}&to=${to}`)
          .set(bearer(hr))
          .expect(200)
      ).body as EmployeeAttendanceView
    ).range.days;
  const check = async (from: string, to: string) =>
    (await api(app).post('/tenant/compliance/check').set(bearer(hr)).send({ from, to }).expect(201))
      .body as ComplianceCheckResult;
  const alertsOf = async (employeeId: string, filter = '') =>
    (
      (
        await api(app)
          .get(`/tenant/compliance/alerts?employeeId=${employeeId}&pageSize=100${filter}`)
          .set(bearer(hr))
          .expect(200)
      ).body as ComplianceAlertPage
    ).items;
  const one = async (employeeId: string, kind: string) => {
    const found = (await alertsOf(employeeId)).filter((a) => a.kind === kind);
    expect(found).toHaveLength(1);
    return found[0]!;
  };
  const ack = (id: string, note: string) =>
    api(app).post(`/tenant/compliance/alerts/${id}/acknowledge`).set(bearer(hr)).send({ note });
  const putSettings = (body: object) =>
    api(app).put('/tenant/compliance/settings').set(bearer(hr)).send(body);
  const DEFAULT_CAPS = {
    overtimeDailyCapMinutes: 120,
    overtimeWeeklyCapMinutes: 720,
    overtimeMonthlyCapMinutes: null,
    warnAtPercent: 90,
  };
  const sentFor = (alertId: string) =>
    runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ userId: notifications.userId, title: notifications.title })
        .from(notifications)
        .where(like(notifications.dedupeKey, `compliance.alert:${alertId}:%`)),
    );

  it('raises each adult and cap kind once, and re-running the check changes nothing', async () => {
    const worker = await hire();
    // Seven days in a row, 08:00 to 20:30: eleven and a half hours a day with overtime.
    for (let i = 0; i < 7; i++) await work(worker.id, addDays(weekBefore, i), '08:00', '20:30');
    const weekEnd = addDays(weekBefore, 6);
    const days = await daysOf(worker.id, weekBefore, weekEnd);

    const first = await check(weekBefore, weekEnd);
    expect(first.raised).toBeGreaterThanOrEqual(17);
    const alerts = await alertsOf(worker.id);
    const count = (kind: string) => alerts.filter((a) => a.kind === kind).length;
    expect({
      daily: count('daily_hours'),
      weekly: count('weekly_hours'),
      holiday: count('no_weekly_holiday'),
      overtimeDaily: count('overtime_daily'),
      overtimeWeekly: count('overtime_weekly'),
    }).toEqual({ daily: 7, weekly: 1, holiday: 1, overtimeDaily: 7, overtimeWeekly: 1 });
    expect(alerts.every((a) => a.status === 'open')).toBe(true);

    // The values are the processed days' own: there is one set of hours.
    const weekly = await one(worker.id, 'weekly_hours');
    expect(weekly).toMatchObject({
      periodStart: weekBefore,
      periodEnd: weekEnd,
      value: sum(days.map((d) => d.workedMinutes)),
      limit: 3600,
      detail: { reference: { section: '102' }, daysWorked: 7 },
      employee: { id: worker.id },
    });
    expect(await one(worker.id, 'no_weekly_holiday')).toMatchObject({
      periodStart: weekBefore,
      periodEnd: weekEnd,
      value: 7,
      limit: 6,
      detail: { reference: { section: '103' } },
    });
    expect(await one(worker.id, 'overtime_weekly')).toMatchObject({
      value: sum(days.map((d) => d.overtimeMinutes)),
      limit: 720,
      detail: { reference: null },
    });
    const monday = alerts.find(
      (a) => a.kind === 'daily_hours' && a.periodStart === addDays(weekBefore, 2),
    );
    expect(monday).toMatchObject({
      value: 690,
      limit: 600,
      detail: { reference: { section: '100' }, firstIn: '08:00', lastOut: '20:30' },
    });

    const again = await check(weekBefore, weekEnd);
    expect(again.raised).toBe(0);
    expect(again.updated).toBe(0);
    expect((await alertsOf(worker.id)).map((a) => a.id).toSorted()).toEqual(
      alerts.map((a) => a.id).toSorted(),
    );
  });

  it('acknowledges an alert with a note, keeps it acknowledged, and resolves it when the hours are corrected', async () => {
    const worker = await hire();
    const day = addDays(lastWeek, 2);
    await punch(worker.id, day, '08:00');
    const late = await punch(worker.id, day, '20:00');
    await check(day, day);
    const alert = await one(worker.id, 'daily_hours');
    expect(alert).toMatchObject({ status: 'open', value: 660, note: null, acknowledgedBy: null });

    expect((await ack(alert.id, 'no').expect(400)).body.code).toBe('validation_failed');
    const done = (await ack(alert.id, 'Export shipment; line leader told').expect(201))
      .body as ComplianceAlertView;
    expect(done).toMatchObject({
      status: 'acknowledged',
      note: 'Export shipment; line leader told',
      acknowledgedBy: { name: expect.any(String) },
    });
    expect((await ack(alert.id, 'Again').expect(409)).body.code).toBe('alert_acknowledged');

    // A later exit: the value follows the day while the alert stays acknowledged.
    const later = await punch(worker.id, day, '21:00');
    await check(day, day);
    expect(await one(worker.id, 'daily_hours')).toMatchObject({
      id: alert.id,
      status: 'acknowledged',
      value: 720,
      note: 'Export shipment; line leader told',
    });

    // Both late punches were wrong: the day is under ten hours and the alert no longer holds.
    for (const p of [late, later]) {
      await api(app)
        .post(`/tenant/attendance/punches/${p.id}/void`)
        .set(bearer(hr))
        .send({ reason: 'Wrong employee card' })
        .expect(201);
    }
    await punch(worker.id, day, '17:00');
    const result = await check(day, day);
    expect(result.resolved).toBeGreaterThanOrEqual(1);
    expect((await one(worker.id, 'daily_hours')).status).toBe('resolved');
    expect((await ack(alert.id, 'Late note').expect(409)).body.code).toBe('alert_resolved');
    const resolved = await alertsOf(worker.id, '&status=resolved');
    expect(resolved.map((a) => a.id)).toContain(alert.id);
  });

  it('checks the company’s overtime caps, a monthly one too, and refuses caps above the law', async () => {
    const above = await putSettings({ ...DEFAULT_CAPS, overtimeDailyCapMinutes: 180 }).expect(400);
    expect(above.body.code).toBe('cap_above_law');
    const settings = (await api(app).get('/tenant/compliance/settings').set(bearer(hr)))
      .body as ComplianceSettingsView;
    expect(settings).toMatchObject({
      law: {
        adultDaily: { minutes: 600, reference: { section: '100' } },
        adultWeekly: { minutes: 3600, reference: { section: '102' } },
        overtimeDaily: { minutes: 120 },
        overtimeWeekly: { minutes: 720 },
        adolescentDaily: { factory: 300, other: 420, reference: { section: '41' } },
        womenNight: { from: '22:00', to: '06:00', reference: { section: '109' } },
      },
    });

    const worker = await hire();
    // The 2nd to the 4th of a month that has passed them.
    const month = `${addDays(today, -5).slice(0, 7)}-01`;
    const dates = [1, 2, 3].map((n) => addDays(month, n));
    for (const date of dates) await work(worker.id, date, '08:00', '19:30');
    const days = await daysOf(worker.id, dates[0]!, dates[2]!);
    const overtime = sum(days.map((d) => d.overtimeMinutes));
    // An hour and a half of overtime on working days, the whole day on a Friday.
    expect(Math.min(...days.map((d) => d.overtimeMinutes))).toBeGreaterThanOrEqual(90);
    try {
      const caps = {
        overtimeDailyCapMinutes: 60,
        overtimeWeeklyCapMinutes: 720,
        overtimeMonthlyCapMinutes: overtime - 30,
        warnAtPercent: 80,
      };
      const saved = (await putSettings(caps).expect(200)).body as ComplianceSettingsView;
      expect(saved).toMatchObject({ ...caps, updatedAt: expect.any(String) });

      await check(dates[0]!, dates[2]!);
      expect(await one(worker.id, 'overtime_monthly')).toMatchObject({
        periodStart: month,
        value: overtime,
        limit: overtime - 30,
      });
      const daily = (await alertsOf(worker.id)).filter((a) => a.kind === 'overtime_daily');
      expect(daily.map((a) => a.periodStart).toSorted()).toEqual(dates);
      expect(daily.map((a) => a.value).toSorted()).toEqual(
        days.map((d) => d.overtimeMinutes).toSorted(),
      );
      expect(daily.every((a) => a.limit === 60)).toBe(true);
    } finally {
      await putSettings(DEFAULT_CAPS).expect(200);
    }
    // Back at the defaults, the same days pass the monthly check (no cap) on the next run.
    await check(dates[0]!, dates[2]!);
    expect((await one(worker.id, 'overtime_monthly')).status).toBe('resolved');
  });

  it('shows the week’s hours against the caps and the law, flagging those near a limit', async () => {
    const worker = await hire();
    // Saturday to Thursday, 08:00 to 18:20: 9h20 a day, 56 hours, 93% of the law's 60.
    for (let i = 0; i < 6; i++) await work(worker.id, addDays(lastWeek, i), '08:00', '18:20');
    const days = await daysOf(worker.id, lastWeek, addDays(lastWeek, 6));
    const board = async (unit: string) =>
      (
        await api(app)
          .get(
            `/tenant/compliance/hours?week=${addDays(lastWeek, 3)}&orgUnitId=${ref(org.orgUnits, unit)}`,
          )
          .set(bearer(hr))
          .expect(200)
      ).body as HoursBoardView;
    const view = await board('MGT-L1');
    expect(view).toMatchObject({
      weekStart: lastWeek,
      weekEnd: addDays(lastWeek, 6),
      warnAtPercent: 90,
      caps: { daily: 120, weekly: 720, monthly: null },
      law: { adultWeekly: { minutes: 3600, reference: { section: '102' } } },
    });
    expect(view.rows.find((r) => r.employee.id === worker.id)).toMatchObject({
      orgUnit: 'Line 1',
      adolescent: false,
      workplace: 'factory',
      daysWorked: 6,
      workedMinutes: sum(days.map((d) => d.workedMinutes)),
      overtimeMinutes: sum(days.map((d) => d.overtimeMinutes)),
      weeklyLimitMinutes: 3600,
      percent: 93,
      level: 'warn',
    });
    expect((await board('MGT-L2')).rows.map((r) => r.employee.id)).not.toContain(worker.id);
  });

  it('holds adolescents to the factory’s daily and weekly limits, and others to their own', async () => {
    const young = { dateOfBirth: addMonths(today, -(15 * 12 + 6)), joinedOn: addMonths(today, -3) };
    const inFactory = await hire(young);
    const inOffice = await hire(young, {
      locationId: ref(org.locations, 'HO'),
      orgUnitId: ref(org.orgUnits, 'MGT-HR'),
    });
    // Saturday to Thursday, 08:00 to 15:30: six and a half hours a day, 39 in the week.
    for (const person of [inFactory, inOffice]) {
      for (let i = 0; i < 6; i++) await work(person.id, addDays(weekBefore, i), '08:00', '15:30');
    }
    const weekEnd = addDays(weekBefore, 6);
    await check(weekBefore, weekEnd);

    const daily = (await alertsOf(inFactory.id)).filter((a) => a.kind === 'adolescent_daily');
    expect(daily).toHaveLength(6);
    expect(daily[0]).toMatchObject({
      value: 390,
      limit: 300,
      detail: { reference: { section: '41' }, workplace: 'factory', age: 15 },
    });
    expect(await one(inFactory.id, 'adolescent_weekly')).toMatchObject({
      periodStart: weekBefore,
      value: 2340,
      limit: 2160,
      detail: { workplace: 'factory', daysWorked: 6 },
    });
    // The adult limits do not apply to them, and an office allows 7 hours a day and 48 a week.
    // (Saturday is the head office's day off, so working it is overtime there.)
    expect((await alertsOf(inFactory.id)).map((a) => a.kind)).not.toContain('daily_hours');
    const office = await alertsOf(inOffice.id);
    expect(office.filter((a) => a.kind.startsWith('adolescent'))).toEqual([]);

    const again = await check(weekBefore, weekEnd);
    expect(again.raised).toBe(0);
    expect(
      (await alertsOf(inFactory.id)).filter((a) => a.kind.startsWith('adolescent')),
    ).toHaveLength(7);
  });

  it('flags an adolescent’s night work and missing certificate, cleared by uploading one', async () => {
    const dateOfBirth = addMonths(today, -(16 * 12 + 2));
    const minor = await hire({ dateOfBirth, joinedOn: addMonths(today, -6), gender: 'female' });
    const day = addDays(lastWeek, 1);
    // From 06:00: an hour inside 19:00–07:00, four and a half hours in all.
    await work(minor.id, day, '06:00', '10:30');
    await check(day, today);

    expect(await one(minor.id, 'adolescent_night')).toMatchObject({
      periodStart: day,
      value: 60,
      limit: 0,
      detail: {
        reference: { section: '41' },
        window: { from: '19:00', to: '07:00' },
        firstIn: '06:00',
        lastOut: '10:30',
        age: 16,
      },
    });
    // The stricter adolescent rule covers her; no separate alert as a woman at night.
    expect((await alertsOf(minor.id)).map((a) => a.kind).toSorted()).toEqual([
      'adolescent_certificate',
      'adolescent_night',
    ]);
    expect(await one(minor.id, 'adolescent_certificate')).toMatchObject({
      status: 'open',
      periodEnd: today,
      detail: { reference: { section: '37' }, certificate: { reason: 'missing' } },
    });
    const listed = async () =>
      (
        (await api(app).get('/tenant/compliance/adolescents').set(bearer(hr)).expect(200))
          .body as AdolescentsView
      ).rows.find((r) => r.employee.id === minor.id)!;
    expect(await listed()).toMatchObject({
      age: 16,
      workplace: 'factory',
      location: 'Gazipur Factory',
      certificate: { state: 'missing', documentId: null },
      weekLimitMinutes: 2160,
      dailyLimitMinutes: 300,
      openAlerts: 2,
    });

    const issuedOn = addDays(today, -10);
    const doc = (
      await api(app)
        .post(`/tenant/employees/${minor.id}/documents`)
        .set(bearer(hr))
        .attach('file', PDF, 'fitness.pdf')
        .field('category', 'fitness_certificate')
        .field('title', 'Certificate of fitness (Form 15)')
        .field('issuedOn', issuedOn)
        .expect(201)
    ).body as { id: string };
    await check(day, today);
    expect((await one(minor.id, 'adolescent_certificate')).status).toBe('resolved');
    expect((await one(minor.id, 'adolescent_night')).status).toBe('open');
    expect(await listed()).toMatchObject({
      certificate: {
        state: 'valid',
        documentId: doc.id,
        // No expiry date on it: 12 months from the upload (s.37).
        validUntil: addDays(addMonths(today, 12), -1),
      },
      openAlerts: 1,
    });
  });

  it('flags a woman’s night work without consent, and clears it once consent is recorded', async () => {
    const woman = await hire({ gender: 'female' });
    const day = addDays(lastWeek, 2);
    await work(woman.id, day, '14:00', '22:45');
    await check(day, day);
    const alert = await one(woman.id, 'women_night');
    expect(alert).toMatchObject({
      status: 'open',
      value: 45,
      limit: 0,
      detail: {
        reference: { section: '109' },
        window: { from: '22:00', to: '06:00' },
        firstIn: '14:00',
        lastOut: '22:45',
      },
    });
    const listed = (
      (await api(app).get('/tenant/compliance/night-work').set(bearer(hr)).expect(200))
        .body as NightWorkView
    ).rows.find((r) => r.employee.id === woman.id);
    expect(listed).toMatchObject({
      consentFrom: null,
      nightDays: 1,
      lastNight: day,
      openAlerts: 1,
    });

    const consent = (consentFrom: string | null, id = woman.id) =>
      api(app).put(`/tenant/compliance/night-work/${id}`).set(bearer(hr)).send({ consentFrom });
    // Consent from the next day does not cover that night.
    expect((await consent(addDays(day, 1)).expect(200)).body).toMatchObject({ openAlerts: 1 });
    const row = (await consent(day).expect(200)).body as NightWorkRow;
    expect(row).toMatchObject({ consentFrom: day, nightDays: 1, openAlerts: 0 });
    expect((await one(woman.id, 'women_night')).status).toBe('resolved');
    await check(day, day);
    expect((await one(woman.id, 'women_night')).status).toBe('resolved');

    const found = (
      await api(app)
        .get(`/tenant/compliance/night-work?search=${encodeURIComponent(woman.employeeCode)}`)
        .set(bearer(hr))
        .expect(200)
    ).body as NightWorkView;
    expect(found.rows.map((r) => r.employee.id)).toEqual([woman.id]);

    const man = await hire();
    expect((await consent(day, man.id).expect(400)).body.code).toBe('consent_women_only');
    const audit = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ after: tenantAuditLog.after })
        .from(tenantAuditLog)
        .where(
          and(
            eq(tenantAuditLog.action, 'compliance.night_consent'),
            eq(tenantAuditLog.entityId, woman.id),
          ),
        ),
    );
    expect(audit.map((a) => a.after)).toEqual(
      expect.arrayContaining([{ nightWorkConsentFrom: day }]),
    );
  });

  it('tells HR and the worker’s line manager once per alert, and keeps the pages to HR', async () => {
    const [manager] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ id: employees.id, userId: employees.userId })
        .from(employees)
        .innerJoin(tenantUsers, eq(tenantUsers.id, employees.userId))
        .where(eq(tenantUsers.email, SEED_MANAGER_EMAIL)),
    );
    const worker = await hire({}, { managerId: manager!.id });
    const day = addDays(lastWeek, 3);
    await punch(worker.id, day, '07:30');
    await punch(worker.id, day, '19:00');
    await check(day, day);
    const alert = await one(worker.id, 'daily_hours');

    const roles = ASSIGNABLE_TENANT_ROLES.filter((r) =>
      ROLE_PERMISSIONS[r].includes('compliance.manage'),
    );
    const hrUsers = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ id: tenantUsers.id })
        .from(tenantUsers)
        .where(and(inArray(tenantUsers.role, roles), isNull(tenantUsers.disabledAt))),
    );
    const sent = await sentFor(alert.id);
    expect(sent.map((s) => s.userId).toSorted()).toEqual(
      [...hrUsers.map((u) => u.id), manager!.userId].toSorted(),
    );
    expect(sent.map((s) => s.title)).toContainEqual(expect.stringMatching(/worked over 10 hours/));

    // A later exit changes the alert, not who was told.
    await punch(worker.id, day, '20:00');
    await check(day, day);
    expect((await one(worker.id, 'daily_hours')).value).toBe(690);
    expect(await sentFor(alert.id)).toHaveLength(sent.length);

    const managerToken = await loginAs(app, SEED_MANAGER_EMAIL);
    await api(app).get('/tenant/compliance/alerts').set(bearer(managerToken)).expect(403);
    await api(app)
      .post('/tenant/compliance/check')
      .set(bearer(managerToken))
      .send({ from: day, to: day })
      .expect(403);
  });

  it('counts every kind on the overview, and leaves committee alerts to their own job', async () => {
    const entityId = ref(org.legalEntities, 'MGT');
    const periodStart = addDays(today, -1);
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .insert(complianceAlerts)
        .values({
          tenantId,
          kind: 'committee_missing',
          subjectId: entityId,
          periodStart,
          periodEnd: periodStart,
          value: 0,
          limit: 1,
        })
        .onConflictDoNothing(),
    );
    await check(addDays(today, -7), today);
    const overview = (await api(app).get('/tenant/compliance/overview').set(bearer(hr)).expect(200))
      .body as ComplianceOverview;
    expect(overview.kinds.map((k) => k.kind)).toContain('committee_term_ended');
    expect(overview.kinds.find((k) => k.kind === 'committee_missing')!.open).toBeGreaterThanOrEqual(
      1,
    );
    expect(overview.open).toBe(overview.kinds.reduce((n, k) => n + k.open, 0));
    expect(overview.adolescents).toBeGreaterThanOrEqual(1);

    const listed = (
      (
        await api(app)
          .get(`/tenant/compliance/alerts?kind=committee_missing&from=${periodStart}`)
          .set(bearer(hr))
          .expect(200)
      ).body as ComplianceAlertPage
    ).items.find((a) => a.subjectId === entityId)!;
    expect(listed).toMatchObject({
      status: 'open',
      employee: null,
      subjectName: org.legalEntities.find((e) => e.id === entityId)!.name,
    });
  });
});
