import {
  CIPHER_FIELDS,
  compensationLines,
  createFieldCipher,
  employeePay,
  grades,
  jobAssignments,
  payGroups,
  payrollSettings,
  reviewCycles,
  reviews,
  salaryStructures,
  tenantUsers,
} from '@gp/db';
import {
  Decimal,
  DEFAULT_COMPETENCIES,
  DEFAULT_INCREMENT_MATRIX,
  type CompensationRoundView,
  type EmployeePayView,
  type PayrollRunItemPage,
  type PayrollRunView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { recruitmentKit } from './applications-helpers.js';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

const base = '/tenant/compensation';
const on = '2026-10-01';
describe('budgeted compensation planning', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof recruitmentKit>>;
  let cipher: ReturnType<typeof createFieldCipher>;
  beforeAll(async () => {
    app = await bootApp();
    cipher = createFieldCipher(testEnv().fieldKey);
    kit = await recruitmentKit(app);
  });
  afterAll(async () => {
    await kit.close();
    await app.close();
  });
  const as = (token = kit.admin) => bearer(token);

  async function fixture(options: { people?: number; rmg?: boolean; acknowledged?: boolean } = {}) {
    // Org tests intentionally retire a seeded grade; this fixture owns its grade.
    const [grade] = await kit.inTenant((tx) =>
      tx
        .insert(grades)
        .values({
          tenantId: kit.tenantId,
          code: `CP-${kit.unique()}`,
          name: 'Compensation test grade',
          rank: 100,
        })
        .returning(),
    );
    const manager = await kit.person();
    const members = [];
    const [structure] = await kit.inTenant((tx) =>
      tx
        .select()
        .from(salaryStructures)
        .where(eq(salaryStructures.code, options.rmg ? 'RMG_WORKER' : 'STAFF')),
    );
    const [group] = await kit.inTenant((tx) =>
      tx
        .insert(payGroups)
        .values({
          tenantId: kit.tenantId,
          code: `CP-${kit.unique()}`,
          name: 'Compensation test',
          frequency: 'monthly',
        })
        .returning(),
    );
    const [cycle] = await kit.inTenant((tx) =>
      tx
        .insert(reviewCycles)
        .values({
          tenantId: kit.tenantId,
          name: `Compensation ${kit.unique()}`,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'released',
          competencies: [...DEFAULT_COMPETENCIES],
        })
        .returning(),
    );
    for (let i = 0; i < (options.people ?? 1); i++) {
      const person = await kit.person();
      members.push(person);
      await kit.inTenant(async (tx) => {
        await tx
          .update(jobAssignments)
          .set({ managerId: manager.employee.id, gradeId: grade!.id })
          .where(eq(jobAssignments.employeeId, person.employee.id));
        await tx.insert(employeePay).values({
          tenantId: kit.tenantId,
          employeeId: person.employee.id,
          effectiveFrom: '2024-01-01',
          status: 'approved',
          structureId: structure!.id,
          payGroupId: group!.id,
          amountsEnc: cipher.encrypt(JSON.stringify({ amount: '20000', fixed: {} }), {
            tenantId: kit.tenantId,
            field: CIPHER_FIELDS.payAmounts,
          }),
          wageGrade: options.rmg ? 'G4' : null,
          reason: 'Initial test pay',
        });
        await tx.insert(reviews).values({
          tenantId: kit.tenantId,
          cycleId: cycle!.id,
          employeeId: person.employee.id,
          managerEmployeeId: manager.employee.id,
          status: options.acknowledged ? 'acknowledged' : 'released',
          finalRating: 4,
          recommendations: { increment: true, promotionDesignationId: null, plan: false },
        });
      });
    }
    const gradeId = grade!.id;
    const input = {
      name: `Increment ${kit.unique()}`,
      legalEntityId: kit.company('MGT'),
      cycleId: cycle!.id,
      effectiveFrom: on,
      rmgAnnual: options.rmg ?? false,
      matrix: DEFAULT_INCREMENT_MATRIX,
      ranges: [{ gradeId, minimum: '10000', maximum: '30000' }],
      budgets: [{ orgUnitId: null, monthlyAmount: '100000' }],
    };
    return { manager, members, group: group!, cycle: cycle!, input };
  }
  const create = async (input: object) =>
    (await api(app).post(base).set(as()).send(input).expect(201)).body as CompensationRoundView;
  const get = async (id: string, token = kit.admin) =>
    (await api(app).get(`${base}/${id}`).set(as(token)).expect(200)).body as CompensationRoundView;
  const propose = (
    round: CompensationRoundView,
    line = round.lines[0]!,
    token = kit.admin,
    extra: object = {},
  ) =>
    api(app)
      .patch(`${base}/${round.id}/lines/${line.id}`)
      .set(as(token))
      .send({
        percent: line.percent,
        reason: 'Reviewed against performance',
        version: line.version,
        submit: true,
        ...extra,
      });
  const send = (id: string) => api(app).post(`${base}/${id}/export`).set(as());
  async function submitAll(round: CompensationRoundView) {
    for (const line of round.lines) await propose(round, line).expect(200);
    return get(round.id);
  }

  it('snapshots acknowledged and released reviews, encrypts pay, and exposes only direct reports to managers', async () => {
    const f = await fixture({ acknowledged: true });
    const r = await create(f.input);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({
      rating: 4,
      incrementRecommended: true,
      band: 'to_maximum',
      suggestedPercent: '7',
      grossBefore: '20000.00',
      grossAfter: '21400.00',
      submitted: false,
    });
    const [stored] = await kit.inTenant((tx) =>
      tx.select().from(compensationLines).where(eq(compensationLines.roundId, r.id)),
    );
    expect(stored!.amountsEnc).toMatch(/^v1:/);
    expect(stored!.amountsEnc).not.toContain('20000');
    const managerView = await get(r.id, f.manager.token);
    expect(managerView).toMatchObject({ manage: false, people: 1, budgets: [], skipped: [] });
    expect(managerView.lines[0]!.canEdit).toBe(true);
    for (const token of [
      (await kit.person()).token,
      f.members[0]!.token,
      (await kit.staff('hr_admin', ['MGF'])).token,
    ]) {
      await api(app).get(`${base}/${r.id}`).set(as(token)).expect(404);
      expect(
        (await api(app).get(base).set(as(token)).expect(200)).body.map((x: { id: string }) => x.id),
      ).not.toContain(r.id);
    }
    await api(app).post(base).set(as(f.manager.token)).send(f.input).expect(403);
    const ngo = (await tenantLogin(app, 'sponsored-ngo')).accessToken;
    await api(app).get(`${base}/${r.id}`).set(as(ngo)).expect(404);
  });

  it('refuses unpublished cycles, omits unfinished reviews and lists missing grade ranges', async () => {
    const f = await fixture({ people: 2 });
    await kit.inTenant((tx) =>
      tx.update(reviewCycles).set({ status: 'active' }).where(eq(reviewCycles.id, f.cycle.id)),
    );
    expect((await api(app).post(base).set(as()).send(f.input).expect(400)).body.code).toBe(
      'compensation_cycle',
    );
    await kit.inTenant(async (tx) => {
      await tx
        .update(reviewCycles)
        .set({ status: 'released' })
        .where(eq(reviewCycles.id, f.cycle.id));
      await tx
        .update(reviews)
        .set({ status: 'manager' })
        .where(eq(reviews.employeeId, f.members[1]!.employee.id));
    });
    const r = await create(f.input);
    expect(r.lines.map((l) => l.employee.id)).toEqual([f.members[0]!.employee.id]);
    expect(r.skipped).toContainEqual(
      expect.objectContaining({
        employee: expect.objectContaining({ id: f.members[1]!.employee.id }),
        reason: 'no_released_review',
      }),
    );
    expect(
      (
        await api(app)
          .post(base)
          .set(as())
          .send({ ...f.input, ranges: [] })
          .expect(400)
      ).body.code,
    ).toBe('compensation_empty');
  });

  it('requires reasons, rejects stale versions, fixes submitted manager proposals and checks unit and company budgets', async () => {
    const f = await fixture();
    const unitId = kit.org.orgUnits.find((u) => u.code === 'MGT-L1')!.id;
    const r = await create({
      ...f.input,
      budgets: [
        { orgUnitId: null, monthlyAmount: '100000' },
        { orgUnitId: unitId, monthlyAmount: '1' },
      ],
    });
    expect((await send(r.id).expect(409)).body.code).toBe('compensation_unsubmitted');
    await propose(r, r.lines[0]!, f.manager.token, { reason: '' }).expect(400);
    await propose(r, r.lines[0]!, f.manager.token).expect(200);
    await propose(r, r.lines[0]!, f.manager.token).expect(403);
    expect((await propose(r).expect(409)).body.code).toBe('compensation_changed');
    expect((await send(r.id).expect(409)).body.code).toBe('compensation_budget');
    await api(app)
      .patch(`${base}/${r.id}/budgets`)
      .set(as(f.manager.token))
      .send({ budgets: f.input.budgets })
      .expect(403);
    await api(app)
      .patch(`${base}/${r.id}/budgets`)
      .set(as())
      .send({ budgets: [{ orgUnitId: null, monthlyAmount: '1' }] })
      .expect(200);
    expect((await send(r.id).expect(409)).body.code).toBe('compensation_budget');
    const latest = await get(r.id);
    await propose(latest, latest.lines[0]!, kit.admin, {
      percent: '0',
      reason: 'No increment within the budget',
    }).expect(200);
    const sent = (await send(r.id).expect(200)).body as CompensationRoundView;
    expect(sent.status).toBe('payroll');
    expect(sent.lines[0]!.payChangeId).toBeNull();
    await api(app).post(`${base}/${r.id}/cancel`).set(as()).expect(409);
  });

  it('forces maker-checker, prevents self approval and makes approved changes available to payroll', async () => {
    const f = await fixture();
    const finance = await kit.staff('finance_officer');
    const r = await submitAll(await create(f.input));
    const [settings] = await kit.inTenant((tx) => tx.select().from(payrollSettings));
    await kit.inTenant((tx) => tx.update(payrollSettings).set({ makerChecker: false }));
    let sent: CompensationRoundView;
    try {
      sent = (await send(r.id).expect(200)).body;
    } finally {
      await kit.inTenant((tx) =>
        tx.update(payrollSettings).set({ makerChecker: settings!.makerChecker }),
      );
    }
    expect(sent!.lines[0]).toMatchObject({ payStatus: 'pending' });
    const employeeId = f.members[0]!.employee.id;
    const pay = (await api(app).get(`/tenant/employees/${employeeId}/pay`).set(as()).expect(200))
      .body as EmployeePayView;
    const pending = pay.pending[0]!;
    expect(pending).toMatchObject({ effectiveFrom: on, gross: '21400.00', status: 'pending' });
    await api(app)
      .post(`/tenant/approvals/${pending.steps[0]!.id}/approve`)
      .set(as())
      .send({})
      .expect(403);
    await api(app)
      .post(`/tenant/approvals/${pending.steps[0]!.id}/approve`)
      .set(as(finance.token))
      .send({})
      .expect(201);
    expect((await get(r.id)).lines[0]!.payStatus).toBe('approved');
    await send(r.id).expect(409);
    const run = (
      await api(app)
        .post('/tenant/payroll/runs')
        .set(as())
        .send({ payGroupId: f.group.id, month: '2026-10' })
        .expect(201)
    ).body as PayrollRunView;
    await api(app).post(`/tenant/payroll/runs/${run.id}/compute`).set(as()).expect(200);
    const items = (await api(app).get(`/tenant/payroll/runs/${run.id}/items`).set(as()).expect(200))
      .body as PayrollRunItemPage;
    expect(items.items).toHaveLength(1);
    expect(items.items[0]!.lines.find((l) => l.code === 'BASIC')?.amount).toBe('12840.00');
  });

  it('exports atomically and refuses pay changed after planning', async () => {
    const f = await fixture({ people: 2 });
    const r = await submitAll(await create(f.input));
    const ordered = r.lines.toSorted((a, b) => a.employee.id.localeCompare(b.employee.id));
    const changed = ordered[1]!;
    const [source] = await kit.inTenant((tx) =>
      tx.select().from(employeePay).where(eq(employeePay.employeeId, changed.employee.id)),
    );
    await kit.inTenant((tx) =>
      tx.insert(employeePay).values({
        ...source!,
        id: undefined,
        effectiveFrom: '2026-09-01',
        reason: 'Different approved pay',
        createdAt: new Date(),
      }),
    );
    expect((await send(r.id).expect(409)).body.code).toBe('compensation_stale');
    const after = await get(r.id);
    expect(after.status).toBe('open');
    expect(after.lines.every((l) => l.payChangeId === null)).toBe(true);
    const pending = await kit.inTenant((tx) =>
      tx.select().from(employeePay).where(eq(employeePay.status, 'pending')),
    );
    expect(pending.some((p) => r.lines.some((l) => l.employee.id === p.employeeId))).toBe(false);
    await api(app).post(`${base}/${r.id}/cancel`).set(as()).expect(200);
    await send(r.id).expect(409);
  });

  it('serializes concurrent submissions and exports without duplicating pay proposals', async () => {
    const f = await fixture();
    const r = await create(f.input);
    const changes = await Promise.all([propose(r), propose(r)]);
    expect(changes.map((x) => x.status).toSorted()).toEqual([200, 409]);
    const sent = await Promise.all([send(r.id), send(r.id)]);
    expect(sent.map((x) => x.status).toSorted()).toEqual([200, 409]);
    const pay = (
      await api(app).get(`/tenant/employees/${f.members[0]!.employee.id}/pay`).set(as()).expect(200)
    ).body as EmployeePayView;
    expect(pay.pending).toHaveLength(1);
  });

  it('applies the RMG basic floor independently of the matrix and does not repeat an annual increase', async () => {
    const f = await fixture({ rmg: true });
    const zero = Object.fromEntries(
      Object.keys(DEFAULT_INCREMENT_MATRIX).map((r) => [
        r,
        { below_midpoint: '0', to_maximum: '0', above_maximum: '0' },
      ]),
    );
    const r = await create({ ...f.input, matrix: zero });
    const line = r.lines[0]!;
    expect(line.percent).toBe('0');
    expect(Number(line.basicAfter)).toBeGreaterThanOrEqual(
      new Decimal(line.basicBefore).times('1.09').ceil().toNumber(),
    );
    const sent = (await send((await submitAll(r)).id).expect(200)).body as CompensationRoundView;
    expect(sent.lines[0]!.payStatus).toBe('pending');
    await api(app)
      .post(base)
      .set(as())
      .send({ ...f.input, matrix: zero })
      .expect(400);
    // Withdrawal lets HR rebuild; it never changes approved pay.
    await api(app)
      .post(`/tenant/pay-changes/${sent.lines[0]!.payChangeId}/cancel`)
      .set(as())
      .expect(204);
    const rebuilt = await create({ ...f.input, matrix: zero });
    expect(rebuilt.lines[0]!.grossBefore).toBe('20000.00');
    const again = (await send((await submitAll(rebuilt)).id).expect(200))
      .body as CompensationRoundView;
    const finance = await kit.staff('finance_officer');
    const pending = (
      await api(app).get(`/tenant/employees/${f.members[0]!.employee.id}/pay`).set(as()).expect(200)
    ).body as EmployeePayView;
    await api(app)
      .post(`/tenant/approvals/${pending.pending[0]!.steps[0]!.id}/approve`)
      .set(as(finance.token))
      .send({})
      .expect(201);
    expect((await get(again.id)).lines[0]!.payStatus).toBe('approved');
    // Now no pending pay exists: the annual-round history itself blocks a repeated increment.
    expect(
      (
        await api(app)
          .post(base)
          .set(as())
          .send({ ...f.input, matrix: zero })
          .expect(400)
      ).body.code,
    ).toBe('compensation_empty');
  });

  it('keeps rejected pay unchanged, allows a new round, and prevents HR editing their own line', async () => {
    const f = await fixture();
    const finance = await kit.staff('finance_officer');
    const r = await submitAll(await create(f.input));
    await send(r.id).expect(200);
    const url = `/tenant/employees/${f.members[0]!.employee.id}/pay`;
    const before = (await api(app).get(url).set(as()).expect(200)).body as EmployeePayView;
    await api(app)
      .post(`/tenant/approvals/${before.pending[0]!.steps[0]!.id}/reject`)
      .set(as(finance.token))
      .send({ comment: 'Return for a smaller proposal' })
      .expect(201);
    expect((await get(r.id)).lines[0]!.payStatus).toBe('rejected');
    const after = (await api(app).get(url).set(as()).expect(200)).body as EmployeePayView;
    expect(after.history.find((p) => p.status === 'approved')!.gross).toBe('20000.00');
    const rebuilt = await create(f.input);
    await kit.inTenant((tx) =>
      tx
        .update(tenantUsers)
        .set({ role: 'hr_admin' })
        .where(eq(tenantUsers.email, f.members[0]!.email)),
    );
    const own = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email: f.members[0]!.email, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;
    expect((await get(rebuilt.id, own)).lines[0]!.canEdit).toBe(false);
    await propose(rebuilt, rebuilt.lines[0]!, own).expect(403);
  });

  it('refuses job changes after planning and enforces both feature and write access gates', async () => {
    const f = await fixture();
    const r = await submitAll(await create(f.input));
    await kit.inTenant(async (tx) => {
      const [old] = await tx
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.employeeId, f.members[0]!.employee.id));
      await tx
        .update(jobAssignments)
        .set({ effectiveTo: '2026-08-31' })
        .where(eq(jobAssignments.id, old!.id));
      await tx.insert(jobAssignments).values({
        ...old!,
        id: undefined,
        effectiveFrom: '2026-09-01',
        effectiveTo: null,
        event: 'transfer',
      });
    });
    expect((await send(r.id).expect(409)).body.code).toBe('compensation_stale');
    const starter = (await tenantLogin(app, 'trial-co')).accessToken;
    expect((await api(app).get(base).set(as(starter)).expect(403)).body.code).toBe(
      'feature_not_in_plan',
    );
    const readOnly = (await tenantLogin(app, 'acme-garments')).accessToken;
    expect((await api(app).post(base).set(as(readOnly)).send(f.input).expect(403)).body.code).toBe(
      'tenant_read_only',
    );
  });
});
