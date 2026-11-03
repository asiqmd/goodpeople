import { z } from 'zod';

const reason = z.string().trim().min(10).max(1000);
const money = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/);
const date = z.iso.date();
export const UAE_SCHEMES = [
  'expatriate_none',
  'gpssa_1999',
  'gpssa_2023',
  'gcc_extension',
  'other_authority',
  'unknown',
] as const;
export const uaeEmployerInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    effectiveFrom: date,
    regime: z.enum([
      'mohre_federal_private',
      'difc',
      'adgm',
      'government',
      'domestic',
      'other_free_zone',
    ]),
    workModel: z.enum(['full_time', 'part_time', 'other']),
    endOfService: z.enum(['statutory_gratuity', 'alternative_savings', 'other']),
    workingTime: z.enum(['standard', 'excluded']),
    weeklyRestDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    dailyMinutes: z.number().int().min(60).max(480),
    noticeDays: z.number().int().min(30).max(90),
    probationMonths: z.number().int().min(0).max(6),
    proration: z.literal('calendar_days'),
    reason,
  })
  .strict();
export const uaeWorkerInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    employeeId: z.uuid(),
    effectiveFrom: date,
    scheme: z.enum(UAE_SCHEMES),
    authority: z.enum(['none_confirmed', 'gpssa', 'other', 'unknown']),
    priorParticipation: z.enum([
      'none',
      'law_1999',
      'law_2023',
      'pensioner_1999',
      'gratuity_1999',
      'unknown',
    ]),
    firstContributionOn: date.optional(),
    workLocation: z.enum(['AE_onshore', 'cross_border', 'unknown']),
    contractTerm: z.enum(['fixed_term', 'unknown', 'other']),
    contractEndOn: date.optional(),
    noticeDays: z.number().int().min(30).max(90),
    probationMonths: z.number().int().min(0).max(6),
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
      !v.scheme.startsWith('gpssa') ||
      !!(v.firstContributionOn && v.contributionSalary && v.contributionBasisOn),
    'GPSSA needs participation history and an explicitly recorded contribution salary/date',
  );
export const uaeOvertimeSchema = z
  .object({
    date,
    minutes: z.number().int().min(1).max(480),
    kind: z.enum(['day', 'night', 'rest', 'holiday']),
    ramadan: z.boolean(),
    scheduledMinutes: z.number().int().min(0).max(480),
    threeWeekWorkedMinutes: z.number().int().min(1).max(20000),
  })
  .strict();
const deductions = z
  .array(
    z
      .object({
        kind: z.enum(['overpayment', 'disciplinary', 'court_debt', 'loan']),
        amount: money,
        writtenConsent: z.boolean(),
        reference: z.string().min(5).max(160),
      })
      .strict(),
  )
  .max(20);
export const uaePayrollLineSchema = z
  .object({
    workerCoverageId: z.uuid(),
    basic: money,
    allowances: money,
    unpaidDays: z.number().int().min(0).max(31),
    sickDaysBefore: z.number().int().min(0).max(90),
    sickDays: z.number().int().min(0).max(31),
    probationCompleted: z.boolean(),
    shiftWorker: z.boolean(),
    overtime: z.array(uaeOvertimeSchema).max(62),
    deductions,
  })
  .strict();
export const uaePayrollInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    periodStart: date,
    periodEnd: date,
    lines: z.array(uaePayrollLineSchema).min(1).max(100),
    reason,
  })
  .strict()
  .refine(
    (v) => new Set(v.lines.map((l) => l.workerCoverageId)).size === v.lines.length,
    'Duplicate worker coverage',
  );
export const uaeSettlementInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    workerCoverageId: z.uuid(),
    lastWorkingDay: date,
    basic: money,
    allowances: money,
    unpaidServiceDays: z.number().int().min(0).max(20000),
    unusedAnnualDays: z.number().min(0).max(60).multipleOf(0.5),
    noticePayDays: z.number().int().min(0).max(90),
    unpaidSalary: money,
    terminationReason: z.enum(['resignation', 'contract_end', 'employer_termination']),
    serviceHistory: z.literal('single_employer_no_transfers'),
    reason,
  })
  .strict();
export const uaeComparisonInputSchema = z
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
export const UAE_EVIDENCE_KINDS = [
  'law_and_cohorts',
  'privacy',
  'hosting_transfer',
  'documents_en',
  'documents_ar',
  'bank_format',
] as const;
export const uaeEvidenceInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    kind: z.enum(UAE_EVIDENCE_KINDS),
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
export const uaeWpsEventInputSchema = z
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
export type UaeEmployerInput = z.infer<typeof uaeEmployerInputSchema>;
export type UaeWorkerInput = z.infer<typeof uaeWorkerInputSchema>;
export type UaePayrollInput = z.infer<typeof uaePayrollInputSchema>;
export type UaePayrollLine = z.infer<typeof uaePayrollLineSchema>;
export type UaeSettlementInput = z.infer<typeof uaeSettlementInputSchema>;
export type UaeComparisonInput = z.infer<typeof uaeComparisonInputSchema>;
export type UaeEvidenceInput = z.infer<typeof uaeEvidenceInputSchema>;
export type UaeWpsEventInput = z.infer<typeof uaeWpsEventInputSchema>;
export const uaeLeaveInputSchema = z
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
    ]),
    usedBefore: z.number().int().min(0).max(90),
    requestedDays: z.number().int().min(1).max(90),
    eventDate: date.optional(),
    eligibilityAttested: z.literal(true),
    probationCompleted: z.boolean(),
  })
  .strict();
export type UaeLeaveInput = z.infer<typeof uaeLeaveInputSchema>;
export type UaeLeavePreview = {
  mode: 'preview';
  kind: string;
  unit: 'calendar_days' | 'working_days';
  fullDays: number;
  halfDays: number;
  unpaidDays: number;
  reference: string;
  postedToLedger: false;
};

export type UaeResultLine = {
  employeeId: string;
  currency: 'AED';
  gross: string;
  employeeContribution: string;
  employerContribution: string;
  governmentContribution: string;
  deductions: string;
  net: string;
  components: { code: string; amount: string; reference: string }[];
  facts: Record<string, string | number | boolean>;
};
export type UaePilotResult = {
  kind: 'payroll' | 'settlement';
  currency: 'AED';
  mode: 'preview';
  lines: UaeResultLine[];
  total: string;
  warnings: string[];
};
export type UaePilotView = {
  contextCurrent: boolean;
  id: string;
  kind: 'payroll' | 'settlement';
  periodStart: string;
  periodEnd: string;
  calculationHash: string;
  contextHash: string;
  manifestHash: string;
  result: UaePilotResult;
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
export type UaeOverview = {
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
    definition: UaeEmployerInput;
  }[];
  workers: {
    id: string;
    employeeId: string;
    name: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    definition: UaeWorkerInput;
    supported: boolean;
  }[];
  employees: { id: string; name: string }[];
  pilots: UaePilotView[];
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
