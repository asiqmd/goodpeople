import {
  createDb,
  employees,
  employeePaymentAccounts,
  runAsTenant,
  tenantAuditLog,
  tenants,
} from '@gp/db';
import type { EmployeeDetail, EmployeeListItem, OrgSnapshot, Page } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  api,
  bearer,
  bootApp,
  platformToken,
  tenantLogin,
  testEnv,
  uniqueSlug,
} from './test-env.js';

const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const portalAccess = (role: string) => ({
  email: `${uniqueSlug('new-login')}@my-group.test`,
  role,
});

describe('employees', () => {
  let app: INestApplication;
  let hr: string;
  let org: OrgSnapshot;
  let seq = 0;

  beforeAll(async () => {
    app = await bootApp();
    hr = (await tenantLogin(app, 'my-group')).accessToken;
    org = (await api(app).get('/tenant/org').set(bearer(hr)).expect(200)).body;
  });
  afterAll(() => app.close());

  const entity = (code: string) => org.legalEntities.find((e) => e.code === code)!.id;
  const location = (code: string) => org.locations.find((l) => l.code === code)!.id;
  const unit = (code: string) => org.orgUnits.find((u) => u.code === code)!.id;
  const designation = (code: string) => org.designations.find((d) => d.code === code)!.id;

  const newHire = (overrides: Record<string, unknown> = {}) => {
    seq += 1;
    return {
      employeeCode: `T-${Date.now().toString(36)}-${seq}`,
      fullName: 'Jesmin Nahar',
      fullNameBn: 'জেসমিন নাহার',
      fatherName: 'Abdul Hai',
      motherName: 'Rabeya Begum',
      dateOfBirth: '2000-05-20',
      gender: 'female',
      religion: 'islam',
      mobilePhone: '01812345678',
      presentAddress: address,
      permanentAddress: address,
      identity: { nid: `${Date.now()}`.slice(-10) },
      joinedOn: '2026-10-01',
      probationEndsOn: '2026-12-31',
      job: {
        legalEntityId: entity('MGT'),
        locationId: location('GZP'),
        orgUnitId: unit('MGT-L1'),
        designationId: designation('SO'),
        employmentType: 'probationer',
        workerCategory: 'worker',
      },
      ...overrides,
    };
  };

  const list = async (query: string) =>
    (await api(app).get(`/tenant/employees?${query}`).set(bearer(hr)).expect(200))
      .body as Page<EmployeeListItem>;

  it('lists the seeded employees with their current job', async () => {
    const page = await list('pageSize=100&search=MG-');
    // Other tests' codes are random and can contain "mg-" too: count the seeded ones.
    expect(page.items.filter((e) => /^MG-\d{4}$/.test(e.employeeCode))).toHaveLength(10);
    const shirin = page.items.find((e) => e.employeeCode === 'MG-0004')!;
    expect(shirin.designation?.name).toBe('Line Supervisor');
    expect(page.items.find((e) => e.employeeCode === 'MG-0010')!.isAdolescent).toBe(true);
  });

  it('finds an employee by NID through the blind index, never by plain text', async () => {
    const page = await list('search=1996000005');
    expect(page.items.map((e) => e.employeeCode)).toEqual(['MG-0005']);
  });

  it('filters by org unit including everything below it', async () => {
    const page = await list(`orgUnitId=${unit('MGT-PROD')}&pageSize=100&search=MG-`);
    // The seeded people of Production and its lines; other tests hire there too.
    const seeded = page.items.map((e) => e.employeeCode).filter((c) => /^MG-\d{4}$/.test(c));
    expect(seeded.toSorted()).toEqual([
      'MG-0003',
      'MG-0004',
      'MG-0005',
      'MG-0006',
      'MG-0007',
      'MG-0010',
    ]);
  });

  it('hires with a portal login, and the employee sees only their own record', async () => {
    const email = `${uniqueSlug('jesmin')}@my-group.test`;
    const res = await api(app)
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(newHire({ portalAccess: { email } }))
      .expect(201);
    const created = res.body.employee as EmployeeDetail;
    expect(res.body.temporaryPassword).toEqual(expect.any(String));
    expect(created.mobilePhone).toBe('+8801812345678');
    expect(created.currentJob).toMatchObject({ event: 'hire', employmentType: 'probationer' });
    expect(created.portalUser).toMatchObject({ email, role: 'employee' });

    const login = await api(app)
      .post('/auth/login')
      .send({ tenant: 'my-group', email, password: res.body.temporaryPassword })
      .expect(200);
    const me = await api(app)
      .get('/tenant/me/employee')
      .set(bearer(login.body.accessToken))
      .expect(200);
    expect(me.body.id).toBe(created.id);
    expect(me.body.identity.nid).toBe(created.identity.nid);
    await api(app).get('/tenant/employees').set(bearer(login.body.accessToken)).expect(403);
  });

  it('gives a role other than employee at hire only to those who manage logins', async () => {
    const email = `${uniqueSlug('hr-officer')}@my-group.test`;
    await api(app)
      .post('/tenant/users')
      .set(bearer(hr))
      .send({ name: 'Hiring officer', email, role: 'hr_officer', password: testEnv().password })
      .expect(201);
    const officer = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;
    const refused = await api(app)
      .post('/tenant/employees')
      .set(bearer(officer))
      .send(newHire({ portalAccess: portalAccess('tenant_admin') }))
      .expect(403);
    expect(refused.body.code).toBe('role_needs_users_manage');
    await api(app)
      .post('/tenant/employees')
      .set(bearer(officer))
      .send(newHire({ portalAccess: portalAccess('employee') }))
      .expect(201);
    const byAdmin = await api(app)
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(newHire({ portalAccess: portalAccess('hr_officer') }))
      .expect(201);
    expect(byAdmin.body.employee.portalUser).toMatchObject({ role: 'hr_officer' });
  });

  it('stores identity numbers encrypted and keeps them out of the audit log', async () => {
    const nid = '1985123456789';
    const res = await api(app)
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(newHire({ identity: { nid, tin: '987654321012' } }))
      .expect(201);
    const id = res.body.employee.id;
    expect(res.body.employee.identity).toMatchObject({ nid, tin: '987654321012' });

    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const [tenant] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, 'my-group'));
      const [row, audit] = await runAsTenant(db, tenant!.id, async (tx) => [
        (await tx.select().from(employees).where(eq(employees.id, id)))[0]!,
        await tx.select().from(tenantAuditLog).where(eq(tenantAuditLog.entityId, id)),
      ]);
      expect(row.nidEnc).toMatch(/^v1:/);
      expect(row.nidEnc).not.toContain(nid);
      expect(row.tinEnc).not.toContain('987654321012');
      expect(row.nidHash).toEqual(expect.any(String));
      expect(audit.map((a) => a.action)).toContain('employee.hire');
      expect(JSON.stringify(audit)).not.toContain(nid);
    } finally {
      await pool.end();
    }
  });

  it('refuses a second employee with the same NID', async () => {
    const res = await api(app)
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(newHire({ identity: { nid: '1996000005' } }))
      .expect(409);
    expect(res.body.message).toBe('Another employee already has this NID');
  });

  it('refuses anyone under 14, and an org unit from another legal entity', async () => {
    await api(app)
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(newHire({ dateOfBirth: '2014-01-01' }))
      .expect(400);
    const res = await api(app)
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(
        newHire({ job: { ...newHire().job, legalEntityId: entity('MGF'), locationId: undefined } }),
      )
      .expect(400);
    expect(res.body.message).toBe('The org unit belongs to another legal entity');
  });

  it('transfers between companies from a future date, keeping continuous service', async () => {
    const page = await list('search=MG-0006');
    const anjali = page.items[0]!;
    const res = await api(app)
      .post(`/tenant/employees/${anjali.id}/job-changes`)
      .set(bearer(hr))
      .send({
        event: 'transfer',
        effectiveFrom: '2027-01-01',
        reason: 'Moved to the foods plant',
        changes: {
          legalEntityId: entity('MGF'),
          locationId: location('NRJ'),
          orgUnitId: unit('MGF-QC'),
          designationId: designation('QI'),
        },
      })
      .expect(201);
    const detail = res.body as EmployeeDetail;
    // Still at Textiles today; the transfer is only in force from 1 January.
    expect(detail.currentJob?.legalEntity.id).toBe(entity('MGT'));
    expect(detail.joinedOn).toBe('2022-08-01');

    const history = (
      await api(app).get(`/tenant/employees/${anjali.id}/job-history`).set(bearer(hr)).expect(200)
    ).body;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      event: 'transfer',
      effectiveFrom: '2027-01-01',
      effectiveTo: null,
    });
    expect(history[0].legalEntity.id).toBe(entity('MGF'));
    expect(history[0].manager).toMatchObject({ employeeCode: 'MG-0004' });
    expect(history[1]).toMatchObject({ event: 'hire', effectiveTo: '2026-12-31' });
  });

  it('refuses a change on the same day as another, or before joining', async () => {
    const shirin = (await list('search=MG-0004')).items[0]!;
    const change = (effectiveFrom: string) =>
      api(app)
        .post(`/tenant/employees/${shirin.id}/job-changes`)
        .set(bearer(hr))
        .send({
          event: 'change',
          effectiveFrom,
          reason: 'Back-dated',
          changes: { gradeId: org.grades[0]!.id },
        })
        .expect(400);
    expect((await change('2022-01-01')).body.message).toBe(
      'A change already takes effect on 2022-01-01; correct that entry instead',
    );
    expect((await change('2018-06-01')).body.message).toBe(
      'The change cannot be before joining on 2019-01-10',
    );
  });

  it('confirms a probationer as permanent', async () => {
    const mitu = (await list('search=MG-0007')).items[0]!;
    const res = await api(app)
      .post(`/tenant/employees/${mitu.id}/job-changes`)
      .set(bearer(hr))
      .send({
        event: 'confirmation',
        effectiveFrom: '2026-12-01',
        reason: 'Probation completed',
        changes: {},
      })
      .expect(201);
    expect(res.body.confirmedOn).toBe('2026-12-01');
    const history = (await api(app).get(`/tenant/employees/${mitu.id}/job-history`).set(bearer(hr)))
      .body;
    expect(history[0]).toMatchObject({ event: 'confirmation', employmentType: 'permanent' });
  });

  it('saves nominees only when shares total 100%', async () => {
    const id = (await list('search=MG-0008')).items[0]!.id;
    await api(app)
      .put(`/tenant/employees/${id}/nominees`)
      .set(bearer(hr))
      .send([{ name: 'Ayesha Siddika', relation: 'Mother', sharePercent: 50 }])
      .expect(400);
    const res = await api(app)
      .put(`/tenant/employees/${id}/nominees`)
      .set(bearer(hr))
      .send([
        { name: 'Ayesha Siddika', relation: 'Mother', sharePercent: 50 },
        { name: 'Nurul Islam', relation: 'Father', sharePercent: 50 },
      ])
      .expect(200);
    expect(res.body).toHaveLength(2);
  });

  it('masks account numbers and stores them encrypted', async () => {
    const id = (await list('search=MG-0009')).items[0]!.id;
    const res = await api(app)
      .put(`/tenant/employees/${id}/payment-accounts`)
      .set(bearer(hr))
      .send([
        {
          method: 'bank',
          provider: 'BRAC Bank',
          routingNumber: '060261726',
          accountNumber: '1501201234567',
          isPrimary: true,
        },
        { method: 'mfs', provider: 'nagad', accountNumber: '01711000009', isPrimary: false },
      ])
      .expect(200);
    expect(res.body.map((a: { accountNumberMasked: string }) => a.accountNumberMasked)).toEqual([
      '•••• 4567',
      '•••• 0009',
    ]);
    const { db, pool } = createDb(testEnv().ownerUrl, { max: 1 });
    try {
      const [tenant] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, 'my-group'));
      const rows = await runAsTenant(db, tenant!.id, (tx) =>
        tx.select().from(employeePaymentAccounts).where(eq(employeePaymentAccounts.employeeId, id)),
      );
      expect(rows.every((r) => r.accountNumberEnc?.startsWith('v1:'))).toBe(true);
      expect(JSON.stringify(rows)).not.toContain('1501201234567');
    } finally {
      await pool.end();
    }

    // Editing an account without retyping its number keeps the stored one.
    const [bank] = res.body;
    const edited = await api(app)
      .put(`/tenant/employees/${id}/payment-accounts`)
      .set(bearer(hr))
      .send([
        {
          id: bank.id,
          method: 'bank',
          provider: 'BRAC Bank',
          branchName: 'Uttara',
          routingNumber: '060261726',
          isPrimary: true,
        },
      ])
      .expect(200);
    expect(edited.body[0]).toMatchObject({
      branchName: 'Uttara',
      accountNumberMasked: '•••• 4567',
    });
  });

  it("hides another workspace's employees", async () => {
    const id = (await list('search=MG-0001')).items[0]!.id;
    const ngo = (await tenantLogin(app, 'sponsored-ngo')).accessToken;
    await api(app).get(`/tenant/employees/${id}`).set(bearer(ngo)).expect(404);
    const page = (await api(app).get('/tenant/employees').set(bearer(ngo)).expect(200)).body;
    // The NGO has its own people, and none of My Group's.
    expect(page.items.map((e: { id: string }) => e.id)).not.toContain(id);
    expect(
      page.items.every((e: { employeeCode: string }) => e.employeeCode.startsWith('SN-')),
    ).toBe(true);
  });

  it("enforces the workspace's employee cap", async () => {
    const superAdmin = await platformToken(app);
    const slug = uniqueSlug('capped');
    const assigned = await api(app)
      .post('/platform/tenants')
      .set(bearer(superAdmin))
      .send({
        name: 'Capped Co',
        slug,
        industryTemplate: 'corporate',
        billingMode: 'complimentary',
        planCode: 'enterprise',
        limits: { max_employees: 1 },
        reason: 'Testing the employee cap',
        admin: { name: 'Capped Admin', email: `admin@${slug}.test` },
      })
      .expect(201);
    const token = (
      await api(app)
        .post('/auth/login')
        .send({
          tenant: slug,
          email: `admin@${slug}.test`,
          password: assigned.body.temporaryPassword,
        })
    ).body.accessToken;
    const le = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(token))
        .send({ name: 'Capped Co Ltd' })
        .expect(201)
    ).body;
    const hire = (nid: string) =>
      newHire({
        identity: { nid },
        job: { legalEntityId: le.id, employmentType: 'permanent', workerCategory: 'staff' },
      });
    await api(app)
      .post('/tenant/employees')
      .set(bearer(token))
      .send(hire('5550000001'))
      .expect(201);
    const res = await api(app)
      .post('/tenant/employees')
      .set(bearer(token))
      .send(hire('5550000002'))
      .expect(403);
    expect(res.body.code).toBe('limit_reached');
  });
});
