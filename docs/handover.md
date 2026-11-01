# Picking up the work

Where Good People stands, how to get it running again, and what comes next. Last updated
1 November 2026, after Phase 4 M2.

## Where things stand

| Phase                             | Milestones                                                                                                    | Status       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------ |
| 0 Foundation                      | Tenancy with row-level security, auth, entitlements, Super Admin console with "Assign company"                | Done         |
| [1 Core HR](phases/phase-1.md)    | M1 org and employees · M2 rules, holidays and leave · M3 attendance · M4 lifecycle and documents · M5 go-live | Done         |
| [2 Payroll](phases/phase-2.md)    | M1 pay foundations · M2 runs and payslips · M3 tax, PF and bonuses · M4 settlement · M5 reports               | Done         |
| [3 Commercial](phases/phase-3.md) | M1 sign-up · M2 billing · M3 RMG pack · M4 NGO and group packs · M5 support and launch                        | Done         |
| [4 Talent](phases/phase-4.md)     | M1 recruitment · M2 performance                                                                               | Done         |
|                                   | **M3 compensation planning** · M4 learning · M5 engagement and employee services                              | **Next: M3** |
| 5 Enterprise and international    | SSO and SCIM, public API, self-hosted edition, UAE and KSA packs, SOC 2                                       | Not started  |
| 6 Intelligence and scale          | Analytics, AI assistant, anomaly detection                                                                    | Not started  |

