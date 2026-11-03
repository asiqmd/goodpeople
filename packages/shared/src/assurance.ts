import { z } from 'zod';
const text = z.string().trim().min(10).max(2000),
  ref = z.string().trim().min(5).max(300),
  hash = z.string().regex(/^[a-f0-9]{64}$/),
  day = z.iso.date();
export const ASSURANCE_CATALOG = [
  {
    id: 'identity_lifecycle',
    title: 'Identity and deprovisioning',
    ownerRole: 'Enterprise IT and security',
    cadenceDays: 30,
    waivable: false,
    external: true,
  },
  {
    id: 'privileged_access',
    title: 'Privileged and field access review',
    ownerRole: 'Security and data owner',
    cadenceDays: 30,
    waivable: true,
    external: false,
  },
  {
    id: 'mfa_recovery',
    title: 'MFA and emergency recovery',
    ownerRole: 'Enterprise IT',
    cadenceDays: 90,
    waivable: false,
    external: true,
  },
  {
    id: 'tenant_isolation',
    title: 'Tenant, company and field isolation',
    ownerRole: 'Security',
    cadenceDays: 30,
    waivable: false,
    external: false,
  },
  {
    id: 'webhook_delivery',
    title: 'Receiver, egress and replay acceptance',
    ownerRole: 'Integration and operations',
    cadenceDays: 30,
    waivable: false,
    external: true,
  },
  {
    id: 'worker_failover',
    title: 'Worker load, leases and failover',
    ownerRole: 'Operations',
    cadenceDays: 30,
    waivable: false,
    external: true,
  },
  {
    id: 'change_release',
    title: 'Change, clean source and supply chain',
    ownerRole: 'Release engineering',
    cadenceDays: 30,
    waivable: false,
    external: false,
  },
  {
    id: 'vulnerability',
    title: 'Vulnerabilities and remediation',
    ownerRole: 'Security',
    cadenceDays: 7,
    waivable: false,
    external: false,
  },
  {
    id: 'independent_pentest',
    title: 'Independent enterprise penetration test',
    ownerRole: 'Security',
    cadenceDays: 365,
    waivable: false,
    external: true,
  },
  {
    id: 'backup_restore',
    title: 'Backup and distinct-host recovery',
    ownerRole: 'Operations',
    cadenceDays: 30,
    waivable: false,
    external: true,
  },
  {
    id: 'incident_response',
    title: 'Incident plan and response drill',
    ownerRole: 'Incident commander',
    cadenceDays: 90,
    waivable: false,
    external: true,
  },
  {
    id: 'privacy_vendors',
    title: 'Privacy, vendors, retention and transfers',
    ownerRole: 'Legal and privacy',
    cadenceDays: 90,
    waivable: false,
    external: true,
  },
  {
    id: 'people_governance',
    title: 'Policy, training and governance',
    ownerRole: 'Management and HR',
    cadenceDays: 90,
    waivable: true,
    external: false,
  },
  {
    id: 'host_qualification',
    title: 'Linux, offline and host qualification',
    ownerRole: 'Customer and release operations',
    cadenceDays: 90,
    waivable: false,
    external: true,
  },
  {
    id: 'arabic_review',
    title: 'Arabic content and legal documents',
    ownerRole: 'Local language and legal reviewer',
    cadenceDays: 90,
    waivable: false,
    external: true,
  },
  {
    id: 'merchant_acceptance',
    title: 'Merchant and reconciliation acceptance',
    ownerRole: 'Finance and provider',
    cadenceDays: 90,
    waivable: false,
    external: true,
  },
  {
    id: 'country_bd',
    title: 'Bangladesh country-consumer qualification',
    ownerRole: 'Local payroll and legal',
    cadenceDays: 90,
    waivable: false,
    external: true,
  },
  {
    id: 'country_ae',
    title: 'UAE country and bank qualification',
    ownerRole: 'Local payroll, legal and provider',
    cadenceDays: 90,
    waivable: false,
    external: true,
  },
  {
    id: 'country_sa',
    title: 'Saudi country, bank and Mudad qualification',
    ownerRole: 'Local payroll, legal and provider',
    cadenceDays: 90,
    waivable: false,
    external: true,
  },
] as const;
export const ASSURANCE_CONTROL_IDS = ASSURANCE_CATALOG.map((x) => x.id);
export const assuranceControlIdSchema = z.enum(ASSURANCE_CATALOG.map((x) => x.id));
export const assuranceProgramInputSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    mode: z.enum(['readiness', 'synthetic']),
    releaseVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    sourceDigest: hash,
    sourceDirty: z.boolean(),
    deployment: z.enum(['managed', 'dedicated', 'self_hosted']),
    countries: z
      .array(z.enum(['BD', 'AE', 'SA']))
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    arabic: z.boolean(),
    merchantCheckout: z.boolean(),
    systemBoundary: text,
    customerResponsibilities: text,
    exclusions: text,
    subserviceOrganizations: text,
    criteriaVersion: ref,
    descriptionCriteriaVersion: ref,
    criteriaConfirmed: z.boolean(),
    reportClaim: z.enum(['none', 'type1', 'type2']),
    periodFrom: day,
    periodThrough: day,
    targetIncidentSeconds: z.number().int().positive().max(604800),
    targetsConfirmed: z.boolean(),
    targetRtoSeconds: z.number().int().positive().max(604800),
    targetRpoSeconds: z.number().int().min(0).max(604800),
    reason: text,
  })
  .strict()
  .refine((v) => v.periodThrough >= v.periodFrom, 'Observation period is reversed')
  .refine(
    (v) => v.reportClaim !== 'type1' || v.periodFrom === v.periodThrough,
    'Type 1 uses an as-of date',
  );
