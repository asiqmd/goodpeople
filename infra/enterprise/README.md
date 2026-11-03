# Self-hosted enterprise — M3 release candidate

This is an implemented candidate profile. It is **not yet a qualified customer release**. The November 2026 local evidence uses native macOS, PostgreSQL and fresh logical databases on one physical host. Docker images, clean Linux installation, physical second-host recovery and agreed service RTO/RPO remain external acceptance gates. Never represent the native restore-to-maintenance timing as service RTO.

## Supported candidate boundary

One installation, one customer tenant, one Linux host, one architecture per bundle (`linux/amd64` or `linux/arm64`). Docker Engine 28+, Compose v2, 4 CPUs, 8 GiB RAM and at least 30 GiB free are the candidate floor, not a capacity guarantee. Allocate measured database, document, WAL, backup and retention capacity separately. The exact qualified Linux distribution, kernel, Engine/Compose patch versions, image IDs and CPU architecture must be recorded in the qualification reports before sale. No supported distribution/patch matrix is being claimed from this Mac.

The initial topology is a TLS proxy, non-root web/API, a separate durable worker, PostgreSQL 17 and authenticated persistent Redis 7.4 with no eviction. The worker uses the exact API image. The supplied profile supports the **local encrypted document store**. Customer S3, HA, arbitrary Kubernetes, live SaaS tenant relocation and general multi-region failover are outside this profile. Forced tenant RLS remains enabled even though the database is physically bound to one tenant.

The registry digests in `images.lock.json` are resolved upstream inputs, **not executed or qualified images**. Packaged image IDs, actual dependency SBOMs and notices belong to a signed release bundle. Do not use floating tags, rebuild an installed image in place, or run `docker compose pull` on the customer host.

## Publisher: build and sign a candidate

Use a dedicated build host with Docker, Syft and sufficient disk. The publisher may fetch dependencies; the customer installation must not need to. Review source, then run `node infra/enterprise/release.mjs source /absolute/repository` to obtain the commit, source-tree SHA-256 and dirty flag. Build API/web with the four matching build arguments `GP_RELEASE_VERSION`, `GP_SOURCE_COMMIT`, `GP_SOURCE_TREE_SHA256`, `GP_SOURCE_DIRTY`. Record that same source object and immutable dependency references in a private copy of `release-spec.example.json`. A dirty candidate cannot be qualified. The fixed Node base digest is shared by both Dockerfiles.

Supply the official Node 24 Linux runtime archive for the target architecture with `nodeRuntimeVersion` and `nodeRuntimeSha256` in the spec, independently verify its publisher checksum/signature, and retain that verification in the qualification records. It is included for disconnected operator tooling. Supply an offline copy of the required PostgreSQL 17 clients as a host prerequisite; the recovery script does not install or download them. Record versions and installation media in the host report.

Generate/store an Ed25519 **release** private key outside the repository and bundle, mode 0600. Keep the **license** signing key separate. Only public verification keys and customer-issued license envelopes go to the customer. For example, use `openssl genpkey -algorithm ED25519 -out /private/vendor-release.pem`, then `openssl pkey -in /private/vendor-release.pem -pubout -out /private/vendor-release.pub.pem`. Never use a test key as a commercial trust root.

Run `GP_RELEASE_PRIVATE_KEY_FILE=/private/vendor-release.pem node infra/enterprise/release.mjs pack /private/spec.json /export/good-people-5.3.0-linux-amd64`. Packing exports five image archives, a worker/API image binding, per-image CycloneDX SBOMs and actual license/notice files, migration SQL, Compose, config schema, operator instructions and Node runtime. It writes `release.json`, exact `SHA256SUMS` and its Ed25519 `release.sig`. The result is always a **candidate**. A pack failure removes only its new output directory.

Transfer the trusted release public key through a separately authenticated channel and record its fingerprint. A public key found inside an untrusted bundle is not a trust anchor.

## Customer: verify before executing bundle code

Obtain the approved offline host prerequisites and TLS certificates first. Verify the release signature using the out-of-band public key, then checksums, before extracting or running the supplied Node runtime:

