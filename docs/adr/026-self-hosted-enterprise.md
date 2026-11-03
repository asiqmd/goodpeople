# ADR 026: Bound enterprise installations and offline release evidence

Status: accepted for the local Phase 5 M3 candidate; commercial qualification pending.

## Context

Enterprise customers need an offline installation with customer-owned infrastructure, key custody and recovery. An unsigned billing flag cannot be the trust boundary for an installed license. A database restore can revive sessions, provisioners and removed users; merely restoring the SQL dump is insufficient. Dedicated placement must not become an arbitrary DSN router or an unreviewed live tenant relocation tool.

## Decision

An installed database binds one immutable installation/customer/tenant identity and self-hosted or dedicated mode. API/worker configuration must match it; managed mode refuses an installed database. JWTs, machine credentials and tenant-scoped transactions reject another tenant. Forced RLS remains active and the online application role cannot own/create schema or bypass RLS. Restricted installation/placement metadata is server-managed platform/auth metadata, separate from tenant business tables.

The vendor signs strict versioned Ed25519 license envelopes covering exact bytes, installation/customer/tenant bindings, sequence, feature/limit set and dates. Only public verification keys ship. Signed entitlements do not change actor/company/field permissions. Read-only expiry/invalid/missing/clock-anomaly state preserves authorized reads/exports/revocation; explicit suspension remains stronger. Rejected renewals retain the previous valid envelope and append evidence. Sequence and observed-clock high-water marks cannot move backward through ordinary updates. The host database owner remains trusted; this is not hostile-host DRM.

A named one-use bootstrap invitation replaces demo/default credentials. Installed mode requires MFA and disables signup. Core services require no vendor callback. Optional providers require an explicit customer egress decision; disabled channels skip without logging message bodies. Diagnostics require an explicit recent-MFA administrator action and emit an allowlist, with no automatic transfer.

The first candidate profile is Linux/Docker Compose, one host/architecture, PostgreSQL 17, authenticated persistent Redis, separate fenced worker and local encrypted document storage. Both application Dockerfiles pin the same Node image digest. Signed releases bind exact API/web/dependency image IDs, the shared worker/API image, source provenance, SBOMs/notices, SQL, configuration schema, runtime and runbooks. An out-of-band release public key verifies exact SHA256SUMS bytes before bundle code executes. Bundles start as candidates; qualification requires reviewed reports for exact artifacts, two distinct Linux hosts and agreed/measured service RTO/RPO. The release key and license key are separate.

Migration locking and migration execution use the same dedicated PostgreSQL session, with SQL-history verification before changing schema. An interrupted transaction rolls back and releases the session lock. An image rollback is not a database downgrade. Supported upgrade paths require populated-data, interruption and joint-recovery evidence; future contract/backfill steps must supply their own qualification.

A joint local recovery point contains a PostgreSQL custom dump, referenced encrypted documents, per-table row/checksum inventory, document hashes and key fingerprints inside an authenticated encrypted archive. Backup credentials and encryption key are independent of online app/owner credentials. Restore requires a fresh database/directory, matching field/key history and a fresh JWT secret. It verifies data first, revokes restored sessions/provisioners/machine credentials, disables external delivery and enters a reconciliation freeze. Only named local recovery administrators may reach recovery controls. Human identity/company/payment reconciliation and fresh credentials precede a recorded MFA-backed acknowledgement. Restore-to-maintenance timing is never labelled service RTO.

The legacy field root remains the blind-index root. New field/file writes can use an authenticated key ID with retained historical read keys; v1/GPF1 remain readable. Bulk re-encryption and blind-index rotation/backfill are deferred. Key custody must include the root and all historical keys for every retained backup.

The managed placement registry creates new metadata-only pilot tenants. It stores approved routing/residency metadata and an installation proof public key, never a caller-supplied DSN. Activation verifies a short-lived challenge-bound receipt from a separate licensed dedicated database after two actual named local MFA recoveries. Shared login returns an approved origin link and forwards no credentials. Active dedicated tenants are excluded from shared business entitlements. General live tenant relocation remains deferred. In-place adoption is confined to an existing single-customer self-hosted database with matching tenant/license, maintenance, backup and reconciliation; it is not shared SaaS extraction.

## Evidence and consequences

The local tests exercise license signatures/bindings/limits/renewals/expiry/export/clock handling, one-use bootstrap and mandatory MFA, diagnostics redaction, placement proof/replay/routing, historical encryption, disabled delivery, populated 0055→0058 migration serialization/interruption/retry, and same-host fresh-database encrypted recovery with a separate read-only BYPASSRLS backup role. Linux image execution, clean disconnected install, physical second-host recovery, actual host version matrix, production service RTO/RPO and commercial support approval remain open. No commercial qualification is inferred from CI configuration or native rehearsal.

See the [operator runbook](../../infra/enterprise/README.md), [responsibility contract](../../infra/enterprise/responsibilities.md), [Phase 5 record](../phases/phase-5.md#m3-implementation-record) and [control register](../security/enterprise-controls.md).
