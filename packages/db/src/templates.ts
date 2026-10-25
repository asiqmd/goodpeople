import type { IndustryTemplate } from '@gp/shared';
import { eq } from 'drizzle-orm';
import type { Tx } from './client.js';
import {
  designations,
  grades,
  legalEntities,
  locations,
  orgUnits,
  shifts,
} from './schema/index.js';

// A new workspace's starting organisation by industry: ordinary records the workspace edits
// like any other. The country pack (leave, holidays, letters, pay) is provisioned separately.

type Unit = {
  code: string;
  name: string;
  nameBn: string;
  kind: 'department' | 'section' | 'line';
  parent?: string;
};
type Designation = [code: string, name: string, nameBn: string, category: 'worker' | 'staff'];
type Site = {
  code: string;
  name: string;
  nameBn: string;
  kind: 'head_office' | 'factory' | 'branch' | 'field_office';
  weeklyOffDays?: number[];
};
type Shift = { code: string; name: string; nameBn: string; start: string; end: string };

interface Template {
  sites: Site[];
  units: Unit[];
  designations: Designation[];
  grades: [code: string, name: string, rank: number][];
  shifts: Shift[];
}

const HEAD_OFFICE: Site = {
  code: 'HO',
  name: 'Head Office',
  nameBn: 'প্রধান কার্যালয়',
  kind: 'head_office',
};
const MANAGEMENT: Designation[] = [
  ['MD', 'Managing Director', 'ব্যবস্থাপনা পরিচালক', 'staff'],
  ['HRM', 'HR Manager', 'মানবসম্পদ ব্যবস্থাপক', 'staff'],
  ['HRO', 'HR Officer', 'মানবসম্পদ কর্মকর্তা', 'staff'],
  ['ACC', 'Accountant', 'হিসাবরক্ষক', 'staff'],
];
const STAFF_GRADES: Template['grades'] = [
  ['M1', 'Management 1', 100],
  ['M2', 'Management 2', 90],
  ['E1', 'Executive 1', 60],
  ['E2', 'Executive 2', 50],
];

