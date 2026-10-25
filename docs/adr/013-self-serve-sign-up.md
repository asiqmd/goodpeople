# ADR 013: Self-serve sign-up makes trials from verified email addresses

**Status:** accepted for Phase 3 M1 · 2026-10-25

## Decision

**A workspace is created only after its owner proves the email address.** Sign-up has two
steps:

1. **Start:** the person's name, email, company and industry. A six-digit code is emailed.
   Only the code's hash is stored, in a platform-level `signups` table, since no workspace
   exists yet. The code expires in 15 minutes and allows five wrong guesses.
2. **Verify:** the code, a workspace address and a password. In one transaction this
   creates the tenant, the owner's `tenant_admin` login, the country pack and the industry
   template. The owner is then signed in through the normal login, so two-step sign-in
   still applies where the server requires it for admins.

**Trials are the existing `trial` billing mode.** A sign-up gets the Business plan, with
access ending after 30 days. Phase 0's access rules then make the workspace read-only.
Nothing new decides access: entitlements stay separate from billing (ADR 003), and the
super admin can change the mode like any other.

**Abuse is handled with limits and evidence, not CAPTCHAs.**

- Starts are limited per address and per network, and verifications per sign-up.
- A hidden field that people never fill catches simple bots: they get the same answer and
  no email.
- Each address gets one trial. Asking again sends a "sign in" email, never a second code,
  so the response gives nothing away.
- Every sign-up is listed for the platform team, with the network it came from, and is
  written to the platform audit log with no platform user as the actor.
- The server can turn sign-up off (`SIGNUP_ENABLED=off`) for our own and self-hosted
  installations.

**Industry templates are data.** `provisionIndustryTemplate` creates the company, its sites,
units, designations, grades and shifts from a table per industry: RMG, corporate, NGO, group
and other. They are ordinary records the workspace edits. An RMG template's factory site is
what makes the Labour Act's factory rules apply there.

## Why

- **Proof before provisioning** keeps junk workspaces and typo'd addresses out. It also
  means the welcome email and later invoices reach someone real.
- **Reusing billing modes and access states** means trials end the way unpaid workspaces
  will in M2: read-only, never deleted, export always possible.
- **Templates as data** give each industry a running start without code that branches by
  customer type. A workspace with a different shape renames or removes what it does not
  need.

## Consequences

- The `signups` table holds personal data (names, addresses, networks) for sign-ups that
  never finish. It needs a retention rule, set with the data protection review in M5.
- Rate limits live in one API process's memory until the shared store arrives. More than
  one API instance would give each its own limits.
- A sample-data sandbox is a separate piece (M5). Trials start empty except for the
  template.
