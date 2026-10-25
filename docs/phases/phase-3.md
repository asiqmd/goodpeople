# Phase 3: Bangladesh commercial launch & industry packs

**Goal:** a Bangladeshi company finds Good People, signs up, sets itself up and pays without
talking to us, and RMG factories, NGOs and groups of companies find what they need ready-made.

Phase 3 builds on Phase 2's payroll and the Phase 0 tenancy model, where billing modes and
entitlements are separate from payment. It ships in five milestones. Each is merged only when
its tests pass and it has been walked through in the browser.

| Milestone                         | Scope                                                                                                                                                                                                  | Depends on | Status |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------ |
| **M1 Sign-up & onboarding**       | Public site in English and Bangla, self-serve sign-up with a verified email, 30-day trials, industry templates (RMG, corporate, NGO, group), a first-steps guide, the sign-up funnel for us            | Phase 2    | Done   |
| **M2 Billing & invoicing**        | Prices per employee with a worker seat, monthly metering, VAT invoices (Mushak 6.3) with VDS and TDS, coupons, card and bKash payments, bank and cheque reconciliation, dunning to read-only, partners | M1         | Done   |
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
- **Pricing:** the plans with their modules and limits. Prices came with M2. Until then the
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

- **Choosing a plan and paying** came with M2.
- **Trial reminders** before the end came with M2's reminders.
- **A sandbox with sample data** (a second workspace to explore before entering real data)
  comes with M5's help centre.
- **Rate limits** are kept in the API process's memory. Several API instances behind a load
  balancer need the shared store (Redis), as noted since Phase 1.
- **Abuse:** the Sign-ups page shows each attempt's company, address and network.
  Disposable-address blocking and reviewing trials by hand come if abuse appears.

## M2: Billing & invoicing

### Prices and plans

- **Per seat, per month:** each plan has a price per staff member, a lower price per factory
  worker, and a monthly minimum. Prices are dated and set in the platform console; the
  public pricing page shows the ones in force.
- **Choosing a plan:** a trial (or a paying workspace) chooses Starter, Growth or Business on
  its Billing page, sees what this month's people would cost under each, names the company
  its invoices go to (with its BIN) and can enter a coupon. The trial becomes a paid plan at
  once. Enterprise is agreed with us. Cancelling ends the plan with the month: that month is
  invoiced, then the workspace is read-only.
- **Coupons:** a percentage or an amount off, for a number of months or every month, with an
  expiry and a use limit. One per workspace.

### Monthly invoices

- **In arrears:** once a month ends, each paid workspace is invoiced for everyone employed on
  any day of it. Staff and workers are counted by their job at the month's end. A first month
  counts from the day the plan was chosen; the minimum tops up a small month; the coupon
  comes off before VAT.
- **Automatic and safe to repeat:** a background job issues the last month's invoices and
  brings subscriptions up to date every few hours. Finance can issue any finished month from
  the console; what was issued is kept and not counted again.
- **Numbering:** `GP/2026-27/000001` for invoices and `GP-CN/2026-27/000001` for credit
  notes, per fiscal year, from a locked counter.

### VAT and Mushak

- **Mushak-6.3 (tax invoice)** and **Mushak-6.7 (credit note)** as PDFs in English and
  Bangla, with the form's heading and rule, the supplier's and buyer's names, addresses and
  BINs, the date and time of issue, the service code, value before VAT, VAT and the total in
  words. A credit note names the original invoice and the reason.
- **Rates from the country pack:** S099.10 (IT-enabled services) at 5% or S099.20 (other
  services) at 15%, chosen in the platform's settings until NBR rules which a subscription is.
  A registered startup's exemption (SRO 147-Ain/2026) makes invoices VAT-free.
- **Invoices carry the rules customers need:** VDS and its certificate, and paying through a
  bank or MFS above Tk 1,00,000 so the buyer keeps its input credit.

### Paying

- **Online:** SSLCommerz (cards and internet banking) and bKash (tokenized checkout) behind
  one interface. The customer goes to the gateway's page and comes back to Billing; the
  payment is recorded only after the gateway confirms it server to server, once, at the
  confirmed amount. SSLCommerz's notification records it even if the customer never comes
  back. A test gateway that takes no money is available for development.
- **Bank transfer and cheque:** Billing shows our bank details. Finance records a transfer or
  cheque against an invoice, or uploads a bank statement (xlsx or csv): every credit whose
  narration names an invoice is recorded once.

### Tax withheld at source

- A customer records **VDS** (VAT withheld, with its Mushak-6.6 certificate) or **TDS**
  (income tax withheld) against an invoice, up to the legal rate on the value before VAT.
  It counts against the invoice at once. Finance accepts it once the certificate is checked
  or rejects it, which makes the amount owed again.

