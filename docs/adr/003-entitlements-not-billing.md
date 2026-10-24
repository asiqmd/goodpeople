# ADR 003: Code checks entitlements, never billing (the subscription bypass)

**Status:** accepted · 2026-10-24

## Decision

`resolveAccess()` (`packages/shared/src/access.ts`) is the only place that turns a tenant's
billing situation into what it may do. It returns:

- `accessState`: `full`, `read_only` or `suspended`
- the enabled `features`
- the effective `limits`
- `subscriptionChecked`, which is false for every bypassed tenant

Guards (`AccessStateGuard`, `FeatureGuard` with `@RequireFeature`) and the UI read only that
result.

### How each billing mode resolves

| Billing mode    | Subscription read? | Access ends when                                  |
| --------------- | ------------------ | ------------------------------------------------- |
| `internal`      | never              | never                                             |
| `complimentary` | never              | admin-set expiry (optional)                       |
| `partner`       | never              | admin-set expiry (optional)                       |
| `license`       | never              | admin-set expiry (optional)                       |
| `trial`         | no                 | trial end                                         |
| `paid`          | yes                | grace period after the period end, then read-only |

### How features and limits combine

1. **Plan:** the starting set of features and limits.
2. **Tenant limit overrides:** an admin cap or raise, which replaces the plan's limit.
3. **Active time-boxed grants:** these only ever add.

### Rules that hold for every tenant

- Unpaid or expired tenants become read-only. Their data is never locked, and export
  always works.
- Billing webhooks write only to `subscriptions`, so they cannot affect a bypassed tenant.

## Why

- The founders must be able to assign any company (their own organizations, sponsored NGOs,
  pilots) with no checkout, invoice or dunning. Doing that with a flag scattered across
  modules would break as billing grows.
- One pure function is easy to test exhaustively (`access.test.ts` covers every mode,
  expiry, grace period, override and grant).

## Consequences

- Every bypass decision needs a reason and is written to the append-only platform audit log.
- Paid third-party usage (SMS) keeps quotas even for bypassed tenants.
- Maker-checker approval for large complimentary grants is planned. It is not built in Phase 0.
