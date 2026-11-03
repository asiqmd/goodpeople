# ADR 024: Enterprise identity and access

Accepted locally, 2 November 2026. Implements Phase 5 M1 after [ADR 023](023-enterprise-authorization-boundaries.md). Real-provider production acceptance remains pending.

## Decision

Human access tokens identify a database session and have an explicit issuer, audience, type and signing-key ID. Refresh and logout consult a durable root-family marker, so a refresh child cannot survive a concurrent family revocation. The API reads current login status, role and company grants on every protected request. Tenant business transactions lock the login and session and check the authority revision before proceeding. Grant removal, role changes and SCIM deactivation therefore apply to existing sessions and requests waiting for a transaction. MFA challenges also bind the password proof to its authority revision.

Built-in templates keep their permission matrix. A login enters custom mode explicitly; removing its final assignment leaves no delegated access. Own employee service remains independent. Each grant binds permissions and denials to none, selected companies, or explicitly all current/future companies. Denials win. Identity, bank, contacts and pay fields have separate read, write and export controls. Conflicting field policies resolve conservatively across assignments; restrictions cannot be assembled into broader access through unrelated grants.

Existing historical payroll runs and financial reports lack consistent company snapshots. This release requires all-company authority for payroll permissions and those financial workflows, including legacy scoped users. Own/direct-report custom relationships are supported for employee directory reads; other permissions require company-level relationships. Broader financial/relationship support needs resource-specific designs and tests rather than relaxing these checks.

Production uses private Redis for atomic rate limits, one-use OIDC state and replay checks. Durable database proof tombstones, monotonic TOTP steps, recovery-code consumption and session state survive loss of volatile keys. Memory state is limited to single-process development and tests. Redis failure blocks operations that depend on it. This does not lift the deployment's single-runner limit: M2 still owns durable scheduled work and delivery.

OIDC uses Authorization Code, S256 PKCE, state, nonce, signed RS256 ID tokens, issuer/audience validation and a one-use browser/app-bound handoff. Accounts link through issuer plus subject and proved local ownership, or an immutable SCIM external identifier matched to the configured signed sub/oid claim. Email matching and JIT role creation are absent. One enabled provider per workspace is supported. Two administrators must test it and two named emergency administrators must complete password plus MFA recovery before enforcement.

SCIM 2.0 Users/Groups use tenant/connection-bound, hashed, expiring bearer credentials. Provisioning changes logins and group-owned assignments, never employment or pay. HR disable and IdP disable are independent. Deletion is a retained inactive tombstone. Initial non-conditional updates are supported; supplied stale versions fail, and reactivation or re-adding a removed membership requires a current If-Match. This safety requirement must be confirmed with the chosen provisioner or its adapter.

Support remains a separately granted read-only principal. Custom roles cannot manufacture security administrators; group mappings also cannot grant payroll checker authority. Identity changes require a built-in administrator and recent MFA. Emergency use is audited and alerts administrators.

## Consequences

Deployment requires a migration cutover, durable authenticated Redis, and signing-key procedures. Pre-M1 tokens are retired; rolling an old binary back against custom authority data is unsafe. EN/BN web administration and web/mobile SSO are implemented. A signed local provider and two API instances exercise protocol and revocation behavior; this is not an Entra/Okta production pilot or a multi-runner certification.

See the [identity runbook](../ops/identity.md), [access-path inventory](../security/identity-access-paths.md), [control register](../security/enterprise-controls.md), and [milestone status](../phases/phase-5.md#m1-implementation-record).
