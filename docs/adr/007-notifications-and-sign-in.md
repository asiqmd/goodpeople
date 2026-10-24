# ADR 007: Notifications go through an outbox; sign-in gains SMS codes and a second step

**Status:** accepted for Phase 1 M5 · 2026-10-24

## Decision

**Notifications.** Whatever happens (a request to decide, a decision, a document expiring, a
letter issued) is written as one `notifications` row per person and one
`notification_deliveries` row per channel, **in the same transaction as the change**. A
dispatcher sends the deliveries afterwards:

- It is woken half a second after the change, and also sweeps every 30 seconds.
- It claims each delivery with a five-minute lease, sends it outside any transaction, and
  marks it sent, retried with backoff (1, 2, 4, 8 minutes), or failed.
- Each channel has a driver chosen in the environment: SMTP for email, SSL Wireless for SMS,
  Firebase Cloud Messaging for push. Each also has a `log` driver for development and tests.
- Text comes from templates per event and language (English and Bangla), which a workspace may
  reword. Each person gets their own language.
- SMS count against the plan's monthly credits; over the limit they are skipped, not sent.
- Daily reminders carry a key, so each is sent once however often the job runs.

Sign-in codes are the exception: they are sent straight away, because someone is waiting,
and recorded with the code hidden.

**Sign-in.**

- **Employees** may sign in with a six-digit code sent by SMS instead of a password. Codes are
  stored hashed and expire in five minutes. Each allows five wrong guesses and works once.
  Requests are limited per number and per address, and the answer is the same whether or not
  the number has a login.
- **Two-step sign-in** uses authenticator apps (TOTP, RFC 6238), with eight one-time recovery
  codes. The secret is field-encrypted. With `REQUIRE_ADMIN_MFA=on`, workspace and HR admins
  and every platform user must set it up during their first sign-in.
- After a right password, the second step is a short-lived token signed with its own key, so
  it can never pass as an access token.
- Sign-in attempts are limited per login and per address, in memory.

**Role templates.** A role is a named set of permissions (`employees.read`,
`attendance.manage`, `users.manage` and so on). Routes check permissions, never role names:
workspace admin, HR admin, HR officer, attendance officer, auditor and employee. Identity
numbers are shown in full only with `employees.identity`.

## Why

- A notification must never be lost when the change succeeded, nor sent when it rolled back.
  Writing it in the same transaction gives both without a message broker. Redis and BullMQ
  arrive with payroll in Phase 2 and can replace the dispatcher's loop without touching
  callers.
- Many factory workers have no email and share phones, but every one has a mobile number. An
  SMS code is the sign-in they can use. Staff with wide access need more than a password.
- Permissions let a workspace give someone attendance without identity numbers, or audit
  without changes, and new roles become a table entry rather than code changes.

## Consequences

- Delivery is at least once: a crash after sending and before marking can repeat a message.
- Rate limits and the dispatcher's wake-ups live in one API process. Several API instances
  need a shared store (Redis) first. Until then the runbook says to run one.
- SMS costs money and sender IDs need BTRC approval; workspaces start with SMS off.
- The bundled SMS driver follows SSL Wireless's v3 API. Other gateways fit the same small
  interface, and each needs checking against its own documentation before go-live.
- A role's permissions are code (`packages/shared/src/permissions.ts`). Custom roles per
  workspace come later, with field-level permissions (Phase 5).
