# ADR 009: Payroll runs freeze what was paid, and corrections pay the difference

**Status:** accepted for Phase 2 M2 · 2026-10-25

## Decision

**A run is a month for a pay group.** It goes draft → computed → pending (maker-checker) →
locked, or is cancelled, and a pay group has at most one regular run per month that is not
cancelled. Its people are those whose pay record in force on their last employed day of the
month is in the group. Anyone employed with no approved pay is listed in the default group's
run as a problem, so nobody is left out silently.

**Computing is a pure function of frozen inputs** (`run-engine.ts`): the approved pay records,
the processed attendance days, approved leave, the amounts entered in the run and the
components' run formulas. The engine does the following:

- Splits the month where pay changed and prorates by calendar days. It rounds each line to
  whole taka and gives the rounding remainder to the structure's last line, so the lines add
  up to the prorated gross.
- Works out overtime, absence and leave without pay with run formulas over named variables
  (`OT_HOURS`, `ABSENT_DAYS`, `WORKER`…). The Bangladesh pack's defaults follow the Labour Act
  (s.108 overtime for workers, s.126 absence).
- Reports problems per person. Errors (no pay, negative net, a broken formula, unprocessed
  days once the month is over) stop the run being sent for approval. Warnings (missing
  punches, the month not over) are for review.

Results are stored per person, encrypted, with the run's totals. Recomputing replaces them
while the run is open.

**Runs read processed attendance, never live attendance.** The days a run pays are the days
HR processed and reviewed. A past day with no processed row is reported. Live computation
would let a late punch change pay that was already reviewed.

**Locked means locked.** Approval locks a run; nothing in it changes again. A later change for
that month, such as a back-dated raise or a corrected absence, goes into an **adjustment run**.
It computes the month again from today's data and pays, per person and component, the
difference from everything already locked for that month. People with no difference drop
out. A month has one open adjustment at a time.

**Payslips are rendered from the stored results** (HTML → PDF in headless Chrome, English or
Bangla, net in words) when asked for, not stored as files. HR can preview them at any time.
An employee sees their own only once the run is published. Publishing notifies by email, push
and the inbox without amounts. The SMS goes to the person's own phone and carries their net
pay; it is the only notification with an amount, and a workspace can remove it from the
template.

**The payment deadline** is worked out when the run opens: before the seventh working day
after the month ends (s.123), skipping weekly offs and the workspace's holidays. A payment
date after it is shown in red.

## Why

- Matching an existing payroll "to the taka" needs every number explained. Frozen inputs, a
  pure engine and per-line problems make a run reproducible and reviewable person by person.
- Editing a locked run is how payroll fraud and silent errors happen. An adjustment that shows
  only the difference is what auditors and banks expect.
- Rendering payslips on request keeps one source of truth. A stored PDF would go stale if a
  template were fixed, and the results it shows never change once locked.

## Consequences

- A big run's people are read a page at a time (filters for problems, errors and big changes,
  and search). Only the page shown is decrypted.
- Weekly pay groups exist but cannot be run until a later milestone; tax, PF and bonuses (M3)
  become more run components and country-pack functions, not changes to the run lifecycle.
- Overtime for staff needs a workspace to change the overtime formula, because the default
  pays workers only.
