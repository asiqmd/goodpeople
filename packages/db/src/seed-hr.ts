import type {
  Address,
  EmploymentType,
  Gender,
  JobEvent,
  Religion,
  WorkerCategory,
} from '@gp/shared';
import { eq } from 'drizzle-orm';
import type { Tx } from './client.js';
import { CIPHER_FIELDS, type FieldCipher } from './field-cipher.js';
import {
  costCentres,
  designations,
  employeeNominees,
  employeePaymentAccounts,
  employees,
  grades,
  jobAssignments,
  legalEntities,
  locations,
  orgUnits,
  tenantUsers,
} from './schema/index.js';

/** The seeded worker with a self-service login (employee role). */
export const SEED_EMPLOYEE_EMAIL = 'rahima@my-group.test';

const addr = (line: string, district: string, division: string, upazila?: string): Address => ({
  line,
  district,
  division,
  ...(upazila ? { upazila } : {}),
});

interface SeedJob {
  event: JobEvent;
  from: string;
  entity: 'textiles' | 'foods';
  location: 'ho' | 'gazipur' | 'narayanganj';
  unit: string;
  designation: string;
  grade: string;
  costCentre: string;
  type: EmploymentType;
  category: WorkerCategory;
  manager?: string;
  reason?: string;
}

interface SeedEmployee {
  code: string;
  name: string;
  nameBn: string;
  father: string;
  mother: string;
  dob: string;
  gender: Gender;
  religion: Religion;
  phone: string;
  nid: string;
  joined: string;
  probationEndsOn?: string;
  home: Address;
  /** Oldest first; the last entry is current. */
  jobs: SeedJob[];
  portal?: boolean;
  nominees?: { name: string; relation: string; share: number }[];
  payment?: {
    method: 'bank' | 'mfs';
    provider: string;
    number: string;
    routing?: string;
    branch?: string;
  };
}

const HO = addr('Plot 7, Gulshan Avenue', 'Dhaka', 'dhaka', 'Gulshan');
const GAZIPUR = addr('Konabari Industrial Area', 'Gazipur', 'dhaka', 'Gazipur Sadar');

const job = (
  j: Omit<SeedJob, 'event' | 'from'> & Partial<Pick<SeedJob, 'event' | 'from'>>,
  from: string,
): SeedJob => ({
  event: 'hire',
  ...j,
  from: j.from ?? from,
});