```sh
openssl pkeyutl -verify -pubin -inkey /trusted/vendor-release.pub.pem -rawin -in SHA256SUMS -sigfile release.sig
sha256sum --strict --check SHA256SUMS
```

Inspect/extract `runtime/node.tar.xz` into a separate private tools directory, put that verified Node binary on PATH and run `node tools/release.mjs verify /absolute/bundle /trusted/vendor-release.pub.pem`. This also rejects unsigned added files, unsafe paths, symlinks, incomplete image provenance and a mismatched worker image. Keep runtime extraction outside the signed bundle directory.

Run `node tools/release.mjs preflight /absolute/bundle /trusted/vendor-release.pub.pem`. An unqualified candidate is rejected. `--accept-candidate` is solely for supervised qualification; it is not customer production approval. `load` runs the same checks, imports the local archives and compares exact image IDs. No registry pull is used. The supplied profile uses `pull_policy: never` and image IDs from signed `images.env`.

## Prepare private configuration and storage

Copy `enterprise.env.example` to an operator-owned settings file outside the signed bundle. Create `config/` with mode 0700; every secret/env/key file must be mode 0600. The sample hostnames and placeholders are unusable examples. Generate independent database owner, app, backup and Redis passwords, a JWT signing secret (at least 48 random bytes) and a 32-byte base64 field root. Do not copy `.env.example` demo secrets or seed accounts. Provision storage directories with the UID/GID verified from the exact pinned image; the 999 defaults are assumptions requiring a Linux qualification check. App/documents/proxy directories must be writable by 1000:1000. Mount PostgreSQL and Redis state persistently. Do not chmod secrets world-readable merely to make a container start.

Use these separate files (see `config-examples.md`):

- `app.env`: only application DB credentials, bound installation/tenant IDs, trusted license public keys, encryption/JWT secrets, origins and optional providers. `DEPLOYMENT_MODE=self_hosted` (or `dedicated`), `SIGNUP_ENABLED=off`, `REQUIRE_ADMIN_MFA=on`, `SECURITY_STORE=redis`, `STORAGE_DRIVER=local`, `STORAGE_DIR=/data/documents`. The API and worker never receive owner/backup/admin credentials.
- `owner.env`: only `DATABASE_OWNER_URL`; combine with `app.env` for technical CLI commands. Never mount it into API/web/worker.
- `setup.env`: database administrator plus distinct owner/app URLs for the one-time role/database setup job. Remove it from the online host after setup where policy permits.
- `database.env`: PostgreSQL initialization password only. `redis.env`: `REDISCLI_AUTH`, matching `requirepass` in private `redis.conf` and the encoded Redis URL.
- `tls/`: customer certificate chain and private key, readable only by the proxy's configured UID. One certificate must cover both configured hosts. No automatic certificate authority callback is configured.

Set `WEB_ORIGIN` and `API_ORIGIN` to approved HTTPS origins. Set web `GP_SUPPORT_EMAIL` and API `SUPPORT_INBOX_EMAIL` to the customer's own operator. Installed SMTP refuses the vendor's default support inbox. Retain the firewall deny policy for outbound internet. `GP_OFFLINE=true` makes the backend Docker network internal; the ingress-connected proxy still requires a host/network firewall to deny unwanted egress. Optional SMTP/SMS/push, OIDC metadata/JWKS, webhooks, DNS/NTP and customer observability require explicit approved destinations. `GP_OFFLINE=false` does not constitute an egress policy. No license or core business vendor callback is required.

## Initialize without demo accounts

Keep the verified bundle immutable and free of runtime/config files. Copy its exact `compose.yml` and `Caddyfile` to a private deployment directory, verify those copies with `cmp` against the signed originals, and place customer `config/` there. Every Compose command must use both settings files, for example `docker compose --env-file /verified/bundle/images.env --env-file /private/enterprise.env -f /srv/gp-deploy/compose.yml ...`. Keep the same project name/paths across operations. Relative config mounts resolve beside the deployment Compose file. Do not edit signed source files or insert secrets into the bundle; `verify` deliberately rejects unsigned additions.

