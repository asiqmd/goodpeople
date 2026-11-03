import { createHash } from 'node:crypto';

export const UAE_PACK_VERSION = '5.5.0-candidate.1';
export const UAE_RESEARCH_AS_OF = '2026-11-02';
export const UAE_PREVIEW_FROM = '2026-06-01';
export const UAE_LAW =
  'https://www.mohre.gov.ae/assets/download/e82f7872/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments_638990571068264034.pdf.aspx';
export const UAE_EXECUTIVE =
  'https://www.mohre.gov.ae/assets/download/ff353ce9/Cabinet%20Resolution%20_Executive%20Regulations%20Decree-Law%20No.%2033.pdf.aspx';
export const UAE_GPS =
  'https://gpssa.gov.ae/pages/en/media-center/news/gpssa-insureds-contribution-payment-may-be-extended-15th-day-each-month';
export const UAE_WPS =
  'https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/payment-of-wages';
export const UAE_RULES = [
  {
    key: 'coverage_contract',
    reference: 'FDL 33/2021 arts 3, 7, 9, 43',
    source: UAE_LAW,
    instrumentEffectiveFrom: '2022-02-02',
    parameters: { probationMonths: 6, noticeMin: 30, noticeMax: 90 },
  },
  {
    key: 'working_time',
    reference: 'FDL 33/2021 arts 17-21, 28; CR 1/2022 art 15',
    source: UAE_EXECUTIVE,
    instrumentEffectiveFrom: '2022-02-02',
    parameters: {
      dailyMinutes: 480,
      weeklyMinutes: 2880,
      ramadanReductionMinutes: 120,
      maxDailyOvertimeMinutes: 120,
      threeWeekMinutes: 8640,
      dayPremiumPercent: 25,
      nightPremiumPercent: 50,
    },
  },
  {
    key: 'leave',
    reference: 'FDL 33/2021 arts 29-32; CR 1/2022 art 19',
    source: UAE_LAW,
    instrumentEffectiveFrom: '2022-02-02',
    parameters: {
      annualDays: 30,
      interimDaysPerMonth: 2,
      sickFull: 15,
      sickHalf: 30,
      sickUnpaid: 45,
      maternityFull: 45,
      maternityHalf: 15,
      parentalDays: 5,
    },
  },
  {
    key: 'deductions',
    reference: 'FDL 33/2021 art 25',
    source: UAE_LAW,
    instrumentEffectiveFrom: '2022-02-02',
    parameters: {
      overpaymentPercent: 20,
      disciplinaryPercent: 5,
      courtDebtPercent: 25,
      aggregatePercent: 50,
    },
  },
  {
    key: 'foreign_gratuity',
    reference: 'FDL 33/2021 arts 29(9), 43, 51, 53',
    source: UAE_LAW,
    instrumentEffectiveFrom: '2022-02-02',
    parameters: {
      firstFiveYearsDays: 21,
      laterDays: 30,
      capBasicMonths: 24,
      paymentDeadlineDays: 14,
    },
  },
  {
    key: 'gpssa_1999',
    reference:
      'GPSSA guidance for Federal Law 7/1999; contribution salary/history requires authority review',
    source: UAE_GPS,
    instrumentEffectiveFrom: null,
    parameters: {
      employeeBps: 500,
      employerGrossBps: 1500,
      governmentBps: 250,
      minimumSalary: 1000,
      maximumSalary: 50000,
    },
  },
  {
    key: 'gpssa_2023',
    reference:
      'GPSSA guidance for FDL 57/2023; existing 1999 participation is not replaced by a new job',
    source: UAE_GPS,
    instrumentEffectiveFrom: '2023-10-31',
    parameters: {
      employeeBps: 1100,
      employerGrossBps: 1500,
      governmentBps: 250,
      governmentThresholdExclusive: 20000,
      minimumSalary: 3000,
      maximumSalary: 70000,
    },
  },
  {
    key: 'wps_due_date',
    reference:
      'MR 340/2026; current government guidance. No compliance percentage or penalty engine is inferred',
    source: UAE_WPS,
    instrumentEffectiveFrom: '2026-06-01',
    parameters: { nextMonthDay: 1 },
  },
  {
    key: 'candidate_conventions',
    reference: 'Implementation proposals, not a statutory assertion: local review required',
    source: 'docs/adr/028-uae-pilot-pack.md',
    instrumentEffectiveFrom: '2026-06-01',
    parameters: {
      monthlyProration: 'calendar_days',
      overtimeDayDivisor: 30,
      overtimeHoursDivisor: 8,
      serviceYearDays: 365,
      rounding: 'component_half_up_minor_units',
    },
  },
] as const;
export const uaeHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function uaeManifest() {
  const rules = UAE_RULES.map((rule) => ({
    ...rule,
    effectiveFrom: UAE_PREVIEW_FROM,
    effectiveTo: UAE_RESEARCH_AS_OF,
    status: 'needs_review' as const,
    reviewer: null,
    reviewedOn: null,
    sourceDocumentHash: null,
    sourceRetrieval: 'official_index_researched_original_consolidated_bytes_pending',
    definitionHash: uaeHash(rule),
    coveredScenarios: [] as string[],
  }));
  return {
    implementationVersion: UAE_PACK_VERSION,
    country: 'AE',
    regime: 'AE_FEDERAL_PRIVATE',
    currency: 'AED',
    calendar: 'gregorian',
    status: 'needs_review',
    liveEnabled: false,
    researchAsOf: UAE_RESEARCH_AS_OF,
    previewFrom: UAE_PREVIEW_FROM,
    previewThrough: UAE_RESEARCH_AS_OF,
    rules,
    manifestHash: uaeHash({ version: UAE_PACK_VERSION, rules }),
  };
}
