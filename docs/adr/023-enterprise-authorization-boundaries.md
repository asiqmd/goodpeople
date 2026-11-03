# ADR 023: Enterprise authentication shares current, tenant-bound authorization

**Status:** design decision for Phase 5 · 1 November 2026. Implementation not started.

## Context

The existing access token contains a role checked against code-defined permissions.
Company scopes and business relationship checks narrow access; tenant RLS and field
encryption protect the underlying records. The Phase 5 outline adds SSO, provisioning,
custom roles and machine clients. These cannot safely obtain authority just by producing
a valid token or matching an email address.

The complete milestone scope, migration and acceptance criteria are in
[Phase 5](../phases/phase-5.md). Existing local Phase 4 work remains intact.

## Decision

1. **Separate authentication from authority.** Local sign-in and tenant-configured OIDC
   resolve a local tenant login. SCIM manages login lifecycle; it does not change employment
   or pay. External identity keys include tenant, connection, issuer and subject. Account
   linking requires proof, not email/domain matching. OIDC is the first SSO protocol; SAML
   is outside the initial implementation.
2. **Resolve current authority on requests.** Session identity, login status and current
   authorization revision are checked after token verification. Revocation or reduced
   grants affect the next request after commit, including on another API instance. Initial
   authorization reads are authoritative database reads. Legacy tokens end at an explicit
   cutover. Refresh-family rotation and one-time security state are atomic across instances.
3. **Keep grants bounded to resources.** Preserve built-in roles, then introduce local custom
   roles with company/relationship bounds and explicit field read/write/export policy.
   Grants add only within their own bounds; explicit denials win. Evaluate the permission
   for the actual resource, avoiding a cross product of unrelated roles and company scopes.
   Scope distinguishes none/selected/all; removing the last grant cannot fall back to the
   legacy no-rows-means-all behavior. Historical records retain their owning company across
   employee transfers. Server-side projections apply to detail, lists, exports and indirect
   disclosure paths.
4. **Keep principal kinds separate.** Platform staff, tenant people, support, API clients,
   Edge Agents and kiosks retain different credentials and authority. Machine scopes narrow
   approved tenant/company/field grants. Support remains explicitly granted, expiring and
   read-only. Neither kind becomes a tenant administrator or a human payroll checker.
5. **Keep the existing invariants.** RLS, composite tenant foreign keys, field encryption,
   private-case/anonymity rules and human maker-checker still apply. Entitlements remain
   independent of payment mode. Commercial expiry permits authenticated read/export and
   access revocation without erasing policy or enabling a local sign-in bypass.
6. **Place country authority explicitly.** A tenant's country is only an onboarding default.
   Effective-dated employer/worker profiles and pinned rule manifests select statutory
   calculations. Unknown regime/date/cohort blocks the calculation. Currency, locale and
   deployment region are separate concepts and cannot select payroll law by inference.

## Consequences

- M1 must change every token issuer/consumer and static role shortcut before enabling SSO
  or SCIM; adding an IdP button alone does not satisfy the milestone.
- Shared rate limits and replay prevention precede distributed sign-in; durable job leases
  and idempotent effects precede multiple scheduled runners in M2.
- Each new tenant table receives RLS and tenant-safe foreign keys. Authentication/platform
  routing metadata stays restricted rather than serving as a second employee database.
- Field projections and current authorization add work to existing exports, notifications
  and mobile paths. Their negative cases are required acceptance checks.
- Self-hosting retains the same authorization/RLS model. Offline licensing supplies
  entitlements, never user authority or a vendor backdoor.
- International packs require a migration of BD assumptions and independent local review.
  No rule, hosting mode or external assurance is certified by adopting this design.

## Alternatives deferred

Keeping roles authoritative until a JWT expires does not meet deprovisioning requirements.
Mapping arbitrary IdP groups directly to privileged roles bypasses local delegation and
company boundaries. Reusing browser admin tokens for integrations hides the real actor and
permits unintended actions. Inferring legal rules from tenant locale/currency cannot support
a group with companies in several countries. These approaches are excluded from Phase 5.
