import { z } from 'zod';
export const API_SCOPES = ['org:read', 'employees:read', 'attendance:read'] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const PUBLIC_FIELDS = [
  'org_names',
  'employee_code',
  'display_name',
  'employment_status',
  'job_reference',
  'attendance_status',
  'attendance_minutes',
] as const;
export type PublicField = (typeof PUBLIC_FIELDS)[number];
export const INTEGRATION_EVENTS = [
  'employee.created',
  'employee.updated',
  'employment.ended',
  'attendance.day.finalized',
] as const;
export type IntegrationEventType = (typeof INTEGRATION_EVENTS)[number];
export const apiClientSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    ownerId: z.uuid(),
    days: z.number().int().min(1).max(365),
    scopes: z.array(z.enum(API_SCOPES)).min(1).max(3),
    fields: z.array(z.enum(PUBLIC_FIELDS)).max(PUBLIC_FIELDS.length),
    scope: z.enum(['none', 'selected', 'all']),
    companyIds: z.array(z.uuid()).max(200),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .refine((v) => (v.scope === 'selected' ? v.companyIds.length > 0 : v.companyIds.length === 0), {
    message: 'Choose explicit companies for selected scope',
  });
export type ApiClientInput = z.infer<typeof apiClientSchema>;
export const webhookSchema = z
  .object({
    clientId: z.uuid(),
    name: z.string().trim().min(2).max(100),
    url: z.url().max(2000),
    events: z.array(z.enum(INTEGRATION_EVENTS)).min(1).max(4),
  })
  .strict();
export type WebhookInput = z.infer<typeof webhookSchema>;
/** Deliberately independent of internal employee DTOs. Never add private fields here. */
export interface PublicEmployeeV1 {
  id: string;
  company_id: string;
  employee_code?: string;
  display_name?: string;
  employment_status?: string;
  job?: {
    id: string;
    site_id: string | null;
    unit_id: string | null;
    designation_id: string | null;
    effective_from: string;
  };
}
export interface PublicPage<T> {
  data: T[];
  page: { next_cursor: string | null; has_more: boolean };
}
export interface IntegrationEnvelope {
  id: string;
  schema_version: '1';
  type: IntegrationEventType;
  tenant_id: string;
  occurred_at: string;
  resource: {
    id: string;
    type: 'employee' | 'attendance_day';
    company_id: string | null;
    date?: string;
  };
}
export interface IntegrationsOverview {
  endpoints: { token: string; api: string; openapi: string };
  clients: {
    id: string;
    clientId: string;
    name: string;
    ownerId: string;
    expiresAt: string;
    revoked: boolean;
    expired: boolean;
    daysRemaining: number;
    reviewRequired: boolean;
    version: number;
    scopes: ApiScope[];
    fields: PublicField[];
    scope: 'none' | 'selected' | 'all';
    companyIds: string[];
    credentials: { id: string; expiresAt: string; revoked: boolean }[];
  }[];
  subscriptions: {
    id: string;
    clientId: string;
    name: string;
    url: string;
    events: IntegrationEventType[];
    enabled: boolean;
    failureCount: number;
    keyId: string;
    pendingKeyId: string | null;
  }[];
  deliveries: {
    id: string;
    subscriptionId: string;
    eventId: string;
    type: string;
    state: string;
    attempts: number;
    nextAttemptAt: string;
    lastStatus: number | null;
    error: string | null;
  }[];
  companies: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  queue: { pending: number; dead: number; oldestAt: string | null; outboxPending: number };
  worker: { heartbeatAt: string | null; stale: boolean; failures: number };
  events: { id: string; action: string; actorId: string; createdAt: string }[];
}
