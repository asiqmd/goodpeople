# Public API, webhooks and workers

Phase 5 M2 is implemented locally. A customer receiver pilot, production DNS/TLS/egress review,
load and failover drills, and Docker image execution remain release evidence to collect.
[ADR 025](../adr/025-public-integrations-and-durable-work.md) records the boundaries.

## Administrator and client onboarding

Open **Workspace → Public API and integrations** as a built-in workspace administrator.
Confirm MFA within five minutes before changing clients, keys or subscriptions. The console
is available in English and Bengali. New authority needs full Enterprise `api_access`;
read-only workspaces can inspect and revoke existing authority. Suspension blocks access.

Choose an active accountable owner, expiry (1–365 days), scopes, explicit public field grants
and companies. `none` is an inactive placeholder; selected companies do not gain future
companies. All-company scope includes future companies only when the owner has that same
ceiling. Custom own/direct-report grants cannot delegate a company-wide feed. Denies win.
Public directory fields are separate from the four sensitive human field groups; those
sensitive groups are never part of v1. Maximum 20 unrevoked clients per tenant.

Copy the initial client secret once into the receiving server's secret store. Only its SHA-256
hash is retained. These random 256-bit secrets are not passwords. The client identifier is
`gpcli.v1.<tenant UUID>.<client UUID>`; the secret is `gpsec_…`. Browser/mobile apps cannot
keep these credentials confidential. Never place them in URLs, source control or logs.

Obtain a token with an HTTPS POST to `/oauth/token`: HTTP Basic client authentication,
`application/x-www-form-urlencoded`, `grant_type=client_credentials`, and optional narrowed
space-separated `scope`. Supported scopes are `org:read`, `employees:read`, `attendance:read`.
Use the returned token only as `Authorization: Bearer …` on `/public/v1`. There is no refresh
token. Default lifetime is 300 seconds, configurable 60–900 and bounded by credential/client
expiry. Its derived signing key, audience and service kind are independent of human/SCIM
credentials; it cannot call internal tenant or payroll controllers.

Rotate a client secret with an explicit overlap of 0–3600 seconds (default 300). At most two
credentials may remain live. Deploy the new secret, then revoke the former credential or wait
for overlap expiry. Revoking a credential stops tokens minted with it; revoking a client stops
all of its tokens and disables its subscriptions. Every request rechecks current database
state. Any client edit advances its version and invalidates old tokens. Owner scope changes
apply immediately; disabling an owner also sets a persistent review requirement. Re-enabling
the owner alone does not restore client access: edit/review the client explicitly.

## Version 1 read contract

The published contract is [public-v1.openapi.json](../api/public-v1.openapi.json), served at
`/public/v1/openapi.json`. Regenerate after building with
`pnpm --filter @gp/api public:openapi`; acceptance tests check that it matches the live contract.

| Resource                                          | Scope and fields                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/companies`, `/sites`, `/units`, `/designations` | `org:read`; IDs and company boundaries, optional `org_names` (code/name). Designations are those referenced by effective jobs in allowed companies.                                                          |
| `/employees`, `/employees/{id}`                   | `employees:read`; ID/company plus explicitly granted employee code, display name, employment status, job references. Company follows the latest effective job, including the last job after separation.      |
| `/attendance`                                     | `attendance:read` and Attendance feature; processed closed calendar days, historical company on that day, optional day status and minute totals. No raw punches, flags, GPS, images or private leave detail. |

IDs are UUIDs; dates are ISO `YYYY-MM-DD` in the existing Dhaka calendar. `finalized` means the
calendar day has ended, not that later attendance corrections are prohibited. No new country
or payroll interpretation is introduced. Private identity, contacts, bank, pay, survey/peer
responses and HR cases are absent from the public SELECTs; v1 never decrypts those fields.

List filters are allowlisted: `company_id`, `limit`, `cursor`; employees also `status`;
attendance also `employee_id`, `date_from`, `date_to`. The attendance window is at most 93
calendar days, default previous 30 closed days. An out-of-scope filter returns an empty list;
out-of-scope employee detail returns 404. There are no aggregate totals. Default page size 50,
maximum 200, stable ascending ID order. A cursor expires after 15 minutes and binds tenant,
client, current authority, resource and filters. On invalidation restart from page one.

Pages are not a snapshot. Concurrent transfers, updates and UUID insertion can change later
pages; upsert by ID, consume notifications and periodically reconcile the full permitted feed.
Deletion/retention and grant changes require recipient-side reconciliation and deletion policy.
No ordering or gap-free historical CDC stream is promised. Breaking v1 changes require customer
notice and at least 180 days of supported version overlap before removal.

Requests carry `X-Request-ID`. Public errors are
`{"error":{"code":"…","message":"…","request_id":"…"}}`; OAuth uses its standard string
`error` and `error_description`, plus `request_id`. Errors never contain SQL or secrets.
Minute limits use `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix seconds).
429 includes `Retry-After` seconds. Default per-client limits are 120/minute and 20,000 per
24-hour fixed window starting with first use. Token minting is limited to 30/minute per IP
and 20/minute per client. Requests, including failed scoped reads after authentication, use
quota. Refresh on 401, review authority on 403, and back off on 429/503. Shared Redis failure
fails closed; all API instances must share the same durable namespace, keys and quota settings.