### Reminders and read-only

- **Due dates and grace:** an invoice is due ten days after issue (a setting). The
  subscription is paid through the oldest unpaid invoice's due date, then Phase 0's grace
  days apply, then the workspace is read-only: everything can still be seen and exported,
  and Billing stays open, so paying restores it at once.
- **Emails, each sent once:** an invoice issued; three days before it is due; when overdue
  (with the date it goes read-only); when read-only; and a payment received. Trials get a
  reminder a week before and the day before they end, and when they have ended.
- The read-only banner links the workspace's billing people straight to Billing.

### Partners

- Resellers with a discount. A workspace put with a partner moves to partner billing; the
  partner gets one invoice a month with a line for each of its workspaces.

### For us

- A **Billing** section in the platform console: what is outstanding and overdue, the
  invoices and credit notes with their payments and certificates to check, issuing a month,
  matching a bank statement, prices, coupons, partners and settings. Finance (and the super
  admin) can change things; every platform role can read.

How billing fits the access rules and why is in
[ADR 014](../adr/014-billing-follows-invoices.md).

### Research (25 Oct 2026; for the tax consultant to sign off)

| Question                        | What we found                                                                                                                       | Source                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| What a tax invoice must show    | Mushak-6.3: supplier's name, address and BIN; buyer's when above Tk 25,000; date and time; description, quantity, value, VAT, total | VAT Rules 2016, rule 40                                       |
| Credit notes                    | Mushak-6.7, naming the original invoice; buyer's details above Tk 5,000 of VAT effect                                               | VAT Rules 2016, rule 40(1)(g)                                 |
| Which service code              | S099.10 (IT-enabled services, 5%) or S099.20 (other services, 15%); not ruled for SaaS                                              | VDS Rules 2025 rule 3, kept by SRO 140/2026; secondary guides |
| VAT withheld by customers (VDS) | Limited companies and large businesses withhold at the service's rate and issue Mushak-6.6; the seller has six tax periods to claim | VAT Act 2012 s.49; VDS Rules                                  |
| Startups                        | Registered startups exempt from VAT and VDS, 1 Jul 2026 to 30 Jun 2035                                                              | SRO 147-Ain/2026                                              |
| Income tax withheld (TDS)       | 10% of the service fee; IT-enabled services income exempt until 30 Jun 2027                                                         | Income Tax Act 2023 s.90; Sixth Schedule; Finance Act 2026    |
| Paying large supplies           | Above Tk 1,00,000, payment through a bank or MFS, or the buyer loses its input credit                                               | VAT Act 2012 s.46                                             |
| VAT returns                     | Monthly again (Mushak 9.1) from October 2026                                                                                        | NBR, reported by Dhaka Tribune                                |
| Card and wallet gateways        | SSLCommerz session and validation APIs (v4); bKash tokenized checkout (grant, create, execute); every payment needs the PIN         | SSLCommerz and bKash developer documentation                  |

### Done when

- **Unit tests:**
  - the VAT rules: 5% and 15% by service code, withheld at the same rate; the startup
    exemption only within its dates; the thresholds, with their law and review status;
  - a month's charge: seats at the staff and worker prices, the minimum, a part first month,
    a coupon by percentage or amount (never below nothing), then VAT; what is still owed
    after payments, withholding and credit notes;
  - the gateways against recorded answers: SSLCommerz starting a checkout, validating a
    payment (valid, validated before, invalid, a return with nothing to validate, an
    unreachable validator that keeps the store password out of the error, the sandbox and
    live hosts, the transaction id within 30 characters, amounts it cannot take); bKash
    signing in once for many checkouts, starting, executing, falling back to the status query
    and declining a payment that is not the one started; the test gateway; and choosing only
    the configured gateways.
- **API end-to-end tests (11 new), each with its own workspaces so they pass in any order:**
  - a trial choosing a plan in the workspace, with a coupon (a wrong one, a second one and a
    workspace we do not bill refused);
  - cancelling at the end of the month (refused for a trial), and choosing a plan again;
  - invoicing two months in arrears: a part first month at the minimum with the coupon, then
    a full month without it; numbering; issuing again counting nothing; the PDFs in English
    and Bangla; another workspace refused;
  - seats counted from employment dates, staff and workers apart;
  - an overdue invoice making the workspace read-only (a read-only email sent), paying it
    online while read-only, access back at once, a repeated return recording nothing twice,
    a forged return failing, and an unconfigured gateway refused;
  - VDS and TDS within their limits, counted at once, accepted or rejected by finance;
  - a credit note with its VAT, never more than the invoice, and its PDF;
  - a cheque recorded (never more than owed) and a bank statement matched once by invoice
    number, with the unmatched credit reported;
  - a partner's workspace billed to the partner at its discount;
  - trial reminders a week before, the day before and at the end, each once;
  - the console closed to workspace users, and the public prices.
