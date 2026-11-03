import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  createDb,
  runAsTenant,
  saudiPilotRuns,
  saudiPilotComparisons,
  saudiWpsBatches,
  saudiWpsEvents,
  saudiWorkerCoverage,
  tenantUsers,
  userEntityScopes,
} from '@gp/db';
import {
  ACCESS_FIELDS,
  emptyFieldPolicy,
  type SaudiPayrollInput,
  type SaudiPilotView,
  type SaudiWorkerInput,
} from '@gp/shared';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';
import { totpAt } from '../src/modules/auth/totp.js';

describe('Saudi coverage, immutable previews and WPS evidence', () => {
  let app: INestApplication,
    db: ReturnType<typeof createDb>,
    token: string,
    tenantId: string,
    company: string,
    bd: string,
    actorId: string,
    foreignToken: string;
  let counter = 0;
  const reason = 'Synthetic Saudi candidate acceptance, not local legal approval';
  const request = () => api(app),
    auth = () => bearer(token);
  const employer = (legalEntityId = company) => ({
    legalEntityId,
    effectiveFrom: '2026-06-01',
    regime: 'hrsd_private',
    workModel: 'full_time',
    endOfService: 'statutory_gratuity',
    workingTime: 'standard',
    weeklyRestDays: [5, 6],
    dailyMinutes: 480,
    noticeDays: 30,
    probationDays: 180,
    proration: 'calendar_days',
    reason,
  });
  async function fixture(overrides: Partial<SaudiWorkerInput> & { nationality?: string } = {}) {
    const nationality = overrides.nationality ?? 'IN';
    const { nationality: _nationality, ...workerOverrides } = overrides;
    const n = ++counter,
      address = {
        line: 'Synthetic test address',
        district: 'Riyadh',
        division: 'Riyadh',
        countryCode: 'SA',
      };
    const employeeId = (
      await request()
        .post('/tenant/employees')
        .set(auth())
        .send({
          employmentCountry: 'SA',
          nationality,
          employeeCode: 'M6-' + n,
          fullName: 'Synthetic Saudi employee ' + n,
          dateOfBirth: '1990-01-01',
          gender: 'female',
          mobilePhone: '+966501234567',
          presentAddress: address,
          permanentAddress: address,
          identity: {},
          joinedOn: overrides.scheme === 'gosi_new' ? '2025-01-01' : '2020-01-01',
          job: { legalEntityId: company, employmentType: 'permanent', workerCategory: 'staff' },
        })
        .expect(201)
    ).body.employee.id;
    await request()
      .post('/tenant/international/employment-profiles')
      .set(auth())
      .send({
        employeeId,
        effectiveFrom: overrides.scheme === 'gosi_new' ? '2025-01-01' : '2020-01-01',
        citizenship: nationality,
        insuranceClass: 'SA_hazards_proposed',
        contractClass: 'full_time',
        originalName: 'Synthetic original name',
        reason,
      })
      .expect(201);
    const coverage = {
      legalEntityId: company,
      employeeId,
      effectiveFrom: '2026-06-01',
      calendarBasis: 'gregorian_written_agreement',
      ramadanHours: 'applies',
      branches: 'hazards_only',
      occupationalHazardsBps: 200,
      singleEmployer: true,
      insuranceCoverageAttested: true,
      firstContributionOn: '2020-01-01',
      contributionSalary: '9000',
      contributionBasisOn: '2026-01-01',
      scheme: 'non_saudi_hazards',
      authority: 'gosi',
      priorParticipation: 'none',
      workLocation: 'SA_onshore',
      contractTerm: 'fixed_term',
      contractEndOn: '2030-12-31',
      noticeDays: 30,
      probationDays: 0,
      evidenceReference: 'Synthetic coverage source ' + n,
      ...workerOverrides,
      reason,
    };
    const id = (
      await request().post('/tenant/saudi/workers').set(auth()).send(coverage).expect(201)
    ).body.id;
    const input: SaudiPayrollInput = {
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
          yearOvertimeMinutesBefore: 0,
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
        employerContribution: '180',
        governmentContribution: '0',
        deductions: '0',
        net,
      },
    ],
  });
  const create = async (input: SaudiPayrollInput): Promise<SaudiPilotView> =>
    (await request().post('/tenant/saudi/pilots/payroll').set(auth()).send(input).expect(201)).body;
  beforeAll(async () => {
    app = await bootApp();
    db = createDb(testEnv().ownerUrl);
    const platform = await platformToken(app);
    for (const foreign of [false, true]) {
      const slug = uniqueSlug('saudi'),
        email = `admin@${slug}.test`;
      const assigned = (
        await request()
          .post('/platform/tenants')
          .set(bearer(platform))
          .send({
            name: 'M6 isolated sandbox',
            slug,
            industryTemplate: 'corporate',
            billingMode: 'internal',
            planCode: 'enterprise',
            reason,
            admin: { name: 'Synthetic M6 administrator', email },
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
      for (const countryCode of ['SA', 'BD']) {
        const row = (
          await request()
            .post('/tenant/international/companies')
            .set(auth())
            .send({ name: 'M6 employer ' + countryCode, code: countryCode, countryCode })
            .expect(201)
        ).body;
        if (countryCode === 'SA') company = row.id;
        else bd = row.id;
      }
      await request().post('/tenant/saudi/employers').set(auth()).send(employer()).expect(201);
    }
  });
  afterAll(async () => {
    await db?.pool.end();
    await app?.close();
  });
  it('keeps explicit GOSI schemes separate through the API', async () => {
    for (const modern of [false, true]) {
      const f = await fixture({
        nationality: 'SA',
        branches: 'annuities_saned_hazards',
        scheme: modern ? 'gosi_new' : 'gosi_legacy',
        authority: 'gosi',
        priorParticipation: modern ? 'none' : 'pre_2024_social',
        firstContributionOn: modern ? '2024-07-03' : '2010-01-01',
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
              employeeContribution: '1947.50',
              employerContribution: '2327.50',
              governmentContribution: '0.00',
              net: '17052.50',
            }
          : {
              employeeContribution: '975.00',
              employerContribution: '1175.00',
              governmentContribution: '0.00',
              net: '8025.00',
            },
      );
      f.input.lines[0]!.unpaidDays = 1;
      await request().post('/tenant/saudi/pilots/payroll').set(auth()).send(f.input).expect(409);
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
      await request().post('/tenant/saudi/pilots/payroll').set(auth()).send(f.input).expect(409);
    }
  });
  it('blocks Hijri, multi-employer and unconfirmed GOSI branches at the API boundary', async () => {
    for (const overrides of [
      { calendarBasis: 'hijri' as const },
      { singleEmployer: false },
      { insuranceCoverageAttested: false },
      { branches: 'unknown' as const },
    ]) {
      const f = await fixture(overrides);
      await request().post('/tenant/saudi/pilots/payroll').set(auth()).send(f.input).expect(409);
    }
  });
  it('previews Saudi resignation reductions without executing separation', async () => {
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
      entitlementsAttested: true,
      serviceHistory: 'single_employer_no_transfers',
      reason,
    };
    const resign = (
      await request().post('/tenant/saudi/pilots/settlement').set(auth()).send(body).expect(201)
    ).body;
    const end = (
      await request()
        .post('/tenant/saudi/pilots/settlement')
        .set(auth())
        .send({ ...body, terminationReason: 'employer_termination' })
        .expect(201)
    ).body;
    expect(resign.result.total).toBe('23975.34');
    expect(end.result.total).toBe('35963.01');
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
      name: 'M6 field boundary ' + counter,
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
      .get('/tenant/saudi?legalEntityId=' + company)
      .set(bearer(session.accessToken))
      .expect(403);
    fields.bank = { read: true, write: true, export: true };
    await request()
      .put('/tenant/identity/roles/' + role.id)
      .set(auth())
      .send({ ...roleBody, fields, version: role.version })
      .expect(200);
    await request()
      .get('/tenant/saudi?legalEntityId=' + company)
      .set(bearer(session.accessToken))
      .expect(200);
    await request()
      .get('/tenant/saudi?legalEntityId=' + bd)
      .set(bearer(session.accessToken))
      .expect(409);
  });
  it('keeps source review and activation open, without weakening M4', async () => {
    const data = (
      await request()
        .get('/tenant/saudi?legalEntityId=' + company)
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
    await request().post('/tenant/saudi/activate').set(auth()).send({}).expect(409);
    await request().post('/tenant/saudi/wps/export').set(auth()).send({}).expect(409);
    await request()
      .post('/tenant/payroll/pay-groups')
      .set(auth())
      .send({
        code: 'SA-BLOCKED',
        name: 'Must not invoke BD',
        frequency: 'monthly',
        legalEntityId: company,
        currency: 'SAR',
      })
      .expect(409);
    await request().post('/tenant/saudi/employers').set(auth()).send(employer(bd)).expect(409);
  });
  it('creates exact encrypted SAR previews and does not create statutory payroll', async () => {
    const f = await fixture(),
      run = await create(f.input);
    expect(run.contextCurrent).toBe(true);
    expect(run.result.lines[0]).toMatchObject({
      gross: '9000.00',
      net: '9000.00',
      currency: 'SAR',
      employeeContribution: '0.00',
    });
    await runAsTenant(db.db, tenantId, async (tx) => {
      const [stored] = await tx.select().from(saudiPilotRuns).where(eq(saudiPilotRuns.id, run.id));
      expect(stored!.payloadEnc).not.toContain('9000');
      expect(stored!.payloadEnc).toMatch(/^v[12]:/);
      const [coverage] = await tx
        .select()
        .from(saudiWorkerCoverage)
        .where(eq(saudiWorkerCoverage.id, f.id));
      expect(coverage!.definitionEnc).not.toContain('non_saudi_hazards');
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
        tx.update(saudiPilotRuns).set({ currency: 'BDT' }).where(eq(saudiPilotRuns.id, run.id)),
      ),
    ).rejects.toThrow();
    await expect(
      runAsTenant(db.db, tenantId, (tx) =>
        tx.delete(saudiPilotRuns).where(eq(saudiPilotRuns.id, run.id)),
      ),
    ).rejects.toThrow();
  });
  it('compares exact employee sets and requires a second person for independent evidence', async () => {
    const f = await fixture(),
      run = await create(f.input),
      body = expected(f.employeeId);
    await request()
      .post(`/tenant/saudi/pilots/${run.id}/comparisons`)
      .set(auth())
      .send({ ...body, evidenceKind: 'independent' })
      .expect(409);
    const diff = (
      await request()
        .post(`/tenant/saudi/pilots/${run.id}/comparisons`)
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
          .post(`/tenant/saudi/pilots/${run.id}/comparisons`)
          .set(auth())
          .send(extra)
          .expect(201)
      ).body.outcome,
    ).toBe('differences');
    expect(
      (
        await request()
          .post(`/tenant/saudi/pilots/${run.id}/comparisons`)
          .set(auth())
          .send(body)
          .expect(201)
      ).body.outcome,
    ).toBe('matched');
    await request()
      .post(`/tenant/saudi/pilots/${run.id}/comparisons`)
      .set(auth())
      .send(expected(f.employeeId, '8999.99'))
      .expect(201);
    await request().post(`/tenant/saudi/wps/${run.id}/sandbox`).set(auth()).send({}).expect(409);
    await runAsTenant(db.db, tenantId, async (tx) => {
      const rows = await tx
        .select({ sequence: saudiPilotComparisons.sequence })
        .from(saudiPilotComparisons)
        .where(eq(saudiPilotComparisons.runId, run.id))
        .orderBy(saudiPilotComparisons.sequence);
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
        .post(`/tenant/saudi/pilots/${run.id}/comparisons`)
        .set(auth())
        .send(expected(f.employeeId))
        .expect(201);
    }
    const overview = (
      await request()
        .get('/tenant/saudi?legalEntityId=' + company)
        .set(auth())
        .expect(200)
    ).body;
    expect(overview.qualification.independentConsecutivePeriods).toBe(0);
    expect(overview.qualification.liveEnabled).toBe(false);
  });
  it('runs the synthetic wage-file lifecycle with exact hash/amounts and replay protection', async () => {
    const f = await fixture(),
      run = await create(f.input);
    await request().post(`/tenant/saudi/wps/${run.id}/sandbox`).set(auth()).send({}).expect(409);
    await request()
      .post(`/tenant/saudi/pilots/${run.id}/comparisons`)
      .set(auth())
      .send(expected(f.employeeId))
      .expect(201);
    const batch = (
      await request().post(`/tenant/saudi/wps/${run.id}/sandbox`).set(auth()).send({}).expect(201)
    ).body;
    const file = await request().get(`/tenant/saudi/wps/${batch.id}/file`).set(auth()).expect(200);
    expect(file.text).toContain('SANDBOX ONLY - NOT A SEALED BANK FILE');
    expect(file.text).toContain('INTERNAL_CONTROL,1,9000.00,SAR');
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
      .post(`/tenant/saudi/wps/${batch.id}/events`)
      .set(auth())
      .send({ ...event, fileHash: 'b'.repeat(64) })
      .expect(409);
    await request()
      .post(`/tenant/saudi/wps/${batch.id}/events`)
      .set(auth())
      .send(event)
      .expect(201);
    expect(
      (
        await request()
          .post(`/tenant/saudi/wps/${batch.id}/events`)
          .set(auth())
          .send(event)
          .expect(201)
      ).body.duplicate,
    ).toBe(true);
    await request()
      .post(`/tenant/saudi/wps/${batch.id}/events`)
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
      .post(`/tenant/saudi/wps/${batch.id}/events`)
      .set(auth())
      .send(accepted)
      .expect(201);
    await request()
      .post(`/tenant/saudi/wps/${batch.id}/events`)
      .set(auth())
      .send({ ...accepted, eventId: randomUUID(), kind: 'reconciled', returnedTotal: '8999.99' })
      .expect(409);
    expect(
      (
        await request()
          .post(`/tenant/saudi/wps/${batch.id}/events`)
          .set(auth())
          .send({ ...accepted, eventId: randomUUID(), kind: 'reconciled' })
          .expect(201)
      ).body.paymentProven,
    ).toBe(false);
    await runAsTenant(db.db, tenantId, async (tx) => {
      expect(
        await tx.select().from(saudiWpsEvents).where(eq(saudiWpsEvents.batchId, batch.id)),
      ).toHaveLength(3);
      const [stored] = await tx
        .select()
        .from(saudiWpsBatches)
        .where(eq(saudiWpsBatches.id, batch.id));
      expect(stored!.payloadEnc).not.toContain('AE0703');
    });
  });
  it('preserves a stale preview and blocks reuse after dated coverage changes', async () => {
    const f = await fixture(),
      run = await create(f.input);
    await request()
      .post('/tenant/saudi/workers')
      .set(auth())
      .send({ ...f.coverage, effectiveFrom: '2026-06-15', scheme: 'unknown', authority: 'unknown' })
      .expect(201);
    const historical = (
      await request()
        .get('/tenant/saudi/pilots/' + run.id)
        .set(auth())
        .expect(200)
    ).body;
    expect(historical.contextCurrent).toBe(false);
    expect(historical.result.total).toBe('9000.00');
    expect(historical.calculationHash).toBe(run.calculationHash);
    await request()
      .post(`/tenant/saudi/pilots/${run.id}/comparisons`)
      .set(auth())
      .send(expected(f.employeeId))
      .expect(409);
    await request().post(`/tenant/saudi/wps/${run.id}/sandbox`).set(auth()).send({}).expect(409);
  });
  it('blocks other tenants and company-restricted access before exposing candidates', async () => {
    const f = await fixture(),
      run = await create(f.input);
    await request()
      .get('/tenant/saudi/pilots/' + run.id)
      .set(bearer(foreignToken))
      .expect(404);
    await request()
      .get('/tenant/saudi?legalEntityId=' + company)
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
        .get('/tenant/saudi/pilots/' + run.id)
        .set(auth())
        .expect(404);
      await request().post('/tenant/saudi/pilots/payroll').set(auth()).send(f.input).expect(404);
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
      usedBefore: 29,
      requestedDays: 3,
      eligibilityAttested: true,
      probationCompleted: true,
    };
    expect(
      (await request().post('/tenant/saudi/leave-preview').set(auth()).send(leave).expect(201))
        .body,
    ).toMatchObject({ fullDays: 1, threeQuarterDays: 2, unpaidDays: 0, postedToLedger: false });
    await request()
      .post('/tenant/saudi/leave-preview')
      .set(auth())
      .send({ ...leave, eligibilityAttested: false })
      .expect(400);
    await request()
      .post('/tenant/saudi/leave-preview')
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
        .get('/tenant/saudi?legalEntityId=' + company)
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
      ruleKeys: ['coverage_contract_calendar'],
      coveredScenarios: ['Synthetic contract boundary fixture'],
      synthetic: true,
      reason,
    };
    await request()
      .post('/tenant/saudi/evidence')
      .set(auth())
      .send({ ...evidence, manifestHash: '0'.repeat(64) })
      .expect(409);
    await request().post('/tenant/saudi/evidence').set(auth()).send(evidence).expect(201);
    const after = (
      await request()
        .get('/tenant/saudi?legalEntityId=' + company)
        .set(auth())
        .expect(200)
    ).body;
    expect(after.qualification.open).toContain('law_and_cohorts');
    expect(after.manifest.rules[0].reviewer).toBeNull();
    expect(after.qualification.liveEnabled).toBe(false);
  });
});
