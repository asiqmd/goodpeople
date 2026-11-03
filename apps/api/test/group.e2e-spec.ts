import {
  createDb,
  employees,
  entityPolicyOverrides,
  runAsTenant,
  tenantAuditLog,
  tenants,
  userEntityScopes,
  type Database,
} from '@gp/db';
import {
  addDays,
  todayIn,
  type AttendanceDayView,
  type CompanyPolicyView,
  type ComplianceAlertPage,
  type EmployeeAttendanceView,
  type EmployeeDetail,
  type GroupDashboardView,
  type GroupFigures,
  type GroupPoliciesView,
  type LeaveBalanceView,
  type LeavePreview,
  type LeaveTypeView,
  type PayGroupView,
  type PayrollRunItemView,
  type PayrollSettingsView,
  type PolicyArea,
  type WorkspaceUserCreated,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { NEXT_YEAR, onOrAfter, rahima } from './leave-helpers.js';
import { line, payrollKit, type HireOptions } from './payroll-helpers.js';
import { api, bearer, bootApp, testEnv } from './test-env.js';

type Company = 'MGT' | 'MGF';
const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = (rows: { id: string; code: string | null }[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const sum = (values: number[]) => values.reduce((n, v) => n + v, 0);
const of = (view: GroupDashboardView, code: Company) =>
  view.companies.find((c) => c.legalEntity.code === code)!;
/** Women on the books, from their share: exact while a company has under 1,000 people. */
const women = (f: GroupFigures) => Math.round(((f.womenPercent ?? 0) * f.headcount) / 100);
const counted = (d: AttendanceDayView) =>
  d.dayType === 'working' && d.status !== 'pending' && d.status !== 'off';
/** Gross pay as the dashboard counts it: earnings that are part of gross. */
const grossOf = (item: PayrollRunItemView) =>
  sum(item.lines.filter((l) => l.kind === 'earning' && l.inGross).map((l) => Number(l.amount)));

// Each test hires its own people in My Group Textiles (MGT) and My Group Foods (MGF), makes
// its own pay groups, leave types and logins, compares figures before and after, and puts the
// group's policy back as it found it, so the tests pass in any order.
describe('group', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let kit: Awaited<ReturnType<typeof payrollKit>>;
  let tenantId: string;
  let seq = 0;
  const today = todayIn();
  // A completed month contains the required weekdays and no future punch times,
  // including on the first days of a new month.
  const periodEnd = addDays(`${today.slice(0, 7)}-01`, -1);
  const month = periodEnd.slice(0, 7);

  beforeAll(async () => {
    app = await bootApp();
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    kit = await payrollKit(app);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    tenantId = tenant!.id;
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  const admin = () => bearer(kit.admin);
  const company = (code: Company) => ref(kit.org.legalEntities, code);
  const jobIn = (code: Company) => ({
    legalEntityId: company(code),
    locationId: ref(kit.org.locations, code === 'MGT' ? 'GZP' : 'NRJ'),
    orgUnitId: ref(kit.org.orgUnits, code === 'MGT' ? 'MGT-L1' : 'MGF-QC'),
  });

  /** Someone in a company, with a login when asked. */
  async function hire(
    code: Company,
    person: { gender?: 'male' | 'female'; joinedOn?: string; login?: boolean } = {},
  ) {
    seq += 1;
    const employeeCode = `GR-${Date.now().toString(36)}-${seq}`;
    const email = `${employeeCode.toLowerCase()}@example.test`;
    const employee = (
      await api(app)
        .post('/tenant/employees')
        .set(admin())
        .send({
          employeeCode,
          fullName: `Group Test ${employeeCode}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1993-03-14',
          gender: person.gender ?? 'male',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${seq}`.slice(-10) },
          joinedOn: person.joinedOn ?? '2025-01-01',
          job: {
            ...jobIn(code),
            designationId: ref(kit.org.designations, 'SO'),
            gradeId: ref(kit.org.grades, 'W5'),
            employmentType: 'permanent',
            workerCategory: 'worker',
          },
          ...(person.login
            ? { portalAccess: { email, role: 'employee', password: testEnv().password } }
            : {}),
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    const token = person.login ? await signIn(email) : '';
    return { employee, token };
  }

  /** Someone with approved pay in a pay group (the kit hires into Textiles), moved if asked. */
  async function hireWithPay(payGroup: PayGroupView, code: Company, options: HireOptions = {}) {
    const { employee } = await kit.hire(payGroup, options);
    if (code === 'MGF') {
      await api(app)
        .patch(`/tenant/employees/${employee.id}/jobs/${employee.currentJob!.id}`)
        .set(admin())
        .send({ changes: jobIn('MGF'), reason: 'Works for the foods company' })
        .expect(200);
    }
    return employee;
  }

  async function signIn(email: string) {
    return (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;
  }

  async function login(role: string, limitedTo?: Company) {
    seq += 1;
    const email = `group-${role}-${Date.now().toString(36)}-${seq}@example.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(admin())
        .send({ name: `Group ${role}`, email, role, password: testEnv().password })
        .expect(201)
    ).body as WorkspaceUserCreated;
    if (limitedTo) {
      await runAsTenant(db, tenantId, (tx) =>
        tx
          .insert(userEntityScopes)
          .values({ tenantId, userId: user.id, legalEntityId: company(limitedTo) }),
      );
    }
    return signIn(email);
  }

  const putPolicy = (code: Company, area: PolicyArea, body: object, token = kit.admin) =>
    api(app)
      .put(`/tenant/group/policies/${company(code)}/${area}`)
      .set(bearer(token))
      .send(body);
  const clearPolicy = (code: Company, area: PolicyArea, subjectId?: string) =>
    api(app)
      .delete(
        `/tenant/group/policies/${company(code)}/${area}${subjectId ? `?subjectId=${subjectId}` : ''}`,
      )
      .set(admin());
  /** A company's override for the length of `run`. */
  async function withPolicy(
    code: Company,
    area: PolicyArea,
    body: { subjectId?: string; values: object },
    run: () => Promise<void>,
  ) {
    await putPolicy(code, area, body).expect(200);
    try {
      await run();
    } finally {
      await clearPolicy(code, area, body.subjectId).expect(204);
    }
  }
  const policies = async (token = kit.admin) =>
    (await api(app).get('/tenant/group/policies').set(bearer(token)).expect(200))
      .body as GroupPoliciesView;

  const dashboard = async (token = kit.admin, m = month) =>
    (await api(app).get(`/tenant/group/dashboard?month=${m}`).set(bearer(token)).expect(200))
      .body as GroupDashboardView;
  const daysOf = async (employeeId: string, from: string, to: string) =>
    (
      (
        await api(app)
          .get(`/tenant/employees/${employeeId}/attendance?from=${from}&to=${to}`)
          .set(admin())
          .expect(200)
      ).body as EmployeeAttendanceView
    ).range.days;
  const punch = (employeeId: string, date: string, time: string) =>
    api(app)
      .post(`/tenant/employees/${employeeId}/attendance/punches`)
      .set(admin())
      .send({ date, time, reason: 'From the gate register' })
      .expect(201);
  /** A day this month before today that all of these people work, by their own calendars. */
  async function workingDayOf(ids: string[]) {
    const views = await Promise.all(ids.map((id) => daysOf(id, `${month}-01`, periodEnd)));
    const day = views[0]!.find((d) =>
      views.every((v) => v.find((x) => x.date === d.date)?.dayType === 'working'),
    );
    return day!.date;
  }
  const leaveType = async (fields: object) =>
    (
      await api(app)
        .post('/tenant/leave/types')
        .set(admin())
        .send({
          code: `G${kit.unique()}`.slice(0, 10),
          name: 'Group test leave',
          paid: true,
          approvalChain: ['manager'],
          ...fields,
        })
        .expect(201)
    ).body as LeaveTypeView;
  const alertsOf = async (employeeId: string) =>
    (
      (
        await api(app)
          .get(`/tenant/compliance/alerts?employeeId=${employeeId}&pageSize=100`)
          .set(admin())
          .expect(200)
      ).body as ComplianceAlertPage
    ).items;

  // ── Dashboard ──────────────────────────────────────────────────────────────

  it('counts each company’s month from where people work, and the group as their sum', async () => {
    const g = await kit.group();
    const before = await dashboard();

    // A woman joins Textiles and one joins Foods; a man who joined Foods last year leaves.
    const textiles = await hireWithPay(g, 'MGT', { joinedOn: `${month}-01` });
    const foods = await hireWithPay(g, 'MGF', { joinedOn: `${month}-01` });
    const { employee: leaver } = await hire('MGF', { joinedOn: '2025-01-01' });
    // Recorded as a decided separation leaves it: separated on the month's first day.
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(employees)
        .set({ status: 'separated', separatedOn: `${month}-01` })
        .where(eq(employees.id, leaver.id)),
    );
    // Foods' joiner works long one day; the month so far is processed for both joiners.
    const day = onOrAfter(`${month}-01`, 1);
    await punch(foods.id, day, '08:00');
    await punch(foods.id, day, '19:30');
    await api(app)
      .post('/tenant/attendance/process')
      .set(admin())
      .send({ from: `${month}-01`, to: periodEnd, employeeIds: [textiles.id, foods.id] })
      .expect(201);
    const run = await kit.run(g, month);
    await kit.compute(run.id);

    const after = await dashboard();
    expect(after.month).toBe(month);
    expect(after.months).toHaveLength(12);
    expect(after.months.at(-1)).toBe(month);
    expect(after.payrollVisible).toBe(true);
    for (const [code, person] of [
      ['MGT', textiles],
      ['MGF', foods],
    ] as const) {
      const [was, now] = [of(before, code), of(after, code)];
      const days = (await daysOf(person.id, `${month}-01`, periodEnd)).filter(counted);
      const item = await kit.itemOf(run.id, person.id);
      expect(now.headcount - was.headcount).toBe(1);
      expect(now.trend.at(-1)).toBe(now.headcount);
      expect(now.joiners - was.joiners).toBe(1);
      expect(women(now) - women(was)).toBe(1);
      expect(now.workingDays - was.workingDays).toBe(days.length);
      expect(now.absentDays - was.absentDays).toBe(
        days.filter((d) => d.status === 'absent').length,
      );
      expect(Number(now.payrollCost!.gross) - Number(was.payrollCost!.gross)).toBeCloseTo(
        grossOf(item),
        2,
      );
      expect(
        Number(now.payrollCost!.employerCost) - Number(was.payrollCost!.employerCost),
      ).toBeCloseTo(Number(item.employerCost), 2);
    }
    const overtime = sum(
      (await daysOf(foods.id, `${month}-01`, periodEnd)).map((d) => d.overtimeMinutes),
    );
    expect(overtime).toBeGreaterThan(0);
    expect(
      Math.abs(of(after, 'MGF').overtimeHours - of(before, 'MGF').overtimeHours - overtime / 60),
    ).toBeLessThanOrEqual(0.1);

    // The leaver: one more leaver at Foods, on its books at every earlier month's end.
    expect(of(after, 'MGF').leavers - of(before, 'MGF').leavers).toBe(1);
    expect(of(after, 'MGT').leavers - of(before, 'MGT').leavers).toBe(0);
    expect(of(after, 'MGF').trend.map((n, i) => n - of(before, 'MGF').trend[i]!)).toEqual(
      Array.from({ length: 12 }, () => 1),
    );
    expect(of(after, 'MGT').trend.map((n, i) => n - of(before, 'MGT').trend[i]!)).toEqual([
      ...Array.from({ length: 11 }, () => 0),
      1,
    ]);
    // The group is the companies added up.
    expect(after.group.headcount - before.group.headcount).toBe(2);
    expect(after.group.joiners - before.group.joiners).toBe(2);
    expect(after.group.leavers - before.group.leavers).toBe(1);
    for (const key of ['headcount', 'joiners', 'leavers', 'workingDays', 'openAlerts'] as const) {
      expect(after.group[key]).toBe(sum(after.companies.map((c) => c[key])));
    }
    expect(Number(after.group.payrollCost!.total)).toBeCloseTo(
      sum(after.companies.map((c) => Number(c.payrollCost!.total))),
      2,
    );
  });

  it('shows pay only to those who may see payroll', async () => {
    const auditor = await login('auditor');
    const view = await dashboard(auditor);
    expect(view.payrollVisible).toBe(false);
    expect(view.group.payrollCost).toBeNull();
    expect(view.companies.every((c) => c.payrollCost === null)).toBe(true);
    // The same month with pay for HR, and nothing for an employee.
    expect((await dashboard()).group.payrollCost).toMatchObject({ total: expect.any(String) });
    const employee = await rahima(app);
    await api(app).get('/tenant/group/dashboard').set(bearer(employee)).expect(403);
    await api(app).get('/tenant/group/dashboard?month=2026-13').set(admin()).expect(400);
  });

  it('limits a login to its companies: the dashboard and the policies', async () => {
    const officer = await login('hr_officer', 'MGF');
    const view = await dashboard(officer);
    expect(view.companies.map((c) => c.legalEntity.code)).toEqual(['MGF']);
    // Foods' own figures, without pay (an HR officer does not see payroll), are the group's.
    const { legalEntity: _foods, ...foods } = of(await dashboard(), 'MGF');
    const { legalEntity: _seen, ...seen } = view.companies[0]!;
    expect(seen).toEqual({ ...foods, payrollCost: null });
    expect(view.group).toEqual(seen);

    const hr = await login('hr_admin', 'MGF');
    expect((await policies(hr)).companies.map((c) => c.code)).toEqual(['MGF']);
    await putPolicy('MGT', 'attendance', { values: { requireSelfie: true } }, hr).expect(404);
    await putPolicy('MGF', 'attendance', { values: { requireSelfie: true } }, hr).expect(200);
    await clearPolicy('MGF', 'attendance').expect(204);
  });

  // ── Policies ───────────────────────────────────────────────────────────────

  it('sets, replaces and clears a company’s override, audited, for org managers only', async () => {
    const list = await policies();
    expect(list.companies.map((c) => c.code)).toEqual(expect.arrayContaining(['MGT', 'MGF']));
    expect(list.policies.map((p) => p.area)).toEqual(
      expect.arrayContaining(['attendance', 'provident_fund', 'overtime_caps', 'leave_type']),
    );
    const attendance = list.policies.find((p) => p.area === 'attendance')!;
    const group = attendance.group as { selfPunch: string; requireSelfie: boolean };
    const casual = list.policies.find((p) => p.leaveType?.statutoryKey === 'casual')!;
    expect(casual.leaveType).toMatchObject({ code: expect.any(String), accrual: 'annual_grant' });

    const saved = (
      await putPolicy('MGF', 'attendance', {
        values: { requireSelfie: !group.requireSelfie },
      }).expect(200)
    ).body as CompanyPolicyView<'attendance'>;
    expect(saved).toMatchObject({
      legalEntity: { id: company('MGF'), code: 'MGF' },
      override: { requireSelfie: !group.requireSelfie },
      effective: { ...group, requireSelfie: !group.requireSelfie },
      differs: ['requireSelfie'],
      updatedAt: expect.any(String),
    });
    const [row] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(entityPolicyOverrides)
        .where(
          and(
            eq(entityPolicyOverrides.legalEntityId, company('MGF')),
            eq(entityPolicyOverrides.area, 'attendance'),
            isNull(entityPolicyOverrides.subjectId),
          ),
        ),
    );
    try {
      // A new override replaces the old one; the group's own value differs from nothing.
      const same = (
        await putPolicy('MGF', 'attendance', { values: { selfPunch: group.selfPunch } }).expect(200)
      ).body as CompanyPolicyView<'attendance'>;
      expect(same).toMatchObject({ override: { selfPunch: group.selfPunch }, differs: [] });
      expect(same.override).not.toHaveProperty('requireSelfie');
      const listed = (await policies()).policies.find((p) => p.area === 'attendance')!;
      expect(listed.companies.find((c) => c.legalEntity.code === 'MGF')!.override).toEqual({
        selfPunch: group.selfPunch,
      });

      const refused = async (code: Company, area: string, body: object, status = 400) =>
        (
          await api(app)
            .put(`/tenant/group/policies/${company(code)}/${area}`)
            .set(admin())
            .send(body)
            .expect(status)
        ).body as { code?: string; issues?: { path: string }[] };
      expect(await refused('MGF', 'attendance', { values: {} })).toMatchObject({
        code: 'validation_failed',
        issues: [{ path: 'values' }],
      });
      expect(
        await refused('MGF', 'attendance', { values: { selfPunch: 'sometimes' } }),
      ).toMatchObject({ code: 'validation_failed', issues: [{ path: 'selfPunch' }] });
      expect((await refused('MGF', 'leave_type', { values: { daysPerYear: 12 } })).code).toBe(
        'policy_subject_invalid',
      );
      expect(
        (
          await refused('MGF', 'attendance', {
            subjectId: casual.leaveType!.id,
            values: { requireSelfie: true },
          })
        ).code,
      ).toBe('policy_subject_invalid');
      await refused('MGF', 'payslips', { values: { requireSelfie: true } });
      await refused(
        'MGF',
        'leave_type',
        { subjectId: randomUUID(), values: { daysPerYear: 12 } },
        404,
      );
      await api(app)
        .put(`/tenant/group/policies/${randomUUID()}/attendance`)
        .set(admin())
        .send({ values: { requireSelfie: true } })
        .expect(404);

      // HR officers read the dashboard but do not set policy.
      const officer = await login('hr_officer');
      await api(app).get('/tenant/group/policies').set(bearer(officer)).expect(403);
      await putPolicy('MGT', 'attendance', { values: { requireSelfie: true } }, officer).expect(
        403,
      );
    } finally {
      await clearPolicy('MGF', 'attendance').expect(204);
    }
    await clearPolicy('MGF', 'attendance').expect(404);
    const listed = (await policies()).policies.find((p) => p.area === 'attendance')!;
    expect(listed.companies.find((c) => c.legalEntity.code === 'MGF')).toMatchObject({
      override: null,
      effective: group,
      differs: [],
    });
    const audit = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ action: tenantAuditLog.action })
        .from(tenantAuditLog)
        .where(eq(tenantAuditLog.entityId, row!.id))
        .orderBy(asc(tenantAuditLog.createdAt)),
    );
    expect(audit.map((a) => a.action)).toEqual([
      'group.policy.override',
      'group.policy.override',
      'group.policy.reset',
    ]);
  });

  it('keeps statutory leave at the law’s minimum and overtime caps within it', async () => {
    const types = (await api(app).get('/tenant/leave/types').set(admin()).expect(200))
      .body as LeaveTypeView[];
    const casual = types.find((t) => t.statutoryKey === 'casual')!;
    const maternity = types.find((t) => t.statutoryKey === 'maternity')!;

    const low = await putPolicy('MGF', 'leave_type', {
      subjectId: casual.id,
      values: { daysPerYear: 8 },
    }).expect(400);
    expect(low.body).toMatchObject({
      code: 'below_statutory_minimum',
      issues: [
        {
          path: 'daysPerYear',
          message: expect.stringContaining('s.115'),
          // The web says it in the page's language from the rule and the law's figure.
          code: 'leave.casual.days_per_year',
          params: { limit: 10, section: '115' },
        },
      ],
    });
    const short = await putPolicy('MGF', 'leave_type', {
      subjectId: maternity.id,
      values: { maxDaysPerRequest: 60 },
    }).expect(400);
    expect(short.body).toMatchObject({
      code: 'below_statutory_minimum',
      issues: [{ path: 'maxDaysPerRequest', message: expect.stringContaining('s.46') }],
    });
    // More generous than the law is the company's to choose.
    await withPolicy(
      'MGF',
      'leave_type',
      { subjectId: casual.id, values: { daysPerYear: 14 } },
      async () => {
        const view = (await policies()).policies.find((p) => p.leaveType?.id === casual.id)!;
        expect(view.companies.find((c) => c.legalEntity.code === 'MGF')).toMatchObject({
          effective: { daysPerYear: 14 },
          differs: ['daysPerYear'],
        });
        expect(view.companies.find((c) => c.legalEntity.code === 'MGT')!.override).toBeNull();
      },
    );

    const above = await putPolicy('MGF', 'overtime_caps', {
      values: { overtimeDailyCapMinutes: 180 },
    }).expect(400);
    expect(above.body.code).toBe('cap_above_law');
  });

  it('gives leave by the employee’s company: days a year and days per request', async () => {
    const annual = await leaveType({ accrual: 'annual_grant', daysPerYear: 12 });
    const event = await leaveType({ accrual: 'per_event', maxDaysPerRequest: 10 });
    const { employee: textiles } = await hire('MGT');
    const { employee: foods } = await hire('MGF');
    const year = Number(today.slice(0, 4));
    const entitlement = async (employeeId: string) =>
      (
        (
          await api(app)
            .get(`/tenant/employees/${employeeId}/leave?year=${year}`)
            .set(admin())
            .expect(200)
        ).body as { balances: LeaveBalanceView[] }
      ).balances.find((b) => b.leaveType.id === annual.id)!.entitlement;
    // A week from a Sunday: more than two days, fewer than ten.
    const start = onOrAfter(`${NEXT_YEAR}-03-01`, 0);
    const preview = async (employeeId: string) =>
      (
        await api(app)
          .post(`/tenant/employees/${employeeId}/leave/preview`)
          .set(admin())
          .send({ leaveTypeId: event.id, startDate: start, endDate: addDays(start, 6) })
          .expect(201)
      ).body as LeavePreview;

    try {
      expect(await entitlement(foods.id)).toBe(12);
      await withPolicy(
        'MGF',
        'leave_type',
        { subjectId: annual.id, values: { daysPerYear: 18 } },
        async () => {
          expect(await entitlement(foods.id)).toBe(18);
          expect(await entitlement(textiles.id)).toBe(12);
        },
      );
      await withPolicy(
        'MGF',
        'leave_type',
        { subjectId: event.id, values: { maxDaysPerRequest: 2 } },
        async () => {
          const there = await preview(foods.id);
          expect(there.days).toBeGreaterThan(2);
          expect(there.problems).toContain('At most 2 days per request.');
          expect((await preview(textiles.id)).problems.join(' ')).not.toContain('At most');
        },
      );
      expect((await preview(foods.id)).problems.join(' ')).not.toContain('At most');
    } finally {
      for (const t of [annual, event]) {
        await api(app)
          .patch(`/tenant/leave/types/${t.id}`)
          .set(admin())
          .send({ isActive: false })
          .expect(200);
      }
    }
  });

  it('pays into the provident fund at the rates of each member’s company', async () => {
    const settings = (await api(app).get('/tenant/payroll/settings').set(admin()).expect(200))
      .body as PayrollSettingsView;
    expect(settings.pfEnabled).toBe(true);
    const g = await kit.group();
    const textiles = await hireWithPay(g, 'MGT', { joinedOn: '2025-01-01' });
    const foods = await hireWithPay(g, 'MGF', { joinedOn: '2025-01-01' });
    await api(app)
      .post('/tenant/payroll/pf/members')
      .set(admin())
      .send({ employeeIds: [textiles.id, foods.id], joinedOn: '2026-01-01' })
      .expect(200);

    await withPolicy(
      'MGF',
      'provident_fund',
      { values: { pfEmployeeRate: '8', pfEmployerRate: '9' } },
      async () => {
        const run = await kit.run(g, '2026-02');
        await kit.compute(run.id);
        const [a, b] = [await kit.itemOf(run.id, textiles.id), await kit.itemOf(run.id, foods.id)];
        const basic = Number(line(a, 'BASIC'));
        expect(Number(line(b, 'BASIC'))).toBe(basic);
        const atRate = (rate: string | number) => Math.round((basic * Number(rate)) / 100);
        expect(Number(line(a, 'PF_EMPLOYEE'))).toBe(atRate(settings.pfEmployeeRate));
        expect(Number(line(a, 'PF_EMPLOYER'))).toBe(atRate(settings.pfEmployerRate));
        expect(Number(line(b, 'PF_EMPLOYEE'))).toBe(atRate(8));
        expect(Number(line(b, 'PF_EMPLOYER'))).toBe(atRate(9));
      },
    );
  });

  it('lets people punch from the app as their company allows', async () => {
    const settings = (await api(app).get('/tenant/attendance/settings').set(admin()).expect(200))
      .body as { selfPunch: string };
    // The group's rule (the seed's): inside the location's geofence. Narayanganj has none.
    expect(settings.selfPunch).toBe('geofenced');
    const textiles = await hire('MGT', { login: true });
    const foods = await hire('MGF', { login: true });
    const punchFrom = (token: string) =>
      api(app).post('/tenant/me/attendance/punch').set(bearer(token)).send({ source: 'web' });

    expect((await punchFrom(foods.token).expect(400)).body.code).toBe('no_geofence');
    await withPolicy('MGF', 'attendance', { values: { selfPunch: 'anywhere' } }, async () => {
      await punchFrom(foods.token).expect(201);
      expect((await punchFrom(textiles.token).expect(400)).body.code).toBe('location_required');
    });
    await withPolicy('MGT', 'attendance', { values: { selfPunch: 'off' } }, async () => {
      expect((await punchFrom(textiles.token).expect(403)).body.code).toBe('self_punch_disabled');
    });
  });

  it('holds people to their company’s overtime caps, and counts the alerts per company', async () => {
    const { employee: textiles } = await hire('MGT');
    const { employee: foods } = await hire('MGF');
    const day = await workingDayOf([textiles.id, foods.id]);
    const check = () =>
      api(app)
        .post('/tenant/compliance/check')
        .set(admin())
        .send({ from: day, to: day })
        .expect(201);
    // Anything already true of others that day is raised first, so only these two change.
    await check();
    const before = await dashboard();

    await withPolicy(
      'MGF',
      'overtime_caps',
      { values: { overtimeDailyCapMinutes: 30 } },
      async () => {
        for (const person of [textiles, foods]) {
          await punch(person.id, day, '08:00');
          await punch(person.id, day, '19:30');
        }
        await check();
      },
    );
    const overtime = (await daysOf(foods.id, day, day))[0]!.overtimeMinutes;
    expect(overtime).toBeGreaterThan(30);
    expect(overtime).toBeLessThanOrEqual(120);
    const foodsAlerts = await alertsOf(foods.id);
    expect(foodsAlerts.filter((a) => a.kind === 'overtime_daily')).toEqual([
      expect.objectContaining({ periodStart: day, value: overtime, limit: 30 }),
    ]);
    const textilesAlerts = await alertsOf(textiles.id);
    expect(textilesAlerts.filter((a) => a.kind === 'overtime_daily')).toEqual([]);

    const after = await dashboard();
    const open = (alerts: typeof foodsAlerts) =>
      alerts.filter((a) => a.status === 'open' && a.periodStart <= `${month}-31`).length;
    expect(of(after, 'MGF').openAlerts - of(before, 'MGF').openAlerts).toBe(open(foodsAlerts));
    expect(of(after, 'MGT').openAlerts - of(before, 'MGT').openAlerts).toBe(open(textilesAlerts));
  });
});