const base = { reason: text };
export const assuranceEventInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...base,
      kind: z.literal('control'),
      controlId: assuranceControlIdSchema,
      ownerId: z.uuid(),
      cadenceDays: z.number().int().min(1).max(365),
      procedure: text,
      classification: z.enum(['internal', 'restricted']),
      retentionDays: z.number().int().min(1).max(3650),
      retentionApproved: z.boolean(),
      nextDueOn: day,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('evidence'),
      controlId: assuranceControlIdSchema,
      controlVersion: z.uuid(),
      evidenceKind: z.enum(['operating', 'external', 'synthetic']),
      sourceReference: ref,
      documentHash: hash,
      executedAt: z.iso.datetime(),
      coverFrom: day,
      coverThrough: day,
      outcome: z.enum(['passed', 'failed']),
      notes: text,
      drill: z
        .object({
          environment: z.enum(['native_same_host', 'production_like', 'production']),
          sourceHostReference: ref,
          targetHostReference: ref,
          responseSeconds: z.number().int().min(0).max(604800).optional(),
          serviceRtoSeconds: z.number().int().min(0).max(604800),
          rpoSeconds: z.number().int().min(0).max(604800),
          scenario: ref,
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('evidence_review'),
      evidenceId: z.uuid(),
      decision: z.enum(['accept', 'reject']),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('finding'),
      controlId: assuranceControlIdSchema,
      severity: z.enum(['critical', 'high', 'moderate', 'low']),
      title: z.string().trim().min(5).max(180),
      sourceReference: ref,
      ownerId: z.uuid().optional(),
      dueOn: day,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('finding_assignment'),
      findingId: z.uuid(),
      ownerId: z.uuid(),
      dueOn: day,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('finding_decision'),
      findingId: z.uuid(),
      decision: z.enum(['remediated', 'risk_accepted', 'reopen']),
      evidenceId: z.uuid().optional(),
      expiresOn: day.optional(),
      compensatingControls: text.optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('exception'),
      controlId: assuranceControlIdSchema,
      controlVersion: z.uuid(),
      ownerId: z.uuid(),
      expiresOn: day,
      compensatingControls: text,
      evidenceId: z.uuid(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('exception_review'),
      exceptionId: z.uuid(),
      decision: z.enum(['accept', 'reject']),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('release_review'),
      decision: z.enum(['recommend', 'reject']),
      reviewedHeadHash: hash,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('report'),
      firm: ref,
      type: z.enum(['type1', 'type2']),
      periodFrom: day,
      periodThrough: day,
      opinion: z.enum(['unmodified', 'qualified', 'adverse', 'disclaimer']),
      distribution: z.enum(['restricted', 'public_summary_only']),
      sourceReference: ref,
      documentHash: hash,
      evidenceId: z.uuid(),
    })
    .strict(),
]);
export type AssuranceProgramInput = z.infer<typeof assuranceProgramInputSchema>;
export type AssuranceEventInput = z.infer<typeof assuranceEventInputSchema>;
export type AssuranceEvent = {
  id: string;
  sequence: number;
  actorId: string;
  createdAt: string;
  previousHash: string;
  eventHash: string;
  input: AssuranceEventInput;
};
export type AssuranceEvaluation = {
  status: 'blocked' | 'evidence_ready_for_review';
  evaluatedAt: string;
  blockers: string[];
  controls: {
    id: string;
    title: string;
    ownerId: string | null;
    state: 'missing' | 'gap' | 'current' | 'exception';
    gaps: string[];
    evidenceIds: string[];
    exceptionId: string | null;
  }[];
  findings: {
    id: string;
    severity: string;
    title: string;
    ownerId: string | null;
    dueOn: string;
    state: string;
  }[];
  report: { id: string; firm: string; type: string; opinion: string; distribution: string } | null;
  commercialReleaseApproved: false;
  statutoryActivationAvailable: false;
  soc2ClaimAvailable: false;
};
export type AssuranceProgramView = {
  id: string;
  createdBy: string;
  createdAt: string;
  definition: AssuranceProgramInput;
  events: AssuranceEvent[];
  evaluation: AssuranceEvaluation;
  headHash: string;
  version: number;
};
export type AssuranceOverview = {
  programs: { id: string; name: string; releaseVersion: string; mode: string; createdAt: string }[];
  people: { id: string; name: string; role: string }[];
  catalog: typeof ASSURANCE_CATALOG;
  recentMfa: boolean;
  runtime: null | {
    backup: {
      lastBackupAt: string | null;
      lastVerifyAt: string | null;
      staleBackup: boolean;
      staleVerify: boolean;
    };
    worker: { registered: number; healthy: number };
    release: string;
    countryConsumers: Record<'BD' | 'AE' | 'SA', boolean>;
    merchantCheckoutQualified: boolean;
  };
  selected: AssuranceProgramView | null;
};
