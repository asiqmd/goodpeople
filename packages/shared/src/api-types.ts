import type { Access } from './access.js';
import type {
  BillingMode,
  CountryPack,
  IndustryTemplate,
  Limits,
  PlanCode,
  PlatformRole,
  TenantRole,
  TenantStatus,
} from './catalog.js';

// Response shapes. The Flutter app mirrors TenantSession and TenantAccessView by hand.

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export interface TenantSession extends TokenPair {
  user: { id: string; name: string; email: string; role: TenantRole };
  tenant: { id: string; name: string; slug: string };
}

export interface PlatformSession extends TokenPair {
  user: { id: string; name: string; email: string; role: PlatformRole };
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  countryPack: CountryPack;
  industryTemplate: IndustryTemplate;
  status: TenantStatus;
  billingMode: BillingMode;
  planCode: PlanCode;
  accessExpiresAt: string | null;
  limitOverrides: Partial<Limits>;
  bypassReason: string | null;
  createdAt: string;
}

export interface TenantWithAccess extends TenantSummary {
  access: Access;
}

export interface TenantAccessView {
  tenant: Pick<TenantSummary, 'id' | 'name' | 'slug' | 'billingMode' | 'status' | 'planCode'>;
  access: Access;
}

export interface AssignCompanyResult {
  tenant: TenantWithAccess;
  admin: { id: string; email: string };
  /** Present only when the API generated the admin's first password. Shown once. */
  temporaryPassword?: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  tenantId: string | null;
  tenantSlug: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface LegalEntity {
  id: string;
  name: string;
  tin: string | null;
  createdAt: string;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  /** Machine-readable reason, e.g. tenant_read_only, feature_not_in_plan, limit_reached. */
  code?: string;
  issues?: { path: string; message: string }[];
}