1. Allocate the licensed installation/tenant UUIDs and write the bound private config first (see the next step); then start `database redis`; run the `operator` profile `setup` once, then `migrate`. Migration is serialized on a dedicated PostgreSQL session and verifies applied SQL hashes before changing schema. Technical operator containers exit after the command.
2. Before writing the bound app config or running initial migrations, generate installation/tenant UUIDs using `node dist/enterprise-cli.js new-installation` in the API image, or another secure UUID generator. Obtain the offline vendor-signed license for those exact IDs and customer. For a new dedicated workspace use the control plane's allocated tenant ID instead of inventing another.
3. Prepare private `config/bootstrap/bootstrap.json` with `name`, `slug`, `adminName`, `adminEmail`, and `licenseFile` pointing to `/input/customer.license`. Place that envelope in the same read-only input mount. Run `bootstrap`. It refuses an existing tenant, platform account or demo database; it never seeds a password or platform super-admin.
4. Capture the one-use invitation output into a private file, not general logs. Start `api worker web proxy`; open `/install` on the customer web origin. The named administrator claims the code once, sets a password of at least 16 characters, then enrolls an authenticator before receiving normal access. Only a hash of the invitation is retained; expiry is 24 hours. An owner can `reissue-invitation` before any local administrator exists. After activation, use the established account recovery procedure.
5. Create a second named local emergency administrator, enroll MFA, safely escrow recovery material, and actually test password+MFA access for both. Do not substitute a successful SSO login for local recovery testing. Record customer key custodians and independent backup owners.

The web UI exposes installation/license state at `/workspace/enterprise` in English and Bengali. A license changes feature/limit entitlements only; it does not grant HR, payroll, approval or company permissions.

## Offline renewals and clock handling

The vendor issues `gplic1.<key-id>.<payload>.<signature>`. The signature covers exact bytes. Schema, customer/installation/tenant bindings, feature keys, complete limits, dates and strictly increasing sequence are validated. Import through the installation page with recent MFA, or the separate owner CLI `import-license /private/license.txt` with private app+owner environments. No private signing key is required or shipped on site.

Grace is bounded by the signed contract (0–30 days). Valid/grace permits authorized operations; expiry or a missing/invalid/rollback license keeps authorized reads, exports and revocation available and blocks business writes. Administrative suspension remains stronger. A rejected renewal preserves the previous valid envelope and metadata and appends a rejection event. A lower sequence cannot roll back license state. Keep all required verification public keys during vendor key rotation.

A wall clock more than five minutes behind its recorded high-water mark enters read-only mode and creates an anomaly event. Correct NTP/clock and use recent MFA to acknowledge only after the clock catches up. The UI cannot lower that high-water mark. A host owner can ultimately edit its own database; this is operational tamper evidence, not DRM against the machine owner. An accidentally far-future clock requires a reviewed owner recovery plan and a verified recovery point; do not silently lower it or delete audit history.

## Upgrades and a joint recovery point

Run signature/checksum/config/license/version/schema checks before an upgrade. Only `upgradeFrom` versions qualified by the release are supported. Stop API and worker and block new ingress; do not run owner migrations or other writers concurrently. Confirm no application DB connections remain. Take and verify a joint recovery point containing PostgreSQL, every referenced encrypted document, config/encryption key fingerprints and separately escrowed secrets. The supplied recovery tool supports local document storage only.

Create a distinct 32-byte base64 backup encryption key, mode 0600, retained outside the backup archive. Use a dedicated backup role with BYPASSRLS and read access, never the online app role. After migration, a DBA grants `CONNECT`, `USAGE` on public/drizzle, SELECT on all tables and sequences and corresponding owner default privileges to that backup role; it must not have CREATE/UPDATE/DELETE or owner membership. BYPASSRLS is required to take all tenant data; it is not permission for the API. Restore creation uses a separate administrator and pre-provisioned owner/app/backup roles.

Create a private JSON options file for `node tools/recovery.mjs snapshot /private/snapshot.json`:

```json
{
  "databaseUrl": "postgres://gp_backup:ENCODED_SECRET@127.0.0.1:5432/customer_db",
  "documents": "/srv/good-people/documents",
  "configFile": "/private/app.env",
  "backupKeyFile": "/offline/backup.key",
  "output": "/backups/point.gpb",
  "quiesced": true
}
```

