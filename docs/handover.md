# Picking up the work

Where Good People stands, how to get it running again, and what comes next. Last updated
3 November 2026, after Phase 6 M3. The local application runs 6.3.0-local with schema 0072. Phase 4 M3–M5, Phase 5 M1-M7 and Phase 6 M1-M3 are implemented locally and uncommitted.

## Where things stand

| Phase                                               | Milestones                                                                                                                              | Status                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 0 Foundation                                        | Tenancy with row-level security, auth, entitlements, Super Admin console with "Assign company"                                          | Done                               |
| [1 Core HR](phases/phase-1.md)                      | M1 org and employees · M2 rules, holidays and leave · M3 attendance · M4 lifecycle and documents · M5 go-live                           | Done                               |
| [2 Payroll](phases/phase-2.md)                      | M1 pay foundations · M2 runs and payslips · M3 tax, PF and bonuses · M4 settlement · M5 reports                                         | Done                               |
| [3 Commercial](phases/phase-3.md)                   | M1 sign-up · M2 billing · M3 RMG pack · M4 NGO and group packs · M5 support and launch                                                  | Done                               |
| [4 Talent](phases/phase-4.md)                       | M1 recruitment · M2 performance · M3 compensation · M4 learning · M5 engagement and employee services                                   | Done                               |
| [5 Enterprise and international](phases/phase-5.md) | M1 identity/access · M2 integrations · M3 self-hosting · M4 international foundations/billing · M5 UAE · M6 Saudi Arabia · M7 assurance | M1-M7 local; qualification pending |
| [6 Intelligence and scale](phases/phase-6.md)       | M1 analytics foundations; M2 operating/financial insight; M3 read-only assistant; M4 anomaly review; M5 scale qualification             | M1-M3 local, M4 next               |