## Signed receiver contract

Create at most ten subscriptions per client, including disabled subscriptions. HTTPS URLs
cannot contain user information, query or fragment. DNS must resolve entirely to public
addresses; delivery pins the validated address while preserving TLS hostname verification.
Private/loopback/link-local/metadata addresses are blocked. Exact `WEBHOOK_PRIVATE_HOSTS`
entries are operator-approved exceptions, still HTTPS in production. Only isolated tests
permit HTTP on an explicitly allowed host. DNS timeout is 2 seconds; POST/read deadline
5 seconds, response cap 64 KiB. Redirects are failures and are never followed.

Events are captured in the employee/job/attendance business transaction, with immutable ID,
version `1`, event type, tenant ID, occurrence time and resource ID/type/company/date. No
names or private business payloads are included. Events are only retained once a tenant has
an API client. Subscriptions do not backfill events predating their creation. A hire can emit
both created and updated references; consumers reconcile by stable resource ID.

The exact UTF-8 body and these headers are sent:

- `GP-Event-ID`, `GP-Delivery-ID`, `GP-Subscription-ID`
- `GP-Key-ID`, `GP-Timestamp` (Unix seconds), `GP-Signature`

The signature is `v1=` plus lowercase HMAC-SHA256 hex. The key is the one-time signing secret
used as UTF-8 text, not base64-decoded. Sign these exact bytes, without adding a newline:

```text
v1.<key ID>.<timestamp>.<event ID>.<delivery ID>.<exact original body>
```

This is the GP v1 protocol, not an implementation of RFC 9421. The
[receiver verifier example](../../apps/api/examples/verify-webhook.ts) checks raw bytes,
constant-time signature comparison, a ±300-second timestamp window and key-to-tenant/
subscription binding. Production receivers need persistent inbox deduplication, not a memory
set. In one transaction insert `(tenant_id,event_id,raw_body)` under a unique key, commit,
then acknowledge 2xx and process asynchronously. Retain deduplication records for at least
the sender retention/replay horizon. An acknowledgement lost after acceptance can cause the
same event and delivery IDs to arrive again, with a fresh timestamp and signature.

To rotate a signing key: **prepare**, copy the one-time secret/key ID into the receiver while
retaining the old key, then **activate**. Preparation does not change outgoing signatures.
Keep the former key for at least five minutes after activation for in-flight requests.
If a prepared secret is lost, prepare another. The sender stores signing secrets encrypted.

Owner, client, live credential, company, event scope, subscription and feature authority are
rechecked at fanout and delivery; employee events also recheck current company. Authority
locks remain held through the bounded POST so revocation cannot commit while it is in flight.
Queued work outside current authority is suppressed. Restore access, enable a repaired receiver,
and provide a review/repair reason to replay a retained dead/suppressed delivery. Replay is
audited and rechecks authority; the worker checks it again. It never extends event retention.

Default retry is exponential 30 seconds up to one hour, plus up to 20% positive jitter,
maximum eight attempts. 410 or exhaustion dead-letters the delivery and disables the endpoint;
repeated endpoint failures also disable it. A crash before recording success can duplicate a
POST: delivery is at least once, never exactly once, and ordering is not promised. Temporary
DB failures leave the lease recoverable rather than suppressing legitimate work.

