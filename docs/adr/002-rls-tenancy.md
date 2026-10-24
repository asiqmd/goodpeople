# ADR 002: Shared database, tenant isolation by PostgreSQL row-level security

**Status:** accepted · 2026-10-24

## Decision

- **One schema, shared by all tenants.** Every tenant-scoped table has a `tenant_id` and a
  `tenant_isolation` policy that compares it to the `app.tenant_id` setting
  (`packages/db/migrations/0001_rls.sql`).
- **The setting is per transaction.** `runAsTenant()` / `TenantDb.run()` set it for the
  length of one transaction. Without it, tenant tables return nothing.
- **Two database roles.** The API connects as `gp_app`, which has no `BYPASSRLS` and cannot
  create tables. Migrations and seeds run as `gp_owner`. `FORCE ROW LEVEL SECURITY` applies
  the policy to the owner too.
- **Platform tables are separate.** `tenants`, `plans`, `subscriptions`, grants, audit and
  sessions hold no tenant data and have no RLS. Only the platform-admin, auth and
  entitlements modules read them.

## Why

- A missed `where tenant_id = …` in application code cannot leak data: the database
  refuses. Code review is not the only safeguard.
- Isolation is tested directly against the database: `apps/api/test/tenant-isolation.e2e-spec.ts`
  checks that no table with tenant data is missing RLS.
- It keeps the option open to move a large tenant to its own database (Enterprise tier)
  without changing queries.

## Consequences

- New tenant tables must be added to `RLS_TABLES` and get a policy in a migration. The
  isolation test fails otherwise.
- Cross-tenant reporting for platform staff goes through platform tables or an explicit
  owner-role job, never through the app role.