Phase 5's scope, dependencies, architecture, acceptance checks and pilot release gates are in
[its design and implementation records](phases/phase-5.md#m2-implementation-record). M1-M7 are local; provider/receiver, Linux/offline/cross-host, Arabic and merchant qualification remain pending. Phase 6 has a [repository-grounded design and local M1 record](phases/phase-6.md#m1-implementation-record); the original external product-plan artifact remains unavailable.
The [README](../README.md) lists what each implemented milestone delivered.

## Branches

- **`main`:** the last committed feature milestone is Phase 4 M2. M3, M4 and M5 are implemented locally in the
  current `phase-4/talent` checkout, alongside Phase 5 M1-M7 and Phase 6 M1-M2, with local changes uncommitted for review.
- **One branch per phase:** `phase-0/foundation` → `phase-1/core-hr` → `phase-2/payroll` →
  `phase-3/commercial` → `phase-4/talent`. Each starts where the one before ended, and each
  milestone is one commit named `Phase N Mx: …`.
- **Carrying on:** preserve/review local Phase 4 M3–M5 and Phase 5 M1-M7 on `phase-4/talent`.
  M4 foundations, M5 UAE, M6 Saudi, M7 assurance and Phase 6 M1 are local candidates. Phase 6 M4 is next. M7 qualification remains open. No branch switch, reset, commit or push was performed
  for Phase 5 M1-M7 or Phase 6 M1. Production provider/receiver and operating gates remain open.
  When a milestone is committed, move
  `main` up to it (`git checkout main && git merge --ff-only phase-4/talent`) and push both.

## Getting it running again

Follow [First run](../README.md#first-run) in the README: prerequisites, `.env`, the database,
the seed and the test accounts. Things that have caught us out:

- **`pnpm --filter @gp/db run <script>`:** keep the `run`. Without it, pnpm runs its own command
  of that name; `pnpm --filter @gp/db setup` once rewrote `~/.zshrc`.
- **Bringing the dev database up to date:** `pnpm db:migrate && pnpm --filter @gp/db provision`,
  then `pnpm db:seed` (it only adds what is missing). `pnpm db:reset` starts it clean; the
  browser walkthroughs leave their data behind (after M2, for example, a released half-year
  review and Mitu Begum's probation end moved to 18 November). After M3, the seeded
  compensation round is sent, three demo pay changes are approved from 1 December 2026,
  and the separate over-budget browser walkthrough is cancelled. A clean seed creates only
  a draft round; it never creates those approved changes.
- **M4 local walkthrough data:** `DEMO_M4_SAFETY` is an extra bilingual course, with a
  completed 31 October session/certificate for Rahima and a 5 November session from which
  she withdrew. HR added designation requirements and a 31 October demo fire drill. The
  three seeded course requirements also cover Senior Sewing Operators. These are demo
  records, retained alongside the earlier walkthroughs; no data reset was performed.
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

## Implementation history and next milestone

Phase 4 is implemented locally through M5. **Engagement** and **Employee services** use Core
HR: anonymous surveys/eNPS, recognition, announcements/policy receipts, private HR requests
and assets. See [ADR 022](adr/022-engagement-and-employee-services.md) and
[the M5 scope/checks](phases/phase-4.md#m5-engagement-and-employee-services).

The local M5 browser walkthrough leaves an extra closed survey with protected results, a
published policy notice acknowledged by Rahima, a company recognition post, a closed private
HR request (with HR-only notes), and `BROWSER-M5-PHONE`, acknowledged, returned and retired.
The seed's survey remains open and unanswered; no anonymous response data was fabricated.
The seeded request and ID-card receipt remain available for another walkthrough.

Phase 5 M1 is implemented locally. Current session/user authority, custom bounded grants,
field controls, OIDC, SCIM and protected recovery are described in the
[M1 record](phases/phase-5.md#m1-implementation-record) and [identity runbook](ops/identity.md).
The local database is migrated and provisioned through 0052 without resetting Phase 4 data.
Legacy sessions are deliberately retired; sign in again. Production now requires durable
private authenticated Redis. Local two-instance tests use loopback Redis on 6381; Docker dev
Redis uses 6379, selected with TEST_REDIS_URL. Memory remains single-process development-only.

The separate M1 walkthrough workspace is browser-m1-mvy0zok2, with M1 Browser Company A/B,
a restricted M1 Company profile editor role and the renamed BROWSER-M1-001 employee.
The administrator has MFA; its synthetic test material stays outside the repository.
No real IdP or provisioning credential was added to this workspace. The API runs on 4000,
web on 3000, and loopback test Redis on 6381; the API background switch is off. M1 validation:
997 repository tests, 320 mobile tests, lint/typecheck/build and the bilingual browser flow.

Phase 5 M2 now implements owner-bounded public client credentials, the versioned read API,
minimal signed webhooks and durable fenced scheduled workers. See the
[M2 implementation record](phases/phase-5.md#m2-implementation-record),
[OpenAPI](api/public-v1.openapi.json) and [integration/worker runbook](ops/integrations.md).
Migrations/provisioning are now through 0055, preserving earlier data. API 4000, web 3000 and
Redis 6381 remain running with a separate log-only notification worker. The M1 sandbox now
also has the revoked `M2 Directory sandbox` client, exercised in both languages. No real
receiver credentials or live external transfer were configured. 1,018 repository tests (750 API), 320 mobile tests, lint/typecheck/build, a full shuffled API run (749 tests) and 21 final shuffled M2 checks.

Phase 5 M3 is now an implemented **local candidate**. See the [M3 record](phases/phase-5.md#m3-implementation-record), [ADR 026](adr/026-self-hosted-enterprise.md), [operator runbook](../infra/enterprise/README.md), [private config examples](../infra/enterprise/config-examples.md) and [support responsibilities](../infra/enterprise/responsibilities.md). The development database is migrated through **0058**, preserving all five workspaces, 19 employee rows and two document records. There was no data reset, commit, push or branch switch.

M3 adds offline signed bound licenses, one-use named MFA activation, expiry/read/export and renewal controls, redacted opt-in diagnostics, key history, a separate read-only backup role, authenticated joint DB/document recovery, restored-credential revocation and reconciliation freeze. Installed upgrades require a trusted signed target/source/schema and a recent matching independently restored/decrypted recovery point, with online app connections stopped. The dedicated registry is new-pilot-only, with approved origins/residency and a short-lived signed readiness receipt; no caller DSN or live shared-tenant relocation was added. The pinned Node 24 checks also caught and fixed a fetch/Undici dispatcher version mismatch in the existing OIDC and webhook clients.

The self-hosted browser sandbox is separate: API **4010**, web **3010**, database `good_people_m3_browser`, workspace `enterprise-m3-browser`. Only synthetic data and a local test signing key are used. Its invitation was consumed and MFA enrolled; a bad renewal, expired read-only license and valid sequence-3 renewal were exercised, followed by opt-in diagnostics in English/Bengali. Synthetic credentials/config remain private outside the repository. Main development remains API 4000/web 3000/Redis 6381 with a separate log-only notification worker. Stop the relevant servers before rebuilding their shared web output.

Validation: **1,044 repository tests (776 API), 320 mobile tests**, lint/typecheck/build and all 776 API tests shuffled on the pinned Node 24 runtime pass. Four final encrypted recovery/release-signature checks also pass. English/Bengali browser evidence is saved outside the repository; no provider callback, real receiver or commercial signing key was used.

**Qualification remains open:** this Mac has no Docker and limited disk. Native same-host fresh-database restore/checksum/decryption and upgrade interruption tests do not establish clean Linux install, image execution, physical second-host recovery or service RTO/RPO. No commercial bundle was published or qualified. Customer support/renewal/key-custody/residency contracts and exact Linux/architecture/version matrix need approval with actual observed reports. The signed-bundle tooling refuses ordinary candidate preflight and unsubstantiated qualification. M1 real IdP/mobile/recovery/security and M2 receiver timestamp/signature/durable-dedup/load/failover gates remain open.

The main managed worker still reports an existing overdue backup record (last successful record 27 October 2026). The native M3 drill does not update or clear that managed backup schedule; review the existing backup cron/offsite policy before operational use.

M4 international foundations, M5 UAE and M6 Saudi Arabia have local candidates, as recorded below. Next implement [M7 assurance and enterprise release](phases/phase-5.md#m7-assurance-and-enterprise-release), carrying each country's source and cohort/consumer qualification gates forward. Carry the earlier operating gates forward; local implementation is not commercial or legal approval.

## Waiting on people outside the code

These need a person's sign-off before the matching feature is relied on in production:

- **Labour lawyer:**
  - the RMG pack's rules marked for review ([Phase 3 M3](phases/phase-3.md#m3-rmg-pack));
  - the improvement plan's legal note, s.23–24 and s.26
    ([Phase 4 M2](phases/phase-4.md#improvement-plans)).
- **Labour lawyer, M3:** confirms the RMG annual basic increment rule, applicability and
  eligibility before production reliance.
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

M5 has no survey free text/raw exports or subgroup reports, recognition rewards, announcement/
HR-ticket attachments, SLA automation, asset procurement/depreciation or payroll deductions.
Lists are unpaged except recognition's latest 100. Anonymity protects product reporting, not
live database observers. Workers without logins need another suitable channel; no proxy
responses/acknowledgements are supported. HR management stays on web.

M4 learning is trainer-led; HR/manager tools are on the web, employee self-service also in
mobile. HR lists are unpaged. Corrections retain old records with archive/revocation/voiding.
Learning PDFs are employer attendance records; external accreditation, signed registers and
required fire-service notices are outside the software. See M4's Carried list.

M3 planning is web-only and the full company round is currently unpaged. Rejected or
withdrawn exported proposals are reconsidered in a new round. Prior RMG increases outside
this workflow need manual verification. See M3's Carried list for details.

Each milestone's "Carried" list in its phase doc says what was left for later and why. The
latest, from [Phase 4 M2](phases/phase-4.md#checked-1), includes:

- **Paper acknowledgement:** workers without logins cannot acknowledge a plan or review, and
  a signed paper copy cannot be recorded yet.
- **Declining peer feedback:** peers cannot decline a request.

## Phase 5 M4 continuation

Use `/workspace/international` for dated employer profiles and foreign HR metadata. The separate synthetic `international-m4` workspace holds BD/AE/SA acceptance data; earlier workspace data remains present. `/platform/international` is the finance-only candidate price book. No international merchant checkout, AE/SA statutory payroll, Hijri conversion or approved Arabic legal template is enabled.

The additive development schema is 0064. The populated-copy reconciliation compared all original columns/rows across 163 tables and six stored-file hashes, including encrypted people, locked financial results, permissions and a staged non-Dhaka site zone. No main reset or seed was run. [ADR 027](adr/027-international-foundations.md), [M4’s record](phases/phase-5.md#m4-implementation-record) and [the consumer inventory](phases/m4-consumer-inventory.md) explain the boundaries.

Arabic remains a measured technical preview with English fallback; remaining content, notification and legal-language review is a release gate. Cross-employer execution requires a reviewed settlement/opening/service workflow. M5/M6 must qualify each country consumer before enabling processing. M1 provider, M2 delivery/load/failover and M3 signed-release/Linux/offline/physical recovery gates remain open. A previous stale backup-job record is not cleared or reclassified by this work.

Native API/web checks use Node 24.15.0, PostgreSQL 17 and local Redis 6381. Do not start the old M3 installed sandbox against the new compiled code/schema without the verified signed-release and recovery-point upgrade procedure. No commit, push, branch switch, worktree or commercial release was created.

M4 validation: 1,068 regular repository tests plus the separately enabled joint-recovery test pass (1,069 unique checks), as do 321 mobile tests, analyze, build, typecheck and lint. Native EN/BN/AR views, a 390px RTL viewport and the Arabic informational PDF/download-refresh flow pass. Arabic coverage remains a partial preview: 554 of 5,998 web strings differ from English. M5 UAE and M6 Saudi Arabia now have local candidates, as recorded below; M7 is next.

## Phase 5 M5 continuation

Open `/workspace/uae` in the isolated `uae-m5` workspace. It contains non-GCC expatriate and old/new GPSSA examples, three exact synthetic monthly comparisons, a settlement and a browser-created October preview. The fourth person's unknown coverage is visibly unsupported. The WPS batch is a reconciled **simulation**, with no bank upload or proof of payment; synthetic comparisons leave the independent period count at zero. No actual AE payroll, leave, separation or payment consumer is enabled.

[ADR 028](adr/028-uae-pilot-pack.md), [the source/review dossier](phases/m5-uae-review.md) and [M5's record](phases/phase-5.md#m5-implementation-record) describe coverage, proposed conventions and external qualification. Rule reviewers and original consolidated hashes remain unasserted. M1 custom payroll permissions retain their all-company assignment restriction; legacy selected-company and all field restrictions are checked by the candidate service. Do not loosen M1 delegation to enable a preview.

The additive development schema is 0067. The populated copy retained all original rows/columns in 168 tables and six stored-file hashes, with all recorded site zones. Native totals are seven workspaces, eleven employers, twenty-four employees, two documents and the single pre-existing payroll run. The UAE workspace has no statutory runs, posted leave or executed separations. All candidate financial payloads are encrypted. API 4000, web 3000 and Redis 6381 remain loopback services; use Node 24.15.0. The prior stale backup warning is not cleared or reclassified by a synthetic drill.

Validation: 1,104 unique repository checks, including the separately enabled joint recovery, plus 321 Flutter tests; analyze/build/typecheck/lint pass. EN/BN/AR, blocked coverage, saved/compared payroll, leave bands, 390px RTL and the Arabic informational PDF are verified. Existing build caches were expired to recover disk space; source, databases, stored files and prior outputs were retained. All earlier local work remains uncommitted on `phase-4/talent`.

M6 now also has a local candidate; M7 is next. M5 still needs original/local rule/cohort and boundary review, three real independent periods and settlement, reviewed EN/AR statutory documents, current agent acceptance and actual returns, privacy/retention/hosting review and complete country-consumer qualification. M1–M4 gates carry forward. There is no UAE self-activation switch and no production bank or merchant checkout was enabled.

## Phase 5 M6 continuation

Open `/workspace/saudi` in the isolated `saudi-m6` workspace. The separate Saudi candidate covers standard private-sector full-time examples with written Gregorian agreements, non-GCC hazards-only and GOSI legacy/new-law histories. Three synthetic month comparisons include the July rate change; a resignation settlement and internal WPS return simulation are reconciled. A fourth worker's unknown coverage is visibly unsupported. Synthetic examples leave real independent periods at zero, with live Saudi payroll/leave/settlement/payment disabled.

See [ADR 029](adr/029-saudi-pilot-pack.md), [the review dossier](phases/m6-saudi-review.md) and [M6's record](phases/phase-5.md#m6-implementation-record). Do not infer a GOSI cohort from a new job, assume GCC/unknown coverage is zero, convert Hijri dates implicitly, reuse GPSSA calculations/EDR files, or treat the sandbox as a bank/Mudad format. Arabic and original/local source review remain open. The recorded annuity/SANED/hazards split does not constitute an insured-status decision. M1 custom payroll assignment restrictions are retained.

The additive schema is 0069. A populated 0067→0069 copy retained all original rows/columns in 175 tables, six stored-file hashes and all recorded site zones. Node 24.15.0, API 4000, web 3000, Redis 6381 and the separate worker remain the local runtime, with release label `5.6.0-local`. Source, databases, stored files and earlier outputs were preserved; all existing local work remains uncommitted on `phase-4/talent`.

Validation: 1,168 regular repository checks plus separately enabled joint recovery (1,169 unique), 321 Flutter tests, analyze/build/typecheck/lint. The 14 Saudi API checks plus joint recovery pass shuffled with seed 5606. Native totals reconcile to SAR 34,175.00 in June and 34,080.00 in July/August; settlement SAR 26,494.52. EN/BN/AR, unknown-coverage rejection, a 390px RTL viewport and the Arabic informational PDF are covered by the M6 acceptance evidence.

**Next: M7 assurance and enterprise release.** Define the system boundary and named owners, remediate control gaps and collect actual operating/security evidence. Original Saudi source/calendar/cohort review, real independent pilots, EN/AR statutory documents, bank/sealed-file/Mudad/justification and payment acceptance, privacy/retention/hosting and all country consumers still need qualification. Earlier M1–M5 operating gates and the stale backup warning carry forward. No production bank, merchant checkout or country self-activation switch was enabled.

## Phase 5 M7 handoff record

At the M7 handoff, the workspace was [Assurance and release](http://127.0.0.1:3000/platform/assurance). API 4000, web 3000 and the dedicated worker ran release `5.7.0-local`, with loopback Redis 6381. Use Node 24.15.0; the correct config key is `RELEASE_VERSION`. Managed platform Super Admin and MFA within five minutes are required; installs, tenant users, support and clients cannot access this register. Two clearly labelled local QA identities exercise a separate synthetic program; their credentials stay outside the repository and they are not real human control owners.

Schema is through 0071. The two new assurance tables are platform FORCE-RLS tables with a current actor policy, not tenant `RLS_TABLES` entries. Definitions/events are encrypted, immutable and hash-verified. The populated 0069-to-0071 copy preserved all original rows/columns in 182 tables, six file hashes and zones. Original tenant/HR/payroll records were retained; no reset, branch switch, commit or push occurred. M7's private rehearsal dump is protected with a separate archive key; it is not a qualified joint/offsite production backup.

1,225 regular tests, the separate joint-recovery check (1,226 unique), 73 shuffled focused checks (seed 5707), 321 mobile tests, analyze, lint, typecheck and build pass. Browser/source-integrity evidence is in the local M7 acceptance outputs. There is no Docker on this host and no actual CI run, container/clean-Linux/offline qualification, independent pentest or CPA report is claimed.

Netro Systems Limited is the user-named M7 coordinating organization; individual accountable owners and independent firms are still pending. A new immutable program carries the original unresolved findings forward without editing that history. The current real local program scopes BD/AE/SA plus Arabic: 18 required controls, zero actual human owners, no accepted operating/external evidence or report. The overdue backup and two moderate dependency advisories are visible unowned findings. Last stored backup is 27 October 2026; the existing alert remains open. All three required system worker tasks were within cadence at verification. BD is the actual available dispatcher; AE/SA and merchant checkout remain disabled. Synthetic acceptance and native same-host recovery cannot override these facts.

**Next:** obtain accountable owners and agreed scope/criteria/targets, triage the two dependencies and repair/prove actual backup/recovery, then complete the M1-M6 provider/host/country and independent security/examination qualifications. A changed immutable definition requires a fresh readiness program with unresolved findings carried forward. Only after all current gates and an independent exact-head recommendation can enterprise tooling accept its restricted export alongside the existing host matrix. The export is unsigned and does not authorize commercial release or a public SOC 2 claim. Phase 6 design can be requested separately. See [ADR 030](adr/030-assurance-and-enterprise-release.md), [the dossier and operating steps](phases/m7-assurance-review.md) and [the control register](security/enterprise-controls.md).

## Phase 6 design handoff

The [Phase 6 design](phases/phase-6.md) and [ADR 031](adr/031-intelligence-and-scale-boundaries.md) propose analytics foundations, operating/financial insight, a read-only assistant, explainable anomaly review and measured scale qualification. **The design's first implementation was M1 Analytics foundations, now delivered below.** Start with versioned workforce metrics and current company/relationship/field authorization, then the bounded API and EN/BN/Arabic-preview page. Reconcile current group definitions and actual job history; distinguish incomplete data from zero. A model, warehouse, migration or bulk backfill is not a prerequisite for that first slice.

The original design step changed documentation only. At that handoff runtime was 5.7.0-local/schema 0071; M7 records, earlier artifacts, source, database and processes are retained. No provider was configured or contacted with HR data, no entitlement/privilege was granted, and no Phase 6 code or capacity result is claimed. The M7 validation counts above are its recorded results, not fresh Phase 6 implementation tests. Markdown format, local references and source preservation are checked for this design.

Netro Systems Limited remains the coordinating organization, with individual owners pending. M7 closure remains an independent workstream: overdue actual backup/recovery, two moderate dependencies, named control owners, published criteria/targets, independent security/CPA and M1-M6 provider/host/country qualifications. No assurance snapshot or commercial approval is refreshed by writing a new design. Update the scoped evidence before qualifying changed source. The design's decision table states which pilot, provider, retention and workload choices are needed for later activation; none blocks preparation of M1's bounded local implementation.

## Phase 6 M1 handoff record

At M1 handoff, local runtime was **6.1.0-local**, Node 24.15.0, API 4000, web 3000, worker and loopback Redis 6381. Schema remains 0071 / 72 migrations; M1 needed no SQL migration. The [Analytics workspace](http://127.0.0.1:3000/workspace/analytics?asOf=2026-10-31) and [M1 implementation record](phases/phase-6.md#m1-implementation-record) cover the new workforce slice. [ADR 032](adr/032-workforce-analytics.md) records its boundaries.

Closing headcount, continuous-service joiners and completed leavers use versioned definitions, authorized effective assignment history, current company/relationship rights and a repeatable-read snapshot. Missing/ambiguous history returns a dash/null with a reason; current business days are provisional. Site selection uses its clock and narrows the company. Both analytics.view and employees.read plus analytics/core_hr features are required. Existing plan defaults and signed licenses do not acquire analytics automatically; no old entitlement was activated.

A separate **Netro Analytics M1 (synthetic)** workspace holds two synthetic companies, one site, seven employment records, an administrator, a company-A-only reader and an ordinary employee. At 2026-10-31 the group is **5 / 4 / 1** and A **2 / 3 / 1**; the intentional 2026-11-02 history gap yields incomplete headcount. These are test fixtures, not real employment outcomes. Credentials remain private local work files. Main totals: nine tenants, 14 employers, 35 employees, 20 tenant users; prior source/control records and six encrypted stored objects remain intact. M7 retains three programs, nine encrypted events and all release blockers.

Validation: **1,269 regular repository tests + one opt-in joint recovery = 1,270 unique**, 321 Flutter tests, clean analyze, lint/typecheck and production build. Analytics + calculation + identity + recovery pass 68 checks shuffled with seed 6101. EN/BN, source details, company/site filters, restricted/employee denial, an intentional missing-history state and Arabic preview at 390px are verified. Nine tiny-fixture application-role/RLS query plans were captured, with 0.14 ms maximum individual execution in that single observation; no capacity claim follows.

**Next: Phase 6 M2 Operating and financial insight.** Extend the metric contract using source-module and sensitive-field rights, eligible locked source states, country/currency reconciliation and protected export jobs. No model was configured, no source backfill/warehouse was added and no financial or foreign-country consumer was activated. Preserve all local Phase 4/5/M1 changes on phase-4/talent; no branch switch, reset, commit or push occurred. Netro Systems Limited remains coordinator; named individuals and all M7 operating/independent/provider/host/country/Arabic/merchant gates remain pending.

## Phase 6 M2 handoff record

At M2 handoff, the local workspace ran `6.2.0-local` on Node 24.15.0 with API 4000, web 3000, the separate worker and loopback Redis 6381. Migration 0072 adds the two tenant-scoped tables for saved definitions and encrypted export jobs. A populated copy retained all prior rows and columns across 184 tables and all six stored files.

Operating and financial insight covers closed-month attendance, leave ledger activity, training enrolments and six distinct monthly payroll cost figures. The synthetic October 2026 result reconciles to 6 workdays, 2,700 minutes, 6.0 leave days, 6 completions and BDT 633.00 in employer cost. The payroll figure matches the existing locked trend. The [M2 implementation record](phases/phase-6.md#m2-implementation-record) describes the exact source and permission rules.

Export jobs use the tenant worker lease and encrypt CSV bytes with tenant, owner and job context. Access is rechecked at enqueue, execution and download. A source revision change requires a new export. Saved reports are private to their owner. The local cohort of five and 24-hour live retention are implementation choices pending production review. Activate the separate Analytics Insights entitlement only for an approved workspace.

The full repository suite passed 1,284 tests including joint recovery. The focused shuffled run passed 17 M2 and scheduler checks. The build, lint, typecheck, 321 mobile tests and Flutter analysis passed. The live worker produced a six-month CSV that reconciled to the synthetic BDT 633.00 total. Local health and readiness are available on port 4000.

M3 is the read-only workspace assistant. The M7 release gates still need operating and independent evidence, with Netro Systems Limited coordinating named ownership.

## Phase 6 M3 handoff record

The local workspace assistant runs at `/workspace/assistant` on `6.3.0-local`, schema 0072. The opt-in `workspace_assistant` feature enables a local reader for shipped help, the published privacy policy, workforce history and operating insight. The original report routes enforce permissions on each call. Citation verification checks the source revision and current access.

The local implementation uses English, Bangla and Arabic UI labels, with the excerpt language shown beside document versions. Limits are 20 reads per actor and 120 per tenant per minute. The assistant entitlement is enabled in the separate M2 synthetic workspace for walkthroughs. Model providers and private policy ingestion require their own approval. [M3 implementation record](phases/phase-6.md#m3-implementation-record)

The repository suite passed 1,293 tests including joint recovery. The native walkthrough verified help, workforce and payroll citations. The local candidate uses schema 0072 and all 73 recorded migration hashes match.

M4 is explainable anomaly review. The existing production qualification gates carry forward.

## Phase 6 M4 handoff record

The local anomaly inbox runs at `/workspace/analytics/anomalies` on `6.4.0-local`. Schema 0073 adds encrypted finding evidence and review state behind forced tenant row security. The dedicated `anomaly_review` entitlement is enabled only in the separate M4 synthetic workspace.

The four checks use M1 effective assignments and M2 attendance and reconciled locked payroll results. Each finding has a versioned evidence snapshot and a link to its source workflow. Reviewers claim their findings, acknowledge or dismiss current evidence, and resolve findings after a fresh source check confirms correction. The existing audit log records changes. [M4 implementation record](phases/phase-6.md#m4-implementation-record)

The API and web serve ports 4000 and 3000, with the separate worker and loopback Redis on 6381. Health and readiness passed. The worker continues to report the known overdue backup. The populated migration rehearsal and the development upgrade preserved all existing tables and six files. The synthetic walkthrough verified a corrected finding and its audit trace. All 1,304 repository tests passed, including joint recovery.

M5 is scale and enterprise release. Representative backtests, detector approval, retention and the existing production assurance gates carry forward.

## Phase 6 M5 current handoff

The local candidate runs `6.5.0-local` with 74 applied migrations through schema 0073. API 4000, web 3000, worker and loopback Redis 6381 are running. For native launches, point both API and worker at the populated `apps/api/storage` directory using an absolute path. Readiness passed after restart.

On the isolated 5,000-employee fixture, serial attendance p95 moved from 106.10 ms to 44.19 ms. The control tenant progressed under export backlog, a second worker recovered a killed worker's queued result, and entitlement rollback preserved core access and locked payroll facts. The encrypted dedicated recovery drill restored Phase 6 evidence and rebuilt an authorized export after fresh MFA. [M5 local qualification record](phases/m5-scale-release-review.md)

A new managed development backup and verification succeeded at 07:19 UTC on 3 November. The copy stays in private same-host storage. Recurring and off-site backup, supported Linux and distinct-host qualification, named owners and service targets remain production gates. One moderate minimatch advisory remains after the scoped uuid update.

All 1,305 repository tests passed, including the opt-in encrypted recovery drill, along with build, lint and type checks.
