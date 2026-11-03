import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  createDb,
  runAsTenant,
  uaePilotRuns,
  uaePilotComparisons,
  uaeWpsBatches,
  uaeWpsEvents,
  uaeWorkerCoverage,
  tenantUsers,
  userEntityScopes,
} from '@gp/db';
import {
  ACCESS_FIELDS,
  emptyFieldPolicy,
  type UaePayrollInput,
  type UaePilotView,
  type UaeWorkerInput,
} from '@gp/shared';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';
import { totpAt } from '../src/modules/auth/totp.js';

describe('UAE coverage, immutable previews and WPS evidence', () => {
  let app: INestApplication,
    db: ReturnType<typeof createDb>,
    token: string,
    tenantId: string,
    company: string,
    bd: string,
    actorId: string,
    foreignToken: string;
  let counter = 0;
  const reason = 'Synthetic UAE candidate acceptance, not local legal approval';
  const request = () => api(app),
    auth = () => bearer(token);
  const employer = (legalEntityId = company) => ({
    legalEntityId,
    effectiveFrom: '2026-06-01',
    regime: 'mohre_federal_private',
    workModel: 'full_time',
    endOfService: 'statutory_gratuity',
    workingTime: 'standard',
    weeklyRestDays: [0, 6],
    dailyMinutes: 480,
    noticeDays: 30,
    probationMonths: 6,
    proration: 'calendar_days',
    reason,
  });
  async function fixture(overrides: Partial<UaeWorkerInput> & { nationality?: string } = {}) {
    const nationality = overrides.nationality ?? 'IN';
    const { nationality: _nationality, ...workerOverrides } = overrides;
    const n = ++counter,
      address = {
        line: 'Synthetic test address',
        district: 'Dubai',
        division: 'Dubai',
        countryCode: 'AE',
      };
    const employeeId = (
      await request()
        .post('/tenant/employees')
        .set(auth())
        .send({
          employmentCountry: 'AE',
          nationality,
          employeeCode: 'M5-' + n,
          fullName: 'Synthetic UAE employee ' + n,
          dateOfBirth: '1990-01-01',
          gender: 'female',
          mobilePhone: '+971501234567',
          presentAddress: address,
          permanentAddress: address,
          identity: {},
          joinedOn: '2020-01-01',
          job: { legalEntityId: company, employmentType: 'permanent', workerCategory: 'staff' },
        })
        .expect(201)
    ).body.employee.id;
    await request()
      .post('/tenant/international/employment-profiles')
      .set(auth())
      .send({
        employeeId,
        effectiveFrom: '2020-01-01',
        citizenship: nationality,
        insuranceClass: 'AE_expat_proposed',
        contractClass: 'full_time',
        originalName: 'Synthetic original name',
        reason,
      })
      .expect(201);
    const coverage = {
      legalEntityId: company,
      employeeId,
      effectiveFrom: '2026-06-01',
      scheme: 'expatriate_none',
      authority: 'none_confirmed',
      priorParticipation: 'none',
      workLocation: 'AE_onshore',
      contractTerm: 'fixed_term',
      contractEndOn: '2030-12-31',
      noticeDays: 30,
      probationMonths: 0,
      evidenceReference: 'Synthetic coverage source ' + n,
      ...workerOverrides,
      reason,
    };
    const id = (await request().post('/tenant/uae/workers').set(auth()).send(coverage).expect(201))
      .body.id;
    const input: UaePayrollInput = {
      legalEntityId: company,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      reason,
      lines: [
        {
          workerCoverageId: id,
          basic: '6000',
          allowances: '3000',
          unpaidDays: 0,
          sickDaysBefore: 0,
          sickDays: 0,
          probationCompleted: true,
          shiftWorker: false,
          overtime: [],
          deductions: [],
        },
      ],
    };
    return { employeeId, id, coverage, input };
  }
  const expected = (employeeId: string, net = '9000') => ({
    evidenceKind: 'synthetic',
    preparedBy: 'Synthetic independent arithmetic',
    reference: 'Synthetic fixture, not a real pilot',
    documentHash: 'a'.repeat(64),
    reason,
    expected: [
      {
        employeeId,
        gross: '9000',
        employeeContribution: '0',
        employerContribution: '0',
        governmentContribution: '0',
        deductions: '0',
        net,
      },
    ],
  });
  const create = async (input: UaePayrollInput): Promise<UaePilotView> =>
    (await request().post('/tenant/uae/pilots/payroll').set(auth()).send(input).expect(201)).body;
  beforeAll(async () => {
    app = await bootApp();
    db = createDb(testEnv().ownerUrl);
    const platform = await platformToken(app);
    for (const foreign of [false, true]) {
      const slug = uniqueSlug('uae'),
        email = `admin@${slug}.test`;
      const assigned = (
        await request()
          .post('/platform/tenants')
          .set(bearer(platform))
          .send({
            name: 'M5 isolated sandbox',
            slug,
            industryTemplate: 'corporate',
            billingMode: 'internal',
            planCode: 'enterprise',
            reason,
            admin: { name: 'Synthetic M5 administrator', email },
          })
          .expect(201)
      ).body;
      const session = (
        await request()
          .post('/auth/login')
          .send({ tenant: slug, email, password: assigned.temporaryPassword })
          .expect(200)
      ).body;
      const setup = (
        await request().post('/account/mfa/setup').set(bearer(session.accessToken)).expect(200)
      ).body;
      await request()
        .post('/account/mfa/confirm')
        .set(bearer(session.accessToken))
        .send({ code: totpAt(setup.secret, new Date()) })
        .expect(200);
      if (foreign) {
        foreignToken = session.accessToken;
        continue;
      }
      token = session.accessToken;
      tenantId = assigned.tenant.id;
      await runAsTenant(db.db, tenantId, async (tx) => {
        const [actor] = await tx
          .select({ id: tenantUsers.id })
          .from(tenantUsers)
          .where(eq(tenantUsers.email, email));
        actorId = actor!.id;
      });
      for (const countryCode of ['AE', 'BD']) {
        const row = (
          await request()
            .post('/tenant/international/companies')
            .set(auth())
            .send({ name: 'M5 employer ' + countryCode, code: countryCode, countryCode })
            .expect(201)
        ).body;
        if (countryCode === 'AE') company = row.id;
        else bd = row.id;
      }
      await request().post('/tenant/uae/employers').set(auth()).send(employer()).expect(201);
    }
  });
  afterAll(async () => {
    await db?.pool.end();
    await app?.close();
  });
  it('keeps explicit GPSSA schemes separate through the API', async () => {
    for (const modern of [false, true]) {
      const f = await fixture({
        nationality: 'AE',
        scheme: modern ? 'gpssa_2023' : 'gpssa_1999',
        authority: 'gpssa',
        priorParticipation: modern ? 'none' : 'law_1999',
        firstContributionOn: modern ? '2024-01-01' : '2010-01-01',
        contributionSalary: modern ? '19000' : '10000',
        contributionBasisOn: '2026-01-01',
      });
      if (modern) {
        f.input.lines[0]!.basic = '10000';
        f.input.lines[0]!.allowances = '9000';
      }
      const run = await create(f.input);
      expect(run.result.lines[0]).toMatchObject(
        modern
          ? {
              employeeContribution: '2090.00',
              employerContribution: '2375.00',
              governmentContribution: '475.00',
              net: '16910.00',
            }
          : {
              employeeContribution: '500.00',
              employerContribution: '1250.00',
              governmentContribution: '250.00',
              net: '8500.00',
            },
      );
      f.input.lines[0]!.unpaidDays = 1;
      await request().post('/tenant/uae/pilots/payroll').set(auth()).send(f.input).expect(409);
    }
  });
  it('retains unsupported cohort and cross-border proposals without calculating zero rates', async () => {
    for (const overrides of [
      {
        nationality: 'KW',
        scheme: 'gcc_extension' as const,
        authority: 'other' as const,
        priorParticipation: 'unknown' as const,
      },
      { workLocation: 'cross_border' as const },
      { contractTerm: 'unknown' as const },
    ]) {
      const f = await fixture(overrides);
      await request().post('/tenant/uae/pilots/payroll').set(auth()).send(f.input).expect(409);
    }
  });
  it('previews settlement without executing separation or importing resignation reductions', async () => {
    const f = await fixture();
    const body = {
      legalEntityId: company,
      workerCoverageId: f.id,
      lastWorkingDay: '2026-06-30',
      basic: '6000',
      allowances: '3000',
      unpaidServiceDays: 0,
      unusedAnnualDays: 0,
      noticePayDays: 0,
      unpaidSalary: '0',
      terminationReason: 'resignation',
      serviceHistory: 'single_employer_no_transfers',
      reason,
    };
    const resign = (
      await request().post('/tenant/uae/pilots/settlement').set(auth()).send(body).expect(201)
    ).body;
    const end = (
      await request()
        .post('/tenant/uae/pilots/settlement')
        .set(auth())
        .send({ ...body, terminationReason: 'employer_termination' })
        .expect(201)
    ).body;
    expect(resign.result.total).toBe('30008.22');
    expect(end.result.total).toBe(resign.result.total);
    await runAsTenant(db.db, tenantId, async (tx) => {
      const e = await tx.execute(
        sql`select separated_on from employees where id=${f.employeeId}::uuid`,
      );
      expect(e.rows[0]!.separated_on).toBeNull();
    });
  });
  it('honours a live custom field denial for the new preview and evidence surface', async () => {
    const email = `m5-limited-${++counter}@example.test`;
    const user = (
      await request()
        .post('/tenant/users')
        .set(auth())
        .send({
          name: 'Synthetic limited reviewer',
          email,
          role: 'hr_officer',
          password: testEnv().password,
        })
        .expect(201)
    ).body;
    const [tenant] = (await db.pool.query('select slug from tenants where id=$1', [tenantId])).rows;
    const session = (
      await request()
        .post('/auth/login')
        .send({ tenant: tenant.slug, email, password: testEnv().password })
        .expect(200)
    ).body;
    const setup = (
      await request().post('/account/mfa/setup').set(bearer(session.accessToken)).expect(200)
    ).body;
    await request()
      .post('/account/mfa/confirm')
      .set(bearer(session.accessToken))
      .send({ code: totpAt(setup.secret, new Date()) })
      .expect(200);
    const fields = Object.fromEntries(
      ACCESS_FIELDS.map((f) => [f, { read: true, write: true, export: true }]),
    ) as ReturnType<typeof emptyFieldPolicy>;
    fields.bank = { read: false, write: false, export: false };
    const roleBody = {
      name: 'M5 field boundary ' + counter,
      permissions: ['payroll.view', 'employees.identity'],
      deniedPermissions: [],
      fields,
    };
    const role = (
      await request().post('/tenant/identity/roles').set(auth()).send(roleBody).expect(201)
    ).body;
    await request()
      .post(`/tenant/identity/users/${user.id}/assignments`)
      .set(auth())
      .send({ roleId: role.id, scope: 'all', companyIds: [] })
      .expect(201);
    await request()
      .get('/tenant/uae?legalEntityId=' + company)
      .set(bearer(session.accessToken))
      .expect(403);
    fields.bank = { read: true, write: true, export: true };
    await request()
      .put('/tenant/identity/roles/' + role.id)
      .set(auth())
      .send({ ...roleBody, fields, version: role.version })
      .expect(200);
    await request()
      .get('/tenant/uae?legalEntityId=' + company)
      .set(bearer(session.accessToken))
      .expect(200);
    await request()
      .get('/tenant/uae?legalEntityId=' + bd)
      .set(bearer(session.accessToken))
      .expect(409);
  });
  it('keeps source review and activation open, without weakening M4', async () => {
    const data = (
      await request()
        .get('/tenant/uae?legalEntityId=' + company)
        .set(auth())
        .expect(200)
    ).body;
    expect(
      data.manifest.rules.every(
        (r: { reviewer: unknown; status: string }) =>
          r.reviewer === null && r.status === 'needs_review',
      ),
    ).toBe(true);
    expect(data.qualification.liveEnabled).toBe(false);
    await request().post('/tenant/uae/activate').set(auth()).send({}).expect(409);
    await request().post('/tenant/uae/wps/export').set(auth()).send({}).expect(409);
    await request()
      .post('/tenant/payroll/pay-groups')
      .set(auth())
      .send({
        code: 'AE-BLOCKED',
        name: 'Must not invoke BD',
        frequency: 'monthly',
        legalEntityId: company,
        currency: 'AED',
      })
      .expect(409);
    await request().post('/tenant/uae/employers').set(auth()).send(employer(bd)).expect(409);
  });
  it('creates exact encrypted AED previews and does not create statutory payroll', async () => {
    const f = await fixture(),
      run = await create(f.input);
    expect(run.contextCurrent).toBe(true);
    expect(run.result.lines[0]).toMatchObject({
      gross: '9000.00',
      net: '9000.00',
      currency: 'AED',
      employeeContribution: '0.00',
    });
    await runAsTenant(db.db, tenantId, async (tx) => {
      const [stored] = await tx.select().from(uaePilotRuns).where(eq(uaePilotRuns.id, run.id));
      expect(stored!.payloadEnc).not.toContain('9000');
      expect(stored!.payloadEnc).toMatch(/^v[12]:/);
      const [coverage] = await tx
        .select()
        .from(uaeWorkerCoverage)
        .where(eq(uaeWorkerCoverage.id, f.id));
      expect(coverage!.definitionEnc).not.toContain('expatriate_none');
      expect(
        (
          await tx.execute(
            sql`select count(*)::int n from payroll_runs where tenant_id=${tenantId}::uuid`,
          )
        ).rows[0]!.n,
      ).toBe(0);
    });
    await expect(
      runAsTenant(db.db, tenantId, (tx) =>
        tx.update(uaePilotRuns).set({ currency: 'BDT' }).where(eq(uaePilotRuns.id, run.id)),
      ),
    ).rejects.toThrow();
    await expect(
      runAsTenant(db.db, tenantId, (tx) =>
        tx.delete(uaePilotRuns).where(eq(uaePilotRuns.id, run.id)),
      ),
    ).rejects.toThrow();
  });
  it('compares exact employee sets and requires a second person for independent evidence', async () => {
    const f = await fixture(),
      run = await create(f.input),
      body = expected(f.employeeId);
    await request()
      .post(`/tenant/uae/pilots/${run.id}/comparisons`)
      .set(auth())
      .send({ ...body, evidenceKind: 'independent' })
      .expect(409);
    const diff = (
      await request()
        .post(`/tenant/uae/pilots/${run.id}/comparisons`)
        .set(auth())
        .send(expected(f.employeeId, '8999.99'))
        .expect(201)
    ).body;
    expect(diff.outcome).toBe('differences');
    expect(diff.differences).toHaveLength(1);
    const extra = {
      ...body,
      expected: [...body.expected, { ...body.expected[0], employeeId: randomUUID() }],
    };
    expect(
      (
        await request()
          .post(`/tenant/uae/pilots/${run.id}/comparisons`)
          .set(auth())
          .send(extra)
          .expect(201)
      ).body.outcome,
    ).toBe('differences');
    expect(
      (
        await request()
          .post(`/tenant/uae/pilots/${run.id}/comparisons`)
          .set(auth())
          .send(body)
          .expect(201)
      ).body.outcome,
    ).toBe('matched');
    await request()
      .post(`/tenant/uae/pilots/${run.id}/comparisons`)
      .set(auth())
      .send(expected(f.employeeId, '8999.99'))
      .expect(201);
    await request().post(`/tenant/uae/wps/${run.id}/sandbox`).set(auth()).send({}).expect(409);
    await runAsTenant(db.db, tenantId, async (tx) => {
      const rows = await tx
        .select({ sequence: uaePilotComparisons.sequence })
        .from(uaePilotComparisons)
        .where(eq(uaePilotComparisons.runId, run.id))
        .orderBy(uaePilotComparisons.sequence);
      expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3, 4]);
    });
  });
  it('keeps three synthetic monthly comparisons out of real pilot qualification', async () => {
    const f = await fixture();
    for (const [from, to] of [
      ['2026-06-01', '2026-06-30'],
      ['2026-07-01', '2026-07-31'],
      ['2026-08-01', '2026-08-31'],
    ]) {
      const run = await create({ ...f.input, periodStart: from!, periodEnd: to! });
      await request()
        .post(`/tenant/uae/pilots/${run.id}/comparisons`)
        .set(auth())
        .send(expected(f.employeeId))
        .expect(201);
    }
    const overview = (
      await request()
        .get('/tenant/uae?legalEntityId=' + company)
        .set(auth())
        .expect(200)
    ).body;
    expect(overview.qualification.independentConsecutivePeriods).toBe(0);
    expect(overview.qualification.liveEnabled).toBe(false);
  });
  it('runs the synthetic wage-file lifecycle with exact hash/amounts and replay protection', async () => {
    const f = await fixture(),
      run = await create(f.input);
    await request().post(`/tenant/uae/wps/${run.id}/sandbox`).set(auth()).send({}).expect(409);
    await request()
      .post(`/tenant/uae/pilots/${run.id}/comparisons`)
      .set(auth())
      .send(expected(f.employeeId))
      .expect(201);
    const batch = (
      await request().post(`/tenant/uae/wps/${run.id}/sandbox`).set(auth()).send({}).expect(201)
    ).body;
    const file = await request().get(`/tenant/uae/wps/${batch.id}/file`).set(auth()).expect(200);
    expect(file.text).toContain('SANDBOX ONLY - NOT FOR BANK UPLOAD');
    expect(file.text).toContain('SCR,0000000000000');
    const event = {
      eventId: randomUUID(),
      fileHash: batch.fileHash,
      kind: 'uploaded',
      reference: 'Synthetic agent upload',
      acceptedCount: 0,
      rejectedCount: 0,
      returnedTotal: '0',
      reason,
    };
    await request()
      .post(`/tenant/uae/wps/${batch.id}/events`)
      .set(auth())
      .send({ ...event, fileHash: 'b'.repeat(64) })
      .expect(409);
    await request().post(`/tenant/uae/wps/${batch.id}/events`).set(auth()).send(event).expect(201);
    expect(
      (
        await request()
          .post(`/tenant/uae/wps/${batch.id}/events`)
          .set(auth())
          .send(event)
          .expect(201)
      ).body.duplicate,
    ).toBe(true);
    await request()
      .post(`/tenant/uae/wps/${batch.id}/events`)
      .set(auth())
      .send({ ...event, reference: 'Changed replay body' })
      .expect(409);
    const accepted = {
      ...event,
      eventId: randomUUID(),
      kind: 'accepted',
      acceptedCount: 1,
      returnedTotal: '9000',
    };
    await request()
      .post(`/tenant/uae/wps/${batch.id}/events`)
      .set(auth())
      .send(accepted)
      .expect(201);
    await request()
      .post(`/tenant/uae/wps/${batch.id}/events`)
      .set(auth())
      .send({ ...accepted, eventId: randomUUID(), kind: 'reconciled', returnedTotal: '8999.99' })
      .expect(409);
    expect(
      (
        await request()
          .post(`/tenant/uae/wps/${batch.id}/events`)
          .set(auth())
          .send({ ...accepted, eventId: randomUUID(), kind: 'reconciled' })
          .expect(201)
      ).body.paymentProven,
    ).toBe(false);
    await runAsTenant(db.db, tenantId, async (tx) => {
      expect(
        await tx.select().from(uaeWpsEvents).where(eq(uaeWpsEvents.batchId, batch.id)),
      ).toHaveLength(3);
      const [stored] = await tx.select().from(uaeWpsBatches).where(eq(uaeWpsBatches.id, batch.id));
      expect(stored!.payloadEnc).not.toContain('AE0703');
    });
  });
  it('preserves a stale preview and blocks reuse after dated coverage changes', async () => {
    const f = await fixture(),
      run = await create(f.input);
    await request()
      .post('/tenant/uae/workers')
      .set(auth())
      .send({ ...f.coverage, effectiveFrom: '2026-06-15', scheme: 'unknown', authority: 'unknown' })
      .expect(201);
    const historical = (
      await request()
        .get('/tenant/uae/pilots/' + run.id)
        .set(auth())
        .expect(200)
    ).body;
    expect(historical.contextCurrent).toBe(false);
    expect(historical.result.total).toBe('9000.00');
    expect(historical.calculationHash).toBe(run.calculationHash);
    await request()
      .post(`/tenant/uae/pilots/${run.id}/comparisons`)
      .set(auth())
      .send(expected(f.employeeId))
      .expect(409);
    await request().post(`/tenant/uae/wps/${run.id}/sandbox`).set(auth()).send({}).expect(409);
  });
  it('blocks other tenants and company-restricted access before exposing candidates', async () => {
    const f = await fixture(),
      run = await create(f.input);
    await request()
      .get('/tenant/uae/pilots/' + run.id)
      .set(bearer(foreignToken))
      .expect(404);
    await request()
      .get('/tenant/uae?legalEntityId=' + company)
      .set(bearer(foreignToken))
      .expect(404);
    await runAsTenant(db.db, tenantId, async (tx) => {
      await tx
        .update(tenantUsers)
        .set({ scopeMode: 'selected' })
        .where(eq(tenantUsers.id, actorId));
      await tx.insert(userEntityScopes).values({ tenantId, userId: actorId, legalEntityId: bd });
    });
    try {
      await request()
        .get('/tenant/uae/pilots/' + run.id)
        .set(auth())
        .expect(404);
      await request().post('/tenant/uae/pilots/payroll').set(auth()).send(f.input).expect(404);
    } finally {
      await runAsTenant(db.db, tenantId, async (tx) => {
        await tx.delete(userEntityScopes).where(eq(userEntityScopes.userId, actorId));
        await tx.update(tenantUsers).set({ scopeMode: 'all' }).where(eq(tenantUsers.id, actorId));
      });
    }
  });
  it('previews leave without posting requests, balances or medical decisions', async () => {
    const f = await fixture();
    const leave = {
      legalEntityId: company,
      workerCoverageId: f.id,
      onDate: '2026-06-01',
      kind: 'sick',
      usedBefore: 14,
      requestedDays: 3,
      eligibilityAttested: true,
      probationCompleted: true,
    };
    expect(
      (await request().post('/tenant/uae/leave-preview').set(auth()).send(leave).expect(201)).body,
    ).toMatchObject({ fullDays: 1, halfDays: 2, unpaidDays: 0, postedToLedger: false });
    await request()
      .post('/tenant/uae/leave-preview')
      .set(auth())
      .send({ ...leave, eligibilityAttested: false })
      .expect(400);
    await request()
      .post('/tenant/uae/leave-preview')
      .set(auth())
      .send({ ...leave, kind: 'parental' })
      .expect(409);
    await runAsTenant(db.db, tenantId, async (tx) =>
      expect(
        (
          await tx.execute(
            sql`select count(*)::int n from leave_requests where employee_id=${f.employeeId}::uuid`,
          )
        ).rows[0]!.n,
      ).toBe(0),
    );
  });
  it('records source-bound review attestations without changing rule status or activation', async () => {
    const before = (
      await request()
        .get('/tenant/uae?legalEntityId=' + company)
        .set(auth())
        .expect(200)
    ).body;
    const evidence = {
      legalEntityId: company,
      kind: 'law_and_cohorts',
      reviewer: 'Synthetic reviewer (not qualified)',
      reviewedOn: '2026-11-01',
      reference: 'Synthetic document reference',
      documentHash: 'd'.repeat(64),
      manifestHash: before.manifest.manifestHash,
      ruleKeys: ['coverage_contract'],
      coveredScenarios: ['Synthetic contract boundary fixture'],
      synthetic: true,
      reason,
    };
    await request()
      .post('/tenant/uae/evidence')
      .set(auth())
      .send({ ...evidence, manifestHash: '0'.repeat(64) })
      .expect(409);
    await request().post('/tenant/uae/evidence').set(auth()).send(evidence).expect(201);
    const after = (
      await request()
        .get('/tenant/uae?legalEntityId=' + company)
        .set(auth())
        .expect(200)
    ).body;
    expect(after.qualification.open).toContain('law_and_cohorts');
    expect(after.manifest.rules[0].reviewer).toBeNull();
    expect(after.qualification.liveEnabled).toBe(false);
  });
});
