# Good People

A multi-tenant HR and payroll platform, built for Bangladesh first and ready to grow abroad.

- **Product and delivery plan:** [Good People plan (Claude Doc)](https://claude.ai/artifact/DwMQ6zCwCRhwhUe6PbijCf)
- **Current state:** Phase 0 (foundation). This covers tenancy with row-level security, auth,
  entitlements, the Super Admin console with **"Assign company" (subscription bypass)**, an
  English/Bangla web app and a Flutter app shell.
- **Not built yet:** HR modules (employees, attendance, leave, payroll). They arrive in Phases 1–2.

## Repository layout

```
apps/
  api/       NestJS 12 (ESM) modular monolith: auth, tenancy, entitlements, platform admin
  web/       Next.js 16: Super Admin console (/platform) and workspace app (/workspace), en/bn
  mobile/    Flutter app: workspace sign-in and home, en/bn (see apps/mobile/README.md)
packages/
  shared/    Contract shared by API and web: billing modes, plans, resolveAccess(), zod schemas
  db/        Drizzle schema, SQL migrations (incl. RLS), setup/migrate/seed scripts
  config/    Shared TypeScript config
docs/adr/    Architecture decisions
infra/       Docker Compose for local services (optional)
```

## Prerequisites

- **Node 24** (`.nvmrc`), with pnpm via `corepack enable pnpm`.
- **PostgreSQL 17**, either way:
  - Homebrew: `brew install postgresql@17 && brew services start postgresql@17`
  - Docker: `docker compose -f infra/docker-compose.yml up -d`
- **Flutter 3.47+**, for `apps/mobile` only.

## First run

```bash
cp .env.example .env        # Homebrew: set DATABASE_ADMIN_URL to postgres://<your-mac-user>@localhost:5432/postgres
pnpm install
pnpm db:setup               # creates roles gp_owner and gp_app, and databases good_people and good_people_test
pnpm db:reset               # migrates and seeds the dev database
pnpm build
```

Then start the API (http://localhost:4000, docs at `/docs`) and the web app (http://localhost:3000):

```bash
pnpm --filter @gp/api start
pnpm --filter @gp/web dev
```

**Seeded test accounts** (local only; the password is `SEED_PASSWORD` in `.env`):

| Who                                | Sign in at        | Workspace       | Email                      |
| ---------------------------------- | ----------------- | --------------- | -------------------------- |
| Super Admin                        | `/platform/login` | –               | `SEED_SUPER_ADMIN_EMAIL`   |
| Internal tenant (2 legal entities) | `/login`          | `my-group`      | `admin@my-group.test`      |
| Complimentary tenant               | `/login`          | `sponsored-ngo` | `admin@sponsored-ngo.test` |
| Paid, payment overdue → read-only  | `/login`          | `acme-garments` | `admin@acme-garments.test` |
| Trial on the Starter plan          | `/login`          | `trial-co`      | `admin@trial-co.test`      |

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test     # unit tests and API end-to-end tests (rebuild good_people_test)
cd apps/mobile && flutter analyze && flutter test
```

## How the subscription bypass works

The API never checks payment status directly:

- `resolveAccess()` in `packages/shared/src/access.ts` turns a tenant's billing mode, plan,
  limit overrides, grants and (for `paid` only) subscription into one result:
  `accessState` (`full`, `read_only` or `suspended`), the features and the limits.
- Guards read only that result.
- A Super Admin uses **Assign company** to create a tenant as `complimentary` or `internal`.
  That tenant is never asked for a subscription.
- Every assignment, billing change and grant needs a reason and lands in an append-only
  audit log.

See [ADR 003](docs/adr/003-entitlements-not-billing.md).

## Tenant isolation

Tenant data lives in shared tables protected by PostgreSQL row-level security:

- The API connects as a role that cannot bypass it.
- Tenant queries run inside `runAsTenant()`, which scopes the transaction.
- `apps/api/test/tenant-isolation.e2e-spec.ts` fails if any new table with tenant data lacks
  forced RLS.

See [ADR 002](docs/adr/002-rls-tenancy.md).

## Mobile API client

`pnpm --filter @gp/api openapi` writes `apps/api/openapi.json`. Then
`apps/mobile/tool/gen_api.sh` generates a typed Dart client for the workspace endpoints.
It uses pure Dart, so Java is not needed.
