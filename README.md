# Good People

A multi-tenant HR and payroll platform, built for Bangladesh first and ready to grow abroad.

**Picking this up later?** Start with [docs/handover.md](docs/handover.md): where things stand,
how to get it running again, how a milestone is built, and what comes next.

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
  - **Phase 2 M4 (settlement, gratuity & disbursement):** final settlement runs for every
    separation type under the 2025/26 amendments (notice, earned leave, gratuity or the
    separation's benefit, loans, the provident fund paid out); a monthly gratuity provision;
    the workers' participation fund with tax at source; split payments, bank and wallet
    files, a Form 38 cash sheet, the bank advice and a journal by cost centre.
  - **Phase 2 M5 (reports & parallel runs):** the payroll register and the Labour Rules'
    wage (Form 38), overtime (Form 34) and advances (Form 40) registers; the quarterly
    withholding statement (s.177) and the fund's year; what each month cost by unit, company,
    site or pay group; comparing a run with the current payroll's sheet to the taka, with
    three matched months as the go-live test; hand-worked golden tests; and matching the
    bank's returns.
  - **Phase 3 M1 (sign-up & onboarding):** a public home and pricing page in English and
    Bangla; self-serve sign-up with an emailed code that creates a 30-day trial workspace;
    starting organisations for RMG, corporate, NGO and group companies; a first-steps guide
    and trial banner; and the sign-up funnel in the platform console.
  - **Phase 3 M2 (billing & invoicing):** prices per staff and worker seat; plans chosen in
    the workspace with coupons; monthly invoices in arrears as Mushak-6.3 VAT invoices and
    6.7 credit notes in English and Bangla; payment by SSLCommerz, bKash, bank transfer or
    cheque (matched from a statement); VAT and income tax withheld by customers with their
    certificates; reminders, then read-only until paid; trial reminders; and partner
    billing.
  - **Phase 3 M3 (RMG pack):** piece rates and production incentives entered by line and
    paid through payroll above the minimum wage; working-time alerts for adults,
    adolescents, women at night and the company's overtime caps; adolescents' certificates
    of fitness; maternity benefit cases paid at the Act's average wage; participation,
    safety and complaint committees and trade unions with check-off; an anonymous grievance
    channel with a QR poster; worker kiosks with ID-card QR codes and PINs set by SMS; and a
    buyer audit report in English and Bangla.
  - **Phase 3 M4 (NGO & group packs):** donors and projects with their FD-6 approvals; each
    person's salary split across projects, planned and then by approved monthly
    timesheets (offline in the app for field staff), in the journal, the cost reports and
    a donor personnel cost schedule with the Foreign Donations Act's 20% administration
    cap; a group dashboard across companies; group policy that a company may override
    (leave, app punching, provident fund, overtime caps) above the law's floors; and HR
    logins limited to some of the group's companies.
  - **Phase 3 M5 (support & launch hardening):** support tickets with response targets by
    plan counted in support hours, and an error reference on every error; read-only support
    access that a workspace admin grants for up to seven days, with every page opened in its
    audit log; a status page with our own checks every minute, incidents and maintenance in
    English and Bangla, and `/ready`; backups and restore drills recorded on an Operations
    page; a help centre of 17 articles and draft legal pages in both languages, with the
    accepted terms recorded at sign-up; request IDs and JSON logs; fixes from our own
    security review; a restore drill of a 20,000-person workspace; and the launch runbook.
  - **Phase 4 M1 (recruitment):** openings approved against a budget; a careers page per
    workspace in English and Bangla with Google-ready job posts and applications with CVs and
    consent; a pipeline by stage with candidates found again by email or mobile; interviews
    with calendar invitations and independent scorecards (web and app); offers approved above
    budget, accepted online with a kept, hashed letter, and hired into the employee record with
    their documents and a pay proposal; candidates erased after the workspace's retention
    period.
  - **Phase 4 M2 (performance):** goals agreed with managers, weighted to 100%, with KPIs read
    from attendance and daily production; review cycles with self reviews (managers alone for
    workers without logins), peer feedback shown only together and from at least three, and
    manager reviews with recommendations; calibration against a guide that is never a quota;
    released reviews acknowledged and never changed, with outcomes for the increment round;
    improvement plans and probation reviews on record (web and app).
  - **Phase 4 M3 (compensation planning):** increment rounds from released ratings and grade
    ranges, company and unit budgets, direct managers' reasoned proposals, encrypted pay
    snapshots, and atomic submission into payroll's maker-checker; an independent,
    effective-dated RMG annual basic increment floor, with English and Bangla web screens.
  - **Phase 4 M4 (learning):** bilingual courses and scheduled sessions, capacity-checked
    enrolment, HR attendance and numbered completion records with expiry and EN/BN PDFs;
    effective-dated required training by designation, direct-report coverage, session/expiry
    reminders, fire drills and the buyer-audit training section. Employees use Learning on
    web and mobile; HR manages it on the web.
  - **Phase 4 M5 (engagement and employee services):** anonymous survey/eNPS aggregates with
    frozen cohorts and a minimum of five responses, company recognition, bilingual announcements
    and policy receipts, encrypted private HR requests with internal notes and scoped handlers,
    and asset issue/receipt/return history. Employees use web and mobile; HR manages on web.
  - **Phase 5 M1 (identity and access):** live session/current-user authorization, explicit
    custom company grants and sensitive-field controls; Redis-backed atomic security state;
    EN/BN administration; OIDC web/mobile sign-in and SCIM login/group provisioning with
    protected emergency recovery. Implemented locally; real-provider activation remains
    gated. See [M1's record](docs/phases/phase-5.md#m1-implementation-record) and the
    [identity runbook](docs/ops/identity.md). Historical payroll requires all-company access;
    M2 below replaces the former timer-runner mechanism.
  - **Phase 5 M2 (public API and integrations):** owner-bounded machine clients, separate
    OAuth client credentials, versioned read-only organisation/directory/attendance APIs,
    signed reference-only webhooks with replay/rotation and durable fenced workers. EN/BN
    administration and queue/worker health are implemented locally. See the
    [M2 record](docs/phases/phase-5.md#m2-implementation-record),
    [public contract](docs/api/public-v1.openapi.json) and [runbook](docs/ops/integrations.md).
  - **Phase 5 M3 (self-hosted enterprise):** a local candidate with signed offline installation-bound licensing, one-use named MFA activation, isolated install/placement boundaries, encrypted joint recovery and credential reconciliation, historical read keys, signed image-bundle tooling and an offline operator/support contract. See [M3's record](docs/phases/phase-5.md#m3-implementation-record) and the [operator runbook](infra/enterprise/README.md). Docker/Linux clean-host, offline and physical cross-host qualification remain open; no commercial release was published.
  - **Phase 6 M1 (analytics foundations):** local versioned headcount, joiners and completed leavers with current company/relationship authorization, effective-history quality states, site clocks and source provenance. Explicit feature activation preserves existing plans/licenses. EN/BN and Arabic preview are checked. See [M1's record](docs/phases/phase-6.md#m1-implementation-record) and [ADR 032](docs/adr/032-workforce-analytics.md).
  - **Phase 6 M2 operating and financial insight** adds closed-month operating reports, reconciled locked payroll cost and encrypted CSV jobs. [M2 implementation record](docs/phases/phase-6.md#m2-implementation-record)
  - **Phase 6 M3 read-only workspace assistant** adds approved help and policy excerpts, scoped report explanations and citations that verify current access and source versions. [M3 implementation record](docs/phases/phase-6.md#m3-implementation-record)
  - **Phase 6 M4 explainable anomaly review** adds four deterministic checks, scoped evidence, assignment and source-verified resolution. [M4 implementation record](docs/phases/phase-6.md#m4-implementation-record)
- **Next:**
  - **Phase 6 M5 scale and enterprise release** has local workload, worker takeover, rollback and recovery evidence. Production qualification is pending. [M5 local qualification record](docs/phases/m5-scale-release-review.md)
  - Our own organisations go live: [docs/ops/go-live.md](docs/ops/go-live.md).
  - Payroll goes live after three parallel months with a design partner:
    [docs/ops/go-live.md](docs/ops/go-live.md#5-payroll-go-live-phase-2).
  - Before the first real invoice: the tax consultant's sign-off on the VAT service code,
    and SSLCommerz and bKash tried in their sandboxes
    ([docs/phases/phase-3.md](docs/phases/phase-3.md#m2-billing--invoicing)).
  - Before factories rely on the RMG pack: the labour lawyer's sign-off on the rules marked
    for review ([docs/phases/phase-3.md](docs/phases/phase-3.md#m3-rmg-pack)).
  - Before an NGO relies on the pack: counsel's sign-off on the Foreign Donations Act rules
    marked for review ([docs/phases/phase-3.md](docs/phases/phase-3.md#m4-ngo--group-packs)).
  - Launch: the gates in [docs/ops/launch.md](docs/ops/launch.md), above all counsel's
    sign-off on the legal pages, the third-party penetration test
    ([docs/security/pentest-scope.md](docs/security/pentest-scope.md)) and a restore drill on
    the production backups.
  - Before HR relies on improvement plans: the labour lawyer's confirmation of the plan's
    legal note ([docs/phases/phase-4.md](docs/phases/phase-4.md#improvement-plans)).
  - Before RMG annual increments are relied on: labour counsel confirms the increment rule
    and eligibility, including prior increases recorded outside planning rounds.
  - **Phase 5 M4 (international foundations):** a local candidate with dated employer/cohort profiles, explicit currency/calendar/zone boundaries, encrypted international identifiers and bank metadata, foreign HR records, Arabic RTL/font preview, and a gated USD/AED candidate price book. AE/SA statutory packs, Hijri conversion, full Arabic/legal review and real merchant checkout remain unqualified. See [M4’s record](docs/phases/phase-5.md#m4-implementation-record). M5 now has a local candidate below. M1–M3 external gates carry forward.
  - **Phase 5 M5 (UAE):** a local preview/evidence candidate with dated MOHRE coverage, distinct expatriate/GPSSA cohorts, exact AED payroll/leave/settlement examples, immutable encrypted comparisons and a non-uploadable WPS sandbox. Original/local rule review, real pilot and bank acceptance, EN/AR legal documents and actual consumer activation remain open. See [M5’s record](docs/phases/phase-5.md#m5-implementation-record) and [the review dossier](docs/phases/m5-uae-review.md). M6 now also has a local candidate below.
  - **Phase 5 M6 (Saudi Arabia):** a separate local SAR preview/evidence candidate with explicit GOSI legacy/new/hazards-only histories, a dated contribution-rate change, Saudi leave/resignation settlement examples and an internal non-uploadable WPS reconciliation sandbox. Original/local review, real pilot and bank/sealed-Mudad acceptance, EN/AR statutory documents and country-consumer activation remain open. See [M6's record](docs/phases/phase-5.md#m6-implementation-record) and [the review dossier](docs/phases/m6-saudi-review.md). M7 now supplies local readiness engineering below.
  - **Phase 5 M7 (assurance and enterprise release):** a restricted Super Admin/MFA readiness console with named-owner controls, encrypted immutable evidence, independent review, findings/exceptions/report metadata, observed operational blockers and source-bound release qualification. The actual program remains blocked by unassigned owners, overdue backup, two moderate dependencies and external qualifications. No CPA report, commercial release or foreign-country activation is asserted. See [M7's record](docs/phases/phase-5.md#m7-implementation-record), [ADR 030](docs/adr/030-assurance-and-enterprise-release.md) and [the closure dossier](docs/phases/m7-assurance-review.md).

Local acceptance tests now need Redis as well as PostgreSQL. The Docker development stack
provides Redis on 6379; set TEST_REDIS_URL=redis://127.0.0.1:6379 when running pnpm test.
Without that override the identity suite uses loopback port 6381 (the CI mapping). Production
requires private authenticated persistent Redis; memory state is development-only.

## Repository layout

```
apps/
  api/       NestJS 12 (ESM) modular monolith: auth, tenancy, entitlements, platform admin, org,
             employees, leave, attendance, approvals, documents, lifecycle, letters, imports,
             accounts and users, notifications, setup checklist, payroll, sign-up, billing,
             production, compliance, maternity, relations, grievances, kiosk, audit report,
             projects, timesheets, group, access scopes, support, support access, status,
             recruitment, applications, offers, goals, reviews, development, compensation, learning
  web/       Next.js 16: Super Admin console (/platform) and workspace app (/workspace), en/bn;
             public home, pricing, sign-up, /help, /legal and /status; help and legal texts in
             content/
  mobile/    Flutter app: sign-in (password or SMS code), profile, documents, leave, attendance
             (location and selfie punching, offline queue), resignation, approvals, team view,
             notifications and push, my pay (payslips, tax, provident fund, loans), interviews
             and scorecards, performance (goals, reviews, peer feedback), en/bn
  edge-agent/  On-site service that buffers ZKTeco and Hikvision punches (see its README)
packages/
  shared/    Contract shared by API and web: billing modes, plans, resolveAccess(), zod schemas
  country-packs/  Statutory rules per country (Bangladesh first), each with legal references
  db/        Drizzle schema, SQL migrations (incl. RLS), setup/migrate/seed scripts
  config/    Shared TypeScript config
docs/handover.md  Where things stand and how to carry on
docs/phases/ Each phase's design, what was checked and what was carried over
docs/adr/    Architecture decisions
docs/ops/    Production runbook, go-live checklist, launch runbook and restore drills
docs/security/ Our security review and the penetration test's scope
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

| Who                                                                                                                 | Sign in at        | Workspace       | Email                        |
| ------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------- | ---------------------------- |
| Super Admin                                                                                                         | `/platform/login` | –               | `SEED_SUPER_ADMIN_EMAIL`     |
| Internal tenant (2 legal entities)                                                                                  | `/login`          | `my-group`      | `admin@my-group.test`        |
| Employee self-service (Rahima)                                                                                      | `/login`          | `my-group`      | `rahima@my-group.test`       |
| Line supervisor, approves leave and attendance corrections; hiring manager and interviewer for the sewing operators | `/login`          | `my-group`      | `shirin@my-group.test`       |
| Finance officer, approves pay changes                                                                               | `/login`          | `my-group`      | `finance@my-group.test`      |
| Complimentary tenant, an NGO with two donor projects                                                                | `/login`          | `sponsored-ngo` | `admin@sponsored-ngo.test`   |
| NGO field facilitator, fills in her timesheet                                                                       | `/login`          | `sponsored-ngo` | `nasrin@sponsored-ngo.test`  |
| NGO programme coordinator, approves timesheets                                                                      | `/login`          | `sponsored-ngo` | `karim@sponsored-ngo.test`   |
| NGO finance officer, approves payroll                                                                               | `/login`          | `sponsored-ngo` | `finance@sponsored-ngo.test` |
| Paid, payment overdue → read-only                                                                                   | `/login`          | `acme-garments` | `admin@acme-garments.test`   |
| Trial on the Starter plan                                                                                           | `/login`          | `trial-co`      | `admin@trial-co.test`        |

Run `BACKGROUND_JOBS=on pnpm worker` in another terminal after building. The API never schedules
jobs. In development, queued email, SMS and push are written to the worker's log (`EMAIL_DRIVER=log` and so
on), so a sign-in code for an employee login with a mobile number shows up there.

The seed tracks attendance from 1 October 2026, with device punches for 1–23 October:
the Gazipur factory on the day shift, Narayanganj on a day/night roster, the head office
punching from the web. Device user 1010 is left unmatched on purpose, to try claiming it.
The NGO has seven people at its head office and Kurigram field office, planned shares in
two projects, and an approved September timesheet whose hours differ from the plan.
My Group also has an open sewing operator job with candidates (recruitment), a released annual
review, a half-year review cycle under way with Rahima's agreed goals (performance), and a
draft compensation round for December 2026. Learning has three demo courses: Rahima has a
current fire-safety record, an expired health-and-safety record and an upcoming harassment-
prevention session; HR sees required-training gaps and a recorded drill. Browser walkthroughs may leave submitted rounds
and approved future demo pay changes in the local database.

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
