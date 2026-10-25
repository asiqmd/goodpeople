# ADR 014: Billing invoices monthly in arrears, and access follows the oldest unpaid invoice

**Status:** accepted for Phase 3 M2 · 2026-10-25

## Decision

**A workspace is invoiced after each month, per seat.** A seat is anyone employed on any day
of the month. Their job at the month's end decides the price: a factory worker's seat is
cheaper than a staff seat, because a factory with thousands of workers cannot pay corporate
prices.

Each plan has a price per staff seat, per worker seat and a monthly minimum. Prices are
dated, and an invoice uses the price in force at the start of its month. A first month counts
from the day the plan was chosen. A coupon comes off before VAT, for as many months as it
says. Choosing a plan is self-serve for Starter, Growth and Business; Enterprise is agreed
with us.

**Invoices are snapshots that never change.** Each invoice keeps the supplier, the buyer, the
lines, the VAT rate and the amounts as issued, and becomes a Mushak-6.3 PDF in English or
Bangla. A mistake is corrected with a credit note (Mushak-6.7) against the invoice, never by
editing it.

Numbers run per fiscal year (July to June), separately for invoices and credit notes:
`GP/2026-27/000001` and `GP-CN/2026-27/000001`. The serial comes from a counter row that is
locked while it is taken, so two invoices never share a number.

**Access follows the subscription, and the subscription follows the invoices.** Billing still
never decides access itself (ADR 003). After every invoice, payment, deduction or credit
note, and each day:

- With unpaid invoices, the subscription is paid through the due date of the oldest one. It
  is `past_due` once that date has passed.
- With nothing owed, it is paid through next month's due date.

Phase 0's access rules then do the rest: full access through the grace days, then read-only,
never locked, with export always open. Choosing a plan, paying and recording withholding stay
open while read-only (`@WritableWhenReadOnly`), so a workspace can always pay its way back.
Complimentary, internal, partner and licence workspaces are never invoiced to the workspace.

**Gateways sit behind one interface, and nothing a browser says is trusted.** SSLCommerz
(cards, internet banking) and bKash (tokenized checkout) each start a checkout and later
verify it with the gateway, server to server. A payment is recorded once, only from
`pending`, at the amount the gateway confirms. That makes a repeated return or notification
harmless. A gateway is offered only when its credentials are set. A test gateway that takes
no money exists for development and is off unless `BILLING_FAKE_GATEWAY=on`.

**Bank transfers and cheques** are recorded by our finance staff, or matched from a bank
statement: a credit whose narration names an invoice number is recorded once.

**Tax a customer withholds counts at once.** A customer may deduct VAT (VDS, with a
Mushak-6.6 certificate) or income tax (TDS) from what it pays. It records the deduction
against the invoice, up to the legal rate on the value before VAT, and the deduction reduces
what is owed straight away. Our finance staff accept it once the certificate is checked, or
reject it, which makes the amount owed again. A customer obeying the law is never pushed
towards read-only while we check paperwork.

**VAT rules live in the Bangladesh country pack, with their law.** The service's VAT and VDS
rates, the buyer-details threshold, the bank-payment rule and the startup exemption are
dated values with references, marked `needs_review` until the tax consultant signs them off.

Which service code a subscription falls under is a platform setting:

- `S099.10`, IT-enabled services, at 5%;
- `S099.20`, other services, at 15%.

NBR has not ruled which applies to SaaS.

**Billing tables are platform tables.** Like `subscriptions`, they hold no workspace data and
have no row-level security. Every workspace-facing read filters by the signed-in workspace,
and the tenant-isolation test lists them as platform tables.

**Partners are billed for their workspaces.** A workspace put with a partner moves to the
`partner` billing mode. The partner gets one invoice a month, with a line per workspace, at
its discount.

## Why

- **Arrears with dated prices** charge for the people actually employed. A month's invoice
  can be recomputed and checked by hand, and the arithmetic is pure, tested functions.
- **Immutable invoices and credit notes** are what VAT law expects (rule 40). They also mean
  a reprinted PDF always matches what the customer was sent.
- **Driving access through the subscription** reuses the access rules every other billing
  mode already uses. "Read-only, never locked" is enforced in one place, and paying restores
  access on the next request.
- **Server-side verification and idempotent settlement** protect against forged returns,
  double clicks and gateways that call twice.
- **Counting withholding at once** follows how Bangladeshi companies actually pay: net of
  VDS and TDS, with the certificate later.

## Consequences

- **Gateways need live testing.** SSLCommerz and bKash were built from their documentation
  and tested against recorded answers, not their sandboxes. A sandbox store and bKash
  credentials are needed before launch.
- **Credit after payment.** A credit note on an invoice already paid leaves the customer in
  credit. That credit is not yet carried to the next invoice, so it is refunded or offset
  by hand.
- **The service code is a business risk** until NBR or the tax consultant decides it. If it
  changes, it applies to invoices issued from then on. Earlier invoices keep their rate, and
  any difference is settled with credit or debit notes.
- **Seats come from employment dates and the job's worker category.** A workspace that never
  separates leavers pays for them, and the billing page shows this month's count to make
  that visible.
- **The test gateway must stay off in production.** The configuration documents this.
  Refusing it when live credentials are set is a small follow-up.
