# ADR 010: Salary tax is projected each month; the fund and loans are ledgers posted at lock

**Status:** accepted for Phase 2 M3 · 2026-10-25

## Decision

**Salary tax is a country-pack function, not a formula.** A tax year is data in
`packages/country-packs/src/bd/tax.ts`, one entry per income year (July to June):

- the thresholds by taxpayer (general; women and people aged 65+; disability and third
  gender; gazetted war-wounded freedom fighters) and Tk 50,000 more per disabled dependant;
- the bands above the threshold;
- the salary exemption (a third, at most Tk 5 lakh);
- the rebate (the least of a share of income, a share of investment and a cap);
- the minimum tax and caps on some investments.

Each year carries its legal reference, sources and review status. A run's month with no tax
year in the pack is an error, so tax is never silently skipped. The tax consultant signs a
year off before it ships.

**Each month's TAX is the year's tax, projected, less what was deducted, spread.** For each
person the run works out the year's salary income:

- what locked runs paid earlier in the fiscal year (including adjustments and bonuses), plus
  any figures from before go-live;
- this month;
- the recurring pay times the months left before June, or before a known separation.

From that it takes the year's tax (with declared or verified investments and recognised
provident fund contributions for the rebate), subtracts what was deducted so far, and divides
the rest by the months left including this one. This is the Act's "average rate on the
estimated income" (s.86): any surplus or shortfall corrects itself in the following months.
How it was worked out is stored with the result and shown on the run and to the employee.

**Salary income follows the components.** An earning marked taxable counts. A deduction marked
taxable (absence, leave without pay) reduces it. Tax, provident fund and loan repayments do
not. The employer's provident fund share is an employer cost: not salary, but an investment for
the rebate when the fund is recognised.

**The provident fund and loans are ledgers that runs post to when they lock.** Each person's
contributions, and each loan's repayment from the run, go into encrypted entries in the same
transaction that locks the run, so a ledger only ever reflects locked pay:

- **Provident fund entries:** opening balances, contributions, interest, loans out and back,
  pay-outs and forfeitures.
- **Loan repayments:** from runs, or recorded directly.

Balances are sums of entries. A loan closes when its repayments reach the principal.
Adjustment runs carry tax and loan recoveries at what was paid, and post only the change in
contributions.

**Loans and increments go through maker-checker like pay changes.** An advance, a loan or a
fund loan is approved in the inbox by someone other than its maker; a fund loan comes out of
the member's own balance. An increment for many people is one approval (a pay batch): on
approval every person's new pay record is approved at once, and nobody can approve a batch
that raises their own pay.

**Festival bonuses are their own runs** for a group and festival: who is paid (religion,
employment on the cut-off day, months of service) and how much (a share of the basic in force
on that day). They go through the same lifecycle and payslips as a month.

## Why

- Tax rules change with every budget, sometimes after the year they apply to (the Finance Act
  2026 raised the 2025-26 thresholds after that year ended). Data per year with references
  keeps every year reproducible and reviewable; a formula could not express bands, the
  rebate and the minimum tax readably.
- Projecting the year each month is what payroll offices in Bangladesh do by hand, and it
  absorbs raises, bonuses and new declarations without year-end surprises.
- Posting to ledgers only at lock keeps them in step with what was actually paid and makes a
  locked run the single source for statements and certificates.

## Consequences

- At 20,000 people a month's compute reads every locked run of the year so far for its
  people. Measured in the phase plan; a yearly summary per person is the next step if it
  grows.
- The provident fund's vesting scale and interest are the trustees' rules, kept as settings,
  not law. Interest is credited once per date on the balance on that date.
- Employees declare investments themselves; payroll verifies them against proofs. Until
  verified, declared amounts count, as in practice.
