# Phase 3: Bangladesh commercial launch & industry packs

**Goal:** a Bangladeshi company finds Good People, signs up, sets itself up and pays without
talking to us, and RMG factories, NGOs and groups of companies find what they need ready-made.

Phase 3 builds on Phase 2's payroll and the Phase 0 tenancy model, where billing modes and
entitlements are separate from payment. It ships in five milestones. Each is merged only when
its tests pass and it has been walked through in the browser.

| Milestone                         | Scope                                                                                                                                                                                                  | Depends on | Status |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------ |
| **M1 Sign-up & onboarding**       | Public site in English and Bangla, self-serve sign-up with a verified email, 30-day trials, industry templates (RMG, corporate, NGO, group), a first-steps guide, the sign-up funnel for us            | Phase 2    | Done   |
| **M2 Billing & invoicing**        | Prices per employee with a worker seat, monthly metering, VAT invoices (Mushak 6.3) with VDS and TDS, coupons, card and bKash payments, bank and cheque reconciliation, dunning to read-only, partners | M1         |        |
| **M3 RMG pack**                   | Piece rate and production incentives, overtime caps and alerts, adolescent workers, maternity benefit, participation committee and union records, anonymous grievances, buyer-audit reports, kiosk     | M1         |        |
| **M4 NGO & group packs**          | Projects and grants, salary split across projects, timesheets, donor reports, field staff offline; group dashboards, group policy with company overrides, shared-service HR roles                      | M1         |        |
| **M5 Support & launch hardening** | Help centre in English and Bangla, support tickets, status page, penetration-test fixes, a disaster-recovery drill, verified backups, the launch runbook                                               | M2–M4      |        |

**Exit test:** a company signs up, imports its people and runs a parallel payroll on a trial
without our help, then pays its first invoice by card, bKash or bank transfer and receives a
Mushak 6.3 VAT invoice. A workspace that stops paying goes read-only and can still export
everything. An RMG design partner passes a mock buyer audit from our reports. The penetration
test has no open high or critical findings, and a restore drill meets the four-hour recovery
target.

## Principles