- **Web:** the workspace's Billing page, the console's Billing section and the pricing page's
  prices, in English and Bangla. The app needed nothing new: billing is on the web.

**Checked:**

- 243 API tests in 29 files (35 new: 18 for the gateways, 6 for the charge arithmetic and 11
  end-to-end), also passing shuffled; country-pack (52, 3 new), shared (95) and the Edge
  Agent's (64). Flutter: 221 tests and analyze clean.
- The browser, in English and Bangla, with the development seed's sample supplier and
  prices:
  - The pricing page showed each plan's staff and worker prices and minimum in Bangla
    digits.
  - Trial Co's owner opened Billing from the trial banner, saw what this month would cost
    under each plan, and chose Business for Trial Co Ltd with its BIN. The banner went and
    the subscription showed active, paid through 10 November.
  - With billing backdated to 16 September, the console issued September: one invoice,
    GP/2026-27/000001, for Tk 2,625 (half the minimum, plus 5% VAT). Its Mushak-6.3 PDFs in
    both languages were checked field by field.
  - Moved past its due date, the next background run made the workspace read-only and
    emailed its owner. The read-only banner linked to Billing; paying with the test gateway
    came back to "payment received", with the workspace writable again.
  - A Tk 500 credit note from the console became GP-CN/2026-27/000001 for Tk 525, with its
    Mushak-6.7 PDF.
  - The console's prices, partners and settings tabs, and the summary figures.
  - Fixed on the way: re-issuing a month counted existing invoices as new; the Bangla PDF's
    time of issue said "PM"; the console's payment and credit forms were squeezed into a
    table cell.

**Carried into later milestones from M2:**

- **The live gateways:** SSLCommerz and bKash were built from their documentation and tested
  against recorded answers. Before launch, a sandbox store and bKash sandbox credentials are
  needed to confirm the details the documentation leaves open: the SSLCommerz success
  redirect posting `val_id`, the bKash "already executed" code and its status query's
  invoice field, and what `payerReference` shows the customer.
- **Credit after payment:** a credit note on a paid invoice leaves the customer in credit.
  Carrying it to the next invoice, and refunds through the gateways, come later; until then
  finance settles them by hand.
- **The service code** needs the tax consultant's answer, or an NBR ruling, before the first
  real invoice. All the VAT values are marked for review.
- **NBR's e-invoicing and our own VAT return:** invoices are electronic PDFs; connecting to
  NBR's e-invoice system, and a Mushak-9.1 export for our own monthly return, come with M5's
  launch preparation.
- **Annual prepayment** with a discount (in the commercial plan) is not built.
- **Changing plan mid-month** prices the whole month at the plan held when it is invoiced.
- **The test gateway** must stay off in production; refusing it alongside live credentials
  is a small follow-up.
- **Billing in other currencies** (USD and AED through a merchant of record) is Phase 5.

## Later milestones (outline; detailed when each starts)

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

**M2 billing:**

- VAT and Supplementary Duty Rules 2016, English text (rule 40, Mushak-6.3 and 6.7):
  https://nbr.gov.bd/uploads/rules/Authentic_English_Text_VAT_Rules_2016.pdf
- SRO 140/2026 (VDS rates): https://nbr.gov.bd/uploads/sros/VAT_SRO-140.pdf
- SRO 147-Ain/2026 (startup exemption): https://nbr.gov.bd/uploads/sros/VAT_SRO-147.pdf
- Finance Act 2026: https://nbr.gov.bd/uploads/acts/Finance_Act_2026.pdf
- Income Tax Act 2023 (s.90): https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf
- KPMG, Bangladesh Tax 2026:
  https://assets.kpmg.com/content/dam/kpmg/bd/pdf/Tax/Bangladesh_Tax_2026.pdf
- PwC, Bangladesh withholding taxes:
  https://taxsummaries.pwc.com/bangladesh/corporate/withholding-taxes
- TDS rates for FY 2026-27: https://taxpertbd.com/tds-rates-chart-fy2026-27/
- IT-enabled services exemption:
  https://legalseba.com/bd-resources/tax-exemption-for-information-technology-enabled-services-ites-in-bangladesh/
- VAT on software services: https://rakibhassan.eu/vat-on-software-services-bangladesh/
- Monthly VAT returns:
  https://www.dhakatribune.com/business/420880/nbr-to-return-to-monthly-vat-return-process
- E-invoicing in Bangladesh:
  https://www.vatupdate.com/2026/08/28/bangladesh-e-invoicing-e-reporting-country-booklet/
- SSLCommerz API v4: https://developer.sslcommerz.com/doc/v4/
- bKash tokenized checkout: https://developer.bka.sh