Phases 5 and 6 are outlined in the
[product and delivery plan](https://claude.ai/artifact/DwMQ6zCwCRhwhUe6PbijCf); each gets its own
`docs/phases/phase-N.md` when it starts. The [README](../README.md) lists what each milestone
delivered.

## Branches

- **`main`:** the latest finished milestone. Today it is the same commit as `phase-4/talent`.
- **One branch per phase:** `phase-0/foundation` → `phase-1/core-hr` → `phase-2/payroll` →
  `phase-3/commercial` → `phase-4/talent`. Each starts where the one before ended, and each
  milestone is one commit named `Phase N Mx: …`.
- **Carrying on:** work on Phase 4 M3 on `phase-4/talent`. When a milestone is committed, move
  `main` up to it (`git checkout main && git merge --ff-only phase-4/talent`) and push both.

## Getting it running again

Follow [First run](../README.md#first-run) in the README: prerequisites, `.env`, the database,
the seed and the test accounts. Things that have caught us out:

- **`pnpm --filter @gp/db run <script>`:** keep the `run`. Without it, pnpm runs its own command
  of that name; `pnpm --filter @gp/db setup` once rewrote `~/.zshrc`.
- **Bringing the dev database up to date:** `pnpm db:migrate && pnpm --filter @gp/db provision`,
  then `pnpm db:seed` (it only adds what is missing). `pnpm db:reset` starts it clean; the
  browser walkthroughs leave their data behind (after M2, for example, a released half-year
  review and Mitu Begum's probation end moved to 18 November).
- **Port 3000 in use:** run the web app on another port with
  `pnpm --filter @gp/web exec next dev --port 3001`.
- **Disk space:** the tests build a test database and the web build caches; with only a few GB
  free they fail with "No space left on device". `.turbo` and `apps/web/.next` are safe to
  delete.
- **Seeded passwords** are for local use only; never use them anywhere else.

## How a milestone is built

Every milestone so far has followed the same steps, and the next ones should too:

1. **Design first:** write the milestone's section in its phase doc (scope, the rules with their
   legal references, who sees what) before writing code.
2. **Foundation:**
   - tables in a migration, row-level security in a second one (and the tables added to
     `RLS_TABLES` in `packages/db/src/schema/rls.ts`);
   - shared types and constants in `packages/shared`;
   - the permission, notification events and their EN/BN templates;
   - empty API modules, the navigation, and seed data for the walkthrough.
3. **Areas:** the API and web for each area, with unit tests next to the logic and an end-to-end
   spec in `apps/api/test`. Strings go in `apps/web/messages/en.json` and `bn.json`, in natural
   Bangla. A help article goes in `apps/web/content/help/{en,bn}`.
4. **The app:** the self-service parts in `apps/mobile`, with widget tests.
5. **Checks:** `pnpm lint && pnpm typecheck && pnpm test`, the API suite shuffled with a few
   seeds (`pnpm exec vitest run --sequence.shuffle --sequence.seed=<n>` in `apps/api`), and
   `flutter analyze && flutter test` in `apps/mobile`.
6. **Walkthrough:** in the browser, in English and Bangla, as the seeded people who use it.
7. **Docs:**
   - the phase doc's "Done when", "Checked" and "Carried";
   - an ADR for the milestone's main decisions;
   - the README's Done and Next;
   - the go-live checklist.
8. **One commit** for the milestone.

**Conventions to keep:**

- **Isolation:** tenant data is isolated by row-level security ([ADR 002](adr/002-rls-tenancy.md)).
- **Features, not payment:** code checks a tenant's features, never its payment
  ([ADR 003](adr/003-entitlements-not-billing.md)).
- **Statutory rules** are effective-dated configuration ([ADR 004](adr/004-effective-dated-rules.md)).
- **Reads never write:** a GET computes what it shows, and jobs or writes store it, because the
  support role's read-only access checks only the HTTP method.
- **Relationship access:** "is this my report?" is checked in the service, which answers "not
  found" to anyone else.
- **Pay changes** always go through payroll's maker-checker.
- **Tests** create their own data and pass in any order and on any date.

## Next: Phase 4 M3, compensation planning

From the [Phase 4 outline](phases/phase-4.md#later-milestones-outline-detailed-when-each-starts):

- **Increments** by rating and position in the grade's range (an increment matrix);
- **budgets** per company and unit;
- **managers' proposals**, then approval;
- **pay changes** that reach payroll, effective-dated, through its maker-checker;
- **the RMG wage board's annual increment.**

**What it builds on:**

- **M2's outcomes:** released reviews' final ratings and recommendations
  (`GET /tenant/performance/outcomes`, and the CSV on a released cycle's page). Only released
  reviews count.
- **Phase 2's pay:** salary structures and grades, pay changes and their approval.
- **Phase 3's RMG pack:** minimum wage grades.

**Start** by writing the M3 section of [phase-4.md](phases/phase-4.md). With Claude Code, open
this folder and say "Start Phase 4 M3 (compensation planning)".

## Waiting on people outside the code

These need a person's sign-off before the matching feature is relied on in production:

- **Labour lawyer:**
  - the RMG pack's rules marked for review ([Phase 3 M3](phases/phase-3.md#m3-rmg-pack));
  - the improvement plan's legal note, s.23–24 and s.26
    ([Phase 4 M2](phases/phase-4.md#improvement-plans)).
- **Tax consultant:** the VAT service code, before the first real invoice
  ([Phase 3 M2](phases/phase-3.md#m2-billing--invoicing)).
- **Counsel:**
  - the Foreign Donations Act rules ([Phase 3 M4](phases/phase-3.md#m4-ngo--group-packs));
  - the legal pages;
  - the recruitment consent text and retention period
    ([Phase 4 M1](phases/phase-4.md#m1-recruitment)).
- **Payment providers:** SSLCommerz and bKash tried in their sandboxes.
- **Launch gates:** a third-party penetration test ([scope](security/pentest-scope.md)) and a
  restore drill on production backups ([launch runbook](ops/launch.md)).
- **Going live:** our own organisations follow [go-live.md](ops/go-live.md).

## Known gaps

Each milestone's "Carried" list in its phase doc says what was left for later and why. The
latest, from [Phase 4 M2](phases/phase-4.md#checked-1), includes:

- **Paper acknowledgement:** workers without logins cannot acknowledge a plan or review, and
  a signed paper copy cannot be recorded yet.
- **Declining peer feedback:** peers cannot decline a request.
