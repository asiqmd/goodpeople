# Phase 6 M5 local qualification record

**Observed 3 November 2026 (Asia/Dhaka).** The local candidate runs `6.5.0-local` with schema 0073. The local workload, worker takeover, rollback and recovery drills passed. Production qualification requires owner-approved targets and evidence from the supported deployment matrix.

## Workload and measurements

The isolated loopback lab used Node 24.15.0, PostgreSQL 17.11 and local Redis on one Mac16,12 running macOS 27.0.1, with 10 logical CPUs and 16 GiB of RAM. API, load client, database and worker shared that machine. The large tenant held 5,000 employees, 80,000 closed-month attendance rows and 20,000 locked payroll items. The control tenant held 50 employees, 800 closed-month attendance rows and 200 locked payroll items. The seeded lab database occupied 73,589,263 bytes before the trials.

Seven API reads each received one initial call and 25 warm serial calls. PostgreSQL and OS caches were uncontrolled. Mixed load used seven read clients and one serial writer with 16 samples per call type. The writer edited one synthetic employee through the normal PATCH route. The mixed column below was measured while the surviving worker and export backlog were active. Units are milliseconds. With 16 samples, nearest-rank p95 and p99 both reflect the largest sample.

| Call                        | Before serial p95 | After serial p50 / p95 / p99 | After mixed p50 / p95 / p99 |
| --------------------------- | ----------------: | ---------------------------: | --------------------------: |
| Workforce snapshot          |             45.94 |        41.36 / 48.62 / 56.05 |    254.45 / 284.48 / 284.48 |
| Attendance insight          |            106.10 |        42.23 / 44.19 / 45.00 |    184.59 / 260.90 / 260.90 |
| Locked payroll cost insight |            123.40 |     107.32 / 110.26 / 111.32 |    225.44 / 282.23 / 282.23 |
| Anomaly inbox               |              7.39 |           4.24 / 7.19 / 9.46 |     81.52 / 156.89 / 156.89 |
| Assistant admission         |              2.89 |           1.77 / 2.07 / 3.01 |       12.68 / 96.01 / 96.01 |
| Employee list page          |             10.46 |           6.29 / 7.79 / 8.32 |     56.48 / 148.88 / 148.88 |
| Payroll runs                |             23.94 |        20.20 / 26.22 / 26.78 |    157.80 / 279.06 / 279.06 |
| Employee edit               |                 — |                            — |    151.37 / 268.01 / 268.01 |

The measured HTTP calls returned their expected status and reconciled results with zero errors. The large tenant returned 5,000 active employees, 20,000 worked days, 12,000,000 worked minutes and BDT 527,500.00 locked employer cost. The control export reconciled to BDT 5,275.00. The attendance movement check took 405 ms before the change and 174 ms after it, one observed request each. Assistant timings cover authenticated admission. The local workload used deterministic retrieval and incurred zero model calls.

## Query and resource observations

The attendance and leave reports now find effective assignment counts and company eligibility with one lateral aggregate per source row. The aggregate still counts overlapping assignments across companies, admits a historical company only when the active assignment is missing, and leaves RLS and existing cohort, time and row bounds in place.

Under the app role and tenant RLS, five `EXPLAIN ANALYZE` runs per attendance query returned the same 20,000 rows. Median execution moved from 32.03 ms to 25.44 ms. Last-run shared hits moved from 120,364 to 60,364. The existing attendance date and assignment employee/date indexes were usable. Workforce candidate and locked payroll item plan medians were 8.69 ms and 6.45 ms. These timings cover the measured SQL shapes and exclude API authorization, serialization and payroll decryption.

API RSS peaked at 759 MiB in the worker drill. The sampled surviving worker reached 681 MiB. The sampler observed at most 1 session waiting on a database lock. The two downloaded CSVs were 1,147 and 1,139 bytes. Their base64 ciphertext occupied 1,564–1,572 bytes per ready artifact. These are observations for this fixture and topology. Service targets and capacity decisions remain open.

## Fairness, failure and rollback

Two worker processes used the same PostgreSQL leases with concurrency two per process and a ten-second lease. A lab-only trigger paused the first worker during publish. It was killed while it owned the lease, and the job remained queued with no result published. The second worker produced one downloadable artifact for that request. The control export was first observed ready at 3.92 s while 6 large-tenant jobs remained queued. The interrupted export became observable 50.54 s after the kill. Largest sampled queue age was 54.45 s. These queue ages include polling delay. The takeover includes scheduler cadence and lease recovery. Cross-tenant download returned 404.

Concurrent duplicate enqueue and save requests returned a single identifier. The bursts kept the tested reviewer at the existing caps of ten export jobs and twenty saved reports. Existing lease tests also expire a lease, let a second owner take it, and verify the first owner cannot commit a subsequent write.