The snapshot refuses active app connections, missing referenced files, source changes, links/unsafe paths and an existing output file. It checks table row counts/checksums and file hashes around the dump, then creates an authenticated AES-256-GCM archive. Plaintext staging is private and removed; protect the staging volume as carefully as the live database. A quiesced-boundary RPO of zero describes that maintenance point only, not the time since the last scheduled backup. Copy the encrypted archive off site and verify it by an isolated restore before calling it a verified recovery point.

For an already bound installation, use the `migrate` operator service (`enterprise-cli migrate`), not the generic db migration script. Mount private upgrade inputs read-only at `/upgrade` and set `GP_UPGRADE_BUNDLE_DIR`, `GP_RELEASE_VERIFY_PUBLIC_KEY_FILE`, `GP_UPGRADE_RECOVERY_ARCHIVE`, `GP_UPGRADE_RECOVERY_REPORT` in the owner environment. The bundle directory must contain the signed release manifest/index/signature; the trusted public key comes from outside that bundle. The gate checks exact signature/manifest, target version/schema, declared supported source, bound verified license (an expired license stays read-only after technical updates), zero app connections and a matching restored recovery archive hash no older than one hour. A candidate requires explicit `GP_ACCEPT_CANDIDATE=on` for qualification only. A new empty installation has no existing recovery point to require. An installed database with pending SQL refuses the generic migration path.

The recovery report must include the tool's installation/tenant/source-release/snapshot timestamps/archive hash and successful row/document/key checks. After independently reading an encrypted field and file with the retained keys in the isolated restored system, preserve that report and add `fieldAndFileDecryptionConfirmed:true` to the private verified-point record. Do not set that flag from checksums alone. The gate is an owner attestation backed by the actual drill; it cannot substitute for that observation. These inputs are not mounted into the online API or worker.

Run owner-only migrations, start the exact new images, run health/MFA/business/read/export/worker checks, and reopen ingress only after acceptance. Current M3 SQL is additive; future expand/backfill/validate/contract steps need their own measured reports. Never edit applied migration SQL. The runner refuses mismatched hashes, newer history and implicit downgrade. The native interrupted-transaction test proves PostgreSQL rollback for the tested migration; it does not prove every future nontransactional backfill can be retried.

For failure, keep the failed host isolated. Choose forward repair only after review. Otherwise restore the verified point with the matching previous images and keys on a **new** database and document directory. Reverting an image tag does not roll back schema. Reconcile all accepted writes after the recovery point before reopening. No general destructive down migration is provided.

## Restore, credential reconciliation and key custody

Keep the legacy field root **and every historical key** alongside independent offline escrow. Rotated fields use `v2:<key-id>:...`; files use GPF2; v1/GPF1 still decrypt through the legacy root. Key IDs are authenticated. New writes use the active configured key. Blind indexes deliberately keep the legacy root, so retaining that root remains mandatory. Bulk re-encryption and blind-index rotation/backfill are not automated in M3. Never remove a historical key until all corresponding data/backups have been migrated and independently tested.

Prepare a new JWT access secret with no previous access key for recovery. Restore refuses the old signing secret, wrong installation/key fingerprints, a pre-existing database/directory or altered archive. Example private options:

```json
{
  "adminUrl": "postgres://restore_admin:ENCODED_SECRET@127.0.0.1:5432/postgres",
  "ownerUrl": "postgres://gp_owner:ENCODED_SECRET@127.0.0.1:5432/customer_recovered",
  "targetDatabase": "customer_recovered",
  "documents": "/srv/good-people/documents-recovered",
  "configFile": "/private/recovered-app.env",
  "backupKeyFile": "/offline/backup.key",
  "input": "/backups/point.gpb",
  "evidenceFile": "/private/restore-report.json"
}
```

Run `node tools/recovery.mjs restore /private/restore.json`. The restored app configuration must point to that fresh database; it must contain the same field root/read keys and a fresh JWT secret. Keep ownership role names consistent with the dump. The tool verifies restored rows and documents before applying a recovery freeze. Failed new targets stay isolated for inspection; it never overwrites them on retry.

