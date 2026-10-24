import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  type AccessState,
  type BillingMode,
  type FeatureKey,
  type LimitKey,
  type Limits,
  type SubscriptionStatus,
  type TenantStatus,
} from './catalog.js';

export type AccessReason =
  | 'internal'
  | 'complimentary'
  | 'complimentary_expired'
  | 'partner'
  | 'partner_expired'
  | 'license'
  | 'license_expired'
  | 'trial'
  | 'trial_ended'
  | 'paid'
  | 'payment_grace'
  | 'payment_overdue'
  | 'subscription_ended'
  | 'no_subscription'
  | 'read_only_by_admin'
  | 'suspended'
  | 'archived';

export interface AccessGrant {
  kind: 'feature' | 'limit';
  key: string;
  /** For limit grants: the new limit, or `null` for unlimited. Ignored for feature grants. */
  value: number | null;
  startsAt: Date;
  endsAt: Date | null;
}

export interface AccessInput {
  tenant: {
    status: TenantStatus;
    billingMode: BillingMode;
    accessExpiresAt: Date | null;
    /** Admin-set limits that replace the plan's (a cap or an increase). */
    limitOverrides?: Partial<Limits>;
  };
  plan: { features: readonly FeatureKey[]; limits: Limits };
  /** Only read for `paid` tenants. Bypassed tenants never look at it. */
  subscription: { status: SubscriptionStatus; currentPeriodEnd: Date; graceDays: number } | null;
  grants: readonly AccessGrant[];
  now: Date;
}

export interface Access {
  accessState: AccessState;
  reason: AccessReason;
  /** False for every billing mode except `paid`: the subscription bypass. */
  subscriptionChecked: boolean;
  features: FeatureKey[];
  limits: Limits;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const isExpired = (expiresAt: Date | null, now: Date) =>
  expiresAt !== null && now.getTime() >= expiresAt.getTime();

const isActiveGrant = (grant: AccessGrant, now: Date) =>
  grant.startsAt.getTime() <= now.getTime() && !isExpired(grant.endsAt, now);

function billingState(
  input: AccessInput,
): Pick<Access, 'accessState' | 'reason' | 'subscriptionChecked'> {
  const { tenant, subscription, now } = input;
  const byExpiry = (ok: AccessReason, expired: AccessReason) =>
    isExpired(tenant.accessExpiresAt, now)
      ? { accessState: 'read_only' as const, reason: expired, subscriptionChecked: false }
      : { accessState: 'full' as const, reason: ok, subscriptionChecked: false };

  switch (tenant.billingMode) {
    case 'internal':
      return { accessState: 'full', reason: 'internal', subscriptionChecked: false };
    case 'complimentary':
      return byExpiry('complimentary', 'complimentary_expired');
    case 'partner':
      return byExpiry('partner', 'partner_expired');
    case 'license':
      return byExpiry('license', 'license_expired');
    case 'trial':
      return byExpiry('trial', 'trial_ended');
    case 'paid': {
      if (!subscription) {
        return { accessState: 'read_only', reason: 'no_subscription', subscriptionChecked: true };
      }
      const periodEnd = subscription.currentPeriodEnd.getTime();
      const graceEnd = periodEnd + subscription.graceDays * DAY_MS;
      const t = now.getTime();
      if (subscription.status === 'canceled') {
        return t <= periodEnd
          ? { accessState: 'full', reason: 'paid', subscriptionChecked: true }
          : { accessState: 'read_only', reason: 'subscription_ended', subscriptionChecked: true };
      }
      if (subscription.status === 'active' && t <= periodEnd) {
        return { accessState: 'full', reason: 'paid', subscriptionChecked: true };
      }
      return t <= graceEnd
        ? { accessState: 'full', reason: 'payment_grace', subscriptionChecked: true }
        : { accessState: 'read_only', reason: 'payment_overdue', subscriptionChecked: true };
    }
  }
}

/** Grants only ever add: a limit grant wins when it is more generous than the plan. */
function moreGenerous(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.max(a, b);
}

/**
 * Decides what a tenant may do right now. Code elsewhere checks only the result,
 * never billing records, which is what lets a Super Admin bypass subscriptions.
 */
export function resolveAccess(input: AccessInput): Access {
  const { tenant, plan, grants, now } = input;
  const activeGrants = grants.filter((g) => isActiveGrant(g, now));

  const features = new Set<FeatureKey>(plan.features);
  const limits: Limits = { ...plan.limits };
  for (const key of LIMIT_KEYS) {
    const override = tenant.limitOverrides?.[key];
    if (override !== undefined) limits[key] = override;
  }
  for (const grant of activeGrants) {
    if (grant.kind === 'feature' && (FEATURE_KEYS as readonly string[]).includes(grant.key)) {
      features.add(grant.key as FeatureKey);
    }
    if (grant.kind === 'limit' && (LIMIT_KEYS as readonly string[]).includes(grant.key)) {
      const key = grant.key as LimitKey;
      limits[key] = moreGenerous(limits[key], grant.value);
    }
  }
  const resolved = { features: FEATURE_KEYS.filter((f) => features.has(f)), limits };

  if (tenant.status === 'suspended' || tenant.status === 'archived') {
    return {
      accessState: 'suspended',
      reason: tenant.status,
      subscriptionChecked: false,
      ...resolved,
    };
  }
  const billing = billingState(input);
  if (tenant.status === 'read_only' && billing.accessState === 'full') {
    return { ...billing, accessState: 'read_only', reason: 'read_only_by_admin', ...resolved };
  }
  return { ...billing, ...resolved };
}