const EMPLOYEES: SeedEmployee[] = [
  {
    code: 'MG-0001',
    name: 'Farhan Rahman',
    nameBn: 'ফারহান রহমান',
    father: 'Abdur Rahman',
    mother: 'Nasrin Rahman',
    dob: '1984-06-12',
    gender: 'male',
    religion: 'islam',
    phone: '01711000001',
    nid: '1984000001',
    joined: '2018-02-01',
    home: addr('House 21, Road 4, Dhanmondi', 'Dhaka', 'dhaka', 'Dhanmondi'),
    jobs: [
      job(
        {
          entity: 'textiles',
          location: 'ho',
          unit: 'MGT-HR',
          designation: 'HRM',
          grade: 'M2',
          costCentre: 'ADMIN',
          type: 'permanent',
          category: 'staff',
        },
        '2018-02-01',
      ),
    ],
    payment: {
      method: 'bank',
      provider: 'Dutch-Bangla Bank',
      number: '1011100012345',
      routing: '090261725',
      branch: 'Gulshan',
    },
  },
  {
    code: 'MG-0002',
    name: 'Nusrat Jahan',
    nameBn: 'নুসরাত জাহান',
    father: 'Jahangir Alam',
    mother: 'Rokeya Begum',
    dob: '1994-09-03',
    gender: 'female',
    religion: 'islam',
    phone: '01711000002',
    nid: '1994000002',
    joined: '2021-07-15',
    home: addr('Flat 5B, Mirpur 10', 'Dhaka', 'dhaka', 'Mirpur'),
    jobs: [
      job(
        {
          entity: 'textiles',
          location: 'ho',
          unit: 'MGT-HR',
          designation: 'HRE',
          grade: 'E1',
          costCentre: 'ADMIN',
          type: 'permanent',
          category: 'staff',
          manager: 'MG-0001',
        },
        '2021-07-15',
      ),
    ],
  },
  {
    code: 'MG-0003',
    name: 'Kamal Hossain',
    nameBn: 'কামাল হোসেন',
    father: 'Delwar Hossain',
    mother: 'Hasina Khatun',
    dob: '1979-01-20',
    gender: 'male',
    religion: 'islam',
    phone: '01711000003',
    nid: '1979000003',
    joined: '2016-05-10',
    home: GAZIPUR,
    jobs: [
      job(
        {
          entity: 'textiles',
          location: 'gazipur',
          unit: 'MGT-PROD',
          designation: 'PM',
          grade: 'M2',
          costCentre: 'PROD',
          type: 'permanent',
          category: 'staff',
        },
        '2016-05-10',
      ),
    ],
  },
  {
    code: 'MG-0004',
    name: 'Shirin Akter',
    nameBn: 'শিরিন আক্তার',
    father: 'Mokbul Hossain',
    mother: 'Jahanara Begum',
    dob: '1990-11-25',
    gender: 'female',
    religion: 'islam',
    phone: '01711000004',
    nid: '1990000004',
    joined: '2019-01-10',
    home: GAZIPUR,
    jobs: [
      job(
        {
          entity: 'textiles',
          location: 'gazipur',
          unit: 'MGT-L1',
          designation: 'SO',
          grade: 'W4',
          costCentre: 'PROD',
          type: 'permanent',
          category: 'worker',
          manager: 'MG-0003',
        },
        '2019-01-10',
      ),
      job(
        {
          event: 'promotion',
          entity: 'textiles',
          location: 'gazipur',
          unit: 'MGT-L1',
          designation: 'LS',
          grade: 'S1',
          costCentre: 'PROD',
          type: 'permanent',
          category: 'staff',
          manager: 'MG-0003',
          reason: 'Promoted to line supervisor',
        },
        '2022-01-01',
      ),
    ],
  },
  {
    code: 'MG-0005',
    name: 'Rahima Khatun',
    nameBn: 'রহিমা খাতুন',
    father: 'Abul Kashem',
    mother: 'Monowara Begum',
    dob: '1996-04-08',
    gender: 'female',
    religion: 'islam',
    phone: '01711000005',
    nid: '1996000005',
    joined: '2020-03-01',
    home: GAZIPUR,
    jobs: [
      job(
        {
          entity: 'textiles',
          location: 'gazipur',
          unit: 'MGT-L1',
          designation: 'SSO',
          grade: 'W3',
          costCentre: 'PROD',
          type: 'permanent',
          category: 'worker',
          manager: 'MG-0004',
        },
        '2020-03-01',
      ),
    ],
    portal: true,
    nominees: [{ name: 'Jamal Uddin', relation: 'Husband', share: 100 }],
    payment: { method: 'mfs', provider: 'bkash', number: '01711000005' },
  },
  {
    code: 'MG-0006',
    name: 'Anjali Das',
    nameBn: 'অঞ্জলি দাস',
    father: 'Haripada Das',
    mother: 'Shefali Das',
    dob: '1999-12-14',
    gender: 'female',
    religion: 'hinduism',
    phone: '01711000006',
    nid: '1999000006',
    joined: '2022-08-01',
    home: GAZIPUR,
    jobs: [
      job(
        {
          entity: 'textiles',
          location: 'gazipur',
          unit: 'MGT-L1',
          designation: 'SO',
          grade: 'W4',
          costCentre: 'PROD',
          type: 'permanent',
          category: 'worker',
          manager: 'MG-0004',
        },
        '2022-08-01',
      ),
    ],
  },
  {
    code: 'MG-0007',
    name: 'Mitu Begum',
    nameBn: 'মিতু বেগম',
    father: 'Sirajul Islam',
    mother: 'Fatema Begum',
    dob: '2001-02-17',
    gender: 'female',
    religion: 'islam',
    phone: '01711000007',
    nid: '2001000007',
    joined: '2026-09-01',
    probationEndsOn: '2026-11-30',
    home: GAZIPUR,
    jobs: [
      job(
        {
          entity: 'textiles',
          location: 'gazipur',
          unit: 'MGT-L2',
          designation: 'SO',
          grade: 'W4',
          costCentre: 'PROD',
          type: 'probationer',
          category: 'worker',
          manager: 'MG-0004',
        },
        '2026-09-01',
      ),
    ],
  },
  {
    code: 'MG-0008',
    name: 'Rafiq Islam',
    nameBn: 'রফিক ইসলাম',
    father: 'Nurul Islam',
    mother: 'Ayesha Siddika',
    dob: '1992-07-30',
    gender: 'male',
    religion: 'islam',
    phone: '01711000008',
    nid: '1992000008',
    joined: '2021-04-12',
    home: addr('Fatullah', 'Narayanganj', 'dhaka', 'Narayanganj Sadar'),
    jobs: [
      job(
        {
          entity: 'foods',
          location: 'narayanganj',
          unit: 'MGF-QC',
          designation: 'QI',
          grade: 'W3',
          costCentre: 'PROD',
          type: 'permanent',
          category: 'worker',
        },
        '2021-04-12',
      ),
    ],
  },
  {
    code: 'MG-0009',
    name: 'Tanvir Ahmed',
    nameBn: 'তানভীর আহমেদ',
    father: 'Mushfiqur Ahmed',
    mother: 'Shahnaz Parvin',
    dob: '1995-05-05',
    gender: 'male',
    religion: 'islam',
    phone: '01711000009',
    nid: '1995000009',
    joined: '2023-01-02',
    home: addr('Uttara Sector 7', 'Dhaka', 'dhaka', 'Uttara'),
    jobs: [
      job(
        {
          entity: 'textiles',
          location: 'ho',
          unit: 'MGT-FIN',
          designation: 'ACC',
          grade: 'E1',
          costCentre: 'FIN',
          type: 'permanent',
          category: 'staff',
          manager: 'MG-0001',
        },
        '2023-01-02',
      ),
    ],
  },
  {
    code: 'MG-0010',
    name: 'Sumon Barua',
    nameBn: 'সুমন বড়ুয়া',
    father: 'Ratan Barua',
    mother: 'Mala Barua',
    dob: '2009-03-10',
    gender: 'male',
    religion: 'buddhism',
    phone: '01711000010',
    nid: '20090310000000010',
    joined: '2026-06-01',
    home: addr('Raozan', 'Chattogram', 'chattogram', 'Raozan'),
    jobs: [
      job(
        {
          entity: 'textiles',
          location: 'gazipur',
          unit: 'MGT-L2',
          designation: 'SO',
          grade: 'W5',
          costCentre: 'PROD',
          type: 'temporary',
          category: 'worker',
          manager: 'MG-0004',
        },
        '2026-06-01',
      ),
    ],
  },
];

