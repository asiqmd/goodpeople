import {
  createDb,
  employeePay,
  runAsTenant,
  SEED_EMPLOYEE_EMAIL,
  SEED_FINANCE_EMAIL,
  tenants,
} from '@gp/db';
import type {
  ApprovalItem,
  CompensationApprovalItem,
  EmployeeDetail,
  EmployeePayView,
  NotificationInbox,
  OrgSnapshot,
  PayGroupView,
  PayRecordView,
  SalaryStructureView,
  WorkspaceUserCreated,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { loginAs } from './leave-helpers.js';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;

describe('payroll foundations', () => {
  let app: INestApplication;
  let admin: string;
  let finance: string;
  let org: OrgSnapshot;
  let rmg: SalaryStructureView;
  let staff: SalaryStructureView;
  let monthly: PayGroupView;
  let seq = 0;

  beforeAll(async () => {
    app = await bootApp();
    admin = (await tenantLogin(app, 'my-group')).accessToken;
    finance = await loginAs(app, SEED_FINANCE_EMAIL);
    org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200)).body;
    const structures = (
      await api(app).get('/tenant/payroll/structures').set(bearer(admin)).expect(200)
    ).body as SalaryStructureView[];
    rmg = structures.find((s) => s.code === 'RMG_WORKER')!;
    staff = structures.find((s) => s.code === 'STAFF')!;
    monthly = (
      (await api(app).get('/tenant/payroll/pay-groups').set(bearer(admin)).expect(200))
        .body as PayGroupView[]
    ).find((g) => g.code === 'MONTHLY')!;
  });
  afterAll(() => app.close());

  async function hire() {
    seq += 1;
    const res = await api(app)
      .post('/tenant/employees')
      .set(bearer(admin))
      .send({
        employeeCode: `P-${Date.now().toString(36)}-${seq}`,
        fullName: `Payroll Test ${seq}`,
        fatherName: 'Abdul Karim',
        motherName: 'Hosne Ara',
        dateOfBirth: '1996-02-14',
        gender: 'female',
        mobilePhone: '01812345678',
        presentAddress: address,
        permanentAddress: address,
        identity: { nid: `${Date.now()}${seq}`.slice(-10) },
        joinedOn: '2026-01-01',
        job: {
          legalEntityId: ref(org.legalEntities, 'MGT'),
          locationId: ref(org.locations, 'GZP'),
          orgUnitId: ref(org.orgUnits, 'MGT-L1'),
          designationId: ref(org.designations, 'SO'),
          gradeId: ref(org.grades, 'W5'),
          employmentType: 'permanent',
          workerCategory: 'worker',
        },
      })
      .expect(201);
    return res.body.employee as EmployeeDetail;
  }

  const change = (overrides: Record<string, unknown> = {}) => ({
    effectiveFrom: '2026-10-01',
    structureId: rmg.id,
    payGroupId: monthly.id,
    amount: '13025',
    wageGrade: 'G4',
    reason: 'Opening pay',
    ...overrides,
  });

  async function createUser(role: string) {
    seq += 1;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({
          name: `${role} ${seq}`,
          email: `${role}-${Date.now()}-${seq}@example.test`,
          role,
          password: testEnv().password,
        })
        .expect(201)
    ).body as WorkspaceUserCreated;
    const token = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email: user.email, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;
    return { user, token };
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  it('starts every workspace from the country pack', async () => {
    const components = (
      await api(app).get('/tenant/payroll/components').set(bearer(admin)).expect(200)
    ).body as { code: string; isSystem: boolean; inOvertimeBase: boolean }[];
    expect(components.map((c) => c.code)).toEqual(
      expect.arrayContaining(['BASIC', 'HOUSE_RENT', 'MEDICAL', 'OVERTIME', 'TAX', 'PF_EMPLOYER']),
    );
    expect(components.filter((c) => c.inOvertimeBase).map((c) => c.code)).toEqual(['BASIC']);
    expect(rmg).toMatchObject({ basis: 'gross', wageBoard: 'BD_RMG_2023', isSystem: true });
    expect(rmg.inUse).toBeGreaterThan(0);
    expect(monthly).toMatchObject({ frequency: 'monthly', isDefault: true });

    const boards = (
      await api(app).get('/tenant/payroll/wage-boards').set(bearer(admin)).expect(200)
    ).body;
    expect(boards[0]).toMatchObject({ id: 'BD_RMG_2023', status: 'needs_review' });
    expect(boards[0].grades.find((g: { grade: string }) => g.grade === 'G5')).toMatchObject({
      gross: '12500.00',
      basic: '6700.00',
    });
    const settings = (await api(app).get('/tenant/payroll/settings').set(bearer(admin)).expect(200))
      .body;
    expect(settings.makerChecker).toBe(true);
    expect(settings.approvers).toBeGreaterThanOrEqual(2);
  });

  it('checks structures before saving them', async () => {
    const save = (body: Record<string, unknown>) =>
      api(app)
        .post('/tenant/payroll/structures')
        .set(bearer(admin))
        .send({
          code: `S${Date.now() % 100000}${seq++}`,
          name: 'Test structure',
          basis: 'gross',
          ...body,
        });

    const bad = await save({ lines: [{ component: 'BASIC', formula: 'GROSS *' }] }).expect(400);
    expect(bad.body.code).toBe('structure_invalid');
    expect(bad.body.issues[0]).toMatchObject({ path: 'lines.0.formula' });

    const unknown = await save({ lines: [{ component: 'BONUS_X', formula: '1' }] }).expect(400);
    expect(unknown.body.message).toContain('There is no component BONUS_X');

    const runItem = await save({ lines: [{ component: 'OVERTIME', formula: '1' }] }).expect(400);
    expect(runItem.body.message).toContain('not worked out by structures');

    const unbalanced = await save({
      lines: [
        { component: 'BASIC', formula: 'round(GROSS * 0.5)' },
        { component: 'HOUSE_RENT', formula: 'round(BASIC * 0.5)' },
      ],
    }).expect(400);
    expect(unbalanced.body.code).toBe('structure_not_balanced');

    const cycle = await save({
      lines: [
        { component: 'BASIC', formula: 'GROSS - HOUSE_RENT' },
        { component: 'HOUSE_RENT', formula: 'BASIC / 2' },
      ],
    }).expect(400);
    expect(cycle.body.message).toContain('depend on each other');

    const created = await save({
      lines: [
        { component: 'BASIC', formula: 'round(GROSS * 0.7)' },
        { component: 'HOUSE_RENT', formula: 'GROSS - BASIC' },
      ],
    }).expect(201);
    expect(created.body.inUse).toBe(0);

    const preview = await api(app)
      .post('/tenant/payroll/structures/preview')
      .set(bearer(admin))
      .send({ basis: 'gross', amount: '20000', lines: created.body.lines })
      .expect(200);
    expect(preview.body).toEqual({
      values: { BASIC: '14000.00', HOUSE_RENT: '6000.00' },
      gross: '20000.00',
      problems: [],
    });

    // People are paid on the RMG structure, so its lines are fixed; renaming is fine.
    const locked = await api(app)
      .patch(`/tenant/payroll/structures/${rmg.id}`)
      .set(bearer(admin))
      .send({ lines: [{ component: 'BASIC', formula: 'GROSS' }] })
      .expect(409);
    expect(locked.body.code).toBe('structure_in_use');
    await api(app)
      .patch(`/tenant/payroll/structures/${rmg.id}`)
      .set(bearer(admin))
      .send({ name: 'RMG worker (2023 wage board)' })
      .expect(200);
  });

  it('keeps component codes usable in formulas', async () => {
    await api(app)
      .post('/tenant/payroll/components')
      .set(bearer(admin))
      .send({ code: 'GROSS', name: 'Gross', kind: 'earning', calculation: 'fixed' })
      .expect(400);
    await api(app)
      .post('/tenant/payroll/components')
      .set(bearer(admin))
      .send({ code: 'night allowance', name: 'Night', kind: 'earning', calculation: 'fixed' })
      .expect(400);
    const created = await api(app)
      .post('/tenant/payroll/components')
      .set(bearer(admin))
      .send({
        code: `night_${seq++}`,
        name: 'Night allowance',
        nameBn: 'রাত্রি ভাতা',
        kind: 'earning',
        calculation: 'fixed',
        inGross: true,
      })
      .expect(201);
    expect(created.body.code).toMatch(/^NIGHT_/);

    const components = (await api(app).get('/tenant/payroll/components').set(bearer(admin)))
      .body as {
      id: string;
      code: string;
    }[];
    const basic = components.find((c) => c.code === 'BASIC')!;
    const res = await api(app)
      .patch(`/tenant/payroll/components/${basic.id}`)
      .set(bearer(admin))
      .send({ calculation: 'fixed' })
      .expect(409);
    expect(res.body.code).toBe('component_in_use');
  });

  // ── Employee pay ───────────────────────────────────────────────────────────

  it('shows pay worked out from its structure, and keeps the amounts encrypted', async () => {
    const people = (
      await api(app).get('/tenant/employees?search=MG-0005').set(bearer(admin)).expect(200)
    ).body.items;
    const pay = (
      await api(app).get(`/tenant/employees/${people[0].id}/pay`).set(bearer(admin)).expect(200)
    ).body as EmployeePayView;
    expect(pay.current).toMatchObject({
      status: 'approved',
      gross: '15200.00',
      wageGrade: 'G2',
      minimumWage: { grade: 'G2', minimumGross: '14150.00', meets: true },
    });
    expect(Object.fromEntries(pay.current!.lines.map((l) => [l.code, l.amount]))).toEqual({
      BASIC: '8500.00',
      HOUSE_RENT: '4250.00',
      MEDICAL: '750.00',
      CONVEYANCE: '450.00',
      FOOD: '1250.00',
    });

    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
      const rows = await runAsTenant(db, tenant!.id, (tx) =>
        tx.select().from(employeePay).where(eq(employeePay.employeeId, people[0].id)),
      );
      expect(rows[0]!.amountsEnc).toMatch(/^v1:/);
      expect(rows[0]!.amountsEnc).not.toContain('15200');
    } finally {
      await pool.end();
    }
  });

  it('needs a second person to approve a pay change', async () => {
    const person = await hire();
    const below = await api(app)
      .post(`/tenant/employees/${person.id}/pay`)
      .set(bearer(admin))
      .send(change({ amount: '12000', wageGrade: 'G5' }))
      .expect(400);
    expect(below.body.code).toBe('below_minimum_wage');
    const noGrade = await api(app)
      .post(`/tenant/employees/${person.id}/pay`)
      .set(bearer(admin))
      .send(change({ wageGrade: null }))
      .expect(400);
    expect(noGrade.body.code).toBe('wage_grade_required');

    const proposed = (
      await api(app)
        .post(`/tenant/employees/${person.id}/pay`)
        .set(bearer(admin))
        .send(change({ fixed: { special: '500' } }))
        .expect(201)
    ).body as PayRecordView;
    expect(proposed).toMatchObject({
      status: 'pending',
      gross: '13525.00',
      fixed: { SPECIAL: '500.00' },
    });
    expect(proposed.steps).toEqual([
      expect.objectContaining({ kind: 'payroll', status: 'pending' }),
    ]);

    // One change at a time.
    const again = await api(app)
      .post(`/tenant/employees/${person.id}/pay`)
      .set(bearer(admin))
      .send(change())
      .expect(409);
    expect(again.body.code).toBe('pay_change_pending');

    // The maker sees it waiting for someone else, and cannot approve it.
    const mine = (await api(app).get('/tenant/approvals').set(bearer(admin)).expect(200))
      .body as ApprovalItem[];
    expect(mine.some((i) => i.subjectType === 'compensation' && i.change.id === proposed.id)).toBe(
      false,
    );
    const stepId = proposed.steps[0]!.id;
    const own = await api(app)
      .post(`/tenant/approvals/${stepId}/approve`)
      .set(bearer(admin))
      .send({})
      .expect(403);
    expect(own.body.code).toBe('own_change');

    // The finance officer sees old and new side by side, and is told about it.
    const inbox = (await api(app).get('/tenant/approvals').set(bearer(finance)).expect(200))
      .body as ApprovalItem[];
    const item = inbox.find(
      (i): i is CompensationApprovalItem =>
        i.subjectType === 'compensation' && i.change.id === proposed.id,
    )!;
    expect(item).toMatchObject({ kind: 'payroll', previous: null });
    const told = (await api(app).get('/tenant/notifications').set(bearer(finance)).expect(200))
      .body as NotificationInbox;
    const notice = told.items.find((n) => n.title.includes(person.fullName))!;
    expect(notice.body).toContain('Pay change from');
    expect(notice.body).not.toContain('13');

    await api(app)
      .post(`/tenant/approvals/${stepId}/approve`)
      .set(bearer(finance))
      .send({})
      .expect(201);
    const pay = (
      await api(app).get(`/tenant/employees/${person.id}/pay`).set(bearer(admin)).expect(200)
    ).body as EmployeePayView;
    expect(pay.pending).toEqual([]);
    expect(pay.history[0]).toMatchObject({ status: 'approved', decidedBy: expect.any(String) });
    // The maker hears the decision.
    const decided = (await api(app).get('/tenant/notifications').set(bearer(admin)).expect(200))
      .body as NotificationInbox;
    expect(decided.items.some((n) => n.event === 'approval.decided')).toBe(true);

    // Nothing may start before approved pay; a change from the same date replaces it.
    const early = await api(app)
      .post(`/tenant/employees/${person.id}/pay`)
      .set(bearer(admin))
      .send(change({ effectiveFrom: '2026-09-01' }))
      .expect(400);
    expect(early.body.code).toBe('pay_backdated');
    const fix = (
      await api(app)
        .post(`/tenant/employees/${person.id}/pay`)
        .set(bearer(admin))
        .send(change({ amount: '13100', reason: 'Correct the amount' }))
        .expect(201)
    ).body as PayRecordView;
    await api(app)
      .post(`/tenant/approvals/${fix.steps[0]!.id}/approve`)
      .set(bearer(finance))
      .send({})
      .expect(201);
    const after = (await api(app).get(`/tenant/employees/${person.id}/pay`).set(bearer(admin)))
      .body as EmployeePayView;
    expect(after.history.map((h) => h.status)).toEqual(['approved', 'superseded']);
    expect(after.current?.gross).toBe('13100.00');
  });

  it('withdraws a change, and dates each approved pay until the next', async () => {
    const person = await hire();
    const first = (
      await api(app)
        .post(`/tenant/employees/${person.id}/pay`)
        .set(bearer(admin))
        .send(change({ effectiveFrom: '2026-01-01' }))
        .expect(201)
    ).body as PayRecordView;
    await api(app)
      .post(`/tenant/approvals/${first.steps[0]!.id}/approve`)
      .set(bearer(finance))
      .send({})
      .expect(201);
    const raise = (
      await api(app)
        .post(`/tenant/employees/${person.id}/pay`)
        .set(bearer(admin))
        .send(change({ effectiveFrom: '2026-07-01', amount: '14150', wageGrade: 'G2' }))
        .expect(201)
    ).body as PayRecordView;
    await api(app).post(`/tenant/pay-changes/${raise.id}/cancel`).set(bearer(admin)).expect(204);
    let pay = (await api(app).get(`/tenant/employees/${person.id}/pay`).set(bearer(admin)))
      .body as EmployeePayView;
    expect(pay.history.map((h) => h.status)).toEqual(['cancelled', 'approved']);
    expect(pay.history[0]!.steps[0]!.status).toBe('cancelled');

    const second = (
      await api(app)
        .post(`/tenant/employees/${person.id}/pay`)
        .set(bearer(admin))
        .send(change({ effectiveFrom: '2026-07-01', amount: '14150', wageGrade: 'G2' }))
        .expect(201)
    ).body as PayRecordView;
    await api(app)
      .post(`/tenant/approvals/${second.steps[0]!.id}/approve`)
      .set(bearer(finance))
      .send({})
      .expect(201);
    pay = (await api(app).get(`/tenant/employees/${person.id}/pay`).set(bearer(admin)))
      .body as EmployeePayView;
    const january = pay.history.find((h) => h.effectiveFrom === '2026-01-01')!;
    expect(january.effectiveTo).toBe('2026-06-30');
    expect(pay.current?.effectiveFrom).toBe('2026-07-01');
  });

  it('lets a one-person payroll turn maker-checker off', async () => {
    const officer = await createUser('payroll_officer');
    await api(app)
      .patch('/tenant/payroll/settings')
      .set(bearer(officer.token))
      .send({ makerChecker: false })
      .expect(403);
    await api(app)
      .patch('/tenant/payroll/settings')
      .set(bearer(admin))
      .send({ makerChecker: false })
      .expect(200);
    try {
      const person = await hire();
      const made = (
        await api(app)
          .post(`/tenant/employees/${person.id}/pay`)
          .set(bearer(officer.token))
          .send(change())
          .expect(201)
      ).body as PayRecordView;
      expect(made).toMatchObject({ status: 'approved', steps: [] });
    } finally {
      await api(app)
        .patch('/tenant/payroll/settings')
        .set(bearer(admin))
        .send({ makerChecker: true })
        .expect(200);
    }
  });

  it('shows pay only to those who may see it', async () => {
    const officer = await createUser('payroll_officer');
    const hr = await createUser('hr_officer');
    const person = await hire();
    // HR officers manage people but never see salaries.
    await api(app).get(`/tenant/employees/${person.id}/pay`).set(bearer(hr.token)).expect(403);
    await api(app).get('/tenant/payroll/components').set(bearer(hr.token)).expect(403);
    // Payroll officers propose but never approve.
    const proposed = (
      await api(app)
        .post(`/tenant/employees/${person.id}/pay`)
        .set(bearer(officer.token))
        .send(change())
        .expect(201)
    ).body as PayRecordView;
    const count = (
      await api(app).get('/tenant/approvals/count').set(bearer(officer.token)).expect(200)
    ).body;
    expect(count.count).toBe(0);
    await api(app)
      .post(`/tenant/approvals/${proposed.steps[0]!.id}/approve`)
      .set(bearer(officer.token))
      .send({})
      .expect(403);
    await api(app)
      .post(`/tenant/pay-changes/${proposed.id}/cancel`)
      .set(bearer(officer.token))
      .expect(204);

    // Employees see their own pay, and nothing waiting for approval.
    const rahima = await loginAs(app, SEED_EMPLOYEE_EMAIL);
    const mine = (await api(app).get('/tenant/me/pay').set(bearer(rahima)).expect(200))
      .body as EmployeePayView;
    expect(mine.current?.gross).toBe('15200.00');
    expect(mine.pending).toEqual([]);
    await api(app).get(`/tenant/employees/${person.id}/pay`).set(bearer(rahima)).expect(403);
  });

  it('is a plan feature and stays inside its workspace', async () => {
    const trial = (await tenantLogin(app, 'trial-co')).accessToken;
    const gated = await api(app).get('/tenant/payroll/components').set(bearer(trial)).expect(403);
    expect(gated.body.code).toBe('feature_not_in_plan');

    const other = (await tenantLogin(app, 'sponsored-ngo')).accessToken;
    const person = await hire();
    await api(app).get(`/tenant/employees/${person.id}/pay`).set(bearer(other)).expect(404);
    const otherStructures = (
      await api(app).get('/tenant/payroll/structures').set(bearer(other)).expect(200)
    ).body as SalaryStructureView[];
    const res = await api(app)
      .post(`/tenant/employees/${person.id}/pay`)
      .set(bearer(admin))
      .send(change({ structureId: otherStructures[0]!.id }))
      .expect(404);
    expect(res.body.message).toBe('Structure not found');
  });

  it('pays staff on the staff structure, with special allowances on top', async () => {
    const person = await hire();
    const preview = await api(app)
      .post(`/tenant/employees/${person.id}/pay/preview`)
      .set(bearer(admin))
      .send({
        structureId: staff.id,
        payGroupId: monthly.id,
        amount: '50000',
        fixed: { SPECIAL: '2500' },
      })
      .expect(200);
    expect(preview.body).toMatchObject({ gross: '52500.00', minimumWage: null, problems: [] });
    expect(
      Object.fromEntries(
        preview.body.lines.map((l: { code: string; amount: string }) => [l.code, l.amount]),
      ),
    ).toEqual({
      BASIC: '30000.00',
      HOUSE_RENT: '15000.00',
      MEDICAL: '2500.00',
      CONVEYANCE: '2500.00',
      SPECIAL: '2500.00',
    });
    const wrongFixed = await api(app)
      .post(`/tenant/employees/${person.id}/pay/preview`)
      .set(bearer(admin))
      .send({
        structureId: staff.id,
        payGroupId: monthly.id,
        amount: '50000',
        fixed: { BASIC: '1' },
      })
      .expect(200);
    expect(wrongFixed.body.problems[0].message).toContain('not a fixed amount component');
  });
});
