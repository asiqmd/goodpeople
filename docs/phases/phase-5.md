# Phase 5: Enterprise and international

**Goal:** an enterprise controls who can enter and what each person or integration can do;
can run Good People in an agreed hosting environment; and can operate Bangladesh, UAE and
Saudi companies without mixing their law, money or records.

**Status: M1-M7 implemented locally; enterprise release and external qualification remain pending.** Updated 3 November 2026. Phase 4 M3-M5 and Phase 5 M1-M7 remain uncommitted in the existing checkout. M7 provides a restricted readiness register and release gates; it does not close the outstanding customer/provider/host/country/CPA qualifications. The original design is retained below and the implementation records state actual evidence and remaining gates.

[ADR 023](../adr/023-enterprise-authorization-boundaries.md) records the shared authority
and country boundaries behind these milestones.

The repository's [handover](../handover.md) supplies the outline: SSO/SCIM, public API,
self-hosting, UAE/KSA packs and SOC 2. This design also carries forward custom roles and
field permissions from [ADR 007](../adr/007-notifications-and-sign-in.md), dedicated tenant
placement from [ADR 002](../adr/002-rls-tenancy.md), and USD/AED billing from
[Phase 3 M2](phase-3.md#m2-billing--invoicing). The linked
[original product plan](https://claude.ai/artifact/DwMQ6zCwCRhwhUe6PbijCf) could not be read
through the research tool; no additional scope is attributed to it.

## Delivery sequence

| Milestone                               | Scope                                                                                                                 | Depends on                     | Status                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| **M1 Identity and access**              | Current session authorization, custom roles and field permissions, OIDC SSO, SCIM provisioning, shared security state | Phase 4                        | Implemented locally; provider gate pending  |
| **M2 Public API and integrations**      | Tenant service principals, a versioned read API, signed webhooks and durable delivery                                 | M1                             | Implemented locally; receiver gate pending  |
| **M3 Self-hosted enterprise**           | Licensed deployment bundle, offline operation, supported upgrades and recovery; dedicated managed placement contract  | M1, M2 delivery infrastructure | Local candidate; host qualification pending |
| **M4 International foundations**        | Per-company jurisdictions, currency and calendar boundaries, Arabic/RTL, USD/AED subscription billing                 | M1; M2 for billing delivery    | Local candidate; qualification pending      |
| **M5 UAE pack**                         | Reviewed federal private-sector payroll/leave/settlement rules and a validated wage-file adapter                      | M4                             | Local candidate; qualification pending      |
| **M6 Saudi Arabia pack**                | Reviewed private-sector rules, GOSI cohort handling and a validated wage-file adapter                                 | M4; M5's adapter pattern       | Local candidate; qualification pending      |
| **M7 Assurance and enterprise release** | SOC 2 readiness, operating evidence, enterprise security review and final release gates                               | All; evidence starts in M1     | Local readiness; external closure pending   |

Implementation proceeds in this order. Control owners collect evidence throughout the
phase; M7 is not the first security milestone. A country pilot can remain closed while
another reviewed country is released. There is no assumed delivery date or auditor fee.

**Phase exit:** a pilot enterprise provisions and removes logins through its IdP, limits HR
to particular companies and fields, consumes the public API with a revocable client, and
receives a replayable signed event. A fresh supported self-hosted installation is upgraded
and restored from a backup without a vendor login. Reviewed UAE and Saudi pilot payrolls
reconcile to independent calculations and accepted wage files; historical BD payrolls stay
unchanged. An evidence register supports an independent CPA's examination without claiming
that passing software checks constitutes a SOC 2 report.

## Existing foundations and boundaries

This table records the pre-M1 inspection, not the current identity implementation.

| Existing seam                                                                                                           | Phase 5 implication                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `JwtAuthGuard` verifies the signed token and takes its role from the payload; refresh checks the current login          | M1 must validate current session/user authority on protected requests, not wait for a refresh after deprovisioning    |
| Code-defined role templates in `permissions.ts`, company scopes and service relationship checks                         | Preserve the templates; replace static role assumptions before accepting custom roles or service principals           |
| Tenant RLS, composite tenant foreign keys, field encryption and separate platform authority                             | New enterprise tenant tables get the same isolation; neither an IdP nor a customer API token gains platform authority |
| Explicit, expiring, read-only support grants                                                                            | Support remains a separate constrained principal; SSO/custom roles cannot make it an ordinary administrator           |
| `sso` and `api_access` in the feature catalogue                                                                         | Existing entitlement names do not mean either integration is implemented                                              |
| A tenant-level `country_pack` defaulting to BD; location time zones default to Dhaka; payroll directly imports BD rules | M4 needs a reviewed migration and dispatch boundary before adding country codes                                       |
| Decimal-string money without a currency in each value; BD-specific identity/tax fields                                  | Add explicit currency/context at public boundaries and country-specific validation without reinterpreting old values  |
| Docker Compose kit, local/S3 encrypted storage, backup scripts and CI container smoke tests                             | Reuse these foundations; a supported licensed edition still needs release, installation and recovery contracts        |
| Process-local rate limits, MFA replay state and scheduled runners                                                       | Shared security state is an M1 prerequisite; durable job ownership is an M2 prerequisite for multiple instances       |

Relevant code: [auth guard](../../apps/api/src/modules/auth/jwt-auth.guard.ts),
[permission guard](../../apps/api/src/common/roles.ts),
[request context](../../apps/api/src/common/request-context.ts),
[catalogue](../../packages/shared/src/catalog.ts),
[payroll context](../../apps/api/src/modules/payroll/run-context.ts),
[country engine](../../packages/country-packs/src/engine.ts), and
[operations runbook](../ops/runbook.md).

### Rules that apply to every milestone

- A request has one tenant and one principal type. Tenant identity comes from verified
  credentials, never a caller-supplied company or tenant header. Tenant tables remain inside
  `runAsTenant()` under `gp_app`; migration credentials never serve requests.
- Access requires current principal authority, tenant access state, feature entitlement,
  the permission for that resource's company/relationship, permitted fields and the
  operation's business rules. An API scope only narrows this result. An explicit denial
  wins. A role for company A cannot borrow company B from another role's scope.
- Platform administration, tenant administration, support, integration, Edge Agent and kiosk
  authority stay distinct. Existing public careers, speak-up and payment callbacks retain
  their specific guards; public API authentication is not a replacement for them.
- Payroll changes and disbursement retain human maker-checker and self-approval restrictions.
  Provisioning is not hiring, an API client is not a human checker, and a webhook does not
  execute pay. Private HR cases and anonymous-response protections remain independent of
  broad HR read permissions.
- Billing modes stay independent of authorization, including `license`, `internal`,
  `partner` and `complimentary`. Expiry never erases data or prevents authorized read/export.
  Authentication and actions that only revoke access remain available when commercial
  access becomes read-only; suspension still blocks ordinary tenant use.
- Reads do not mutate. Audit records identify the real actor, principal kind, request/event,
  tenant and company where applicable; they exclude tokens, identity cleartext and private
  message bodies. No new pathway exposes raw survey responses or reidentifies respondents.

## M1: Identity and access

### First increment: current authorization and custom roles

Start here before enabling an IdP. Add an authorization context resolved from a session ID,
login status and authorization revision. Disabling a login, removing a grant, changing its
company scope or revoking a session commits a revision/revocation with the change. A request
starting after that commit must fail or use the reduced authority on every API instance.
For the first implementation, read authoritative state on each protected request; do not
introduce a positive cache whose TTL becomes a deprovisioning delay. Refresh rotation is
atomic and detects reuse across instances. Logout revokes its access session as well as its
refresh token. Existing support-session expiry and revocation checks still apply.

Issue typed Good People tokens with explicit issuer/audience and rotating signing-key IDs.
An IdP ID token, MFA challenge, SCIM credential or machine token must never authenticate a
human session route. Key rotation has a bounded overlap and an emergency revocation path.

Existing tokens have no session/revision claims. Stage the new issuer and guards, test web
and mobile refresh, then end legacy sessions at the documented cutover. Reject legacy
access tokens after cutover; do not retain a permanent compatibility bypass. Recheck current
authority inside high-impact write/approval transactions so a concurrent revocation cannot
approve a later payroll lock.

Keep each existing role as a built-in template with the same initial permissions. Add
workspace-owned roles and assignments with explicit company scope and optional own/direct
report constraints. Multiple assignments add only their own bounded grants; explicit
denials take precedence. Require a recent MFA step for identity settings, privileged role
changes and credential creation. A custom role cannot grant platform/support authority,
bypass maker-checker or exceed the grantor's delegable permissions and company scope.
Protect the last recoverable tenant administrator. Record before/after policy versions and
show administrators an effective-access preview before applying a change.

Represent company scope as explicit `none`, `selected` or `all`, including whether `all`
covers newly created companies. Today, no `user_entity_scopes` rows means every company.
Backfill that legacy meaning explicitly; new provisioned identities start with no company
authority until mapped. Removing the last group/company grant must produce `none`, never
fall through to the legacy unrestricted default. For a historical payroll, case or document,
check its recorded owning company as well as the required relationship; a later employee
transfer must not relabel old records or expose a former company's pay to the new HR team.

Field policies distinguish read, write and export for identity documents, bank accounts,
personal contacts and pay. Collection endpoints, detail endpoints, search, nested responses,
CSV/PDF exports and notification templates use the same server-side projection. A denied
field cannot be recovered through filtering, sorting, aggregates, validation errors or
cached files. Field encryption remains; permission to decrypt is not inferred from a
general `employees.read` grant. Case-handler privacy, peer anonymity and survey thresholds
remain separate rules and cannot be overridden by a custom role.

**Product placement:** existing role templates stay available on all plans. Propose a
`custom_roles` feature for the Enterprise role editor and explicit grants; add it deliberately
to shared types, plan seeds and the console during implementation. Enforcement of saved
restrictions continues after a downgrade. Revoke/reduce access remains possible. SSO and SCIM
configuration use the existing `sso` feature, without testing payment inside auth code.

### OIDC single sign-on

Initial coverage is tenant-configured, service-provider-initiated OIDC, using Authorization
Code with S256 PKCE. Validate issuer, signature/allowed algorithm, audience and authorized
party where applicable, expiry and nonce. Bind one-time state to the initiating session,
tenant, connection and fixed callback; validate redirect targets. Use maintained protocol
libraries rather than handwritten token verification. These choices follow
[OIDC Core §3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
and the [OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html).

Each connection is pinned to one workspace. The durable identity key is tenant + connection

- issuer + subject; email/domain alone never links accounts or grants membership. Existing
  users link through a recently authenticated, audited admin or self-link flow proving control
  of both accounts. New identities require provisioning or an approved invitation; just-in-time
  account creation is off initially. Discovery errors do not disclose membership. Configuration
  fetches, metadata URLs and key refreshes need SSRF protections and bounded network timeouts.

OIDC authenticates a tenant login; the local authorization context still decides its access.
IdP role claims are not executable permissions. Admin MFA is satisfied only by a tested
connection assurance policy; otherwise require Good People's own second step. Connection
secret/key rotation, emergency disable and audit history are part of setup. Enforce SSO only
after a second administrator completes a successful test and recovery exercise. Keep two
named emergency local administrators, protected by MFA and alerted use, outside SCIM and
ordinary SSO enforcement. Recovery cannot create a vendor support backdoor.

Web uses its server session. Mobile signs in through the system browser and exchanges a
single-use app handoff bound to the initiating app session, never an IdP token in a deep-link
URL. Validate return destinations and avoid embedded webviews, following the native-app
browser guidance in [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html). SMS/password paths remain for
non-SSO cohorts only; the policy must not let an SSO-enforced user bypass through OTP, account
recovery or a second mobile endpoint. Provider outage does not automatically enable fallback.

SAML, IdP-initiated login, broad social login and a multi-tenant identity marketplace are
explicitly deferred. An Entra ID or Okta pilot uses that provider's OIDC and provisioning
configuration; support for any other protocol is not implied by the SSO label.

### SCIM provisioning

Expose tenant-bound `/scim/v2` credentials separately from browser, mobile and public API
tokens. Implement Users and Groups, discovery (`ServiceProviderConfig`, `Schemas`,
`ResourceTypes`), create/read/replace/PATCH/delete, pagination and a documented filter subset.
Return SCIM errors and capability metadata; unsupported bulk/sort operations must not be
advertised. Use stable IDs, tenant/connection-bound `externalId`, uniqueness errors and
version/ETag concurrency checks. Protocol and schema contracts follow
[RFC 7644](https://www.rfc-editor.org/rfc/rfc7644.html) and
[RFC 7643](https://www.rfc-editor.org/rfc/rfc7643.html).

Provisioning creates a disabled or policy-approved login and an explicit employee-link task;
it does not create employment, pay, bank details or statutory service. Attribute ownership is
visible: IdP owns login name/contact/active state; HR owns employee records and job history.
Group mappings refer to administrator-approved local roles and company scopes. Unknown groups
grant nothing; group payloads cannot invent roles or company IDs. Privileged administrator,
payroll-checker and emergency accounts require separate local approval. Unlinking or deleting
a managed group removes only the grants owned by that mapping.

`active=false` invalidates every managed login session at commit. Reactivation never restores
revoked sessions or an independently disabled HR/security account; keep deactivation reasons
separate. DELETE removes the provisioning resource/link and disables its managed login while
retaining employment, payroll, security tombstones and audit records under their retention
policies. A repeated DELETE stays safe. Keep a generation/revision and reconciliation history
so stale updates cannot silently revive a removed identity. Record version conflicts and
retry explicitly; do not pretend SCIM carries an ordered event stream. Show provisioner
credentials once, store only their hashes and support rotation; keep revocation usable in
read-only mode.

### Data, shared state and acceptance

Proposed tenant RLS tables: `identity_connections`, `external_identities`, `custom_roles`,
`role_permissions`, `role_field_policies`, `role_assignments`, `scim_credentials`,
`scim_groups`, `scim_group_mappings` and `provisioning_events`. IDs and foreign keys include
tenant ownership; uniqueness includes connection/issuer where appropriate. Extend
`tenant_users` with authorization revision and independent disable reasons; extend existing
platform `auth_sessions` with session-family/reuse/revocation metadata, keeping that table
restricted to auth. Do not copy tenant permission documents into unscoped platform tables.

Use a shared Redis-backed adapter for atomic rate limits, one-time state/handoff/MFA replay
records and short-lived challenges, with separate namespaces and bounded TTLs. Durable
identity, session and policy state stays in PostgreSQL. An unavailable shared security store
fails sign-in/challenge operations closed with a retryable error; it never disables limits
silently. Do not switch the production runbook to multiple instances yet: M2 must also make
scheduled work safe.

**Done when:**

- Existing templates pass the same positive and negative access cases; custom grants cannot
  cross tenant/company boundaries or leak denied fields through any output path. Evaluate
  mixed company/role assignments without taking their unintended cross product. Removing
  the final scope stays denied; transferring an employee does not transfer authority over
  historical payroll or private-case records.
- Disabling a user or removing a company grant blocks an already-issued token's next
  request on two API instances; a refresh race has one winner and replay ends the family.
  A revocation racing a payroll lock cannot commit a newly unauthorized approval.
- OIDC rejects wrong issuer/audience/nonce/state, callback replay and account-link takeover;
  provider key rotation works. Web and mobile obey SSO/MFA enforcement, and the emergency
  recovery drill leaves a complete audit trail.
- A real pilot IdP completes provisioning, group changes, concurrent PATCH, deactivation,
  deletion, reprovisioning and reconciliation. Neither a stale patch nor an email collision
  revives access or changes an employee's pay. Redis restart/outage cases are exercised.
- EN/BN admin and employee walkthroughs remain usable; security documentation and initial
  access-review evidence are recorded. Provider credentials in tests are fixtures, not live
  secrets committed to the repository.

### M1 implementation record

Implemented locally on 2 November 2026; see [ADR 024](../adr/024-enterprise-identity-and-access.md).
Human tokens now identify a live session and current login authority. Custom role grants bind
permissions, denials and company scope; final removal leaves no delegated grant. Structured
field read/write/export controls, current web principals, generic custom-role notifications,
and shared atomic security state cover existing auth, MFA, kiosk and rate-limit paths.
Tenant transactions check current revision/session under locks, including a request already
waiting when the user is disabled. Built-in access, separate read-only support and human
maker-checker remain in place.

The EN/BN **Identity and access** console manages roles, scopes, recovery administrators,
OIDC connections and tests, expiring provisioning credentials, group mappings, employee links,
retained inactive restores and the latest 100 actor-attributed audit events. Web and Flutter
support organisation sign-in through a browser/app-bound handoff and existing MFA. OIDC uses
Code+S256 with signed ID-token, issuer, audience, nonce/state and one-use checks; DNS/socket
validation restricts provider network access. SCIM Users/Groups manage only login identity
and source-owned grants. HR and IdP disables stay independent; deactivation ends sessions
without altering employment/pay history. Migrations 0043–0052 retire old session formats and
add the authority, provisioning, replay and reconciliation data/constraints.

Implemented boundaries deliberately narrow the original design:

- Historical payroll and workspace-wide financial reports require **all-company** authority.
  Selected-company payroll grants are refused until these resources carry reliable company
  snapshots. Custom own/direct-report relationships cover employee directory reads only.
- Field conflicts resolve conservatively across assignments. Unstructured documents/cases,
  indirect filters and binary exports are refused when safe projection is unavailable.
  A limited editor submits only authorized profile changes. Own employee service remains
  independent of delegated role grants.
- Field-limited delegates cannot operate the unprojected recruitment, performance or private
  employee-service surfaces. Their own employee services remain available through ownership
  checks. These delegate permissions require read authority for all four sensitive groups
  until resource-specific safe projections are implemented. Account/UI permissions use the
  same current server resolver.
- One enabled OIDC provider per workspace; enforcement covers enrolled linked accounts,
  with all managed logins SSO-only. Unenrolled worker cohorts retain local methods. Two
  distinct provider tests and two actual local password/MFA emergency recoveries within
  24 hours are required before enforcement.
- Initial SCIM updates can omit ETags, and removals/deactivation remain unconditional.
  Supplied stale versions fail; reinstating a disabled user or removed membership requires
  a current If-Match. Provisioners that omit conditional headers need an approved explicit
  restoration process or adapter. Deletion uses a retained tombstone, never an email relink.
- Production requires authenticated persistent Redis. The two-instance identity suite does
  **not** remove the single-runner deployment limit; M2 still owns durable scheduled work.
  SAML, social login, arbitrary SCIM extensions/bulk, public customer API and new country packs
  are not added by M1.

Validation uses a local RSA-signed OIDC provider and two API instances with real Redis. It
covers live role/scope/deactivation changes, a blocked request at revocation, final-grant
removal, field projection/partial writes/exports, own/direct-report and historical-company
reads, signed negative claims, provider key rotation/bad signatures, bounded access-key
rotation, MFA replay after lost Redis state, SCIM lifecycle/version races and real two-admin
link/recovery flows. Final local validation: pnpm lint and pnpm typecheck pass; pnpm test passes 997 tests
(729 API, including 32 identity acceptance cases); pnpm build passes all six build tasks.
Flutter analysis and all 320 mobile tests pass. The API suite also passed a shuffled regression run with the family-revocation fix. A paused
refresh/revoke test reproduces the transaction boundary and verifies that the child stays
revoked. Outstanding SMS proofs are rejected after the login phone changes. A password reset between the MFA revision check and issuance also rejects the old proof.

The EN/BN browser walkthrough uses a separate Enterprise workspace, browser-m1-mvy0zok2,
with two synthetic companies and M1 Scoped HR. A locally created role grants employee
read/partial edit only in Company A and restricts sensitive fields. The UI saved a name-only
edit; an administrator API check confirmed the original identity/contact values survived.
The final grant was revoked and restored, verifying that the old token immediately lost
delegated access. Both help translations render. The local database was migrated and
provisioned without resetting the Phase 4 demos. The development API uses loopback Redis
6381 with background jobs off; this test Redis is ephemeral, not the production profile.
Docker image/compose smoke was prepared in CI but not run locally because Docker is unavailable.

**Production gates still open:** a named real Entra/Okta pilot including its exact immutable
claim mapping, conditional reinstatement behavior, mobile handoff, provider/JWKS rotation,
IdP outage/recovery and independent identity security review. Named human control owners,
production Redis/restore evidence and alert delivery also require operational acceptance.
No provider tenant has been configured and no external assurance report is claimed.
See the [identity runbook](../ops/identity.md), [access-path inventory](../security/identity-access-paths.md),
[initial control register](../security/enterprise-controls.md) and EN/BN help article.

## M2: Public API and integrations

Create a dedicated `/public/v1` surface and an explicit `service` principal kind in auth and
tenant request context. Do not assign machine clients a tenant-admin role or forward their
tokens to internal controllers. An administrator creates a client with an accountable owner,
expiry, approved scopes and company/field grants no broader than their delegation ceiling.
Later changes require the same authority. Disabling the owner triggers review; revoking the
client blocks every issued token's next request.

Use OAuth client credentials for confidential server clients, over TLS, at a dedicated token
endpoint. Issue short-lived, audience-bound access tokens without refresh tokens. This is a
machine grant, not delegated employee consent or a new social sign-in service
([RFC 6749 §4.4](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.4)). Store only hashes of
client secrets, show each once, support bounded overlap for rotation and prevent token values
in URLs/logs. An outbound webhook signing secret instead needs encrypted storage so the
delivery worker can use it.

### First public contract

| Resource           | Proposed v1 coverage                                                                                     | Excluded from v1                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Organisation       | Scoped companies, sites, units and designations                                                          | Platform/subscription internals                                      |
| Employee directory | Stable ID, employee code, display name, employment status and approved job/company reference             | Identity/bank documents, personal contacts, pay and private cases    |
| Attendance         | Processed daily summaries under an explicit `attendance:read` scope                                      | Raw biometrics, selfies, location trails and new punches/corrections |
| Events             | Minimal `employee.created`, `employee.updated`, `employment.ended`, `attendance.day.finalized` envelopes | Raw survey/peer feedback, HR-ticket content, payroll execution       |

All routes also require `api_access` and the underlying module feature. Return only approved
fields; do not decrypt data then rely on clients to discard it. Apply company filters before
counts and pagination. Publish versioned OpenAPI, bounded cursor pagination (default 50,
maximum 200), stable ID/date formats, allowlisted filters, rate-limit headers, retry guidance
and structured errors with request IDs. Test contracts independently of internal DTOs. A
deprecation policy names a supported overlap and customer notice before removing v1 fields.
Third-party write APIs, employee OAuth delegation and payroll exports are later contracts,
not undocumented additions to this milestone.

### Durable events and jobs

Write an integration outbox row in the business transaction. An event has an immutable ID,
schema version, tenant, resource reference and occurrence time. After commit, workers lease
delivery rows from PostgreSQL and sign the exact body with a timestamp, event/delivery ID and
rotatable key identifier. Deliver at least once; document recipient timestamp checks and
event-ID deduplication. Use bounded exponential retry with jitter, a dead-letter state,
audited manual replay and endpoint disable after persistent failure. The retry schedule and
payload retention are installation settings with documented defaults at implementation.

Validate HTTPS subscription targets against SSRF, redirects and DNS rebinding; block private,
loopback, link-local and metadata destinations. A self-hosted private endpoint requires an
explicit operator allowlist, never an unrestricted tenant switch. Keep event bodies minimal
and re-evaluate current tenant/client/company authority before delivery or replay. Once a
client is revoked or a company grant removed, queued payloads cannot continue leaking data.
No ordering is promised across resources. A crash after a recipient accepts can duplicate a
delivery; the product must not claim exactly once.

Use the same durable lease/idempotency pattern for existing scheduled attendance,
notifications, billing, reminders and retention jobs. Inventory every timer before enabling
multiple runners. Prevent overlapping ownership with database leases, uniqueness constraints
and idempotent business transitions; external effects can still repeat. Separate workers
from request-serving API processes and expose queue age, failed delivery and lease health.
If any mutating public endpoint is added later, first require a tenant/client/route-bound
idempotency key, request hash, durable result and expiry contract. Do not advertise it for
read-only v1 as if write support already existed.

Proposed tenant RLS tables: `api_clients`, `api_client_credentials`, `api_client_grants`,
`webhook_subscriptions`, `integration_events`, `webhook_deliveries`; add restricted job-lease
records in the appropriate tenant/system scope. Reuse the notification outbox's transaction
boundary without mixing notification and integration payload retention.

**Done when:** a sandbox client pages its allowed companies and cannot discover another
company or forbidden field, including through errors/cursors. Wrong-audience, expired,
rotated and revoked credentials fail. Restart two workers during delivery and prove safe
lease recovery, duplicate handling, dead-letter/replay and revoked-subscriber suppression.
Exercise SSRF and quota exhaustion. Existing scheduled jobs pass concurrency checks before
the runbook permits a multi-instance topology. No API client can approve payroll or read
anonymous/private-case data.

### M2 implementation record

Implemented locally on 2 November 2026; production receiver/load/failover acceptance remains
pending. [ADR 025](../adr/025-public-integrations-and-durable-work.md), the
[integration and worker runbook](../ops/integrations.md), the
[versioned OpenAPI](../api/public-v1.openapi.json) and the
[receiver verifier example](../../apps/api/examples/verify-webhook.ts) describe the contract.

- Separate service principals and audience/key-bound client-credentials tokens with explicit
  current owner/resource/company/field ceilings; hashed one-time secrets, bounded rotation,
  expiry, persistent owner review and prompt revocation. No human/SCIM or payroll authority.
- Read-only scoped organisation, approved employee directory and processed closed-day
  attendance projections, independent of internal DTOs. Cursors, quotas, retry metadata,
  structured errors/request IDs and a 180-day breaking-change overlap policy are published.
- Immutable reference-only outbox events captured in business transactions; leased delivery,
  exact-byte HMAC, staged signing-key rotation, DNS pinning/redirect/private-target protection,
  current-authority suppression, backoff/dead letters, audited replay and bounded retention.
  Queue capacity retains unfanned events until room or retention expiry. No exactly-once or
  ordering claim; consumers need persistent deduplication and periodic reconciliation.
- All 20 legacy timers moved to a separate worker with bounded fair claims and DB-clock slots.
  Renewable owner-token leases fence tenant transactions and direct platform queries. The API
  never schedules. Compose adds a worker; CI prepares its image smoke. Existing business
  uniqueness/predicates still protect repeated work and external effects can duplicate.
- English/Bengali administration covers clients, owner review, field/company grants, credentials,
  subscriptions, prepared keys, replay, audit and queue/worker health. Expired/revoked clients
  remain visible for review and cannot be selected for a new subscription.

Migrations 0053–0055 were applied and tenant security provisioned locally without resetting
Phase 4/M1 data. Local runtime is API 4000, web 3000, Redis 6381 and a separate worker using log
notification drivers. The browser sandbox `browser-m1-mvy0zok2` contains the now-revoked
`M2 Directory sandbox` client; no real receiving endpoint or external transfer was configured.

Validation: 1,018 repository tests (750 API), 320 mobile tests, lint/typecheck/build, a full shuffled API run (749 tests) and 21 final shuffled M2 checks. The 21 focused checks include live owner ceilings/relationships,
review/revocation, tenant/field/company isolation, current-authority cursors, processed
attendance, quotas, rollback, independent receiver verification, staged rotation, duplicate
acceptance, dead-letter replay, transfer/expiry rejection, SSRF/redirects, retention/queue
pressure, two-worker ownership/takeover, stale transactions/direct queries and scheduler
process separation/concurrency/fairness. EN/BN browser creation/rotation/MFA/blocked URL/revoke
passed; the running worker reports all 20 task kinds and no failed current tasks.

This supersedes M1's former timer-runner restriction at the implementation level. Default
compose remains one API plus one worker; real image execution, production load/failover,
operator egress/key-custody review and an actual receiver's signature/timestamp/durable dedup
acceptance remain release gates. M1's real-provider/mobile/recovery and independent security
reviews remain open. M3 has a local candidate implementation below; M4 country foundations remain separate.

## M3: Self-hosted enterprise

Ship one supported initial topology: a single enterprise installation using the existing
Linux/Docker Compose pattern, PostgreSQL, durable workers, Redis and local encrypted or
S3-compatible document storage. Retain tenant IDs/RLS even for a one-tenant installation.
Publish a tested support matrix with exact image digests, database/Redis versions and
resource assumptions; Kubernetes, active-active regions and arbitrary customer databases
are outside the first supported edition.

### Installation, license and operations contract

- Deliver signed, versioned API/web/worker images, a software bill of materials, dependency
  licenses, checksums, migrations, environment schema and an installation preflight. Pin
  production dependencies; no `latest` image in a release bundle. Bootstrap a named local
  admin with a one-use invitation, require MFA and refuse demo seeds/default secrets.
- An offline-verifiable signed license binds installation ID, customer, features/limits,
  issue/expiry and renewal/grace policy. The vendor signing key never ships. License results
  feed existing entitlements through `billing_mode=license`; they do not create users or
  permissions. Invalid/expired licenses show a clear state and allow authorized read/export
  and access revocation. Use last-known-valid metadata to avoid destructive behavior during
  a bad renewal. Record clock rollback anomalies for operator review.
- Core HR, payroll, SSO and local exports must not require a vendor callback. Document every
  optional egress destination: configured IdP, mail/SMS/push, public key/update retrieval,
  payment provider and customer webhooks. A restricted-network install uses an imported
  release/license bundle and customer-accessible dependencies. No hidden telemetry;
  diagnostics are opt-in and redact tenant data and credentials.
- Keep app, owner/migration and backup authority separate. Document key custody, rotation,
  old-key availability for historic ciphertext, backup encryption and retention. Recovery
  requires the database, document objects, configuration and relevant encryption keys;
  a successful database restore alone is insufficient. Backups and keys have separate
  protected custody and a recovery procedure that tests their joint availability.
- Upgrade through expand/backfill/validate/contract migrations. Lock migration ownership,
  preflight disk/schema/license compatibility, take a verified recovery point and publish
  compatible application versions. Destructive schema changes need a separate later
  release. A database downgrade is not an assumed rollback; restore/replay and its data-loss
  window must be rehearsed and stated.
- The customer owns host/network patching, backups and IdP availability unless contracted
  otherwise. Good People owns application fixes, release provenance and the tested upgrade
  path. Security updates, supported-version windows and offline support turnaround are
  written into the support contract before sale. Existing explicit support grants remain
  time-limited/read-only; offline support uses customer-exported redacted diagnostics.

### Dedicated managed placement and residency

Treat dedicated managed hosting and customer self-hosting as separate deployment modes.
Model a restricted platform placement record (installation/region/database routing and
status), never a caller-provided DSN. First support a newly provisioned dedicated pilot;
general live tenant relocation remains deferred until a migration tool is separately
accepted. Do not advertise shared-to-dedicated moves as an existing feature.

A future relocation gate must cover a quiesced cutover, row/object ownership, tenant-bound
encryption, job/webhook queues, sessions, full row counts/checksums, routing rollback and
documented source retention/deletion. Never serve both copies as writable. Residency
inventory includes replicas, backup sites, logs, support access, notification vendors and
external integrations; selecting a cloud region alone is not a privacy determination.

**Done when:** an operator follows only the release bundle on a clean host; installs without
vendor connectivity, uses an imported license, exercises expiry/renewal and exports data.
Upgrade the previous supported release with populated data, interrupt a migration, recover,
and restore database + documents + keys on another clean host. Record measured recovery
time/data loss against the pilot's agreed RTO/RPO. Verify signed artifacts, non-root images,
RLS, redacted diagnostics and optional egress. Test the dedicated pilot's routing isolation.
Update the runbook and responsibilities matrix; do not reuse old restore results as evidence
for this new topology.

### M3 implementation record

Implemented locally on 2 November 2026, without committing, pushing, switching branches or resetting development data. Earlier Phase 4 M3–M5 and Phase 5 M1–M2 work is preserved.

- Strict offline Ed25519 license envelopes bind installation/customer/tenant, sequence, features, complete limits and dates. Installed entitlements preserve current user/company/field authority. Expiry, invalid/missing license and clock anomalies retain authorized read/export/revoke access; rejected renewals retain last-good state. Normal updates cannot lower sequence or clock high-water marks.
- A new installation starts with a named one-use hashed invitation, a chosen password and mandatory MFA. Installed startup enforces one-tenant/mode/config/role/RLS boundaries; platform and cross-tenant human/machine access is rejected. Signup, demo seeding and default super-admin provisioning are unavailable in installed mode.
- English/Bengali installation and license controls support recent MFA, offline renewal, redacted opt-in diagnostics, anomaly acknowledgement and explicit recovery reconciliation. Disabled notification channels skip without logging bodies; core operation requires no vendor callback.
- Additive migrations **0056–0058** add installation, invitation, immutable event and placement metadata, monotonic guards and recovery freeze. The migration owner holds the advisory lock on the same session executing migrations and validates existing SQL checksums. Installed upgrades require a trusted signed release/schema/source and a recent matching independently restored/decrypted recovery point, with all app connections stopped. Populated 0055→0058, concurrent owner, interrupted transaction/retry and downgrade refusal are native tested.
- The Linux Compose candidate separates API/worker/web, persistent Redis and PostgreSQL, manual customer TLS and local encrypted documents. Vendor tooling exports immutable image archives, per-image SBOMs/notices, source provenance, config/SQL/runtime/runbooks and an Ed25519 signature over exact SHA256SUMS. No private license/release key ships. Candidates cannot pass normal preflight without real reviewed host qualification; there is no `latest` install path.
- Native backup/restore tooling uses a separate read-only BYPASSRLS backup role, independent authenticated archive key, joint DB/document/key inventories and fresh restore destinations. A local rehearsal matches rows/file hashes, decrypts historical fields/files and rejects old sessions and machine credentials. Restore suspends business access pending current identity/HR/company/payment reconciliation, fresh provisioner/service credentials and a recorded local-admin MFA acknowledgement. Key IDs support new writes plus retained v1/GPF1 reads; blind-index root rotation and bulk re-encryption remain deferred.
- The managed registry is limited to new dedicated pilots: approved HTTPS routing/residency inventory, no caller DSN or existing tenant relocation, and a customer/mode/tenant/install/challenge-bound receipt from a separately licensed instance after two actual local recovery logins. The shared sign-in flow returns the approved destination without forwarding credentials. Existing single-customer self-hosted databases have a separate guarded in-place adoption path, with a recovery freeze.

See [ADR 026](../adr/026-self-hosted-enterprise.md), the [operator runbook](../../infra/enterprise/README.md), [private config examples](../../infra/enterprise/config-examples.md) and [support responsibilities](../../infra/enterprise/responsibilities.md). Application, owner, backup and signing-key custody are separate. Diagnostics require explicit operator review/transfer; no automatic vendor support upload was added.

**Qualification boundary:** this Mac has no Docker and insufficient disk for a credible clean Linux image/install drill. Registry digest resolution, executable bundle tooling, native tests and a same-physical-host logical restore are preparation evidence only. No production bundle was built, signed with a commercial key, published or qualified. Clean Linux disconnected install, exact host/image/architecture compatibility matrix, offline payroll/SSO acceptance, populated-image upgrade/interruption, physical second-host restore and measured agreed service RTO/RPO remain required. The native report's restore-to-maintenance time and zero RPO at a quiesced boundary are not production service guarantees. M1 provider, M2 receiver/load/failover and independent security gates remain open.

Validation: **1,044 repository tests (776 API)**, **320 mobile tests**, lint/typecheck/build, all 776 API checks in shuffled order on Node 24, and a final four-check encrypted recovery/release-signature run pass. The EN/BN browser flow verifies MFA sign-in, rejected renewal retention, expired read-only state, sequence-3 renewal and opt-in diagnostics. The dev migration preserves five workspaces, 19 employees and two document records. Docker/clean Linux/physical cross-host qualification was not run. **Next implementation: M4 international foundations**, with the above M3 operating gates carried forward.

## M4: International foundations

### Country belongs to employment and company, not UI language

Keep the tenant's country as an onboarding default only. Add effective-dated company legal
profiles: country code (`BD`, `AE`, `SA`), supported legal regime, statutory registrations,
payroll currency and applicable calendar. Add an effective-dated employment statutory
profile for citizenship/insurance/contract classifications actually needed by the selected
regime. Job/pay assignments resolve their company profile for the calculation date. Separate
work location/time zone from employer jurisdiction; cross-border/secondment cases require an
explicit reviewed policy and remain blocked where unsupported.

Dispatch through a country-pack interface for leave floors, attendance/OT, payroll,
contributions, settlement, statutory documents and wage-file validation. Unsupported
country/regime/date/cohort returns a blocking problem, never a BD or zero-rate fallback.
BD-only RMG, WPPF, tax and NGO rules run only for their supported jurisdiction; a common
country engine does not make those rules international. Existing `bd_tax` remains BD only.

Rules retain effective dates, source/article, review status and worked examples. Extend the
review record with named reviewer, reviewed date, source version/hash and covered scenarios.
New packs start `needs_review`; registering `AE`/`SA` does not make them payroll-ready. Store
a rule manifest and implementation version with locked runs and settlements, alongside
company/regime/currency/calendar snapshots. Corrected rules create an adjustment/replacement
workflow; they do not rewrite issued payslips or locked historical results.

### Money, time and employee records

- Amounts remain decimal strings, with explicit ISO currency on pay groups, structures,
  jobs/pay changes, budgets, loans, runs, journals and settlement/payment boundaries. Initial
  payroll currencies are BDT/AED/SAR; precision and rounding belong to currency/rule metadata.
  A run and its pay group have one currency. Reject incompatible structures, loans or
  compensation proposals rather than relabeling their amounts.
- Cross-company reporting groups totals by currency. Optional reporting conversion needs a
  recorded rate/source/date and a separate presentation total; it never changes the payable
  or accounting record. FX trading, cross-currency employee payment and an automatic FX feed
  are deferred.
- Store instants in UTC and business dates as dates. Resolve punches/shift boundaries in
  the site's IANA time zone, and payroll/leave dates in the selected calendar. Remove implicit
  Dhaka assumptions from jobs, reminders, reports and exports. Test midnight/overnight
  shifts and different weekly rest patterns. A user's language cannot change a payroll date.
- Gregorian ISO dates remain the transport format. Preserve supplied Hijri dates and the
  calendar/conversion provenance where a contract needs them; any statutory Hijri duration
  requires a reviewed calendar implementation. Religious holidays remain year-specific,
  tentative until confirmed, with an audited change process after a run is locked.
- Make BD NID/TIN fields conditional rather than mandatory globally. Add encrypted typed
  identifiers with issuer, validity and masking, country-specific bank/account schemas,
  names in original script and optional translations. Passport/nationality/visa records get
  explicit field grants. Do not infer religion, statutory eligibility or a person's name
  order from their locale.

### Arabic and migration

Add `ar` alongside EN/BN across shared language enums, database values, web routes/messages,
mobile resources, notifications, help and generated documents. Use logical layout properties,
correct document direction, Arabic font embedding and mixed-script number/account display.
Test keyboard/focus order, tables, calendars and clipping on narrow screens. Country legal
texts, payslips and consent/retention text require Arabic review; automated translation alone
does not release them. Existing EN/BN routes and mobile preferences remain valid.

Migrate additively. Inventory every money/date/rule consumer, including compensation,
recruitment offers, expenses/assets if present, project allocations and group reports. Backfill
existing companies/jobs/pay groups to BD, BDT and their recorded site time zones with a
reconciliation report; do not overwrite a non-default configured zone. Validate all records
before requiring new columns. Keep an explicit legacy BD read adapter for immutable locked
records until historical manifests are reconstructable, without changing original bytes or
asserting a reviewer approved them. New runs require explicit context.

Cross-country transfer ends one statutory assignment and starts another. Human-reviewed
opening balances/service credits specify what carries, with a settlement where required;
never pool statutory balances or continuous service across legal employers automatically.
Same-employer site moves and new-employer transfers have separate workflows.

### International commercial billing

Carry the Phase 3 USD/AED merchant-of-record requirement here. Subscription invoice currency
and seller/tax model are separate from employee payroll currency. Existing BD invoices and
BD payment gateways retain their meaning. Introduce an effective-dated commercial price
book and provider adapter with merchant-of-record product/price mapping, signed callback
verification, durable deduplication, reconciliation, refunds/credits and customer-facing
invoice references. Never emit a BD Mushak invoice as though it were the merchant's invoice.

The launch decision must name a merchant that accepts the seller, customer countries and
USD/AED collection or presentment required by the offer. No provider capability or approval
is assumed. Keep this adapter disabled until provider sandbox acceptance and finance/tax
review of seller, tax, invoice ownership and refund treatment. If no suitable merchant is
available, record this gate as open; manual enterprise contracting is a separate approved
commercial path, not completion of USD/AED checkout. Provider outages do not alter bypassed
tenants or grant features beyond the entitlement resolver.

**Done when:** a copy of a populated BD database migrates with identical locked payroll
amounts, documents, balances and permissions; EN/BN regressions pass. A mixed-country fixture
cannot run without an explicit supported profile or sum BDT/AED/SAR together. Exercise a
transfer, year/rule boundary, time-zone midnight, Hijri-calendar requirement and Arabic
web/mobile/PDF walkthrough. No new pack runs statutory pay while unreviewed. MoR sandbox
evidence or an explicitly open commercial release gate is recorded separately from the
international-core implementation check.

## M5: UAE pack

The first proposed coverage is MOHRE-regulated federal private-sector employment, with an
explicit employer/regime and worker coverage register. DIFC/ADGM, government, domestic work,
unsupported free-zone schemes and alternative end-of-service savings arrangements are
outside this initial pack. Show unsupported cases before onboarding payroll. The federal
law and amendments are the research starting point, not a single universal UAE rulebook
([UAE government overview](https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/employment-laws-and-regulations-in-the-private-sector)).

| Rule family                  | Design requirement before activation                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts and working time   | Reviewed worker/contract coverage, probation/notice, rest, Ramadan schedules, overtime and exclusions                                             |
| Leave                        | Reviewed accrual, eligibility, pay basis, carry/encashment, sickness, parental and other statutory categories                                     |
| Payroll and final settlement | AED components, lawful deduction limits, proration, termination reason, service history, benefit basis and payment deadlines                      |
| Insurance/pension            | Explicit scheme/cohort/authority, contribution basis/caps and employer/employee liabilities; unsupported coverage blocks the affected calculation |
| Wage files                   | Employer, employee and bank identifiers; adapter version, totals, validation, rejection/return evidence and reconciliation                        |

Do not apply one pension formula by nationality alone. GPSSA itself distinguishes coverage
under its newer and previous laws; the employment profile must record the applicable scheme
and prior participation. Other competent authorities/GCC cases require their own reviewed
coverage ([GPSSA laws](https://gpssa.gov.ae/pages/en/laws-and-regulations),
[GPSSA coverage explanation](https://gpssa.gov.ae/pages/en/media-center/news/gpssas-newly-published-federal-law-no-57-2023-now-available-website?trk=article-ssr-frontend-pulse_little-text-block)).

WPS delivery starts as an approved-payroll export for the pilot's bank/exchange agent, with
its current signed-off schema and synthetic examples. A generic CSV is not a validated WPS
file. Keep the exported batch hash, approval, upload reference and accepted/rejected returns;
file generation is not proof of wage payment. No live bank payment or MOHRE filing integration
is assumed ([MOHRE WPS overview](https://observatory.mohre.gov.ae/en/uae-labour-market-priorities/cutting-edge-labour-market-solutions)).

**Done when:** every supported profile/rule version has source/article, named local reviewer,
effective dates and hand-worked boundary fixtures. Test join/leave mid-period, unpaid leave,
OT/rest/Ramadan, applicable pension cohorts, termination reasons and service-length boundaries.
Reconcile three consecutive pilot periods and a final settlement to an independently
prepared payroll, with no unexplained differences; have the pilot's wage-file agent accept
the format/returns. Arabic and English letters/payslips are reviewed. Unsupported regimes
fail closed. Law, privacy, hosting/transfer and payroll-provider reviews are release gates;
no rule is marked verified merely because this design cites a government page.

## M6: Saudi Arabia pack

Start with supported Saudi private-sector Labor Law employment under an explicit coverage
register; government, domestic work and unreviewed special regimes are excluded. Rule
versions must account for amendments rather than reuse an older static summary: HRSD
announced amendments effective 19 February 2025
([HRSD announcement](https://www.hrsd.gov.sa/en/media-center/news/%D9%88%D8%B2%D8%A7%D8%B1%D8%A9-%D8%A7%D9%84%D9%85%D9%88%D8%A7%D8%B1%D8%AF-%D8%A7%D9%84%D8%A8%D8%B4%D8%B1%D9%8A%D8%A9-%D9%88%D8%A7%D9%84%D8%AA%D9%86%D9%85%D9%8A%D8%A9-%D8%A7%D9%84%D8%A7%D8%AC%D8%AA%D9%85%D8%A7%D8%B9%D9%8A%D8%A9-%D8%AA%D8%B9%D9%84%D9%86-%D8%B9%D9%86-%D8%A8%D8%AF%D8%A1-%D8%B3%D8%B1%D9%8A%D8%A7%D9%86-%D8%AA%D8%B9%D8%AF%D9%8A%D9%84%D8%A7%D8%AA-%D9%86%D8%B8%D8%A7%D9%85-%D8%A7%D9%84%D8%B9%D9%85%D9%84)).

Cover SAR payroll; reviewed contract/probation/notice, working time and Ramadan/rest/OT;
statutory leave; deduction limits; and end-of-service outcomes by termination reason and
recognized service. GOSI contributions need explicit insured status, nationality/coverage,
prior contribution history, applicable branches, base/caps and rule effective date. GOSI's
current guidance distinguishes new entrants without contribution periods before 3 July
2024; therefore do not decide a cohort from the current employer's joining date alone
([GOSI contributor guidance](https://beta.gosi.gov.sa/en/contributor)). GCC or other unsupported
insurance cases remain blocked until reviewed, rather than receiving an assumed zero rate.

Reuse the wage-file adapter contract with the Saudi pilot's bank/Mudad workflow, current
employer identifiers, acceptance/justification records and reconciliation. HRSD describes WPS
as wage-file submission and monitoring; the product records the actual result rather than
equating an export with compliance
([HRSD wage protection overview](https://prod.hrsd.gov.sa/en/care-about-you/social-protection)).
Work authorization, Saudization, Qiwa/Mudad/GOSI portal synchronization and e-invoicing are
not implied integrations. Track expiry/registration information only within reviewed
privacy/field scopes; people make eligibility and employment decisions.

**Done when:** meet the UAE pack's source/reviewer, three-period parallel payroll, settlement,
Arabic/English and bank-format gates using independent Saudi fixtures. Include old/new GOSI
cohorts, contribution changes within the pilot horizon, nationality/coverage exceptions,
Hijri-dependent service calculations where applicable, resignation/termination and leave
boundaries. Confirm every advertised scenario against current official text and local
payroll review. Unknown classifications block the affected run. No BD tax, PF, WPPF or RMG
increment is accidentally applied.

## M7: Assurance and enterprise release

### SOC 2 readiness and evidence

The delivery target is a defined system boundary, control ownership, remediated gaps and
operating evidence ready for examination. Only an independent licensed CPA firm issues a
SOC 2 report. Type 1 concerns an as-of date; Type 2 covers an operating period. Product
checks cannot substitute for either report
([AICPA report review checklist](https://assets.ctfassets.net/rb9cdnjh59cm/3xbcLlNc5rd72So4nQpNIk/7a3e8e5945c78c35fc5e116859b96e6a/SOC_2_Report_%C3%82_Review_Checklist.pdf)).

Propose Security as the initial category; management and the CPA decide whether Availability
and Confidentiality belong in the engagement, with Processing Integrity/Privacy considered
explicitly against customer commitments. Record the applicable published criteria/version
and system description criteria with the CPA. The AICPA currently lists a proposed 2027
exposure draft; do not silently treat a proposal as the effective examination basis
([AICPA SOC resources](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services/)).

Create an evidence register at M1 with control ID, owner, system scope, frequency, procedure,
source, access classification, retention, last/next execution, result and remediation owner.
Evidence is dated, attributable and access-controlled; avoid copying employee/tenant payloads
when an identifier and redacted artifact suffice. Retention periods are agreed with legal
and the examiner, alongside legal holds and deletion rules.

| Control area                              | Accountable role to assign at kickoff | Evidence produced during this phase                                                                            |
| ----------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Joiner/mover/leaver and privileged access | Security owner + HR/IT owner          | Access approvals, actual revocation results, recurring access reviews, emergency/support use                   |
| Change management and supply chain        | Engineering/release owner             | Reviewed changes, CI results, artifact provenance/SBOM, release approvals and rollback exercises               |
| Vulnerabilities and testing               | Security owner                        | Dependency/container findings, triage/remediation history and an independent enterprise-scope penetration test |
| Operations and recovery                   | Operations owner                      | Alerts acted on, queue/lease monitoring, patch records, backup checks and fresh restore/RTO/RPO drills         |
| Incident response                         | Incident commander                    | Approved response plan, tabletop, contact/on-call records and tracked corrective actions                       |
| Vendors, commitments and privacy          | Management + legal/privacy owner      | Vendor/subprocessor inventory, contracts, residency/transfer map, retention and data-subject request exercises |
| People and governance                     | Management + HR owner                 | Policy acknowledgement/training, risk register, ownership and review records                                   |

Owners are roles awaiting named people, not invented completed reviews. Set the evidence
cadence and vulnerability/incident response targets before the observation period. A
self-hosted customer's infrastructure is not automatically in the SaaS report's system
boundary; document customer responsibilities and each excluded/subservice organization.
External examination/report issuance remains a separate tracked release claim and business
engagement. Public wording stays "readiness work" until a valid report actually exists.

### International privacy and final gates

For each pilot, legal/privacy review determines controller/processor responsibilities,
applicable law, permitted processing/transfer grounds, subprocessors, retention, employee
notices, rights handling and incident obligations. Do not encode universal UAE/KSA residency,
consent or notification deadlines from a summary. Use the official UAE personal-data law
as a research input, and SDAIA's current transfer rules for Saudi assessments
([UAE legislation catalogue](https://uaelegislation.gov.ae/en/legislations),
[Saudi authority's update announcement](https://spa.gov.sa/en/w2163905)). Hosting mode and
encryption support this review; neither alone establishes legal compliance.

**Done when:** assigned owners complete a readiness gap review; every required control has
current evidence or a visible, owned exception; restore and incident drills pass agreed
targets; and the expanded independent penetration test covers OIDC/SCIM, custom-role/field
escalation, client isolation, webhook SSRF/replay, dedicated routing and self-hosted setup.
No open critical/high finding is accepted without a documented accountable risk decision.
Country pilots clear their own legal, statutory and provider gates. Any issued CPA report
records its actual type, scope, period, opinion and distribution rules separately.

## Implementation handoff

### Next work: close M7 assurance and release qualifications

Preserve local Phase 4 M3-M5 and Phase 5 M1-M7 changes. The local register has 18 required controls with human owners pending, an overdue backup and two moderate dependency findings. Assign actual owners, agree scope/criteria and recovery/incident targets, remediate and independently review operating evidence. Carry all M1-M6 provider, receiver, Linux/offline/distinct-host, Arabic/merchant, legal/pilot/bank/consumer gates forward. No CPA report or signed commercial release exists. Synthetic and same-host checks cannot clear the backup alert or qualify a release. See [the M7 dossier](m7-assurance-review.md).

### Proposed implementation locations

| Area                         | Repository seam                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access/identity/provisioning | `apps/api/src/modules/auth`, `common/roles.ts`, `common/auth-user.ts`, new `identity`/`provisioning` modules; `packages/shared` permissions and contracts |
| Tenant data/migrations       | `packages/db/src/schema`, migration journal, `RLS_TABLES`, field-cipher contexts; keep platform routing/auth metadata explicitly restricted               |
| Integrations/workers         | New `integrations` and worker entry point; existing notification, billing and scheduled-job seams                                                         |
| Hosting                      | `infra`, application Dockerfiles, CI and `docs/ops`; versioned installation/recovery examples                                                             |
| International core/packs     | `packages/country-packs` dispatch plus `bd`, new `ae`/`sa`; payroll/leave/attendance/lifecycle services and their response/export contracts               |
| UI and translations          | Existing web settings/admin pages and Flutter auth/l10n; Arabic messages/fonts/documents in M4                                                            |

### Decisions needed before the corresponding pilot, not before design

| Decision                                                                                           | Owner                                                   | Required before                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------- |
| Pilot IdP, verified domains, account-link policy and emergency administrators                      | Enterprise IT + security owner                          | Enforcing M1 SSO/provisioning     |
| Public directory/attendance fields, receiving endpoints and operational quota                      | Customer data owner + integration owner                 | M2 client activation              |
| Deployment region/topology, key custody, RTO/RPO, supported versions and license terms             | Customer operations + Good People operations/commercial | M3 supported installation         |
| Merchant approval, USD/AED capability, seller/invoice/tax/refund model                             | Finance + legal + payment provider                      | M4 international checkout         |
| Employer regimes, insured cohorts, authoritative rules, Arabic review and bank file specifications | Local payroll/legal reviewer + pilot employer/provider  | M5/M6 statutory activation        |
| System boundary, named control owners, criteria, examination type and period                       | Management + independent CPA                            | M7 examination/attestation claims |

## Design checks and research limits

- **Checked for this design:** current auth/role/scope/country/billing/deployment seams;
  carried Phase 3/4 requirements; milestone dependencies, security boundaries and proposed
  acceptance criteria. Prettier formatting, local link/anchor targets, whitespace and
  preservation of existing implementation files were checked at delivery. The application
  test suites were not rerun for this documentation-only change.
- **Not yet checked:** new code, IdP interoperability, distributed load, licensed installs,
  Arabic rendering, merchant/bank sandboxes, foreign statutory calculations or external
  assurance. These appear in the milestone gates rather than being described as shipped.
- Primary references were consulted on **1 November 2026**. Linked overviews establish
  research scope, not reviewed rates, complete current legal texts or legal sign-off. Some
  government full-text pages/downloads were inaccessible to the research tool (including
  the UAE personal-data text and SDAIA transfer PDF); the relevant gate requires obtaining
  authoritative current text. No statutory rates or deadlines are approved by this design.

### M4 implementation record

2 November 2026: implemented locally as an international-foundations candidate. [ADR 027](../adr/027-international-foundations.md) records the decisions and [the consumer inventory](m4-consumer-inventory.md) records the scope and qualification gates.

Migrations 0059–0064 add dated company/employment profiles, encrypted issued identifiers, currency context, Arabic preference, candidate international prices and a separate merchant ledger. Employer, profile, cohort, currency and locked-context boundaries fail closed. The existing BD adapter keeps its source review statuses; AE/SA registration, Hijri provenance and a selected display language never activate another statutory engine. Cross-employer transfer execution remains blocked pending reviewed settlement/service/opening records.

`/workspace/international` manages company profiles and foreign HR records, with scoped identifier and bank metadata forms. `/platform/international` exposes the USD/AED candidate book to finance. Checkout remains disabled; signed callback tests are a contract harness, not merchant acceptance. Arabic international forms/help and RTL/font support are available as a labelled preview; full legacy translation, notification wording and human Arabic legal review remain open. Arabic statutory documents are disabled.

The populated native 0058→0064 copy rehearsal preserved every original row/column in 163 tables: five workspaces, seven employers, nineteen employees, two documents, one payroll run, leave and permission records. Six stored-file hashes matched. A non-Dhaka site zone was staged on the isolated copy and retained. The development migration was additive, without reset or re-seed. A separate synthetic M4 workspace is used for browser acceptance; it is not customer or legal sign-off.

Validation: 1,068 regular repository tests pass, plus the opt-in joint-recovery test run separately (1,069 unique checks total); 321 Flutter tests, analyze, build, typecheck and lint pass. Native EN/BN/AR views, a 390px RTL viewport and the one-page Arabic informational PDF are verified, including download after an expired-session refresh. Arabic resource coverage remains partial: 554 of 5,998 web strings differ from English. Screenshots and preservation evidence are recorded in the local acceptance report. Node 24 remains pinned for native checks. M1 provider, M2 delivery/load/failover and M3 Docker/Linux/offline/cross-host gates carry forward. Next implementation milestone: **M5 UAE pack**, with source and cohort qualification before any statutory activation.

### M5 implementation record

2 November 2026: UAE is implemented as a **local candidate**. [ADR 028](../adr/028-uae-pilot-pack.md) records the boundaries and [the UAE review dossier](m5-uae-review.md) lists sources and missing acceptance. `/workspace/uae` exposes dated employer/worker coverage, individual fixed-term dates and notice/probation terms, exact AED previews, employee-level comparisons, review references and WPS sandbox evidence. Original names are retained. Every rule remains unreviewed; no named local reviewer or original consolidated source hash is invented.

The calculator separates explicitly recorded non-GCC expatriate, GPSSA 1999 and GPSSA 2023 cases. It covers bounded monthly/leave/OT/deduction and positive-entitlement settlement scenarios, with visible candidate conventions. Unknown cohorts, unsupported regimes, cross-border work, unreviewed pension partial periods, contract gaps, Hijri requirements and profile boundaries block. M4's actual payroll/leave/document/payment and other consumer gates remain closed for AE. Candidate records do not create statutory runs, leave balances, separations, filings or payments.

Migrations 0065–0067 add seven force-RLS tables with composite boundaries, encrypted row-bound payloads, versioned coverage and immutable calculations/evidence. Context changes preserve the original preview and require a replacement before reuse. Sequences and parent locks order comparisons/returns; altered replay bodies conflict. Synthetic comparisons do not count as independent periods; an independently labelled comparison needs a second login and still does not approve law or a release. M1's custom payroll assignment restriction is retained.

The bank public-guide adapter remains unaccepted. Files contain synthetic identifiers, an invalid-for-upload header and `.txt` naming; an exact hash binds simulated upload/return/reconciliation. Reconciliation never asserts wage payment. Real export remains disabled. EN/BN/AR screens, RTL/phone layouts and an Arabic informational PDF are technical previews, not reviewed payslips or legal templates.

Validation: **1,103 regular repository checks** (800 API, 136 shared, 81 country-pack, 70 edge and 16 web) pass; the opt-in joint-recovery check passes separately, for **1,104 unique repository checks**. All 321 Flutter tests, analyze, build, typecheck and lint pass. A shuffled API run exercised the suite; its new optimistic-version test fixture was corrected and the complete suite then passed. Existing mobile sign-in branches received braces only to clear three analyzer notices. Native UI checks cover unsupported coverage, a saved/compared AED preview, cumulative sick bands, EN/BN/AR, 390px RTL with local table scrolling, and a one-page Arabic PDF with explicit unreviewed status.

The populated 0064→0067 copy rehearsal compared every original column/row in **168 tables**, preserving six workspaces, ten employers, twenty employees, two documents, one payroll run and the existing permission/leave records. All recorded zones and six stored-file hashes matched. Development was migrated additively, without reset or re-seed. A separate synthetic `uae-m5` workspace holds four people, three cohort examples, three combined monthly comparisons, a settlement and a browser-created October example; all comparisons are synthetic. The current dev counts are seven workspaces, eleven employers, twenty-four employees and two documents. No earlier work was removed, committed, pushed or switched to another branch.

Release gates remain: original consolidated sources and local named rule/cohort/boundary review; minimum-wage/insurance/contract exceptions and candidate conventions; three real independently reconciled periods and settlement; reviewed English/Arabic payslips and letters; current bank-agent acceptance/returns and approved-payroll export; privacy/retention, hosting/transfer and all affected consumer qualification. M1–M4 external gates and the existing stale backup alert are retained. **Next implementation: M6 Saudi Arabia**, without assuming UAE rules apply.

### M6 implementation record

3 November 2026: implemented Saudi Arabia locally as candidate `5.6.0-candidate.1`. [ADR 029](../adr/029-saudi-pilot-pack.md) and [the source/review dossier](m6-saudi-review.md) record proposed conventions, researched primary guidance and outstanding qualification. The preview window is 1 June–3 November 2026; every rule remains `needs_review`, with no invented original/consolidated hash or named reviewer.

Migrations 0068–0069 add dated employer/worker coverage, encrypted immutable payroll/settlement previews, exact source comparisons/review attestations and a separately labeled internal wage-file/return sandbox. FORCE RLS, composite tenant/company relationships, source snapshots, row-bound field encryption, parent locks and evidence sequences retain M1/M4 boundaries. MFA, payroll rights/entitlement, company/relationship scope and every HR field read grant are required. M1 custom payroll assignment restrictions remain unchanged.

`/workspace/saudi` provides EN/BN/AR coverage, leave, payroll/settlement, qualification/WPS and source forms. Explicit GOSI legacy, new-law and non-GCC hazards-only cohorts use recorded participation/branches/basis rather than current joining date. New-cohort June/July rate changes are visible with annuity/SANED/hazards components. Unknown/GCC/cross-border/multi-employer, Hijri-dependent, special-time and partial/reduced insurance periods block. Non-Saudi fixed terms, Saudi indefinite monthly notice coverage and probation days are explicit.

SAR uses integer halalas and component rounding. Ordinary sick leave uses full/75%/unpaid bands; annual floor, standard maternity and attested event/Hajj/exam previews create no leave ledger. Settlements use final fixed wage, Gregorian anniversary fractions and Saudi resignation factors, with a distinct Article 87 evidence reference and contract-expiry consistency guard. No separation, compensation/insurance decision or payment is executed. BD tax/PF/WPPF/RMG and UAE GPSSA/support/EDR/SCR are not substituted.

The internal wage-file contract has synthetic worker references, exact hashes/control totals and simulated ordered returns/replay protection. It is not a bank payroll instruction or sealed Mudad file; no actual bank schema, portal integration, justification acceptance or payment is claimed. Synthetic comparisons leave the real independent period count at zero; attestations cannot activate the pack.

Validation: 1,168 regular repository checks pass, plus the separately enabled joint-recovery test (1,169 unique checks). The 14 Saudi API checks and joint recovery also pass in shuffled order (seed 5606). All 321 Flutter tests, analyze, build, typecheck and lint pass. A populated 0067→0069 copy retains all original rows/columns across 175 tables, six stored-file hashes and recorded site zones. Native synthetic June/July/August totals are SAR 34,175.00 / 34,080.00 / 34,080.00; the independently day-counted settlement reference is SAR 26,494.52. Browser/language/RTL/PDF evidence and final integrity counts are recorded in the M6 acceptance report.

Original/current rule, cohort/calendar and boundary review; three real independent periods/settlement; EN/AR statutory documents; bank/sealed-file/Mudad workflow and actual payment acceptance; privacy/retention/hosting and all affected consumers remain unqualified. Earlier M1–M5 gates and the stale backup warning remain open. **Next implementation: M7 assurance and enterprise release.**

### M7 implementation record

M7 implements `/platform/assurance` and a managed, current-Super-Admin/recent-MFA API, 19 catalogue controls, immutable scoped programs, encrypted append-only control/evidence/finding/exception/report/release events, independent review, period/cadence/version evaluation and restricted integrity-checked exports. Migrations 0070-0071 add two separately FORCE-RLS-protected platform tables. Actual backup/worker/country/merchant observations remain independent blockers. Enterprise release qualification now requires the exact clean-source assurance envelope and latest independent recommendation; ordinary source filenames work without weakening bundle or symlink checks. See [ADR 030](../adr/030-assurance-and-enterprise-release.md) and [the review/runbook dossier](m7-assurance-review.md).

Validation: 1,225 regular tests pass, plus the separately enabled joint-recovery check (1,226 unique repository checks); 73 focused assurance/release/international/recovery checks pass shuffled with seed 5707. All 321 Flutter tests, analyze, build, typecheck and lint pass. The populated 0069-to-0071 rehearsal preserves original rows/columns across 182 tables, six stored-file hashes and recorded zones. Native independent review succeeds only for the explicitly synthetic artifact; self-review and an unqualified release recommendation are denied. Restricted export, language/responsive evidence and final integrity are recorded in the M7 acceptance artifacts.

**Carried:** Netro Systems Limited is the coordinating organization named by the user; individual owners and independent firms are pending. Zero assigned human control owners, unconfirmed examiner criteria/targets/period, no CPA report/independent pentest, an overdue actual backup, two open moderate dependencies and all prior external qualification gates. The real readiness and synthetic programs remain blocked. BD dispatch remains available; AE/SA and merchant checkout remain disabled. No commercial release, country activation, commit or push was performed. Next: named-owner M7 closure; Phase 6 design is separate follow-up work.
