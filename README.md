# Good People

A multi-tenant HR and payroll platform, built for Bangladesh first and ready to grow abroad.

- **Product and delivery plan:** [Good People plan (Claude Doc)](https://claude.ai/artifact/DwMQ6zCwCRhwhUe6PbijCf)
- **Done:**
  - **Phase 0 (foundation):** tenancy with row-level security, auth, entitlements, and the Super
    Admin console with **"Assign company" (subscription bypass)**.
  - **Phase 1 M1 (org & employees):** legal entities, locations and units, the employee master
    with Bangladesh fields, encrypted identity and account numbers, effective-dated job history,
    nominees, payment accounts and self-service profile. It works in web and mobile, in English
    and Bangla.
  - **Phase 1 M2 (rules, holidays & leave):** a Bangladesh rules engine with legal references
    and review status, holiday calendars with tentative lunar dates, leave types, computed
    balances, requests with manager → HR approvals, and a team calendar.
  - **Phase 1 M3 (attendance):** shifts and rotating rosters, punches from ZKTeco and
    Hikvision devices through the on-site Edge Agent, geofenced punching from web and mobile,
    daily processing (late, early out, overtime, absence) under the Labour Act's working
    hours, and corrections approved in the same inbox as leave.
  - **Phase 1 M4 (lifecycle & documents):** probation by the Labour Act, separations with
    statutory notice (employees resign through approvals), back-dated job changes, an
    encrypted documents vault, English and Bangla letters, ID cards and service books as PDFs,
    Excel bulk import, and selfie punches.
  - **Phase 1 M5 (notifications, self-service & go-live):** role templates with permissions,
    workspace logins, sign-in by SMS code for employees and two-step sign-in for admins, an
    inbox with email, SMS and push in English and Bangla, forms that keep what was typed,
    security headers and rate limits, a measured 5,000-employee workspace, a production
    deployment kit, and the go-live checklist. The mobile app gains a team view, push and an
    offline punch queue.
  - **Phase 2 M1 (pay foundations):** pay components and a safe formula engine, salary
    structures with a live preview, the 2023 RMG minimum wage table, pay groups, and encrypted
    employee pay changed through maker-checker in the Approvals inbox.
  - **Phase 2 M2 (payroll runs & payslips):** monthly runs from processed attendance and
    leave (proration, overtime, absence), review against last month, maker-checker locking,
    adjustment runs, the s.123 payment deadline, and English and Bangla payslips by web,
    app, email and SMS, measured at 20,000 employees.
  - **Phase 2 M3 (tax, provident fund & bonuses):** salary tax projected each month under the
    2025-26 and 2026-27 rules with investment declarations, certificates and challans; a
    provident fund ledger with interest, fund loans and vesting; advances and loans through
    maker-checker; festival bonus runs by religion; and annual increments in one approval.
- **Next:**
  - Our own organisations go live: [docs/ops/go-live.md](docs/ops/go-live.md).
  - Phase 2 M4: settlement, gratuity and disbursement. The plan is in
    [docs/phases/phase-2.md](docs/phases/phase-2.md).

## Repository layout

```
apps/
  api/       NestJS 12 (ESM) modular monolith: auth, tenancy, entitlements, platform admin, org,
             employees, leave, attendance, approvals, documents, lifecycle, letters, imports,
             accounts and users, notifications, setup checklist, payroll
  web/       Next.js 16: Super Admin console (/platform) and workspace app (/workspace), en/bn
  mobile/    Flutter app: sign-in (password or SMS code), profile, documents, leave, attendance
             (location and selfie punching, offline queue), resignation, approvals, team view,
             notifications and push, my pay (payslips, tax, provident fund, loans), en/bn
  edge-agent/  On-site service that buffers ZKTeco and Hikvision punches (see its README)
packages/
  shared/    Contract shared by API and web: billing modes, plans, resolveAccess(), zod schemas
  country-packs/  Statutory rules per country (Bangladesh first), each with legal references
  db/        Drizzle schema, SQL migrations (incl. RLS), setup/migrate/seed scripts
  config/    Shared TypeScript config
docs/adr/    Architecture decisions
docs/ops/    Production runbook and the go-live checklist
infra/       Docker Compose for local services, and the production stack (Caddy, backups)
```

## Prerequisites

- **Node 24** (`.nvmrc`), with pnpm via `corepack enable pnpm`.
- **PostgreSQL 17**, either way:
  - Homebrew: `brew install postgresql@17 && brew services start postgresql@17`
  - Docker: `docker compose -f infra/docker-compose.yml up -d`
- **Flutter 3.47+**, for `apps/mobile` only.
- **Chrome or Chromium**, for letters, ID cards and service books (PDF). Found automatically
  where it is usually installed; on servers set `CHROME_PATH`.

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

| Who                                                        | Sign in at        | Workspace       | Email                      |
| ---------------------------------------------------------- | ----------------- | --------------- | -------------------------- |
| Super Admin                                                | `/platform/login` | –               | `SEED_SUPER_ADMIN_EMAIL`   |
| Internal tenant (2 legal entities)                         | `/login`          | `my-group`      | `admin@my-group.test`      |
| Employee self-service (Rahima)                             | `/login`          | `my-group`      | `rahima@my-group.test`     |
| Line supervisor, approves leave and attendance corrections | `/login`          | `my-group`      | `shirin@my-group.test`     |
| Finance officer, approves pay changes                      | `/login`          | `my-group`      | `finance@my-group.test`    |
| Complimentary tenant                                       | `/login`          | `sponsored-ngo` | `admin@sponsored-ngo.test` |
| Paid, payment overdue → read-only                          | `/login`          | `acme-garments` | `admin@acme-garments.test` |
| Trial on the Starter plan                                  | `/login`          | `trial-co`      | `admin@trial-co.test`      |

In development, email, SMS and push are written to the API's log (`EMAIL_DRIVER=log` and so
on), so a sign-in code for an employee login with a mobile number shows up there.

The seed tracks attendance from 1 October 2026, with device punches for 1–23 October:
the Gazipur factory on the day shift, Narayanganj on a day/night roster, the head office
punching from the web. Device user 1010 is left unmatched on purpose, to try claiming it.

After pulling changes that add country-pack defaults (Phase 2 payroll, for example), bring an
existing dev database up to date with `pnpm db:migrate && pnpm --filter @gp/db provision`, then
`pnpm db:seed` to fill in seed data added since (it only adds what is missing).

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test     # unit tests and API end-to-end tests (rebuild good_people_test)
cd apps/mobile && flutter analyze && flutter test
```

`pnpm test` includes the Edge Agent's tests.

**At scale:** `pnpm --filter @gp/db seed:scale` adds a `scale-test` workspace with 5,000
employees, a month of punches and approved pay; `SEED_PASSWORD=… node apps/api/scripts/measure-scale.mjs`
then times the busiest API calls against it. For payroll, seed `SCALE_SLUG=scale-20k
SCALE_EMPLOYEES=20000` the same way and run
`SEED_PASSWORD=… node apps/api/scripts/measure-payroll.mjs scale-20k`; it processes the month,
computes, pages through, locks and publishes a run (with `FISCAL_YEAR=1` it first locks the
year's earlier months, so tax reads a full year so far).

## Production

[docs/ops/runbook.md](docs/ops/runbook.md) installs the Docker stack in `infra/` (Caddy with
TLS, the API, the web app, backups), creates the first super admin without demo data
(`create-super-admin`), and covers upgrades and restores.

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