export const INDUSTRY_TEMPLATE_DATA: Record<IndustryTemplate, Template> = {
  rmg: {
    sites: [HEAD_OFFICE, { code: 'FAC', name: 'Factory', nameBn: 'কারখানা', kind: 'factory' }],
    units: [
      { code: 'ADM', name: 'Admin & HR', nameBn: 'প্রশাসন ও মানবসম্পদ', kind: 'department' },
      { code: 'FIN', name: 'Finance', nameBn: 'অর্থ ও হিসাব', kind: 'department' },
      { code: 'PROD', name: 'Production', nameBn: 'উৎপাদন', kind: 'department' },
      { code: 'CUT', name: 'Cutting', nameBn: 'কাটিং', kind: 'section', parent: 'PROD' },
      { code: 'SEW', name: 'Sewing', nameBn: 'সেলাই', kind: 'section', parent: 'PROD' },
      { code: 'L1', name: 'Line 1', nameBn: 'লাইন ১', kind: 'line', parent: 'SEW' },
      { code: 'L2', name: 'Line 2', nameBn: 'লাইন ২', kind: 'line', parent: 'SEW' },
      { code: 'FIN-SH', name: 'Finishing', nameBn: 'ফিনিশিং', kind: 'section', parent: 'PROD' },
      { code: 'QC', name: 'Quality', nameBn: 'মান নিয়ন্ত্রণ', kind: 'department' },
    ],
    designations: [
      ...MANAGEMENT,
      ['PM', 'Production Manager', 'উৎপাদন ব্যবস্থাপক', 'staff'],
      ['LC', 'Line Chief', 'লাইন চিফ', 'staff'],
      ['LS', 'Line Supervisor', 'লাইন সুপারভাইজার', 'staff'],
      ['SSO', 'Senior Sewing Operator', 'সিনিয়র সেলাই অপারেটর', 'worker'],
      ['SO', 'Sewing Operator', 'সেলাই অপারেটর', 'worker'],
      ['ASO', 'Assistant Sewing Operator', 'সহকারী সেলাই অপারেটর', 'worker'],
      ['CM', 'Cutting Master', 'কাটিং মাস্টার', 'worker'],
      ['IRN', 'Ironman', 'আয়রনম্যান', 'worker'],
      ['QI', 'Quality Inspector', 'মান পরিদর্শক', 'worker'],
      ['HLP', 'Helper', 'সহকারী', 'worker'],
    ],
    grades: [
      ...STAFF_GRADES,
      ['S1', 'Supervisor 1', 40],
      ['G3', 'Worker grade 3', 30],
      ['G4', 'Worker grade 4', 20],
      ['G5', 'Worker grade 5', 10],
    ],
    shifts: [
      { code: 'DAY', name: 'Day shift', nameBn: 'দিনের শিফট', start: '08:00', end: '17:00' },
      { code: 'NIGHT', name: 'Night shift', nameBn: 'রাতের শিফট', start: '20:00', end: '05:00' },
    ],
  },
  corporate: {
    // Offices usually close on Friday and Saturday.
    sites: [{ ...HEAD_OFFICE, weeklyOffDays: [5, 6] }],
    units: [
      { code: 'HR', name: 'HR & Admin', nameBn: 'মানবসম্পদ ও প্রশাসন', kind: 'department' },
      { code: 'FIN', name: 'Finance', nameBn: 'অর্থ ও হিসাব', kind: 'department' },
      { code: 'SAL', name: 'Sales', nameBn: 'বিক্রয়', kind: 'department' },
      { code: 'OPS', name: 'Operations', nameBn: 'অপারেশনস', kind: 'department' },
      { code: 'TECH', name: 'Technology', nameBn: 'প্রযুক্তি', kind: 'department' },
    ],
    designations: [
      ...MANAGEMENT,
      ['GM', 'General Manager', 'মহাব্যবস্থাপক', 'staff'],
      ['MGR', 'Manager', 'ব্যবস্থাপক', 'staff'],
      ['SEX', 'Senior Executive', 'সিনিয়র নির্বাহী', 'staff'],
      ['EXE', 'Executive', 'নির্বাহী', 'staff'],
      ['OFF', 'Officer', 'কর্মকর্তা', 'staff'],
      ['ENG', 'Engineer', 'প্রকৌশলী', 'staff'],
      ['OA', 'Office Assistant', 'অফিস সহকারী', 'worker'],
    ],
    grades: STAFF_GRADES,
    shifts: [
      { code: 'OFFICE', name: 'Office hours', nameBn: 'অফিস সময়', start: '09:00', end: '18:00' },
    ],
  },
  ngo: {
    sites: [
      { ...HEAD_OFFICE, weeklyOffDays: [5, 6] },
      {
        code: 'FLD',
        name: 'Field Office',
        nameBn: 'মাঠ কার্যালয়',
        kind: 'field_office',
        weeklyOffDays: [5, 6],
      },
    ],
    units: [
      { code: 'PRG', name: 'Programmes', nameBn: 'কর্মসূচি', kind: 'department' },
      { code: 'FA', name: 'Finance & Admin', nameBn: 'অর্থ ও প্রশাসন', kind: 'department' },
      {
        code: 'ME',
        name: 'Monitoring & Evaluation',
        nameBn: 'পরিবীক্ষণ ও মূল্যায়ন',
        kind: 'department',
      },
      { code: 'HR', name: 'Human Resources', nameBn: 'মানবসম্পদ', kind: 'department' },
    ],
    designations: [
      ...MANAGEMENT,
      ['ED', 'Executive Director', 'নির্বাহী পরিচালক', 'staff'],
      ['PC', 'Programme Coordinator', 'কর্মসূচি সমন্বয়কারী', 'staff'],
      ['PO', 'Programme Officer', 'কর্মসূচি কর্মকর্তা', 'staff'],
      ['MEO', 'M&E Officer', 'পরিবীক্ষণ ও মূল্যায়ন কর্মকর্তা', 'staff'],
      ['FF', 'Field Facilitator', 'মাঠ সহায়ক', 'staff'],
      ['DRV', 'Driver', 'গাড়িচালক', 'worker'],
    ],
    grades: STAFF_GRADES,
    shifts: [
      { code: 'OFFICE', name: 'Office hours', nameBn: 'অফিস সময়', start: '09:00', end: '17:00' },
    ],
  },
  group: {
    sites: [
      {
        code: 'CO',
        name: 'Corporate Office',
        nameBn: 'কর্পোরেট অফিস',
        kind: 'head_office',
        weeklyOffDays: [5, 6],
      },
    ],
    units: [
      { code: 'GHR', name: 'Group HR', nameBn: 'গ্রুপ মানবসম্পদ', kind: 'department' },
      { code: 'GFIN', name: 'Group Finance', nameBn: 'গ্রুপ অর্থ', kind: 'department' },
      { code: 'SSC', name: 'Shared Services', nameBn: 'শেয়ার্ড সার্ভিস', kind: 'department' },
    ],
    designations: [
      ...MANAGEMENT,
      ['CEO', 'Group CEO', 'গ্রুপ প্রধান নির্বাহী', 'staff'],
      ['GM', 'General Manager', 'মহাব্যবস্থাপক', 'staff'],
      ['MGR', 'Manager', 'ব্যবস্থাপক', 'staff'],
      ['EXE', 'Executive', 'নির্বাহী', 'staff'],
      ['OA', 'Office Assistant', 'অফিস সহকারী', 'worker'],
    ],
    grades: STAFF_GRADES,
    shifts: [
      { code: 'OFFICE', name: 'Office hours', nameBn: 'অফিস সময়', start: '09:00', end: '18:00' },
    ],
  },
  other: {
    sites: [HEAD_OFFICE],
    units: [
      { code: 'HR', name: 'HR & Admin', nameBn: 'মানবসম্পদ ও প্রশাসন', kind: 'department' },
      { code: 'FIN', name: 'Finance', nameBn: 'অর্থ ও হিসাব', kind: 'department' },
    ],
    designations: [
      ...MANAGEMENT,
      ['MGR', 'Manager', 'ব্যবস্থাপক', 'staff'],
      ['OFF', 'Officer', 'কর্মকর্তা', 'staff'],
      ['OA', 'Office Assistant', 'অফিস সহকারী', 'worker'],
    ],
    grades: STAFF_GRADES,
    shifts: [],
  },
};

