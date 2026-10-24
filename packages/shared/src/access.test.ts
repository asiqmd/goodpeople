import { describe, expect, it } from 'vitest';
import { resolveAccess, type AccessInput } from './access.js';
import { PLAN_CATALOG, type BillingMode } from './catalog.js';

const NOW = new Date('2026-10-24T06:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
const starter = PLAN_CATALOG.find((p) => p.code === 'starter')!;

function input(overrides: Partial<AccessInput> & { billingMode?: BillingMode } = {}): AccessInput {
  const { billingMode = 'paid', ...rest } = overrides;
  return {
    tenant: { status: 'active', billingMode, accessExpiresAt: null },
    plan: starter,
    subscription: null,
    grants: [],
    now: NOW,
    ...rest,
  };
}

describe('resolveAccess: subscription bypass', () => {
  it.each(['internal', 'complimentary', 'partner', 'license'] as const)(
    '%s tenants get full access with no subscription and never check one',
    (billingMode) => {
      const access = resolveAccess(input({ billingMode }));
      expect(access.accessState).toBe('full');
      expect(access.subscriptionChecked).toBe(false);
    },
  );

  it('ignores a lapsed subscription on a complimentary tenant', () => {
    const access = resolveAccess(
      input({
        billingMode: 'complimentary',
        subscription: { status: 'past_due', currentPeriodEnd: days(-90), graceDays: 7 },
      }),
    );
    expect(access).toMatchObject({ accessState: 'full', reason: 'complimentary' });
  });

  it.each([
    ['complimentary', 'complimentary_expired'],
    ['partner', 'partner_expired'],
    ['license', 'license_expired'],
    ['trial', 'trial_ended'],
  ] as const)('%s turns read-only once the admin-set expiry passes', (billingMode, reason) => {
    const tenant = { status: 'active' as const, billingMode, accessExpiresAt: days(-1) };
    expect(resolveAccess(input({ tenant }))).toMatchObject({ accessState: 'read_only', reason });
  });

  it('keeps complimentary access until the expiry date', () => {
    const tenant = {
      status: 'active' as const,
      billingMode: 'complimentary' as const,
      accessExpiresAt: days(10),
    };
    expect(resolveAccess(input({ tenant })).accessState).toBe('full');
  });

  it('never expires internal tenants, even with an expiry set', () => {
    const tenant = {
      status: 'active' as const,
      billingMode: 'internal' as const,
      accessExpiresAt: days(-365),
    };
    expect(resolveAccess(input({ tenant }))).toMatchObject({
      accessState: 'full',
      reason: 'internal',
    });
  });
});

describe('resolveAccess: paid tenants', () => {
  it('is read-only with no subscription at all', () => {
    expect(resolveAccess(input())).toMatchObject({
      accessState: 'read_only',
      reason: 'no_subscription',
      subscriptionChecked: true,
    });
  });

  it('is full while an active subscription is in its period', () => {
    const subscription = { status: 'active' as const, currentPeriodEnd: days(20), graceDays: 7 };
    expect(resolveAccess(input({ subscription }))).toMatchObject({
      accessState: 'full',
      reason: 'paid',
    });
  });

  it('keeps full access during the grace period after a failed payment', () => {
    const subscription = { status: 'past_due' as const, currentPeriodEnd: days(-3), graceDays: 7 };
    expect(resolveAccess(input({ subscription }))).toMatchObject({
      accessState: 'full',
      reason: 'payment_grace',
    });
  });

  it('turns read-only (never locked) after the grace period', () => {
    const subscription = { status: 'past_due' as const, currentPeriodEnd: days(-8), graceDays: 7 };
    expect(resolveAccess(input({ subscription }))).toMatchObject({
      accessState: 'read_only',
      reason: 'payment_overdue',
    });
  });

  it('honours the paid-through period of a cancelled subscription, then turns read-only', () => {
    const live = { status: 'canceled' as const, currentPeriodEnd: days(5), graceDays: 7 };
    const ended = { status: 'canceled' as const, currentPeriodEnd: days(-1), graceDays: 7 };
    expect(resolveAccess(input({ subscription: live })).accessState).toBe('full');
    expect(resolveAccess(input({ subscription: ended }))).toMatchObject({
      accessState: 'read_only',
      reason: 'subscription_ended',
    });
  });
});

describe('resolveAccess: tenant status overrides billing', () => {
  it.each(['suspended', 'archived'] as const)(
    '%s tenants are suspended, even internal ones',
    (status) => {
      const tenant = { status, billingMode: 'internal' as const, accessExpiresAt: null };
      expect(resolveAccess(input({ tenant }))).toMatchObject({
        accessState: 'suspended',
        reason: status,
      });
    },
  );

  it('an admin can force read-only on a tenant that would otherwise be full', () => {
    const tenant = {
      status: 'read_only' as const,
      billingMode: 'internal' as const,
      accessExpiresAt: null,
    };
    expect(resolveAccess(input({ tenant }))).toMatchObject({
      accessState: 'read_only',
      reason: 'read_only_by_admin',
    });
  });
});

describe('resolveAccess: entitlement grants', () => {
  it('adds a granted module on top of the plan while the grant is active', () => {
    const grants = [
      {
        kind: 'feature' as const,
        key: 'payroll',
        value: null,
        startsAt: days(-1),
        endsAt: days(30),
      },
    ];
    const access = resolveAccess(input({ billingMode: 'internal', grants }));
    expect(access.features).toContain('payroll');
    expect(access.features).toContain('core_hr');
  });

  it('drops a grant once it ends, and ignores grants not started yet', () => {
    const grants = [
      {
        kind: 'feature' as const,
        key: 'payroll',
        value: null,
        startsAt: days(-30),
        endsAt: days(-1),
      },
      { kind: 'feature' as const, key: 'lms', value: null, startsAt: days(1), endsAt: null },
    ];
    const access = resolveAccess(input({ billingMode: 'internal', grants }));
    expect(access.features).not.toContain('payroll');
    expect(access.features).not.toContain('lms');
  });

  it('only ever raises limits, and null means unlimited', () => {
    const grants = [
      { kind: 'limit' as const, key: 'max_employees', value: 10, startsAt: days(-1), endsAt: null },
      {
        kind: 'limit' as const,
        key: 'max_legal_entities',
        value: null,
        startsAt: days(-1),
        endsAt: null,
      },
    ];
    const { limits } = resolveAccess(input({ billingMode: 'internal', grants }));
    expect(limits.max_employees).toBe(starter.limits.max_employees);
    expect(limits.max_legal_entities).toBeNull();
  });

  it('applies admin limit overrides before grants: a cap holds until a grant raises it', () => {
    const enterprise = PLAN_CATALOG.find((p) => p.code === 'enterprise')!;
    const tenant = {
      status: 'active' as const,
      billingMode: 'complimentary' as const,
      accessExpiresAt: null,
      limitOverrides: { max_employees: 200 },
    };
    expect(resolveAccess(input({ tenant, plan: enterprise })).limits.max_employees).toBe(200);
    const grants = [
      {
        kind: 'limit' as const,
        key: 'max_employees',
        value: 300,
        startsAt: days(-1),
        endsAt: days(30),
      },
    ];
    expect(resolveAccess(input({ tenant, plan: enterprise, grants })).limits.max_employees).toBe(
      300,
    );
  });

  it('ignores unknown feature and limit keys', () => {
    const grants = [
      { kind: 'feature' as const, key: 'teleport', value: null, startsAt: days(-1), endsAt: null },
    ];
    expect(resolveAccess(input({ billingMode: 'internal', grants })).features).toEqual(
      starter.features,
    );
  });
});
