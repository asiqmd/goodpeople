import type { Address, Gender, ProjectCostKind, Religion } from '@gp/shared';
import { eq } from 'drizzle-orm';
import type { Tx } from './client.js';
import { CIPHER_FIELDS, type FieldCipher } from './field-cipher.js';
import {
  designations,
  donors,
  employeeAllocations,
  employeePay,
  employees,
  grades,
  jobAssignments,
  legalEntities,
  locations,
  orgUnits,
  payGroups,
  projects,
  salaryStructures,
  tenantUsers,
  timesheetEntries,
  timesheets,
} from './schema/index.js';
import { INDUSTRY_TEMPLATE_DATA } from './templates.js';

/** The field facilitator with a self-service login, who fills in a timesheet. */
export const SEED_NGO_FIELD_EMAIL = 'nasrin@sponsored-ngo.test';
/** The programme coordinator, her manager, who approves it. */
export const SEED_NGO_MANAGER_EMAIL = 'karim@sponsored-ngo.test';
/** The finance officer, who approves payroll and prepares donor reports. */
export const SEED_NGO_FINANCE_EMAIL = 'finance@sponsored-ngo.test';

const addr = (line: string, district: string, division: string, upazila: string): Address => ({
  line,
  district,
  division,
  upazila,
});
const DHAKA = addr('House 12, Road 3', 'Dhaka', 'dhaka', 'Mohammadpur');
const KURIGRAM = addr('College Para', 'Kurigram', 'rangpur', 'Kurigram Sadar');

interface Person {
  code: string;
  name: string;
  nameBn: string;
  father: string;
  mother: string;
  dob: string;
  gender: Gender;
  religion: Religion;
  phone: string;
  joined: string;
  site: 'HO' | 'FLD';
  unit: string;
  designation: string;
  grade: string;
  category: 'staff' | 'worker';
  manager?: string;
  login?: string;
  gross: number;
}

const PEOPLE: Person[] = [
  {
    code: 'SN-0001',
    name: 'Farhana Islam',
    nameBn: 'ফারহানা ইসলাম',
    father: 'Nurul Islam',
    mother: 'Rokeya Begum',
    dob: '1976-04-12',
    gender: 'female',
    religion: 'islam',
    phone: '01711000101',
    joined: '2018-07-01',
    site: 'HO',
    unit: 'PRG',
    designation: 'ED',
    grade: 'M1',
    category: 'staff',
    gross: 180_000,
  },
  {
    code: 'SN-0002',
    name: 'Abdul Karim',
    nameBn: 'আব্দুল করিম',
    father: 'Abdul Jalil',
    mother: 'Hosne Ara',
    dob: '1984-09-03',
    gender: 'male',
    religion: 'islam',
    phone: '01711000102',
    joined: '2020-01-15',
    site: 'HO',
    unit: 'PRG',
    designation: 'PC',
    grade: 'M2',
    category: 'staff',
    manager: 'SN-0001',
    login: SEED_NGO_MANAGER_EMAIL,
    gross: 95_000,
  },
  {
    code: 'SN-0003',
    name: 'Tahmina Rahman',
    nameBn: 'তাহমিনা রহমান',
    father: 'Mizanur Rahman',
    mother: 'Shahana Parvin',
    dob: '1990-02-21',
    gender: 'female',
    religion: 'islam',
    phone: '01711000103',
    joined: '2021-03-01',
    site: 'HO',
    unit: 'ME',
    designation: 'MEO',
    grade: 'E1',
    category: 'staff',
    manager: 'SN-0002',
    gross: 65_000,
  },
  {
    code: 'SN-0004',
    name: 'Nasrin Sultana',
    nameBn: 'নাসরিন সুলতানা',
    father: 'Abul Kashem',
    mother: 'Monowara Begum',
    dob: '1993-11-08',
    gender: 'female',
    religion: 'islam',
    phone: '01711000104',
    joined: '2022-06-01',
    site: 'FLD',
    unit: 'PRG',
    designation: 'FF',
    grade: 'E2',
    category: 'staff',
    manager: 'SN-0002',
    login: SEED_NGO_FIELD_EMAIL,
    gross: 38_000,
  },
  {
    code: 'SN-0005',
    name: 'Rafiqul Islam',
    nameBn: 'রফিকুল ইসলাম',
    father: 'Siddiqur Rahman',
    mother: 'Jahanara Begum',
    dob: '1991-05-17',
    gender: 'male',
    religion: 'islam',
    phone: '01711000105',
    joined: '2022-06-01',
    site: 'FLD',
    unit: 'PRG',
    designation: 'FF',
    grade: 'E2',
    category: 'staff',
    manager: 'SN-0002',
    gross: 38_000,
  },
  {
    code: 'SN-0006',
    name: 'Moushumi Das',
    nameBn: 'মৌসুমী দাস',
    father: 'Haripada Das',
    mother: 'Shefali Das',
    dob: '1987-12-30',
    gender: 'female',
    religion: 'hinduism',
    phone: '01711000106',
    joined: '2019-09-01',
    site: 'HO',
    unit: 'FA',
    designation: 'ACC',
    grade: 'E1',
    category: 'staff',
    manager: 'SN-0001',
    gross: 55_000,
  },
  {
    code: 'SN-0007',
    name: 'Jamal Hossain',
    nameBn: 'জামাল হোসেন',
    father: 'Kamal Hossain',
    mother: 'Rahima Khatun',
    dob: '1982-03-14',
    gender: 'male',
    religion: 'islam',
    phone: '01711000107',
    joined: '2021-01-10',
    site: 'FLD',
    unit: 'FA',
    designation: 'DRV',
    grade: 'E2',
    category: 'worker',
    manager: 'SN-0006',
    gross: 22_000,
  },
];

