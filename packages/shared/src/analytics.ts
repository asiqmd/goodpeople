import { z } from 'zod';

export const WORKFORCE_METRICS = ['headcount', 'joiners', 'leavers'] as const;
export type WorkforceMetric = (typeof WORKFORCE_METRICS)[number];
export const WORKFORCE_VERSION = 'workforce.v1' as const;
export const WORKFORCE_DEFINITIONS = [
  {
    id: 'headcount',
    version: WORKFORCE_VERSION,
    definition:
      'Joined by the as-of date and not separated on or before it; exactly one effective assignment is required.',
  },
  {
    id: 'joiners',
    version: WORKFORCE_VERSION,
    definition:
      'Continuous-service start in the inclusive month-to-date period, attributed to the company and site at that start. Transfers are not joiners.',
  },
  {
    id: 'leavers',
    version: WORKFORCE_VERSION,
    definition:
      'Recorded completed separation in the inclusive month-to-date period, attributed to the company and site left. Future/pending separations are excluded.',
  },
] as const;
const ids = z
  .string()
  .max(4000)
  .transform((v) => v.split(','))
  .pipe(z.array(z.uuid()).min(1).max(50))
  .transform((v) => [...new Set(v)].toSorted());
export const workforceQuerySchema = z
  .object({
    asOf: z.iso.date().optional(),
    companyIds: ids.optional(),
    locationId: z.uuid().optional(),
  })
  .strict();
export type WorkforceQuery = z.infer<typeof workforceQuerySchema>;
export type MetricState = 'current' | 'provisional' | 'incomplete' | 'unavailable';
export type WorkforceIssue =
  'missing_assignment' | 'overlapping_assignments' | 'invalid_location' | 'unsupported_context';
export interface WorkforceValue {
  id: WorkforceMetric;
  version: typeof WORKFORCE_VERSION;
  unit: 'people';
  value: number | null;
  state: MetricState;
  issues: WorkforceIssue[];
}
export interface AnalyticsCompany {
  id: string;
  code: string | null;
  name: string;
  countryCode: string;
  currency: string | null;
  timeZone: string | null;
  timeZoneSource: 'dated_profile' | 'legacy_bd' | 'site' | 'unavailable';
  calendar: string | null;
  contextSource: 'dated_profile' | 'legacy_bd' | 'unavailable';
  profileId: string | null;
}
export interface AnalyticsLocation {
  id: string;
  legalEntityId: string;
  name: string;
  code: string;
  timeZone: string;
}
export interface AnalyticsCatalog {
  version: typeof WORKFORCE_VERSION;
  metrics: typeof WORKFORCE_DEFINITIONS;
  companies: AnalyticsCompany[];
  locations: AnalyticsLocation[];
  defaultAsOf: string;
  maxAsOf: string;
  scope: 'companies' | 'relationship';
}
export interface WorkforceView {
  version: typeof WORKFORCE_VERSION;
  period: { from: string; through: string };
  asOf: string;
  locationId: string | null;
  computedAt: string;
  dataAsOf: string;
  sourceRevision: string;
  sourceReferences: string[];
  scope: 'companies' | 'relationship';
  coverage: 'authorized_assignment_history';
  cache: 'none';
  metrics: WorkforceValue[];
  companies: (AnalyticsCompany & { businessToday: string | null; metrics: WorkforceValue[] })[];
}