Operational evidence should record queue age and failed or cancelled work separately from lease heartbeat. The source-facing checks use the expected business period, coverage state and source revision. A freshly revoked session or feature must fail the same read or download. These checks keep a healthy worker heartbeat from standing in for fresh or authorized data.

The rollback drill removed only the four opt-in grants from the scale fixture. Workforce, insights, assistant and anomaly routes refused access while employee and payroll routes stayed available. A pending export cancelled without ciphertext, an earlier artifact remained encrypted, and all 20,000 locked item fingerprints matched. Restoring the four grants restored the read surfaces. The runbook uses entitlement rollback while keeping the applied schema and source records.

## Backup, upgrade and restored service

The managed development runtime had resolved its relative document directory against the repository root. Both live document objects were found in the populated API storage directory. The local API and worker now use that directory explicitly.

A quiesced managed development backup completed at 07:19:20 UTC on 3 November. The standard verifier restored it to a fresh scratch database, checked both live document references and the field-key fingerprint, and recorded success at 07:19:22 UTC. The original 186 source/control tables and six stored files matched their fingerprints. The backup and verification added two real local operating records. The artifact is held in private same-host storage. Recurring backup scheduling, off-site custody and a physical restore drill remain open.

The separate encrypted installation rehearsal rejected wrong root/read keys and missing document objects, then reconciled the restored employee, encrypted document, ready export and finding evidence. Old session and machine credentials were rejected. The original export was unavailable under a fresh session. After authorized recovery acknowledgement, the restored inbox opened and a new export was regenerated from its source. Frozen API readiness took 0.70 s. The synthetic service acceptance took 31.48 s, including 30.55 s for a new MFA code. The quiesced fixture reconciled to its recovery point with zero fixture loss. An incident RPO requires a real backup cadence and post-snapshot reconciliation.

The repository also exercises a populated upgrade to the current schema, forced interruption, rollback of that migration transaction, retry, and downgrade refusal. Schema 0073 and its 74 migration hashes carry forward.

The shuffled focused suite passed 68 analytics, insight, assistant, anomaly, upgrade and release checks. The opt-in encrypted recovery drill passed separately and again during the full suite. The second run reached frozen API readiness in 0.94 s and service acceptance in 39.14 s, including 38.01 s for MFA. All 1,305 repository tests passed, along with build, lint and type checks.

## Release qualification boundary

For version 6.5 and later, qualification and signed bundle verification require `phase6_workload_and_fairness` and `phase6_data_recovery_and_rollback` in addition to the existing reports. The host workload report needs the agreed dataset, traffic mix and numerical latency, error and queue targets, raw samples, reconciliation and recovery under worker contention. The recovery report needs matching encrypted Phase 6 evidence, rejection of revoked access, fresh artifact regeneration, feature rollback and measured service RTO/RPO on the physical restore host. [Enterprise operator guide](../../infra/enterprise/README.md)

| Gate                        | Evidence still needed                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owners and acceptance       | Named product/data, operations, privacy/security and release owners under Netro Systems Limited. Agree service targets, test inputs and data correction/approval responsibilities.                                     |
| Hosting and supply chain    | Clean reviewed source, exact Linux/architecture image builds, SBOM and scans, disconnected install and upgrade, distinct-host restore, off-site custody and signed qualification. This Mac remains a development host. |
| Independent security review | Include effective-date query isolation, aggregate/cohort disclosure, read-key and session-family boundaries, assistant injection/citations, reviewer scope and evidence protection, queue exhaustion and stale leases. |
| Retention and vendors       | Approve aggregate exposure, live export expiry, backup copies, anomaly evidence and dismissal reason retention. Model provider and egress approval remains separate.                                                   |
| Production operation        | Verify recurring backups, recovery point objectives, real detector backtests, language review and Phase 5 country, identity, merchant and governance gates.                                                            |

The production dependency audit went from two moderate advisories to one. ExcelJS now resolves to patched `uuid` 11.1.1 through a package-scoped override. The `minimatch` finding remains open. Its patched release is a major upgrade and the older archive dependencies still use legacy exports. The audit reported zero high and critical findings. [uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) · [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

## Repeating the local measurements

Use a disposable database and the existing scale seed with `m5-scale` and `m5-control` slugs. Opt in the four Phase 6 features in that database. Create four completed months with four attendance days per worker per month, 600 minutes per day in the selected month and 420 in each baseline month. Seed reconciled locked runs of BDT 105.50 per worker. The benchmark verifies an authenticated internal fixture before it runs. Its private input holds `origin`, `month`, and `tenant` with the fixture's `id`, `slug`, `size`, `companyId`, `employeeId` and current access `token`. An MFA-backed administrator session is required for payroll. The script emits sanitized timing and reconciliation summaries. [Measurement harness](../../apps/api/scripts/measure-phase6.mjs)

```sh
node apps/api/scripts/measure-phase6.mjs /private/m5-input.json baseline
node apps/api/scripts/measure-phase6.mjs /private/m5-input.json mixed
```