- **Read-only, never locked.** A trial that ends or an invoice not paid makes a workspace
  read-only (Phase 0's access states). Nothing is deleted, and exporting always works.
- **Proven before provisioned.** A workspace exists only after its owner has proved they hold
  the email address. Sign-up is rate-limited per address and per network, and a hidden field
  catches simple bots. We do not depend on solving or serving CAPTCHAs.
- **Bypass stays bypass.** Complimentary, internal, partner and licensed workspaces never see
  billing. Self-serve trials are the only new way in, and the super admin can still assign
  any company.
- **Templates are data.** An industry template creates ordinary records (units, designations,
  shifts, structures) that the workspace edits like any other. Industry features (piece rate,
  grants) are modules a plan includes, never per-customer code.
- **Tax rules carry their law.** VAT rates, invoice fields and withholding are effective-dated
  country-pack rules with references, reviewed by the tax consultant, like salary tax in
  Phase 2.

## M1: Sign-up & onboarding

### Public site

- **Home** in English and Bangla: who it is for (RMG, corporate, NGO, groups), what Bangladesh
  law it knows, and a "Start a free trial" button.
- **Pricing:** the plans with their modules and limits. Prices come with M2. Until then the
  page says prices are per employee per month, quoted on request, and the trial includes
  everything in Business.

### Sign-up

1. **Start:** name, work email, company, industry, and language. A six-digit code goes to the
   email.
   - Codes expire in 15 minutes and allow five wrong guesses.
   - Requests are limited per address and per network.
   - A hidden field that people never fill catches simple bots.
2. **Verify:** the code, the workspace address (checked as it is typed, with a suggestion
   when it is taken) and a password. The workspace is created and the owner is signed in, or
   sent to set up two-step sign-in where the server requires it for admins.
3. **The trial:** 30 days of the Business plan. When it ends the workspace is read-only until
   a plan is chosen (M2).

- One trial per email address. Someone who has one is told to sign in instead.
- The server can turn sign-up off (`SIGNUP_ENABLED`), for our own installations and
  self-hosted ones.
- Each workspace created this way is in the platform audit log as a sign-up, with no
  platform user as its actor.

### Industry templates

Every workspace gets the country pack (leave types, holidays, letters, pay components and
structures, a general shift). The template then adds a starting organisation the workspace
edits as it likes:

| Template  | Company and sites                                  | Units                                                                                | Designations and shifts                                                      |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| RMG       | The company, a head office and a factory           | Admin & HR, Finance; Production with Cutting, Sewing (Lines 1–2), Finishing; Quality | Operators, line supervisor, quality inspector; a day shift and a night shift |
| Corporate | The company and a head office (Sunday–Thursday)    | HR & Admin, Finance, Sales, Operations, Technology                                   | Executives, managers, officers; an office shift                              |
| NGO       | The organisation, a head office and a field office | Programmes, Finance & Admin, Monitoring & Evaluation                                 | Programme officers, field facilitators, coordinators                         |
| Group     | The group's first company and a corporate office   | Group HR, Group Finance, Shared Services                                             | Group-level managers and officers                                            |
| Other     | The company and a head office                      | HR & Admin, Finance                                                                  | Officers and managers                                                        |

A factory site makes the Labour Act's factory rules (earned leave every 18 days worked)
apply there.

### First steps

- **Welcome page:** a short guide from the go-live checklist.
  1. Check the company details.
  2. Review the organisation.
  3. Add or import employees.
  4. Give the HR team logins.
  5. Set up pay.

  Each step shows whether it is done and where to do it.

- **Trial banner:** the days left, on every page of a trial workspace, then the read-only
  notice when it ends.

### For us

- A **Sign-ups** page in the platform console: each started sign-up with its company,
  industry and stage (code sent, workspace created), newest first.

How sign-up fits the tenancy model and why is in
[ADR 013](../adr/013-self-serve-sign-up.md).

### Done when

- **Unit tests:** workspace addresses from company names (suffixes dropped, always valid,
  Bangla names included); each industry template's units, designations and sites are
  consistent (parents first, codes unique, Bangla names present).
- **API end-to-end tests (3 new):**
  - an RMG sign-up:
    - the emailed code, a wrong code and a taken address refused;
    - the workspace created and its owner signed in, with the code then spent;
    - the trial's plan, features and 30 days;
    - the factory, Sewing's lines, the worker designations and the day shift as default;
    - a second sign-up from the same address getting a "sign in" email, not a code;
    - the platform's sign-ups list, closed to workspace users;
  - addresses checked (taken, reserved, free), the hidden field catching a bot, and the
    fourth request in a quarter of an hour refused;
  - sign-up refused where the server turns it off.
- **Web:** the home, pricing and sign-up pages, the welcome guide, the trial banner and the
  platform's Sign-ups page, in English and Bangla. The app needed nothing new: sign-up is on
  the web.

**Checked:**

- 208 API tests in 26 files, also passing shuffled; shared (95, 2 new), country-pack (49) and
  the Edge Agent's (64). Flutter: 221 tests and analyze clean.
- The browser, in English and Bangla:
  - Nasima Haque signed Meghna Apparels Ltd up as RMG. The code came from the API's email
    log. The address `meghna-apparels` was proposed and free.
  - She landed on the welcome guide signed in, with "Free trial: 30 days left" on every
    page. "Review your organisation" was already done by the template.
  - The organisation page showed the factory, Production → Sewing → Lines 1–2 with Bangla
    names, and fourteen designations.
  - The Sign-ups page in the platform console showed her sign-up with its workspace.
  - Pricing and the trial banner in Bangla digits.

**Carried into later milestones from M1:**

- **Choosing a plan and paying** come with M2. Until then, a trial that ends is read-only
  and the super admin can change its billing mode, as for any workspace.
- **Trial reminders** before the end come with M2's dunning emails.
- **A sandbox with sample data** (a second workspace to explore before entering real data)
  comes with M5's help centre.
- **Rate limits** are kept in the API process's memory. Several API instances behind a load
  balancer need the shared store (Redis), as noted since Phase 1.
- **Abuse:** the Sign-ups page shows each attempt's company, address and network.
  Disposable-address blocking and reviewing trials by hand come if abuse appears.

## Later milestones (outline; detailed when each starts)

- **M2 Billing & invoicing:**
  - Prices per employee per month, with a lower worker seat for factories. Active employees
    are counted each month and the invoice follows.
  - VAT invoices (Mushak 6.3) with credit notes. VAT and tax deducted at source by customers,
    with their certificates.
  - Coupons.
  - Payments by SSLCommerz cards and bKash behind one adapter, and bank transfer or cheque
    matched by reference.
  - Dunning: reminders, a grace period, then read-only.
  - Trial reminders.
  - Partner (reseller) billing.
- **M3 RMG pack:**
  - Piece rate and production incentives.
  - Overtime caps with alerts.
  - Adolescent workers' hours and age checks.
  - Maternity benefit tracking and payment.
  - Participation committee and union records.
  - An anonymous grievance channel.
  - Buyer-audit reports: wages against grade minimums, hours, overtime, leave.
  - Kiosk mode with ID-card login, and SMS.
- **M4 NGO & group packs:**
  - Projects and grants, with salary split across them in the journal.
  - Project timesheets, donor-format reports, and field staff working offline.
  - Group dashboards across companies, group policy with company overrides, and HR roles for
    shared services.
- **M5 Support & launch hardening:**
  - A help centre in English and Bangla, support tickets and a status page.
  - Fixes from a third-party penetration test.
  - A disaster-recovery drill and verified backups.
  - The launch runbook.

## Sources (checked 25 Oct 2026)

Added as each milestone's research is done.
