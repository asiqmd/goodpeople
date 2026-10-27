# Launch runbook

How Good People opens to paying customers in Bangladesh, and how we run it in the first weeks.
The server itself is in [runbook.md](runbook.md); a customer moving onto Good People is in
[go-live.md](go-live.md). This page is for us: the people who operate and support the service.

Owners: **Ops** (servers, backups, monitoring), **Support** (tickets and the help centre),
**Eng** (fixes and releases), **Finance** (billing and payments), **Legal** (counsel, the tax
consultant and the labour lawyer), **Lead** (the go/no-go call).

Contents: [Roles](#roles) · [Readiness gates](#readiness-gates) · [Launch day](#launch-day) ·
[Incidents](#incidents) · [Security incidents](#security-incidents) ·
[Rolling back](#rolling-back) · [The first weeks](#the-first-weeks) ·
[Limits we launch with](#limits-we-launch-with)

## Roles

Write the names and phone numbers here before launch, and keep a printed copy.

| Role               | During launch week                                                       | Name and phone |
| ------------------ | ------------------------------------------------------------------------ | -------------- |
| Incident commander | Decides, coordinates, posts on the status page; one person at a time     |                |
| On-call engineer   | Answers alerts within 15 minutes, day and night                          |                |
| Support lead       | Watches the ticket queue and the support inbox in support hours          |                |
| Payroll specialist | Answers payroll and tax questions; checks any figure a customer disputes |                |
| Security contact   | Leads a suspected breach (see [Security incidents](#security-incidents)) |                |
| Comms              | Writes customer emails and status updates in English and Bangla          |                |

**Support hours** are Sunday to Thursday, 9:00 to 18:00 Dhaka time (`SUPPORT_HOURS` in
`packages/shared/src/support.ts`). First-response targets by plan are counted in those hours
and published in the help centre. Urgent tickets outside them reach the on-call engineer
through the support inbox's alert.

## Readiness gates

Each gate needs its evidence linked here before the go/no-go meeting. The Lead decides with
every gate green, or with a written exception.

### Legal and company (Legal, Finance)

- [ ] Counsel signs off the **Terms of Service, Privacy Policy, Refund policy and Data
      Processing Addendum** (`apps/web/content/legal/`). Then remove the draft notice and set
      `TERMS_VERSION` in `packages/shared/src/legal.ts` to the signed version's date.
- [ ] The labour lawyer signs off every rule marked `needs_review` in the Bangladesh pack
      (`packages/country-packs/src/bd/`), including the M3 RMG rules.
- [ ] Counsel confirms the Foreign Donations Act rules (M4) before any NGO relies on them.
- [ ] The tax consultant signs off the VAT and Mushak rules (M2) and salary tax (Phase 2).
- [ ] Trade licence, TIN and BIN (VAT registration) in hand, and entered in **Platform console
      → Billing → Settings**.
- [ ] **SSLCommerz and bKash merchant approval.** Gateways usually review the public site
      for the Terms, Privacy and Refund pages and a contact email (`GP_SUPPORT_EMAIL` in the
      footer); confirm their current list with each.

### Security (Eng, Security contact)

- [ ] The **third-party penetration test** is done on staging against
      [the scope](../security/pentest-scope.md), with no open high or critical finding, and
      every medium either fixed or accepted in writing by the Lead.
- [ ] Every finding of our own review ([review-2026-10.md](../security/review-2026-10.md)) is
      fixed or accepted.
- [ ] CI is green, including the `security` job (`pnpm audit`) and CodeQL.
- [ ] Every platform staff member has two-step sign-in, and `REQUIRE_ADMIN_MFA` is on.
- [ ] Production secrets are new: database passwords, `JWT_ACCESS_SECRET` and
      `FIELD_ENCRYPTION_KEY` (never copied from staging). The key is in the password manager,
      and at least two people can open it.
- [ ] `BILLING_FAKE_GATEWAY` is unset, and Caddy still answers 404 for `/docs` on the public
      API name.

### Infrastructure (Ops)

- [ ] The production server is built by [runbook.md](runbook.md), from a tagged release
      (`GP_VERSION`).
- [ ] **Email:** the sending domain has SPF, DKIM and DMARC, and a test sign-up code reaches
      Gmail and Outlook inboxes, not spam.
- [ ] **SMS:** the sender ID is approved through SSL Wireless, and a sign-in code reaches
      Grameenphone, Robi and Banglalink numbers.
- [ ] **Push:** the production Firebase project, and the app built with
      `APP_ENV=prod` and the production API address.
- [ ] **Backups:** `backup.sh` runs nightly from cron, copies off the server, and each run
      appears on **Platform console → Operations**.
- [ ] **Monitoring:** an external uptime monitor (not on our server) checks
      `https://<GP_API_DOMAIN>/ready`, `https://<GP_DOMAIN>/login` and
      `https://<GP_DOMAIN>/status` every minute and pages the on-call engineer. The alerts in
      [runbook.md → Monitoring](runbook.md#monitoring) are wired to the same pager.
- [ ] The status page shows every component as working, and an incident posted on staging
      appeared there and in a workspace's banner.

### Recovery (Ops)

- [ ] A **restore drill** on the production backups, into a separate machine, met the
      four-hour recovery target, and its timings are written down (as in
      [dr-drill-2026-10.md](dr-drill-2026-10.md)).

### Support (Support)

- [ ] Each support person has a platform login with the `support` role and two-step sign-in.
- [ ] `SUPPORT_INBOX_EMAIL` is a shared inbox that at least two people watch, with an alert
      for urgent tickets out of hours.
- [ ] The help centre (`/help`) has been read end to end against the release, in both
      languages, and the response targets on the contact-support page match the plans.
- [ ] Saved replies for the common questions (sign-in, import errors, the first payroll,
      invoices and Mushak, read-only after a trial) in English and Bangla.
- [ ] Everyone knows the rule for looking inside a workspace: only through access the
      workspace admin granted (Support → Support access), read-only, and every page opened
      is in the workspace's audit log.

### Billing (Finance)

- [ ] Prices final for every plan, with the worker seat and minimums, from the launch date.
- [ ] Gateways in live mode, after a real payment by card and by bKash was made and refunded.
- [ ] The first invoice number of the fiscal year is right, and a Mushak-6.3 has been checked
      against the printed form.

### Product (Lead)

- [ ] Production has no demo data: only `create-super-admin` was run, never `seed`.
- [ ] Sign-up works end to end with a real address, including the terms checkbox.
- [ ] Our own organisations' internal workspaces are created and assigned (complimentary or
      internal) by the super admin.

## Launch day

1. **T−24 h:** code freeze. The release tag is built and has run on staging for a day.
2. **T−2 h:** take a backup by hand (`infra/scripts/backup.sh`) and check it appears on the
   Operations page. Post a maintenance window on the status page if the upgrade needs one.
3. **T−1 h:** deploy the tag ([runbook.md → Upgrades](runbook.md#upgrades)). Migrations run
   with the deploy.
4. **Smoke test** (two people, one in English and one in Bangla):
   - `/ready` answers 200; the status page shows every component working.
   - Sign up a real test company with a real email; enter the code; pick an industry
     template; follow the first steps.
   - Import three people from the sample spreadsheet; hire one by hand.
   - Sign in from the app; punch in; apply for leave and approve it.
   - Compute a payroll on the trial and open a payslip PDF in both languages.
   - Open a support ticket with an attachment; answer it from the console; see the email.
   - Grant support access from the workspace; open it from the console; check a write is
     refused and the audit log shows the pages.
5. **T−0:** remove the maintenance window and announce. Sign-up is open.
6. **T+1 h, T+4 h, T+24 h:** the incident commander checks error logs, the ticket queue, the
   sign-up funnel and payments, and writes one line in the launch log each time.

**Stop the launch** if a smoke test step fails and cannot be fixed within the hour: leave the
maintenance window up, roll back ([Rolling back](#rolling-back)), and set a new date.

## Incidents

**Severity.**

| Level | Examples                                                                                 | Response                                                  |
| ----- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| SEV1  | One workspace sees another's data; everyone is down; payroll figures are wrong           | All hands now; status updates every 30 minutes            |
| SEV2  | A component is down (sign-in codes, PDFs, devices); payments fail; one workspace is down | On-call now, incident commander within 30 minutes; hourly |
| SEV3  | Slow pages, a workaround exists, one feature misbehaves                                  | In support hours; a ticket and a status note if visible   |

**The first 15 minutes.**

1. The on-call engineer acknowledges the alert and names the incident commander.
2. **Post on the status page** (Platform console → Status) in both languages, even if all
   you can say is that you are investigating: which components, how bad.
3. Find the failing requests: every error a customer sees carries a reference (its request
   ID), which is in the API log line for that request. Ask in the ticket for the reference.
4. Decide: fix forward, roll back, or restore (see below). Write each decision and its time
   in the incident log.

**Updates.** Status page updates at the cadence above, through "Identified", "Monitoring"
and "Resolved". Workspaces see open incidents in a banner on every page. Ticket replies link
to the status page instead of repeating it.

**Templates** (fill in the brackets; post both languages):

- Investigating: "We are looking into [problem] affecting [component]. Your data is safe. Next
  update by [time]." / "[উপাদান]-এ [সমস্যা] নিয়ে আমরা কাজ করছি। আপনার তথ্য নিরাপদ। পরের আপডেট
  [সময়]-এর মধ্যে।"
- Identified: "We found the cause: [cause]. A fix is being [deployed/tested]." / "কারণ পাওয়া
  গেছে: [কারণ]। সমাধান [চালু/পরীক্ষা] করা হচ্ছে।"
- Resolved: "[Component] is working again since [time]. [What customers should check, if
  anything.]" / "[সময়] থেকে [উপাদান] আবার কাজ করছে। [গ্রাহকদের কী দেখা উচিত, যদি থাকে।]"

**After.** A written review within five working days for every SEV1 and SEV2: timeline, cause,
what made it worse or better, and actions with owners. Blame-free. Affected workspaces get a
summary by email.

## Security incidents

For a suspected breach, an exposed secret, or one workspace reaching another's data.

1. **Contain.** Depending on what leaked:
   - **A login:** disable it on the workspace's Users page, or for platform staff remove the
     account.
   - **Sessions:** sign everyone out as in [runbook.md → Keys and secrets](runbook.md#keys-and-secrets)
     (rotate `JWT_ACCESS_SECRET` and revoke `auth_sessions`).
   - **Support access:** revoke every running grant:
     `UPDATE support_access_grants SET revoked_at = now() WHERE revoked_at IS NULL;` and
     revoke their sessions in `auth_sessions`.
   - **A database or document copy with `FIELD_ENCRYPTION_KEY`:** treat identity numbers,
     bank numbers and documents as exposed.
2. **Preserve.** Copy the API and Caddy logs and the audit logs (platform and the affected
   workspaces') for the period before anything is rotated out.
3. **Assess.** Which workspaces and which records, from the audit logs and the request IDs.
4. **Notify.** The affected workspaces' admins within 72 hours of knowing, in English and
   Bangla, with what happened, what was exposed and what they should do. Counsel decides on
   notifying authorities under the data protection law in force at the time.
5. **Review** as for a SEV1.

## Rolling back

- **Prefer fixing forward** for anything a small change fixes.
- **The application:** set `GP_VERSION` to the previous tag and `gp up -d`. Migrations are
  forward-only and additive by design, so the previous release runs against the newer
  schema. A release whose migration was not additive says so in its notes, with its own
  rollback steps.
- **The data:** restore only for data loss or corruption, never for a bad release alone. A
  restore loses everything since the backup (up to a day with the bundled database), so the
  Lead decides, and affected workspaces are told what to re-enter.

## The first weeks

**Daily** (incident commander of the day, 15 minutes):

- [ ] Status page and Operations page: every component working, last night's backup present.
- [ ] The ticket queue: nothing overdue against its target; urgent tickets answered.
- [ ] Error log lines since yesterday, grouped; anything new gets a ticket for Eng.
- [ ] Sign-ups started and verified, and trials that imported people (Platform console →
      Sign-ups).
- [ ] Payments received and reconciled; failed card or bKash payments followed up.

**Weekly:** support access grants used that week, and that each had a ticket; dependency
advisories; the help centre articles most searched without a result.

**Monthly:** the restore drill (`verify-backup.sh`), recorded on the Operations page; once a
quarter a full restore into staging.

## Limits we launch with

Known and accepted for launch, each with what would lift it:

- **One server.** The bundled stack is one VM; a failure of the VM is an outage until it is
  rebuilt or restored. A managed database and a second VM come before the first enterprise
  contract with an availability commitment.
- **Up to a day of data can be lost** with the bundled database's nightly dumps. A managed
  PostgreSQL with point-in-time recovery (or WAL archiving) lifts this to minutes.
- **One API process runs the background jobs**, and sign-in rate limits are kept in its
  memory, so a restart resets them.
- **The status page runs on the same server.** When the server is down, the external uptime
  monitor and email are how customers hear from us; a status page on separate hosting comes
  later.
