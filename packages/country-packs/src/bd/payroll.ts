import type { IsoDate, ReviewStatus } from '../engine.js';

// Bangladesh payroll defaults: the components a workspace starts with, two salary structures,
// and the minimum wage tables salaries are checked against. Workspaces change components and
// structures freely; wage tables change only with the gazette.

export interface PackPayComponent {
  code: string;
  name: string;
  nameBn: string;
  kind: 'earning' | 'deduction' | 'employer_cost' | 'info';
  calculation: 'structure' | 'fixed' | 'run';
  taxTreatment: 'taxable' | 'exempt' | 'partly_exempt';
  inGross: boolean;
  inOvertimeBase: boolean;
  prorate: boolean;
  sortOrder: number;
}

const earning = (
  code: string,
  name: string,
  nameBn: string,
  sortOrder: number,
  extra: Partial<PackPayComponent> = {},
): PackPayComponent => ({
  code,
  name,
  nameBn,
  kind: 'earning',
  calculation: 'structure',
  taxTreatment: 'taxable',
  inGross: true,
  inOvertimeBase: false,
  prorate: true,
  sortOrder,
  ...extra,
});

const runItem = (
  code: string,
  name: string,
  nameBn: string,
  kind: PackPayComponent['kind'],
  sortOrder: number,
  extra: Partial<PackPayComponent> = {},
): PackPayComponent => ({
  code,
  name,
  nameBn,
  kind,
  calculation: 'run',
  taxTreatment: kind === 'earning' ? 'taxable' : 'exempt',
  inGross: false,
  inOvertimeBase: false,
  prorate: false,
  sortOrder,
  ...extra,
});

/**
 * Overtime is paid on basic and dearness allowance (Labour Act s.108), so only BASIC is in
 * the overtime base by default; a workspace that pays dearness allowance adds it.
 */
export const BD_PAY_COMPONENTS: readonly PackPayComponent[] = [
  earning('BASIC', 'Basic salary', 'মূল বেতন', 10, { inOvertimeBase: true }),
  earning('HOUSE_RENT', 'House rent', 'বাড়ি ভাড়া', 20),
  earning('MEDICAL', 'Medical allowance', 'চিকিৎসা ভাতা', 30),
  earning('CONVEYANCE', 'Conveyance', 'যাতায়াত ভাতা', 40),
  earning('FOOD', 'Food allowance', 'খাদ্য ভাতা', 50),
  earning('SPECIAL', 'Special allowance', 'বিশেষ ভাতা', 60, { calculation: 'fixed' }),
  runItem('OVERTIME', 'Overtime', 'অতিরিক্ত কাজের ভাতা', 'earning', 100),
  runItem('ATTENDANCE_BONUS', 'Attendance bonus', 'হাজিরা বোনাস', 'earning', 110),
  runItem('FESTIVAL_BONUS', 'Festival bonus', 'উৎসব বোনাস', 'earning', 120),
  runItem('ARREARS', 'Arrears', 'বকেয়া', 'earning', 130),
  runItem('ABSENCE', 'Absence deduction', 'অনুপস্থিতি কর্তন', 'deduction', 200),
  runItem('ADVANCE', 'Advance recovery', 'অগ্রিম কর্তন', 'deduction', 210),
  runItem('PF_EMPLOYEE', 'Provident fund', 'ভবিষ্য তহবিল', 'deduction', 220),
  runItem('TAX', 'Income tax', 'আয়কর', 'deduction', 230),
  runItem(
    'PF_EMPLOYER',
    'Provident fund (employer)',
    'ভবিষ্য তহবিল (নিয়োগকর্তা)',
    'employer_cost',
    300,
  ),
];

export interface PackStructure {
  code: string;
  name: string;
  nameBn: string;
  basis: 'gross' | 'basic';
  lines: { component: string; formula: string }[];
  wageBoard: string | null;
}

/** The RMG wage board's fixed allowances, added up: medical, conveyance and food. */
const RMG_FIXED = 750 + 450 + 1250;

export const BD_SALARY_STRUCTURES: readonly PackStructure[] = [
  {
    code: 'RMG_WORKER',
    name: 'RMG worker (2023 wage board)',
    nameBn: 'আরএমজি শ্রমিক (২০২৩ মজুরি বোর্ড)',
    basis: 'gross',
    // House rent is half of basic, so basic is what is left after the fixed allowances,
    // divided by 1.5; house rent takes the remainder so the lines always add up to the gross.
    lines: [
      { component: 'MEDICAL', formula: '750' },
      { component: 'CONVEYANCE', formula: '450' },
      { component: 'FOOD', formula: '1250' },
      { component: 'BASIC', formula: `round((GROSS - ${RMG_FIXED}) / 1.5)` },
      { component: 'HOUSE_RENT', formula: 'GROSS - BASIC - MEDICAL - CONVEYANCE - FOOD' },
    ],
    wageBoard: 'BD_RMG_2023',
  },
  {
    code: 'STAFF',
    name: 'Staff (basic 60%)',
    nameBn: 'কর্মকর্তা (মূল বেতন ৬০%)',
    basis: 'gross',
    lines: [
      { component: 'BASIC', formula: 'round(GROSS * 0.6)' },
      { component: 'HOUSE_RENT', formula: 'round(BASIC * 0.5)' },
      { component: 'MEDICAL', formula: 'round(GROSS * 0.05)' },
      { component: 'CONVEYANCE', formula: 'GROSS - BASIC - HOUSE_RENT - MEDICAL' },
    ],
    wageBoard: null,
  },
];

export interface WageGrade {
  grade: string;
  name: string;
  nameBn: string;
  gross: number;
  basic: number;
  components: Record<string, number>;
}

export interface WageBoard {
  id: string;
  name: string;
  sector: string;
  effectiveFrom: IsoDate;
  reference: string;
  status: ReviewStatus;
  note?: string;
  grades: readonly WageGrade[];
}

const rmgGrade = (grade: string, name: string, nameBn: string, gross: number, basic: number) => ({
  grade,
  name,
  nameBn,
  gross,
  basic,
  components: { BASIC: basic, HOUSE_RENT: basic / 2, MEDICAL: 750, CONVEYANCE: 450, FOOD: 1250 },
});

export const BD_WAGE_BOARDS: readonly WageBoard[] = [
  {
    id: 'BD_RMG_2023',
    name: 'Readymade garments, 2023',
    sector: 'Readymade garments (RMG)',
    effectiveFrom: '2023-12-01',
    reference: 'Minimum Wage Board gazette for the RMG sector, published 12 November 2023',
    status: 'needs_review',
    note:
      'Figures as reported from the gazette; confirm against its text. Annual increment 5% of ' +
      'basic; 9% decided for December 2024 (gazette of 5 January 2025), whose continuation ' +
      'after 2025 is disputed.',
    grades: [
      rmgGrade('G1', 'Grade 1', 'গ্রেড ১', 14_750, 8_200),
      rmgGrade('G2', 'Grade 2', 'গ্রেড ২', 14_150, 7_800),
      rmgGrade('G3', 'Grade 3', 'গ্রেড ৩', 13_550, 7_400),
      rmgGrade('G4', 'Grade 4', 'গ্রেড ৪', 13_025, 7_050),
      rmgGrade('G5', 'Grade 5 (entry)', 'গ্রেড ৫ (প্রবেশ)', 12_500, 6_700),
      rmgGrade('APPRENTICE', 'Apprentice', 'শিক্ষানবিশ', 9_875, 4_950),
    ],
  },
];

/** The wage table by id, or undefined. */
export const bdWageBoard = (id: string) => BD_WAGE_BOARDS.find((b) => b.id === id);