/** Planned shares of salary: [person, project, percent, cost kind, from]. */
const ALLOCATIONS: [string, string, number, ProjectCostKind, string][] = [
  ['SN-0001', 'WASH-KUR', 10, 'admin', '2026-01-01'],
  ['SN-0001', 'EDU-GIRL', 10, 'admin', '2026-03-01'],
  ['SN-0002', 'WASH-KUR', 50, 'programme', '2026-01-01'],
  ['SN-0002', 'EDU-GIRL', 40, 'programme', '2026-03-01'],
  ['SN-0003', 'WASH-KUR', 50, 'programme', '2026-01-01'],
  ['SN-0003', 'EDU-GIRL', 50, 'programme', '2026-03-01'],
  ['SN-0004', 'WASH-KUR', 100, 'programme', '2026-01-01'],
  ['SN-0005', 'WASH-KUR', 60, 'programme', '2026-01-01'],
  ['SN-0005', 'EDU-GIRL', 40, 'programme', '2026-03-01'],
  ['SN-0006', 'WASH-KUR', 20, 'admin', '2026-01-01'],
  ['SN-0006', 'EDU-GIRL', 15, 'admin', '2026-03-01'],
  ['SN-0007', 'WASH-KUR', 70, 'programme', '2026-01-01'],
];

/** Pay history starts with the year, like My Group's. */
const PAY_FROM = '2026-01-01';

/**
 * Phase 3 M4 for the sponsored NGO: the head office and the Kurigram field office, seven
 * people on the staff structure, two donor-funded projects with their FD-6 approvals, planned
 * salary splits, and one approved timesheet (September) whose hours differ from the plan.
 * Runs after provisioning; does nothing if the NGO already has people.
 */