Restore revokes sessions/refresh families, removes old MFA recovery codes, fences authenticator replay, revokes SCIM/API credentials, marks machine clients for review, disables webhooks and suppresses queued notifications. Durable job leases are cleared. It leaves the installation suspended for business access; only a named local recovery administrator can sign in and reach recovery controls. An authenticator may need the next time window after restore.

Compare restored users, SSO subjects, SCIM groups, role/company scopes, terminated/disabled people and approvals against the current identity/HR source of truth before releasing the freeze. Revoke stale users and restore current role mappings through reviewed owner operations while ingress remains isolated. Issue fresh recovery codes, rotate SCIM/API/webhook secrets, review each machine owner/field/company grant and enable delivery only after destinations are confirmed. Preserve payroll posting/payment identifiers and reconcile external payment/delivery records before retrying jobs; the tool does not reverse an external payment. Use recent MFA and an explicit recorded reconciliation reason on the installation page to acknowledge recovery. The checkbox is an operator attestation, not an automatic identity reconciliation engine.

The report measures **restore to maintenance**, checksums and quiesced-boundary RPO. Measure full service RTO separately through reconciliation, fresh login, authorized export and payroll/worker acceptance on a physically different host.

## New dedicated pilot and placement registry

In the managed control plane, `/platform/placements` requires a super-admin and recent MFA. Create a **new** workspace with an approved routing key, region, HTTPS origins, installation proof public key and explicit inventory for primary data, replicas, backups, logs, support, notifications and integrations. The registry contains routing metadata, not a caller-provided DSN. It creates a suspended metadata tenant with no HR data or users. Existing tenant IDs are rejected; this is not a relocation endpoint.

Bootstrap a separate dedicated database with the registry's allocated installation/tenant IDs and the matching customer license. Generate its Ed25519 installation proof key locally, outside the release/license key hierarchy. After testing both local MFA recovery administrators, use `INSTALLATION_PROOF_PRIVATE_KEY_FILE=/private/instance.pem node dist/enterprise-cli.js readiness-receipt /private/challenge.json /private/receipt.txt` with app+owner env. The challenge file contains `challenge`. The ten-minute receipt binds challenge, customer, dedicated mode, installation, tenant, origins, license, release and database fingerprint. Control-plane activation verifies it once; stale, mismatched or replayed receipts fail. Refreshing a challenge invalidates the previous one.

The shared login lookup returns only an approved destination link and forwards no password. Active dedicated tenants are excluded from shared business entitlements; installed APIs reject platform/cross-tenant sessions and transactions. Publish DNS/TLS/firewall routes only after the actual pilot passes its residency and recovery checks. Disabling a registry entry withdraws shared discovery; it does not shut down a separate host or revoke its local license. General live tenant export/import, CDC and relocation cutover remain deferred.

An existing **single-tenant customer-owned self-hosted** database may be adopted in place after a verified backup, supported schema upgrade, zero app connections and two enrolled named local recovery administrators. `adopt-existing` requires the expected tenant-bound license and a reason; it refuses a demo/multi-tenant/installed database and dedicated mode. It preserves IDs/business rows, changes billing to signed license mode, revokes sessions and enters the recovery reconciliation freeze. This is not migration out of shared SaaS.

## Qualification, diagnostics and support

Before a commercial release, execute every check returned by `qualificationChecksFor(version)` in `release.mjs` on the exact candidate images and architecture. Record independent clean Linux installation and restore host IDs, candidate manifest SHA-256, clean source commit/tree digest, actual image IDs, agreed RTO/RPO, measured **service** RTO/RPO and reviewer identity. Each check has an observed JSON report with `check`, `outcome:"passed"`, `version`, `platform`, `observedAt` and useful sanitized measurements. `qualification.json` includes those hashes and `checks[check] = {outcome,report,sha256}`, plus `schema:1`, `version`, `platform`, `candidateManifestSha256`, `source`, `installHost:{os:"linux",id}`, `restoreHost:{os:"linux",id}`, `imageIds`, `agreedRtoMs`, `agreedRpoMs`, `measuredServiceRtoMs`, `measuredRpoMs`, `reviewedBy`.

