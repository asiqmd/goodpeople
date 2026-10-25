# ADR 015: The RMG pack keeps the law as rules, alerts instead of blocks, and one set of records

**Status:** accepted for Phase 3 M3 · 2026-10-25

## Decision

**The Labour Act's factory rules are country-pack rules.** Each rule is dated and cites its
section, marked `verified` against the Act's English text or `needs_review` where the
2025–26 amendments are only known from secondary sources. The rules are:

- adolescents' hours, night work and certificate of fitness (s.34, s.37, s.41);
- women's night work only with consent (s.109);
- overtime by consent (Labour Rules, rule 99);
- maternity benefit (s.45–s.50);
- the participation, safety and complaint committees (s.205–s.208, s.90A, s.332A);
- trade unions (s.179, s.204);
- grievances (s.33).

The pages show the section beside every figure they apply.

**Working-time limits raise alerts; they never block or change pay.** A check runs hourly
over the recent weeks. Each finding is one alert per person, rule and period:

- adults over 10 hours a day or 60 a week, or seven days without a day off;
- the company's own overtime caps (often a buyer's code);
- adolescents over their limits or at work at night;
- women at night without consent;
- adolescents without a valid certificate.

An alert follows the attendance: it updates when hours are corrected and resolves when it no
longer holds. HR acknowledges it with what was done. Overtime worked is always paid (s.108):
refusing to record or pay hours would only move the breach into the books.

**One set of records.** Nothing keeps a second set of hours, wages or registers for
auditors. The buyer-audit report and its PDF are read from the attendance, payroll, leave,
maternity, committee and grievance records that run the factory. Asking for "audit hours"
has no answer in the product.

**Piece rates feed payroll as variables.** Production is entered per worker, day and
operation, and keeps the rate, target and incentive it was entered with. Payroll reads three
variables a month: pieces, their earnings and the incentive above each day's target.

- **Piece-rated workers** stay on a wage-board time structure. `PIECE_PAY` pays only what the
  pieces earn above the time wage for the days paid, so the grade's minimum wage is always
  met (s.149).
- **Time-rated lines** earn `PROD_INCENTIVE` for pieces above target.
- **Changes after computing:** production changed after a run is computed sends that run
  back to draft. While a run awaits approval, production for its people cannot change. Once
  the run is locked, its days are closed.

**Maternity benefit is paid as itself.** A case per expected birth works out:

- eligibility: six months' service, and fewer than two surviving children;
- the s.48 average wage, from the locked payroll runs and the days worked in the three months
  before the notice;
- the parts and due dates of the payment option she chose (s.47(4)), including parts lost
  when the proof of birth is late.

Her maternity leave linked to the case is unpaid in payroll: the benefit replaces wages, or,
where she is not entitled to the benefit, the leave is without pay (s.46(2)). Nothing pays
twice.

**Committees and unions are records checked against the rules.**

- **Establishments:** each company is an establishment, and a site with committees of its own
  is one too.
- **Committee checks:** each establishment is checked for the committees its workforce
  requires, their size, the balance of sides, the complaint committee's woman chair and
  majority, the meeting rhythm, minutes sent on time, and the term. Gaps become alerts.
- **Union dues:** deducted through payroll (`UNION_SUB`) only for members whose union has
  check-off and who gave written consent (s.204).

**Grievances are anonymous by design.**

- **Raising one:** a public page per workspace, with no sign-in. Nothing that could identify
  the worker is stored unless they choose to give their name: no login, no address, no
  device, no session. The text is encrypted. They follow up with a reference and a PIN they
  chose; the PIN locks after five wrong tries.
- **Harassment:** only the complaint committee's members can open these cases, whatever their
  role, because workers sit on it. Where no committee exists yet, everyone who handles
  grievances sees them, with a warning that it is missing.
- **Deadline:** the Act's 30 days to decide is shown on every case (s.33).

**The kiosk is a device plus a person.**

- **The device:** a shared tablet holds a revocable device token (`gpk.…`, only its hash
  kept).
- **Signing in:** the worker signs in with the employee code from the ID card (a QR code on
  the card, or typed) and a PIN. They set the PIN with a code texted to the mobile number on
  record.
- **Sessions:** a session lasts three minutes and works only at that kiosk. The screen signs
  out after a minute untouched.
- **What a worker can do:** see their attendance, leave balances and payslips, apply for
  leave through the same rules as self-service, and reach the grievance page.

**Plans.**

- `production` (piece rates) comes with Growth and up.
- `kiosk` comes with Business and up.
- The rest of the pack is the law and comes with every plan that has the module it builds on:
  alerts, adolescents, maternity, committees, unions, grievances and the audit report.

## Why

- **Rules as data** keep the amended Act reviewable by counsel, rule by rule, and let a rule
  change on a date without code changes, as for leave and tax.
- **Alerts over blocks:** a factory runs whether or not a limit was passed. What protects
  workers is that every hour is recorded and paid and every breach is visible, with a record
  of what was done. Blocking would push hours off the books.
- **One set of records** is the difference that matters in Bangladesh's garment sector.
  Second books for auditors are a known practice, and a product that makes them impossible is
  the trustworthy one.
- **Piece pay as "the higher of" the two** is common practice and makes the minimum wage
  impossible to undercut by mistake.
- **Anonymity by design**, not by policy: what is not stored cannot leak or be demanded.

## Consequences

- **Rules to confirm:** the 2025–26 values marked `needs_review` need counsel's sign-off
  before factories rely on them. These are maternity's 60/60 days, the union thresholds and
  the complaint committee.
- **Single-process memory:** grievance PIN lockouts, kiosk PIN lockouts and ended sessions
  live in one API process's memory, like the existing rate limits. More than one API
  instance needs the shared store (Redis).
- **Payslips on shared tablets:** Android's browser downloads PDFs instead of showing them.
  A kiosk browser with a PDF viewer, or an HTML payslip view, is needed before kiosks show
  payslips in factories.
- **Consent:** a woman's night-work consent has a start date only. Withdrawing it needs an end
  date (a schema change).
- **Certificate uploads:** a certificate of fitness clears its alert at the next hourly check,
  not at once.
