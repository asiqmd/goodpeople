import { z } from 'zod';

const reason = z.string().trim().min(10).max(1000);
const money = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/);
const date = z.iso.date();
export const SAUDI_SCHEMES = [
  'non_saudi_hazards',
  'gosi_legacy',
  'gosi_new',
  'gcc_extension',
  'other_authority',
  'unknown',
] as const;
export const saudiEmployerInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    effectiveFrom: date,
    regime: z.enum(['hrsd_private', 'government', 'domestic', 'special_regime']),
    workModel: z.enum(['full_time', 'part_time', 'other']),
    endOfService: z.enum(['statutory_gratuity', 'alternative_savings', 'other']),
    workingTime: z.enum(['standard', 'excluded']),
    weeklyRestDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    dailyMinutes: z.number().int().min(60).max(480),
    noticeDays: z.number().int().min(0).max(180),
    probationDays: z.number().int().min(0).max(180),
    restDayAuthorityReference: z.string().trim().min(5).max(240).optional(),
    proration: z.literal('calendar_days'),
    reason,
  })
  .strict();
export const saudiWorkerInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    employeeId: z.uuid(),
    effectiveFrom: date,
    scheme: z.enum(SAUDI_SCHEMES),
    authority: z.enum(['gosi', 'other', 'unknown']),
    priorParticipation: z.enum([
      'none',
      'pre_2024_social',
      'post_2024_only',
      'pre_2024_civil',
      'unknown',
    ]),
    firstContributionOn: date.optional(),
    workLocation: z.enum(['SA_onshore', 'cross_border', 'unknown']),
    contractTerm: z.enum(['fixed_term', 'indefinite', 'unknown', 'other']),
    contractEndOn: date.optional(),
    noticeDays: z.number().int().min(0).max(180),
    probationDays: z.number().int().min(0).max(180),
    calendarBasis: z.enum(['gregorian_written_agreement', 'hijri', 'unknown']),
    ramadanHours: z.enum(['applies', 'not_applicable', 'unknown']),
    branches: z.enum(['hazards_only', 'annuities_saned_hazards', 'other', 'unknown']),
    occupationalHazardsBps: z.union([z.literal(200), z.literal(400)]),
    singleEmployer: z.boolean(),
    insuranceCoverageAttested: z.boolean(),
    contributionSalary: money.optional(),
    contributionBasisOn: date.optional(),
    evidenceReference: z.string().trim().min(5).max(240),
    reason,
  })
  .strict()
  .refine(
    (v) =>
      v.contractTerm !== 'fixed_term' || (!!v.contractEndOn && v.contractEndOn >= v.effectiveFrom),
    'Fixed-term coverage needs its contract end date',
  )
  .refine(
    (v) =>
      !['gosi_legacy', 'gosi_new', 'non_saudi_hazards'].includes(v.scheme) ||
      !!(v.firstContributionOn && v.contributionSalary && v.contributionBasisOn),
    'GOSI needs participation history and an explicitly recorded contribution salary/date',
  );
export const saudiOvertimeSchema = z
  .object({
    date,
    minutes: z.number().int().min(1).max(480),
    kind: z.enum(['day', 'night', 'rest', 'holiday']),
    ramadan: z.boolean(),
    scheduledMinutes: z.number().int().min(0).max(480),
    weeklyWorkedMinutes: z.number().int().min(1).max(3600),
  })
  .strict();
const deductions = z
  .array(
    z
      .object({
        kind: z.enum(['consented_other', 'disciplinary', 'court_debt', 'loan', 'damage']),
        amount: money,
        writtenConsent: z.boolean(),
        reference: z.string().min(5).max(160),
      })
      .strict(),
  )
  .max(20);
export const saudiPayrollLineSchema = z
  .object({
    workerCoverageId: z.uuid(),
    basic: money,
    allowances: money,
    unpaidDays: z.number().int().min(0).max(31),
    sickDaysBefore: z.number().int().min(0).max(120),
    sickDays: z.number().int().min(0).max(31),
    probationCompleted: z.boolean(),
    yearOvertimeMinutesBefore: z.number().int().min(0).max(43200),
    overtime: z.array(saudiOvertimeSchema).max(62),
    deductions,
  })
  .strict();
export const saudiPayrollInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    periodStart: date,
    periodEnd: date,
    lines: z.array(saudiPayrollLineSchema).min(1).max(100),
    reason,
  })
  .strict()
  .refine(
    (v) => new Set(v.lines.map((l) => l.workerCoverageId)).size === v.lines.length,
    'Duplicate worker coverage',
  );
export const saudiSettlementInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    workerCoverageId: z.uuid(),
    lastWorkingDay: date,
    basic: money,
    allowances: money,
    unpaidServiceDays: z.number().int().min(0).max(20000),
    unusedAnnualDays: z.number().min(0).max(60).multipleOf(0.5),
    noticePayDays: z.number().int().min(0).max(180),
    unpaidSalary: money,
    terminationReason: z.enum([
      'resignation',
      'contract_end',
      'employer_termination',
      'article_87_exception',
      'article_80_disputed',
    ]),
    article87EvidenceReference: z.string().trim().min(5).max(240).optional(),
    entitlementsAttested: z.literal(true),
    serviceHistory: z.literal('single_employer_no_transfers'),
    reason,
  })
  .strict();