Events/delivery records expire after 14 days by default, configurable 1–90 days. Decreasing
retention also purges older rows. The default pending/leased delivery cap is 10,000 per tenant;
unfanned events wait for room until retention expires. Monitor both queues and reconcile the
API after an outage, disabled subscription, lost authority or retention expiry. Retention is
not a durable customer archive.

## Worker inventory and operation

API entrypoint `dist/main.js` never schedules, even with the former `BACKGROUND_JOBS=on` switch.
Run `BACKGROUND_JOBS=on pnpm worker` after building, or the compose `worker` service using
`node dist/worker.js`. `PROCESS_ROLE=worker` belongs to that entrypoint; it opens no HTTP port.
Both roles use the same database, encryption/access keys, storage and Redis. Local smoke
runs use log email/SMS/push drivers; production needs configured providers.

| Scheduled task                                                    | Cadence                        |
| ----------------------------------------------------------------- | ------------------------------ |
| Attendance processing                                             | configured minutes, default 15 |
| Notification outbox; notification reminders                       | 30 seconds; hourly             |
| Timesheet reminders                                               | hourly                         |
| Offer expiry; relation alerts; goal progress                      | daily each                     |
| Employee-service reminders; probation reviews; learning reminders | daily each                     |
| Opening closure; due separations                                  | minute each                    |
| Compliance; maternity; review reminders                           | hourly each                    |
| Candidate retention                                               | daily                          |
| Integration event fanout, delivery and cleanup                    | 5 seconds                      |
| Billing; support closure; status checks                           | 3 hours; hourly; minute        |

The [registry](../../apps/api/src/jobs/scheduled-worker.ts) inventories all 20 former timers;
old module bootstrap hooks are inert. Candidate retention and integration cleanup still run
for suspended tenants; routine tenant work and outbound integration delivery are withheld. Existing unique notifications/business transitions,
attendance upserts and invoice/retention predicates supply business idempotency. External
mail/SMS/push effects can repeat after an uncertain acknowledgement and require provider or
recipient deduplication where available. Notification sends recheck the job fence first.

Each job/tenant (or platform job) claims a DB-clock schedule slot in `job_leases`. Default
lease 60 seconds, renewable at one third of its duration, configurable 10–600 seconds.
A unique owner token fences every business transaction and direct platform query. Transactions
hold a shared lease-row lock so takeover waits until they commit; stale continuations cannot
write after takeover. Very long transactions can prevent renewal and must recover by retry;
keep them below lease duration, tune from measured runtime and review queue age.

A successful slot is completed once; failed work backs off 30 seconds and retains a sanitized
failure code. Process loss expires the lease. No backlog of missed schedule ticks is replayed;
business catch-up predicates process due records. Delivery rows have independent 30-second
leases and unique subscription/event IDs. Graceful shutdown stops claiming and awaits active
work; container grace is 90 seconds. Webhook POSTs may still repeat after a crash.

Per-worker concurrency defaults to four (1–8). The fair cursor visits later tasks even when
earlier tasks remain due. Claims are bounded before work starts; worker pools reserve two
connections per active job plus two for claims/heartbeats. Cadences are polling targets,
not delivery SLAs. Scale and size the shared database/Redis against measured backlog.

The console shows pending/dead deliveries, oldest queue age, unfanned events, latest worker
heartbeat and failed task count. A heartbeat older than two minutes is stale. This is cluster
progress, not an HTTP liveness endpoint per worker. Operators can inspect individual leases:

```sql
SELECT key, heartbeat_at, lease_until, started_at, finished_at, ok, last_error
FROM job_leases ORDER BY heartbeat_at NULLS FIRST;
```

For migration, stop the old timer-owning API, apply 0053–0055, deploy API role with jobs off,
then start the separate worker. Never overlap an old timer runner with the new scheduler.
Two new workers may share the DB lease mechanism after the local multi-worker checks; a real
production failover/load exercise remains required. The default compose topology is one API
and one worker. Redis must remain authenticated, persistent and private; memory security
state is unsuitable for multiple processes. Worker image smoke is configured in CI but has
not been executed locally without Docker.
