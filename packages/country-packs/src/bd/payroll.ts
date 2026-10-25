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
  /** For run components: worked out in each run from its variables; null means entered. */
  runFormula: string | null;
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
  runFormula: null,
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
  runFormula: null,
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
  // Labour Rules 2015: (basic + dearness allowance) × 2 × hours ÷ 208. The Act's overtime
  // (s.108) is for workers; a workspace that pays staff overtime changes the formula.
  runItem('OVERTIME', 'Overtime', 'অতিরিক্ত কাজের ভাতা', 'earning', 100, {
    runFormula: 'if(WORKER, round(OT_BASE * 2 * OT_HOURS / 208), 0)',
  }),
  runItem('ATTENDANCE_BONUS', 'Attendance bonus', 'হাজিরা বোনাস', 'earning', 110),
  // Production (the RMG pack): a piece-rated worker earns the larger of the time wage and
  // the pieces at their rates, so the grade's minimum wage is always met; time-rated
  // workers earn an incentive for pieces above each day's target.
  runItem(
    'PIECE_PAY',
    'Piece-rate earnings above wages',
    'মজুরির অতিরিক্ত পিস রেট আয়',
    'earning',
    112,
    {
      runFormula: 'max(0, PIECE_EARNINGS - round(GROSS * PAID_DAYS / PERIOD_DAYS))',
    },
  ),
  runItem('PROD_INCENTIVE', 'Production incentive', 'উৎপাদন প্রণোদনা', 'earning', 114, {
    runFormula: 'round(PRODUCTION_INCENTIVE)',
  }),
  runItem('FESTIVAL_BONUS', 'Festival bonus', 'উৎসব বোনাস', 'earning', 120),
  runItem('ARREARS', 'Arrears', 'বকেয়া', 'earning', 130),
  // Final settlement (s.19–30) and the workers' participation fund (Chapter XV).
  runItem('NOTICE_PAY', 'Pay in lieu of notice', 'নোটিশের পরিবর্তে মজুরি', 'earning', 140),
  runItem('LEAVE_ENCASHMENT', 'Unused earned leave', 'অভোগকৃত অর্জিত ছুটির মজুরি', 'earning', 150),
  runItem('GRATUITY', 'Gratuity', 'গ্র্যাচুইটি', 'earning', 160),
  runItem('SEPARATION_BENEFIT', 'Separation benefit', 'চাকরি অবসানের সুবিধা', 'earning', 170),
  // Paid from the fund, not salary: taxed on its own at source (WPPF_TDS), not as salary.
  runItem('WPPF', 'Participation fund share', 'অংশগ্রহণ তহবিলের অংশ', 'earning', 180, {
    taxTreatment: 'exempt',
  }),
  // Within s.126's cap (the pay for the days absent); basic ÷ 30 per day is common practice.
  // Deductions marked taxable reduce salary income for tax: pay not earned is not income.
  runItem('ABSENCE', 'Absence deduction', 'অনুপস্থিতি কর্তন', 'deduction', 200, {
    runFormula: 'round(BASIC / 30 * ABSENT_DAYS)',
    taxTreatment: 'taxable',
  }),
  // Leave without pay: the gross for each day.
  runItem('UNPAID_LEAVE', 'Leave without pay', 'বিনা বেতনে ছুটি', 'deduction', 205, {
    runFormula: 'round(GROSS / 30 * UNPAID_LEAVE_DAYS)',
    taxTreatment: 'taxable',
  }),
  // Advances and loans are recovered from their schedules; an entered amount replaces it.
  // A resigning worker who does not serve the notice pays wages for the days not given.
  runItem('NOTICE_RECOVERY', 'Notice not served', 'নোটিশ না দেওয়ার মজুরি', 'deduction', 207, {
    taxTreatment: 'taxable',
  }),
  runItem('ADVANCE', 'Advance recovery', 'অগ্রিম কর্তন', 'deduction', 210),
  // A union subscription, deducted only with the member's written consent (s.204).
  runItem('UNION_SUB', 'Union subscription', 'ট্রেড ইউনিয়নের চাঁদা', 'deduction', 215, {
    runFormula: 'UNION_DUES',
  }),
  runItem('LOAN', 'Loan repayment', 'ঋণ পরিশোধ', 'deduction', 212),
  // The provident fund's rates are in payroll settings; contributions apply to members.
  runItem('PF_EMPLOYEE', 'Provident fund', 'ভবিষ্য তহবিল', 'deduction', 220),
  runItem('PF_LOAN', 'Provident fund loan repayment', 'ভবিষ্য তহবিল ঋণ পরিশোধ', 'deduction', 225),
  // Worked out by each run from the year's projected salary (Income Tax Act 2023, s.86).
  runItem('TAX', 'Income tax', 'আয়কর', 'deduction', 230),
  // Income Tax Act 2023, s.88: deducted from a participation fund payout.
  runItem(
    'WPPF_TDS',
    'Tax on participation fund share',
    'অংশগ্রহণ তহবিলের অংশের উপর কর',
    'deduction',
    232,
  ),
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

/**
 * Bangladesh Bank's limits on a personal mobile wallet (circular of 27 March 2025): a wallet
 * may hold at most this much, so a larger payment would bounce. Providers may set lower.
 */
export const BD_MFS_LIMITS = { balanceCap: 500_000, cashInPerDay: 50_000 } as const;