/** An org and ten employees for the internal "My Group" tenant: two companies, a factory, lines. */
export async function seedGroupHr(
  tx: Tx,
  ctx: {
    tenantId: string;
    textilesId: string;
    foodsId: string;
    cipher: FieldCipher;
    passwordHash: string;
  },
) {
  const { tenantId, cipher } = ctx;
  const entityId = { textiles: ctx.textilesId, foods: ctx.foodsId };

  await tx
    .update(legalEntities)
    .set({
      code: 'MGT',
      legalName: 'My Group Textiles Limited',
      registrationNo: 'C-123456',
      tin: '123456789012',
      bin: '000123456789',
      address: HO,
    })
    .where(eq(legalEntities.id, ctx.textilesId));
  await tx
    .update(legalEntities)
    .set({
      code: 'MGF',
      legalName: 'My Group Foods Limited',
      registrationNo: 'C-654321',
      address: HO,
    })
    .where(eq(legalEntities.id, ctx.foodsId));

  const loc = await tx
    .insert(locations)
    .values([
      {
        tenantId,
        legalEntityId: ctx.textilesId,
        code: 'HO',
        name: 'Head Office, Gulshan',
        kind: 'head_office',
        address: HO,
      },
      {
        tenantId,
        legalEntityId: ctx.textilesId,
        code: 'GZP',
        name: 'Gazipur Factory',
        kind: 'factory',
        address: GAZIPUR,
        latitude: 24.0023,
        longitude: 90.3474,
        geofenceRadiusM: 300,
      },
      {
        tenantId,
        legalEntityId: ctx.foodsId,
        code: 'NRJ',
        name: 'Narayanganj Plant',
        kind: 'factory',
        address: addr('Fatullah BSCIC', 'Narayanganj', 'dhaka', 'Narayanganj Sadar'),
      },
    ])
    .returning({ id: locations.id, code: locations.code });
  const locationId = {
    ho: loc.find((l) => l.code === 'HO')!.id,
    gazipur: loc.find((l) => l.code === 'GZP')!.id,
    narayanganj: loc.find((l) => l.code === 'NRJ')!.id,
  };

  const units = new Map<string, string>();
  const unit = async (
    entity: keyof typeof entityId,
    kind: 'department' | 'section' | 'line',
    code: string,
    name: string,
    nameBn: string,
    parent?: string,
  ) => {
    const [row] = await tx
      .insert(orgUnits)
      .values({
        tenantId,
        legalEntityId: entityId[entity],
        kind,
        code,
        name,
        nameBn,
        parentId: parent ? units.get(parent) : null,
      })
      .returning({ id: orgUnits.id });
    units.set(code, row!.id);
  };
  await unit('textiles', 'department', 'MGT-HR', 'HR & Admin', 'মানবসম্পদ ও প্রশাসন');
  await unit('textiles', 'department', 'MGT-PROD', 'Production', 'উৎপাদন');
  await unit('textiles', 'section', 'MGT-SEW', 'Sewing', 'সেলাই', 'MGT-PROD');
  await unit('textiles', 'line', 'MGT-L1', 'Line 1', 'লাইন ১', 'MGT-SEW');
  await unit('textiles', 'line', 'MGT-L2', 'Line 2', 'লাইন ২', 'MGT-SEW');
  await unit('textiles', 'department', 'MGT-FIN', 'Finance', 'অর্থ ও হিসাব');
  await unit('foods', 'department', 'MGF-PROD', 'Production', 'উৎপাদন');
  await unit('foods', 'department', 'MGF-QC', 'Quality Control', 'মান নিয়ন্ত্রণ');

  const designation = byCode(
    await tx
      .insert(designations)
      .values(
        (
          [
            ['MD', 'Managing Director', 'ব্যবস্থাপনা পরিচালক', 'staff'],
            ['HRM', 'HR Manager', 'মানবসম্পদ ব্যবস্থাপক', 'staff'],
            ['HRE', 'HR Executive', 'মানবসম্পদ নির্বাহী', 'staff'],
            ['PM', 'Production Manager', 'উৎপাদন ব্যবস্থাপক', 'staff'],
            ['LS', 'Line Supervisor', 'লাইন সুপারভাইজার', 'staff'],
            ['SSO', 'Senior Sewing Operator', 'সিনিয়র সেলাই অপারেটর', 'worker'],
            ['SO', 'Sewing Operator', 'সেলাই অপারেটর', 'worker'],
            ['QI', 'Quality Inspector', 'মান পরিদর্শক', 'worker'],
            ['ACC', 'Accountant', 'হিসাবরক্ষক', 'staff'],
          ] as const
        ).map(([code, name, nameBn, workerCategory]) => ({
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
      .values(
        (
          [
            ['M1', 'Management 1', 100],
            ['M2', 'Management 2', 90],
            ['E1', 'Executive 1', 60],
            ['S1', 'Supervisor 1', 40],
            ['W3', 'Worker grade 3', 30],
            ['W4', 'Worker grade 4', 20],
            ['W5', 'Worker grade 5', 10],
          ] as const
        ).map(([code, name, rank]) => ({ tenantId, code, name, rank })),
      )
      .returning({ id: grades.id, code: grades.code }),
  );
  const costCentre = byCode(
    await tx
      .insert(costCentres)
      .values([
        { tenantId, code: 'ADMIN', name: 'Administration' },
        { tenantId, code: 'PROD', name: 'Production' },
        { tenantId, code: 'FIN', name: 'Finance' },
      ])
      .returning({ id: costCentres.id, code: costCentres.code }),
  );

  const employeeId = new Map<string, string>();
  for (const e of EMPLOYEES) {
    const userId = e.portal
      ? (
          await tx
            .insert(tenantUsers)
            .values({
              tenantId,
              email: SEED_EMPLOYEE_EMAIL,
              name: e.name,
              passwordHash: ctx.passwordHash,
              role: 'employee',
            })
            .returning({ id: tenantUsers.id })
        )[0]!.id
      : null;
    const [row] = await tx
      .insert(employees)
      .values({
        tenantId,
        employeeCode: e.code,
        userId,
        fullName: e.name,
        fullNameBn: e.nameBn,
        fatherName: e.father,
        motherName: e.mother,
        dateOfBirth: e.dob,
        gender: e.gender,
        religion: e.religion,
        mobilePhone: `+88${e.phone}`,
        presentAddress: e.home,
        permanentAddress: e.home,
        nidEnc: cipher.encrypt(e.nid, { tenantId, field: CIPHER_FIELDS.nid }),
        nidHash: cipher.blindIndex(e.nid, { tenantId, field: CIPHER_FIELDS.nid }),
        joinedOn: e.joined,
        probationEndsOn: e.probationEndsOn ?? null,
        confirmedOn: e.jobs.at(-1)!.type === 'permanent' && !e.probationEndsOn ? e.joined : null,
      })
      .returning({ id: employees.id });
    employeeId.set(e.code, row!.id);

    for (const [i, j] of e.jobs.entries()) {
      const next = e.jobs[i + 1];
      await tx.insert(jobAssignments).values({
        tenantId,
        employeeId: row!.id,
        event: j.event,
        effectiveFrom: j.from,
        effectiveTo: next ? dayBefore(next.from) : null,
        legalEntityId: entityId[j.entity],
        locationId: locationId[j.location],
        orgUnitId: units.get(j.unit)!,
        designationId: designation.get(j.designation)!,
        gradeId: grade.get(j.grade)!,
        costCentreId: costCentre.get(j.costCentre)!,
        managerId: j.manager ? employeeId.get(j.manager)! : null,
        employmentType: j.type,
        workerCategory: j.category,
        reason: j.reason ?? (j.event === 'hire' ? 'Joined' : null),
      });
    }

    if (e.nominees) {
      await tx.insert(employeeNominees).values(
        e.nominees.map((n) => ({
          tenantId,
          employeeId: row!.id,
          name: n.name,
          relation: n.relation,
          sharePercent: n.share,
        })),
      );
    }
    if (e.payment) {
      const p = e.payment;
      await tx.insert(employeePaymentAccounts).values({
        tenantId,
        employeeId: row!.id,
        method: p.method,
        provider: p.provider,
        branchName: p.branch ?? null,
        routingNumber: p.routing ?? null,
        accountName: e.name,
        accountNumberEnc: cipher.encrypt(p.number, {
          tenantId,
          field: CIPHER_FIELDS.accountNumber,
        }),
        accountNumberLast4: p.number.slice(-4),
        isPrimary: true,
      });
    }
  }
}

const byCode = <T extends { id: string; code: string }>(rows: T[]) =>
  new Map(rows.map((r) => [r.code, r.id]));

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
