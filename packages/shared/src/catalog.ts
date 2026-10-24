// Fixed vocabularies shared by the API, the web app and (by hand) the Flutter app.

export const BILLING_MODES = [
  'paid',
  'trial',
  'complimentary',
  'internal',
  'partner',
  'license',
] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

/** Billing modes whose access never depends on a subscription record. */
export const BYPASS_BILLING_MODES = ['complimentary', 'internal', 'partner', 'license'] as const;

export const TENANT_STATUSES = ['active', 'read_only', 'suspended', 'archived'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const ACCESS_STATES = ['full', 'read_only', 'suspended'] as const;
export type AccessState = (typeof ACCESS_STATES)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'canceled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const FEATURE_KEYS = [
  'core_hr',
  'leave',
  'attendance',
  'payroll',
  'bd_tax',
  'recruitment',
  'performance',
  'lms',
  'multi_entity',
  'api_access',
  'sso',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = [
  'max_employees',
  'max_legal_entities',
  'storage_gb',
  'sms_credits_monthly',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** `null` means unlimited. */
export type Limits = Record<LimitKey, number | null>;

export const PLATFORM_ROLES = [
  'super_admin',
  'platform_ops',
  'support',
  'finance',
  'partner_manager',
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Role templates: each is a named set of permissions (see permissions.ts). */
export const TENANT_ROLES = [
  'tenant_admin',
  'hr_admin',
  'hr_officer',
  'attendance_officer',
  'payroll_officer',
  'finance_officer',
  'auditor',
  'employee',
] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const INDUSTRY_TEMPLATES = ['group', 'rmg', 'corporate', 'ngo', 'other'] as const;
export type IndustryTemplate = (typeof INDUSTRY_TEMPLATES)[number];

export const COUNTRY_PACKS = ['BD'] as const;
export type CountryPack = (typeof COUNTRY_PACKS)[number];

export const PLAN_CODES = ['starter', 'growth', 'business', 'enterprise'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  features: FeatureKey[];
  limits: Limits;
}

const STARTER: FeatureKey[] = ['core_hr', 'leave', 'attendance'];
const GROWTH: FeatureKey[] = [...STARTER, 'payroll', 'bd_tax'];
const BUSINESS: FeatureKey[] = [...GROWTH, 'recruitment', 'performance', 'lms', 'multi_entity'];

/** The plan catalogue. Prices are set after the design-partner pilots, so none are listed here. */
export const PLAN_CATALOG: readonly PlanDefinition[] = [
  {
    code: 'starter',
    name: 'Starter',
    features: STARTER,
    limits: { max_employees: 50, max_legal_entities: 1, storage_gb: 5, sms_credits_monthly: 200 },
  },
  {
    code: 'growth',
    name: 'Growth',
    features: GROWTH,
    limits: {
      max_employees: 500,
      max_legal_entities: 1,
      storage_gb: 25,
      sms_credits_monthly: 1000,
    },
  },
  {
    code: 'business',
    name: 'Business',
    features: BUSINESS,
    limits: {
      max_employees: 5000,
      max_legal_entities: 10,
      storage_gb: 100,
      sms_credits_monthly: 5000,
    },
  },
  {
    code: 'enterprise',
    name: 'Enterprise (all modules)',
    features: [...FEATURE_KEYS],
    limits: {
      max_employees: null,
      max_legal_entities: null,
      storage_gb: 500,
      sms_credits_monthly: 20000,
    },
  },
];