/**
 * The company, its sites, units, designations, grades and the template's shifts. Call once for
 * a new workspace, inside a transaction scoped to it; returns the company's legal entity.
 */
export async function provisionIndustryTemplate(
  tx: Tx,
  tenantId: string,
  options: { template: IndustryTemplate; company: string },
): Promise<string> {
  const t = INDUSTRY_TEMPLATE_DATA[options.template];
  const [entity] = await tx
    .insert(legalEntities)
    .values({ tenantId, name: options.company, legalName: options.company, code: 'CO1' })
    .returning({ id: legalEntities.id });
  const legalEntityId = entity!.id;
  await tx.insert(locations).values(
    t.sites.map((s) => ({
      tenantId,
      legalEntityId,
      code: s.code,
      name: s.name,
      kind: s.kind,
      ...(s.weeklyOffDays ? { weeklyOffDays: s.weeklyOffDays } : {}),
    })),
  );
  const ids = new Map<string, string>();
  for (const u of t.units) {
    const [row] = await tx
      .insert(orgUnits)
      .values({
        tenantId,
        legalEntityId,
        kind: u.kind,
        code: u.code,
        name: u.name,
        nameBn: u.nameBn,
        parentId: u.parent ? ids.get(u.parent) : null,
      })
      .returning({ id: orgUnits.id });
    ids.set(u.code, row!.id);
  }
  await tx.insert(designations).values(
    t.designations.map(([code, name, nameBn, workerCategory]) => ({
      tenantId,
      code,
      name,
      nameBn,
      workerCategory,
    })),
  );
  await tx
    .insert(grades)
    .values(t.grades.map(([code, name, rank]) => ({ tenantId, code, name, rank })));
  if (t.shifts.length) {
    await tx
      .insert(shifts)
      .values(
        t.shifts.map((s) => ({
          tenantId,
          code: s.code,
          name: s.name,
          nameBn: s.nameBn,
          startTime: s.start,
          endTime: s.end,
          breakMinutes: 60,
        })),
      )
      .onConflictDoNothing();
    // The template's first shift is the one people start on, instead of the general shift.
    await tx.update(shifts).set({ isDefault: false }).where(eq(shifts.isDefault, true));
    await tx.update(shifts).set({ isDefault: true }).where(eq(shifts.code, t.shifts[0]!.code));
  }
  return legalEntityId;
}
