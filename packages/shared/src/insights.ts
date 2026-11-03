import { z } from 'zod';

export const INSIGHT_VERSION = 'insight.v1' as const;
export const INSIGHT_KINDS = ['attendance', 'leave', 'learning', 'payroll'] as const;
export const PAYROLL_INSIGHT_MONTHS = 6;
export const INSIGHT_MIN_COHORT = 5;
export const INSIGHT_MAX_ROWS = 50_000;
export const INSIGHT_RETENTION_MS = 24 * 60 * 60_000;
const month = z.string().regex(/^(19\d\d|20\d\d)-(0[1-9]|1[0-2])$/);
const companyId = z.uuid().transform((id) => id.toLowerCase());

export const insightDefinitionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('attendance'), month, companyId }).strict(),
  z.object({ kind: z.literal('leave'), month, companyId }).strict(),
  z.object({ kind: z.literal('learning'), month, companyId }).strict(),
  z.object({ kind: z.literal('payroll'), month }).strict(),
]);
export type InsightDefinition = z.infer<typeof insightDefinitionSchema>;
export type InsightKind = InsightDefinition['kind'];
export const insightJobSchema = z.object({ requestId: z.uuid() }).strict();

export const INSIGHT_METRICS = {
  attendance: ['worked_days', 'worked_minutes'],
  leave: ['net_leave_days'],
  learning: ['assigned', 'completed'],
  payroll: ['employer_cost'],
} as const;
export type InsightMetric = (typeof INSIGHT_METRICS)[InsightKind][number];
export type InsightState = 'recorded' | 'provisional' | 'incomplete' | 'unavailable' | 'suppressed';
export type InsightIssue = 'context' | 'coverage' | 'reconciliation' | 'cohort' | 'no_locked_runs';
export interface InsightPoint {
  month: string;
  country: string | null;
  currency: string | null;
  state: InsightState;
  issue?: InsightIssue;
  values: Partial<Record<InsightMetric, string>>;
}
export interface InsightView {
  definition: InsightDefinition;
  version: typeof INSIGHT_VERSION;
  timeZone: string | null;
  points: InsightPoint[];
  dataAsOf: string;
  sourceRevision: string;
}
export interface InsightCatalog {
  latestMonth: string;
  payroll: boolean;
  payrollExport: boolean;
  canSave: boolean;
  companies: { id: string; name: string; kinds: Exclude<InsightKind, 'payroll'>[] }[];
}
export interface SavedInsight {
  id: string;
  definition: InsightDefinition;
  version: typeof INSIGHT_VERSION;
}
export interface InsightJob {
  id: string;
  reportId: string;
  status: 'queued' | 'ready' | 'cancelled' | 'failed' | 'expired';
  expiresAt: string;
  createdAt: string;
}