After a vendor reviews the actual reports, use `GP_RELEASE_PRIVATE_KEY_FILE=... GP_QUALIFICATION_EVIDENCE_DIR=... node tools/release.mjs qualify /bundle /trusted/vendor-release.pub.pem`. The tool refuses same-host/native-only evidence, missing/failing reports, mismatched artifacts and missed targets. It adds the reviewed reports and signs a qualified manifest. Structured validation cannot prove a report was honestly observed; the publisher owns that responsibility. Do not create passing placeholders.

Core HR/payroll, local documents/exports, license checks and customer-local SSO require no vendor internet callback. Disable notification drivers for strict offline operation; disabled deliveries are skipped without logging bodies. Optional channels can be configured only with a customer egress decision. Diagnostics are generated only after an explicit administrator action and recent MFA. The allowlist includes release/schema/license state, opaque installation fingerprint, failed-job count and channel driver names; it excludes employee/customer names, addresses, tenant IDs, secrets, envelopes, keys, DSNs, document contents and raw logs. Review the text and transfer it manually under the agreed support process. There is no automatic support upload. `GP_RECOVERY_DEBUG=on` is an explicit local troubleshooting option that can include PostgreSQL identifiers in errors; do not attach raw output without review.

Read `responsibilities.md` before contracting. An offline support schedule, signed-update cadence, response windows, emergency patches, license renewal lead time, trusted-key delivery, customer change approvals, temporary support access and escalation contacts must be agreed before sale. No production SLA, actual RTO/RPO or availability guarantee is implied by this candidate.

For release 6.5 onward, the signed qualification also requires `phase6_workload_and_fairness` and `phase6_data_recovery_and_rollback`. Record the approved workload and targets, actual route latency and error samples, source reconciliation, queue age and worker takeover observations. Measure restored application service and data recovery after old access is rejected, encrypted evidence is verified and an authorized export is rebuilt. Record the entitlement rollback and the preserved HR/payroll sources. The same-host measurements are a development reference. [Phase 6 qualification record](../../docs/phases/m5-scale-release-review.md)

## M7 assurance evidence before qualification

The evidence directory supplied to `qualify` must now also contain the managed control plane's restricted `assurance-readiness.json` export. Use the `/platform/assurance` workflow with current Super Admin/MFA and actual named owners. Do not manufacture a green export from these examples or from synthetic/native-only checks. Changed scope/criteria/target confirmations require a new immutable program and current carried-forward findings.

The validator checks canonical envelope and definition/event-chain hashes, exact clean release version/source-tree digest, self-hosted/dedicated scope, complete UTC period, confirmed published criteria and incident/RTO/RPO targets, required current control/evidence/exception states, actual backup/worker/country/merchant observations and a second administrator's latest exact-head recommendation. Evaluations must be within seven days, and the runtime export must be no older than two minutes at qualification. Run the host matrix first, then obtain a fresh export immediately before `qualify`. The validator independently checks actual backup timestamps against 26 hours and restore-verification timestamps against seven days; green serialized flags cannot extend these windows. Each control retains its own cadence. Synthetic, dirty-source, missing, stale, incomplete or altered records are rejected before qualification output is written. External provider/legal/host gates cannot be waived by a governance exception.

Qualification retains the complete restricted envelope and its reviewed head/hash beside the existing Linux/offline/upgrade/physical-recovery matrix. The signed bundle includes the policy tool and evidence. Verification checks that frozen record at the recorded qualification time, so a later wall clock does not invalidate a historically qualified bundle. Signing-key custody and actual independent review remain human responsibilities; hashes cannot establish that a dishonest issuer actually performed an operation. This workflow never grants commercial publication, statutory activation or permission to advertise SOC 2.

Source provenance accepts ordinary Git paths, including dotfiles, spaces and Next.js `[id]`/`(console)` directories. It rejects absolute/control-character/unsafe-segment paths and symlink traversal. Bundle extraction/allowlist path rules remain strict. Run provenance against the actual repository root; the local M7 project remains dirty and no commercial bundle was built or signed. See the [M7 closure dossier](../../docs/phases/m7-assurance-review.md) for the actual outstanding owners, dependency, backup and external qualification findings.
