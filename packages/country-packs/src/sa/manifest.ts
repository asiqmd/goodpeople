import { createHash } from 'node:crypto';
export const SAUDI_PACK_VERSION = '5.6.0-candidate.1';
export const SAUDI_RESEARCH_AS_OF = '2026-11-03';
export const SAUDI_PREVIEW_FROM = '2026-06-01';
export const SAUDI_LAW = 'https://www.hrsd.gov.sa/en/knowledge-centre/articles/312';
export const SAUDI_WAGES = 'https://www.hrsd.gov.sa/en/شروط-العمل-وظروفه';
export const SAUDI_RELATIONS = 'https://www.hrsd.gov.sa/en/علاقات-العمل';
export const SAUDI_GOSI = 'https://awareness.gosi.gov.sa/businessJourney.html';
export const SAUDI_GOSI_FAQ = 'https://www.gosi.gov.sa/GOSIOnline/FAQ_Contributor?locale=en_US';
export const SAUDI_WPS =
  'https://www.hrsd.gov.sa/en/ministry-services/services/رفع-ملف-حماية-الأجور';
export const SAUDI_RULES = [
  {
    key: 'coverage_contract_calendar',
    reference:
      'Labor Law arts 2, 7, 10, 37, 53, 75; amended text effective 2025-02-19. Written Gregorian agreement required by this preview.',
    source: SAUDI_RELATIONS,
    instrumentEffectiveFrom: '2025-02-19',
    parameters: {
      probationDays: 180,
      indefiniteMonthlyEmployerNoticeDays: 60,
      indefiniteMonthlyWorkerNoticeDays: 30,
    },
  },
  {
    key: 'working_time',
    reference:
      'Labor Law arts 98-108; standard time only; art 107 hourly wage plus half basic hourly wage',
    source: SAUDI_LAW,
    instrumentEffectiveFrom: '2025-02-19',
    parameters: {
      dailyMinutes: 480,
      weeklyMinutes: 2880,
      ramadanMuslimDailyMinutes: 360,
      ramadanMuslimWeeklyMinutes: 2160,
      maxCandidateActualDailyMinutes: 600,
      maxCandidateActualWeeklyMinutes: 3600,
      candidateAnnualOvertimeMinutes: 43200,
    },
  },
  {
    key: 'leave',
    reference:
      'Labor Law arts 109-117, 151; annual floor, ordinary sick bands and attested events. Benefit/salary coordination requires review.',
    source: SAUDI_WAGES,
    instrumentEffectiveFrom: '2025-02-19',
    parameters: {
      annualDays: 21,
      annualAfterFiveYears: 30,
      sickFull: 30,
      sickThreeQuarter: 60,
      sickUnpaid: 30,
      maternityDays: 84,
      parentalDays: 3,
    },
  },
  {
    key: 'deductions',
    reference: 'Labor Law arts 70, 91-93; ordinary limits only, no court override is inferred',
    source: SAUDI_WAGES,
    instrumentEffectiveFrom: null,
    parameters: {
      loanPercent: 10,
      courtPercent: 25,
      aggregatePercent: 50,
      disciplinaryAndDamageDays: 5,
    },
  },
  {
    key: 'end_of_service',
    reference:
      'Labor Law arts 84-88; final wage; resignation factors and separately attested art 87. Disputes/art 80 and compensation excluded.',
    source: SAUDI_RELATIONS,
    instrumentEffectiveFrom: null,
    parameters: {
      firstFiveYearsMonthlyFraction: '1/2',
      laterMonthlyFraction: '1',
      resignationTwoToFive: '1/3',
      resignationOverFiveBelowTen: '2/3',
      resignationTen: '1',
    },
  },
  {
    key: 'gosi_legacy',
    reference:
      'Explicit pre-2024 Social Insurance/Civil Pension participation, confirmed insured status and branches, not current joining date',
    source: SAUDI_GOSI_FAQ,
    instrumentEffectiveFrom: null,
    parameters: {
      annuityEachBps: 900,
      sanedEachBps: 75,
      hazardsEmployerBps: 200,
      maximumSalary: 45000,
    },
  },
  {
    key: 'gosi_new',
    reference:
      'No prior periods before 2024-07-03; GOSI gradual annuity increase. Published first increase 2025-07-01; later dates are candidate schedule pending original review.',
    source: SAUDI_GOSI,
    instrumentEffectiveFrom: '2024-07-03',
    parameters: {
      annuityFrom2025JulyBps: 950,
      annuityFrom2026JulyBps: 1000,
      sanedEachBps: 75,
      hazardsEmployerBps: 200,
      maximumSalary: 45000,
    },
  },
  {
    key: 'non_saudi_hazards',
    reference:
      'Explicit non-GCC occupational-hazards-only coverage; standard or documented doubled rate; never an assumed zero insurance classification',
    source: SAUDI_GOSI_FAQ,
    instrumentEffectiveFrom: null,
    parameters: {
      employeeBps: 0,
      employerBps: 200,
      doubledEmployerBps: 400,
      minimumSalary: 400,
      maximumSalary: 45000,
    },
  },
  {
    key: 'wps_provider',
    reference:
      'HRSD sealed-file upload/monitoring/justification through Mudad; no accepted bank format or portal integration asserted',
    source: SAUDI_WPS,
    instrumentEffectiveFrom: null,
    parameters: { bankAccepted: false, paymentProven: false },
  },
  {
    key: 'candidate_conventions',
    reference:
      'Proposals requiring local review: calendar-day monthly proration; 30x8 hourly divisor; Gregorian anniversary fractions; component half-up halalas.',
    source: 'docs/adr/029-saudi-pilot-pack.md',
    instrumentEffectiveFrom: SAUDI_PREVIEW_FROM,
    parameters: {
      proration: 'calendar_days',
      hourlyDivisor: 240,
      service: 'written_gregorian_anniversary_fractions',
      rounding: 'component_half_up_minor_units',
    },
  },
] as const;
export const saudiHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function saudiManifest() {
  const rules = SAUDI_RULES.map((rule) => ({
    ...rule,
    effectiveFrom: SAUDI_PREVIEW_FROM,
    effectiveTo: SAUDI_RESEARCH_AS_OF,
    status: 'needs_review' as const,
    reviewer: null,
    reviewedOn: null,
    sourceDocumentHash: null,
    sourceRetrieval: 'official_web_guidance_researched_original_consolidated_bytes_pending',
    definitionHash: saudiHash(rule),
    coveredScenarios: [] as string[],
  }));
  return {
    implementationVersion: SAUDI_PACK_VERSION,
    country: 'SA',
    regime: 'SA_PRIVATE',
    currency: 'SAR',
    calendar: 'gregorian',
    status: 'needs_review',
    liveEnabled: false,
    researchAsOf: SAUDI_RESEARCH_AS_OF,
    previewFrom: SAUDI_PREVIEW_FROM,
    previewThrough: SAUDI_RESEARCH_AS_OF,
    rules,
    manifestHash: saudiHash({ version: SAUDI_PACK_VERSION, rules }),
  };
}
