# ADR 025: Public integrations and durable work

**Status:** accepted for local Phase 5 M2, 2 November 2026. Production receiver, load/failover
and image acceptance remain pending. Builds on [ADR 024](024-enterprise-identity-and-access.md).

## Decision

Expose a deliberately separate read-only `/public/v1` contract. Machine client credentials
produce short-lived service JWTs with a derived key, issuer/audience and no refresh token.
Human, SCIM and service authority stay distinct. An active accountable owner's current
company/resource ceiling bounds each client's explicit field/company grants; own/report
relationships cannot be widened. Recheck every request and business read, hash random client
secrets, encrypt outbound signing keys and require administrator MFA for changes. Revocation
and owner review are database state, not a token-cache promise.

Publish an independent OpenAPI contract and exact-byte minimal event envelopes. Capture the
outbox through deferred transaction triggers so employee/job creation commits atomically with
its references. Current permission and entitlement checks apply again at fanout, delivery and
replay. Lock the authority rows through a bounded HTTPS POST; validate and pin DNS addresses,
refuse redirects and require an operator exception for private receivers. Retain retryable
work under queue pressure; expire it under the documented retention horizon. At least once
requires durable receiver deduplication and periodic API reconciliation.

Move every old timer to a separate worker application context. PostgreSQL leases claim each
schedule slot, bounded fair execution prevents pool exhaustion, and owner-token fences cover
both tenant transactions and direct platform queries. Row locks serialize writes against
lease takeover. Existing business uniqueness/predicates remain necessary: leases alone do
not provide exactly-once external mail/SMS/push or webhook delivery.

## Consequences and evidence

The API no longer needs a timer-owning replica; default deployment adds a worker with no HTTP
listener. Shared persistent Redis is still required for security state/rates, and workers need
shared keys/storage. Owner/client changes may wait for a bounded in-flight POST. Long DB
transactions can delay takeover/renewal, so runtime and queue age remain operating controls.

Local tests cover two API/worker instances, live ceilings/revocation/review, scoped pagination,
minimal fields/attendance, quotas, transactional rollback, independent receiver verification,
key staging, dead-letter replay, duplicate acceptance, SSRF/redirect refusal, queue pressure,
retention and stale-worker fencing. Scheduler tests check process separation, bounded work
and fairness. These are implementation evidence, not production load or operating evidence.

The [runbook](../ops/integrations.md) defines quotas, retention, replay, signature bytes,
rotation, the timer inventory and deployment cutover. Compatibility follows
[OAuth client credentials](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.4) and
[PostgreSQL locking semantics](https://www.postgresql.org/docs/17/sql-select.html#SQL-FOR-UPDATE-SHARE).
GP v1 HMAC is its own receiver protocol and does not claim
[RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html) interoperability.
