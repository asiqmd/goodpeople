import { SEED_FINANCE_EMAIL } from '@gp/db';
import type {
  EmployeeDetail,
  OrgSnapshot,
  PayGroupView,
  PayRecordView,
  PayrollRunItemPage,
  PayrollRunItemView,
  PayrollRunView,
  SalaryStructureView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import type { Test } from 'supertest';
import { loginAs } from './leave-helpers.js';
import { api, bearer, tenantLogin, testEnv } from './test-env.js';

// Hiring people with approved pay, and running, locking and reading payroll runs in the seeded
// my-group workspace, for the payroll end-to-end tests. Each test makes its own pay group.

const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;

export const isPdf = (body: Buffer) => body.subarray(0, 4).toString() === '%PDF';
export const binary = (req: Test) =>
  req.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });
export const line = (item: PayrollRunItemView, code: string) =>
  item.lines.find((l) => l.code === code)?.amount;

export interface HireOptions {
  gross?: string;
  staff?: boolean;
  joinedOn?: string;
  religion?: string;
  login?: boolean;
  employmentType?: 'permanent' | 'probation' | 'temporary' | 'contract';
}

export async function payrollKit(app: INestApplication) {
  const admin = (await tenantLogin(app, 'my-group')).accessToken;
  const finance = await loginAs(app, SEED_FINANCE_EMAIL);
  const org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200))
    .body as OrgSnapshot;
  const structures = (
    await api(app).get('/tenant/payroll/structures').set(bearer(admin)).expect(200)
  ).body as SalaryStructureView[];
  let seq = 0;
  const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase();
  const structure = (code: string) => structures.find((s) => s.code === code)!;

  const approve = (stepId: string) =>
    api(app).post(`/tenant/approvals/${stepId}/approve`).set(bearer(finance)).send({}).expect(201);

  async function group() {
    return (
      await api(app)
        .post('/tenant/payroll/pay-groups')
        .set(bearer(admin))
        .send({ code: `K${unique()}`.slice(0, 30), name: `Kit ${seq}`, frequency: 'monthly' })
        .expect(201)
    ).body as PayGroupView;
  }

  async function hire(payGroup: PayGroupView, options: HireOptions = {}) {
    const {
      gross = '12500',
      staff = false,
      joinedOn = '2024-01-01',
      religion = 'islam',
      login = false,
      employmentType = 'permanent',
    } = options;
    const code = `P-${unique()}`;
    const email = `${code.toLowerCase()}@example.test`;
    const employee = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode: code,
          fullName: `Kit Test ${code}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1990-05-01',
          gender: 'female',
          religion,
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${seq++}`.slice(-10) },
          joinedOn,
          job: {
            legalEntityId: ref(org.legalEntities, 'MGT'),
            locationId: ref(org.locations, 'GZP'),
            orgUnitId: ref(org.orgUnits, 'MGT-L1'),
            designationId: ref(org.designations, 'SO'),
            gradeId: ref(org.grades, 'W5'),
            employmentType,
            workerCategory: staff ? 'staff' : 'worker',
          },
          ...(login
            ? { portalAccess: { email, role: 'employee', password: testEnv().password } }
            : {}),
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    const proposed = (
      await api(app)
        .post(`/tenant/employees/${employee.id}/pay`)
        .set(bearer(admin))
        .send({
          effectiveFrom: joinedOn,
          structureId: structure(staff ? 'STAFF' : 'RMG_WORKER').id,
          payGroupId: payGroup.id,
          amount: gross,
          ...(staff ? {} : { wageGrade: 'G5' }),
          reason: 'Test pay',
        })
        .expect(201)
    ).body as PayRecordView;
    if (proposed.steps[0]) await approve(proposed.steps[0].id);
    const token = login
      ? ((
          await api(app)
            .post('/auth/login')
            .send({ tenant: 'my-group', email, password: testEnv().password })
            .expect(200)
        ).body.accessToken as string)
      : null;
    return { employee, token };
  }

  const run = async (payGroup: PayGroupView, month: string) =>
    (
      await api(app)
        .post('/tenant/payroll/runs')
        .set(bearer(admin))
        .send({ payGroupId: payGroup.id, month })
        .expect(201)
    ).body as PayrollRunView;
  const compute = async (id: string) =>
    (await api(app).post(`/tenant/payroll/runs/${id}/compute`).set(bearer(admin)).expect(200))
      .body as PayrollRunView;
  const items = async (id: string) =>
    (
      (
        await api(app)
          .get(`/tenant/payroll/runs/${id}/items?size=500`)
          .set(bearer(admin))
          .expect(200)
      ).body as PayrollRunItemPage
    ).items;
  const itemOf = async (runId: string, employeeId: string) =>
    (await items(runId)).find((i) => i.employee.id === employeeId)!;
  async function lock(id: string) {
    const submitted = (
      await api(app).post(`/tenant/payroll/runs/${id}/submit`).set(bearer(admin)).expect(200)
    ).body as PayrollRunView;
    if (submitted.steps[0]) await approve(submitted.steps[0].id);
  }

  return {
    admin,
    finance,
    org,
    structure,
    unique,
    approve,
    group,
    hire,
    run,
    compute,
    items,
    itemOf,
    lock,
  };
}
