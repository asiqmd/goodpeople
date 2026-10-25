# ADR 011: Settlements and fund payouts are runs; paying a run is files from locked results

**Status:** accepted for Phase 2 M4 · 2026-10-25

## Decision

**A final settlement is a run of its own kind for the leaver's last month.** It is not a
separate calculation with its own approval and payslip. Opening one for an approved
separation creates a `settlement` run in the leaver's pay group, due 30 working days after
the last day (s.30). Computing it:

- **asks the country pack for the dues in days** (`bdSettlement`): notice short (owed by the
  employer, or by a resigning worker), unused earned leave, and gratuity or the
  separation's benefit, by the slab the whole service falls in;
- **turns days into money at the wage the Act names:** compensation and notice at the
  s.14(3) wage (the last month's basic since 17 Nov 2025, the 12-month average before),
  gratuity at the last basic, leave at a day's gross;
- **feeds them to the ordinary engine as entered amounts**, with the separation date and
  every loan due in full, so proration, tax and loan recovery work as in any run, and HR can
  overwrite any figure;
- **keeps only what is still owed:** the month's lines less what locked runs already paid
  that month (loans as they stand).

The working (service, wage basis, slabs, due date, fund payout) is stored with the result, so
the statement shows how each figure was reached. The regular run for that month skips the
leaver. Locking ends provident fund membership and pays out the vested balance, in the same
transaction that posts the run's ledgers.

**The law's numbers stay in the country pack, by date.** The separation rules carry two
versions, before and from 17 Nov 2025:

- slabs by months served, because the Act words them as "up to three years", "more than
  three years" and "ten years or more";
- the minimum service, and whether a part year over six months counts (gratuity and the
  death benefit only);
- "or gratuity, whichever is higher", and whether only permanent workers qualify;
- the wage basis and the WPPF split.

Gratuity is paid only when the workspace says it provides for it, because the Act makes it
payable under the employer's scheme, not on its own.

**Gratuity is provided for by report, not by posting.** The provision on a date is worked
out from current data, per person and in total, and the month's charge is the change since
the previous month end. Nothing is stored, so a corrected joining date or pay record shows
up at once. The journal posts gratuity paid out against the provision.

**The participation fund is a year record and runs per pay group.** A year stores the profit
and the split under the rule for its end, encrypted. Beneficiaries are worked out when
needed, and the cash is shared equally. A `wppf` run per pay group pays each beneficiary in
it, less tax at source (s.88), and goes through the usual approval and locking. The journal
debits the fund's liability, not salary expense.

**Paying a run reads its locked results; it changes nothing in them.**

- The split across a person's accounts (fixed amounts to secondary accounts, the rest to the
  primary, cash without an account) is applied when the files are made.
- The bank file, one file per wallet provider, the Form 38 cash sheet, the bank advice and
  the journal are all derived from the locked items.
- Files carrying account numbers need `payroll.manage`, and each download is audited.
- Recording the payment date is the only write, and it says whether the date was late.

Bank and wallet layouts differ by institution but carry the same content, so the files hold
everything those uploads ask for. Per-bank layouts are adapters added later.

## Why

- **One lifecycle.** Settlements and fund payouts get approvals, locking, payslips,
  publishing, payment files and the journal from the existing run machinery, without a
  second implementation of tax or loan recovery.
- **Dated law.** The amendments changed resignation, death and the wage basis mid-year, and
  separations either side of 17 Nov 2025 must be settled under their own rules. Dated rule
  versions do that without code branches.
- **Encrypted results stay authoritative.** Payment files and the journal derive from the
  same locked results as payslips, so they cannot disagree with what was approved.

## Consequences

- A leaver paid in a locked regular run before their settlement opened is handled by the
  difference: the settlement pays only what is still owed.
- A settlement run holds one person, which is cheap; a month's regular runs are unaffected.
- The gratuity provision and the fund's beneficiaries are recomputed on every view. At
  20,000 employees that takes 1.7 s and 0.4 s (see the phase doc).
- Counsel must confirm the open readings listed in the phase doc before release. The
  readings are rule data, so changing them is a pack change with tests, not a code change.