export const saudiComparisonInputSchema = z
  .object({
    evidenceKind: z.enum(['synthetic', 'independent']),
    preparedBy: z.string().trim().min(3).max(160),
    reference: z.string().trim().min(5).max(240),
    documentHash: z.string().regex(/^[a-f0-9]{64}$/),
    expected: z
      .array(
        z
          .object({
            employeeId: z.uuid(),
            gross: money,
            employeeContribution: money,
            employerContribution: money,
            governmentContribution: money,
            deductions: money,
            net: money,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    reason,
  })
  .strict()
  .refine(
    (v) => new Set(v.expected.map((l) => l.employeeId)).size === v.expected.length,
    'Duplicate comparison employee',
  );
export const SAUDI_EVIDENCE_KINDS = [
  'law_and_cohorts',
  'privacy',
  'hosting_transfer',
  'documents_en',
  'documents_ar',
  'bank_format',
] as const;
export const saudiEvidenceInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    kind: z.enum(SAUDI_EVIDENCE_KINDS),
    reviewer: z.string().trim().min(3).max(160),
    reviewedOn: date,
    reference: z.string().trim().min(5).max(240),
    documentHash: z.string().regex(/^[a-f0-9]{64}$/),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    ruleKeys: z
      .array(z.string().regex(/^[a-z0-9_]{2,80}$/))
      .max(30)
      .default([]),
    coveredScenarios: z.array(z.string().trim().min(3).max(240)).max(100).default([]),
    synthetic: z.boolean(),
    reason,
  })
  .strict();
export const saudiWpsEventInputSchema = z
  .object({
    eventId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
    fileHash: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(['uploaded', 'accepted', 'rejected', 'reconciled']),
    reference: z.string().trim().min(5).max(160),
    acceptedCount: z.number().int().min(0).max(100),
    rejectedCount: z.number().int().min(0).max(100),
    returnedTotal: money,
    reason,
  })
  .strict();
export type SaudiEmployerInput = z.infer<typeof saudiEmployerInputSchema>;
export type SaudiWorkerInput = z.infer<typeof saudiWorkerInputSchema>;
export type SaudiPayrollInput = z.infer<typeof saudiPayrollInputSchema>;
export type SaudiPayrollLine = z.infer<typeof saudiPayrollLineSchema>;
export type SaudiSettlementInput = z.infer<typeof saudiSettlementInputSchema>;
export type SaudiComparisonInput = z.infer<typeof saudiComparisonInputSchema>;
export type SaudiEvidenceInput = z.infer<typeof saudiEvidenceInputSchema>;
export type SaudiWpsEventInput = z.infer<typeof saudiWpsEventInputSchema>;
export const saudiLeaveInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    workerCoverageId: z.uuid(),
    onDate: date,
    kind: z.enum([
      'annual',
      'sick',
      'maternity',
      'parental',
      'bereavement_spouse',
      'bereavement_family',
      'study',
      'marriage',
      'bereavement_sibling',
      'hajj',
    ]),
    usedBefore: z.number().int().min(0).max(120),
    requestedDays: z.number().int().min(1).max(90),
    eventDate: date.optional(),
    eligibilityAttested: z.literal(true),
    probationCompleted: z.boolean(),
  })
  .strict();
export type SaudiLeaveInput = z.infer<typeof saudiLeaveInputSchema>;
export type SaudiLeavePreview = {
  mode: 'preview';
  kind: string;
  unit: 'calendar_days' | 'working_days';
  fullDays: number;
  threeQuarterDays: number;
  unpaidDays: number;
  reference: string;
  postedToLedger: false;
};

export type SaudiResultLine = {
  employeeId: string;
  currency: 'SAR';
  gross: string;
  employeeContribution: string;
  employerContribution: string;
  governmentContribution: string;
  deductions: string;
  net: string;
  components: { code: string; amount: string; reference: string }[];
  facts: Record<string, string | number | boolean>;
};
export type SaudiPilotResult = {
  kind: 'payroll' | 'settlement';
  currency: 'SAR';
  mode: 'preview';
  lines: SaudiResultLine[];
  total: string;
  warnings: string[];
};
export type SaudiPilotView = {
  contextCurrent: boolean;
  id: string;
  kind: 'payroll' | 'settlement';
  periodStart: string;
  periodEnd: string;
  calculationHash: string;
  contextHash: string;
  manifestHash: string;
  result: SaudiPilotResult;
  comparisons: {
    id: string;
    outcome: string;
    evidenceKind: string;
    differences: {
      employeeId: string;
      field: string;
      expected: string | null;
      actual: string | null;
    }[];
  }[];
};
export type SaudiOverview = {
  companies: { id: string; name: string }[];
  selectedCompanyId: string | null;
  manifest: {
    implementationVersion: string;
    manifestHash: string;
    researchAsOf: string;
    previewFrom: string;
    previewThrough: string;
    rules: {
      key: string;
      reference: string;
      source: string;
      status: string;
      reviewer: null;
      definitionHash: string;
    }[];
  };
  employers: {
    id: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    definition: SaudiEmployerInput;
  }[];
  workers: {
    id: string;
    employeeId: string;
    name: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    definition: SaudiWorkerInput;
    supported: boolean;
  }[];
  employees: { id: string; name: string }[];
  pilots: SaudiPilotView[];
  evidence: {
    id: string;
    kind: string;
    reviewer: string;
    reviewedOn: string;
    reference: string;
    synthetic: boolean;
    currentManifest: boolean;
  }[];
  wps: {
    id: string;
    runId: string;
    fileHash: string;
    adapterVersion: string;
    state: string;
    count: number;
    total: string;
    paymentProven: false;
  }[];
  qualification: {
    liveEnabled: false;
    independentConsecutivePeriods: number;
    independentSettlement: boolean;
    open: string[];
  };
  capabilities: {
    employer: boolean;
    worker: boolean;
    prepare: boolean;
    evidence: boolean;
    compare: boolean;
  };
};