export async function seedNgo(
  tx: Tx,
  ctx: { tenantId: string; cipher: FieldCipher; passwordHash: string },
) {
  const { tenantId, cipher } = ctx;
  if ((await tx.select({ id: employees.id }).from(employees).limit(1)).length) return;

  const [entity] = await tx.select().from(legalEntities);
  const entityId = entity!.id;
  await tx
    .update(legalEntities)
    .set({
      code: 'SNF',
      legalName: 'Sponsored NGO Foundation',
      registrationNo: 'NGOAB-2451',
      tin: '345678901234',
      address: DHAKA,
    })
    .where(eq(legalEntities.id, entityId));

  const template = INDUSTRY_TEMPLATE_DATA.ngo;
  const site = byCode(
    await tx
      .insert(locations)
      .values(
        template.sites.map((s) => ({
          tenantId,
          legalEntityId: entityId,
          code: s.code,
          name: s.code === 'FLD' ? 'Kurigram Field Office' : 'Head Office, Mohammadpur',
          kind: s.kind,
          address: s.code === 'FLD' ? KURIGRAM : DHAKA,
          weeklyOffDays: s.weeklyOffDays,
        })),
      )
      .returning({ id: locations.id, code: locations.code }),
  );
  const unit = byCode(
    await tx
      .insert(orgUnits)
      .values(
        template.units.map((u) => ({
          tenantId,
          legalEntityId: entityId,
          kind: u.kind,
          code: u.code,
          name: u.name,
          nameBn: u.nameBn,
        })),
      )
      .returning({ id: orgUnits.id, code: orgUnits.code }),
  );
  const designation = byCode(
    await tx
      .insert(designations)
      .values(
        template.designations.map(([code, name, nameBn, workerCategory]) => ({
          tenantId,
          code,
          name,
          nameBn,
          workerCategory,
        })),
      )
      .returning({ id: designations.id, code: designations.code }),
  );
  const grade = byCode(
    await tx
      .insert(grades)
      .values(template.grades.map(([code, name, rank]) => ({ tenantId, code, name, rank })))
      .returning({ id: grades.id, code: grades.code }),
  );

  const [structure] = await tx
    .select()
    .from(salaryStructures)
    .where(eq(salaryStructures.code, 'STAFF'));
  const [group] = await tx.select().from(payGroups).where(eq(payGroups.code, 'MONTHLY'));
  const [admin] = await tx
    .select({ id: tenantUsers.id })
    .from(tenantUsers)
    .where(eq(tenantUsers.role, 'tenant_admin'));

  const employeeId = new Map<string, string>();
  for (const p of PEOPLE) {
    const userId = p.login
      ? (
          await tx
            .insert(tenantUsers)
            .values({
              tenantId,
              email: p.login,
              name: p.name,
              passwordHash: ctx.passwordHash,
              role: 'employee',
            })
            .returning({ id: tenantUsers.id })
        )[0]!.id
      : null;
    const home = p.site === 'FLD' ? KURIGRAM : DHAKA;
    const nid = `19${p.dob.slice(0, 4)}${p.phone.slice(-9)}`;
    const [row] = await tx
      .insert(employees)
      .values({
        tenantId,
        employeeCode: p.code,
        userId,
        fullName: p.name,
        fullNameBn: p.nameBn,
        fatherName: p.father,
        motherName: p.mother,
        dateOfBirth: p.dob,
        gender: p.gender,
        religion: p.religion,
        mobilePhone: `+88${p.phone}`,
        presentAddress: home,
        permanentAddress: home,
        nidEnc: cipher.encrypt(nid, { tenantId, field: CIPHER_FIELDS.nid }),
        nidHash: cipher.blindIndex(nid, { tenantId, field: CIPHER_FIELDS.nid }),
        joinedOn: p.joined,
        confirmedOn: p.joined,
      })
      .returning({ id: employees.id });
    employeeId.set(p.code, row!.id);
    await tx.insert(jobAssignments).values({
      tenantId,
      employeeId: row!.id,
      event: 'hire',
      effectiveFrom: p.joined,
      legalEntityId: entityId,
      locationId: site.get(p.site)!,
      orgUnitId: unit.get(p.unit)!,
      designationId: designation.get(p.designation)!,
      gradeId: grade.get(p.grade)!,
      managerId: p.manager ? employeeId.get(p.manager)! : null,
      employmentType: 'permanent',
      workerCategory: p.category,
      reason: 'Joined',
    });
    await tx.insert(employeePay).values({
      tenantId,
      employeeId: row!.id,
      effectiveFrom: PAY_FROM,
      status: 'approved',
      structureId: structure!.id,
      payGroupId: group!.id,
      amountsEnc: cipher.encrypt(JSON.stringify({ amount: String(p.gross), fixed: {} }), {
        tenantId,
        field: CIPHER_FIELDS.payAmounts,
      }),
      reason: 'Opening pay',
      requestedBy: admin?.id ?? null,
      decidedBy: admin?.id ?? null,
      decidedAt: new Date(`${PAY_FROM}T00:00:00Z`),
    });
  }

  await tx.insert(tenantUsers).values({
    tenantId,
    email: SEED_NGO_FINANCE_EMAIL,
    name: 'Moushumi Das (Finance)',
    passwordHash: ctx.passwordHash,
    role: 'finance_officer',
  });

  // Fictional donors; the FD-6 numbers follow the NGO Affairs Bureau's approvals.
  const donor = byCode(
    await tx
      .insert(donors)
      .values([
        { tenantId, code: 'DWT', name: 'Delta Water Trust', country: 'NL' },
        { tenantId, code: 'NFF', name: 'Northfield Foundation', country: 'GB' },
      ])
      .returning({ id: donors.id, code: donors.code }),
  );
  const project = byCode(
    await tx
      .insert(projects)
      .values([
        {
          tenantId,
          legalEntityId: entityId,
          code: 'WASH-KUR',
          name: 'Safe Water and Sanitation, Kurigram',
          nameBn: 'কুড়িগ্রামে নিরাপদ পানি ও স্যানিটেশন',
          donorId: donor.get('DWT')!,
          grantReference: 'DWT/BD/2026/014',
          fd6ApprovalNo: 'FD-6/2026/0418',
          fd6ApprovedOn: '2025-12-18',
          startsOn: '2026-01-01',
          endsOn: '2027-12-31',
          approvedBudget: '18500000.00',
          staffBudget: '7200000.00',
        },
        {
          tenantId,
          legalEntityId: entityId,
          code: 'EDU-GIRL',
          name: 'Girls Stay in School',
          nameBn: 'মেয়েরা বিদ্যালয়ে থাকুক',
          donorId: donor.get('NFF')!,
          grantReference: 'NFF-2026-BD-07',
          fd6ApprovalNo: 'FD-6/2026/0532',
          fd6ApprovedOn: '2026-02-20',
          startsOn: '2026-03-01',
          endsOn: '2028-02-29',
          approvedBudget: '9600000.00',
          staffBudget: '4100000.00',
        },
      ])
      .returning({ id: projects.id, code: projects.code }),
  );
  await tx.insert(employeeAllocations).values(
    ALLOCATIONS.map(([person, code, percent, costKind, fromOn]) => ({
      tenantId,
      employeeId: employeeId.get(person)!,
      projectId: project.get(code)!,
      percent: percent.toFixed(2),
      costKind,
      fromOn,
      createdBy: admin?.id ?? null,
    })),
  );

  // Tahmina's September: planned 50/50, but the survey round put more of it on water.
  const [sheet] = await tx
    .insert(timesheets)
    .values({
      tenantId,
      employeeId: employeeId.get('SN-0003')!,
      month: '2026-09-01',
      status: 'approved',
      submittedAt: new Date('2026-10-01T10:15:00+06:00'),
      decidedAt: new Date('2026-10-02T09:40:00+06:00'),
      decidedByEmployeeId: employeeId.get('SN-0002')!,
    })
    .returning({ id: timesheets.id });
  const workdays = daysOf('2026-09').filter((d) => ![5, 6].includes(new Date(d).getUTCDay()));
  await tx.insert(timesheetEntries).values(
    workdays.flatMap((date) => [
      {
        tenantId,
        timesheetId: sheet!.id,
        employeeId: employeeId.get('SN-0003')!,
        date,
        projectId: project.get('WASH-KUR')!,
        hours: '5.00',
      },
      {
        tenantId,
        timesheetId: sheet!.id,
        employeeId: employeeId.get('SN-0003')!,
        date,
        projectId: project.get('EDU-GIRL')!,
        hours: '3.00',
      },
    ]),
  );
}

const byCode = <T extends { id: string; code: string | null }>(rows: T[]) =>
  new Map(rows.map((r) => [r.code!, r.id]));

/** Every date of a month (YYYY-MM). */
function daysOf(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
