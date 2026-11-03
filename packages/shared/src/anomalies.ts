import { z } from 'zod';

export const ANOMALY_VERSION = 'anomaly.v1' as const;
export const ANOMALY_RULES = [
  'assignment_coverage',
  'attendance_processing',
  'attendance_movement',
  'payroll_movement',
] as const;
export type AnomalyRule = (typeof ANOMALY_RULES)[number];

const month = z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/);
export const anomalyFindingIdSchema = z.uuid();
const companyId = z.uuid().transform((id) => id.toLowerCase());
export const anomalyDefinitionSchema = z.discriminatedUnion('rule', [
  z.object({ rule: z.literal('assignment_coverage'), month }).strict(),
  z.object({ rule: z.literal('attendance_processing'), month, companyId }).strict(),
  z.object({ rule: z.literal('attendance_movement'), month, companyId }).strict(),
  z.object({ rule: z.literal('payroll_movement'), month }).strict(),
]);
export type AnomalyDefinition = z.infer<typeof anomalyDefinitionSchema>;

export const anomalyReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim') }).strict(),
  z.object({ action: z.literal('release') }).strict(),
  z.object({ action: z.literal('acknowledge') }).strict(),
  z.object({ action: z.literal('dismiss'), reason: z.string().trim().min(5).max(300) }).strict(),
  z.object({ action: z.literal('resolve') }).strict(),
]);
export type AnomalyReview = z.infer<typeof anomalyReviewSchema>;
export type AnomalyStatus = 'open' | 'assigned' | 'acknowledged' | 'dismissed' | 'resolved';

export const ANOMALY_BASELINE_MONTHS = 3;
export const ANOMALY_RELATIVE_THRESHOLD = '25';
export const ANOMALY_ABSOLUTE_THRESHOLDS = {
  attendance_movement: '1800',
  payroll_movement: '10000',
} as const;

export type AnomalyEvidence =
  | { kind: 'assignments'; issues: ('missing_assignment' | 'overlapping_assignments')[] }
  | { kind: 'processing'; trackingFrom: string; processedThrough: string | null; expected: string }
  | { kind: 'pending_attendance' }
  | {
      kind: 'movement';
      unit: 'minutes_per_day' | 'BDT';
      observed: string;
      baseline: string;
      baselineFrom: string;
      baselineThrough: string;
      difference: string;
      changePercent: string;
      absoluteThreshold: string;
      relativeThreshold: string;
    };

export type AnomalyOutcome =
  | { state: 'detected'; evidence: AnomalyEvidence }
  | { state: 'clear'; evidence?: AnomalyEvidence }
  | { state: 'insufficient'; reason: 'context' | 'coverage' | 'baseline' | 'zero_baseline' };

export type AnomalyEvaluation = AnomalyOutcome & {
  version: typeof ANOMALY_VERSION;
  sourceVersion: string;
  sourceRevision: string;
  measuredAt: string;
};

export interface AnomalyFinding {
  id: string;
  definition: AnomalyDefinition;
  version: typeof ANOMALY_VERSION;
  sourceVersion: string;
  sourceRevision: string;
  measuredAt: string;
  evidence: AnomalyEvidence;
  status: AnomalyStatus;
  ownedByMe: boolean;
  supersededAt: string | null;
  reason: string | null;
  resolution: { sourceRevision: string; measuredAt: string } | null;
}

export interface AnomalyCatalog {
  latestMonth: string;
  assignmentCoverage: boolean;
  payrollMovement: boolean;
  companies: { id: string; name: string }[];
}

export interface AnomalyInbox {
  canReview: boolean;
  canRelease: boolean;
  findings: AnomalyFinding[];
  next: string | null;
}
