# Phase 2: Payroll & Bangladesh statutory compliance

**Goal:** three consecutive monthly payrolls run alongside each design partner's current
process and **match it to the taka**, and 20,000 employees compute in under ten minutes.

Phase 2 builds on Phase 1's processed attendance, leave and lifecycle. It ships in five
milestones; each is merged only when its tests pass and it has been walked through in the
browser.

| Milestone                                  | Scope                                                                                                                                          | Depends on | Status |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| **M1 Pay foundations**                     | Pay components, a safe formula engine, salary structures, minimum wages, pay groups, employee pay with maker-checker                           | Phase 1    | Done   |
| **M2 Payroll runs & payslips**             | Pay periods, attendance and leave inputs, proration, overtime, the run lifecycle with locking, adjustment runs, EN/BN payslips                 | M1         | Done   |
| **M3 Tax, provident fund & bonuses**       | Salary income tax (projection, declarations, proofs, certificates), PF, festival and attendance bonuses, loans and advances, annual increments | M2         | Done   |
| **M4 Settlement, gratuity & disbursement** | Final settlement per separation type, gratuity, WPPF, bank and MFS payment files, cash sheets, split pay, accounting export                    | M3         |        |
| **M5 Reports & parallel runs**             | Statutory and management reports, golden tests from real (anonymised) sheets, reconciliation against the current payroll, go-live              | M4         |        |

## Principles

- **Money is exact.** Amounts are `numeric` in the database and `decimal.js` in code, never
  floating point. Rounding happens in one place, by a rule the workspace can see.
- **Salaries are secret.** Pay amounts are field-encrypted like identity numbers
  ([ADR 006](../adr/006-documents-and-pdfs.md)); only roles with `payroll.view` see them, and
  each employee sees their own.
- **Four eyes on money.** A salary change, and later a payroll run, needs a second person
  with `payroll.approve` (maker-checker). A one-person workspace can turn this off, and the
  audit log says so.
- **Locked means locked.** A locked payroll run never changes; corrections go through an
  adjustment run that shows the difference (M2).
- **Rules carry their law.** Minimum wages, overtime, tax slabs, PF, gratuity and WPPF are
  effective-dated country-pack rules with a legal reference and a review status. A tax
  consultant signs off the tax rules before M3 ships, as counsel did for Phase 1.
- **Formulas, not code.** Pay components are formulas a workspace can read and change (for
  example `round((GROSS - 2450) / 1.5)`). The formula language has no access to anything but
  numbers and the names it is given.

## M1: Pay foundations

### Pay components

A workspace's building blocks of pay, starting from the country pack's:

| Code                                                        | Component (BN)             | Kind          | Calculated by    |
| ----------------------------------------------------------- | -------------------------- | ------------- | ---------------- |
| `BASIC`                                                     | Basic (মূল বেতন)           | earning       | the structure    |
| `HOUSE_RENT`                                                | House rent (বাড়ি ভাড়া)   | earning       | the structure    |
| `MEDICAL`                                                   | Medical (চিকিৎসা ভাতা)     | earning       | the structure    |
| `CONVEYANCE`                                                | Conveyance (যাতায়াত ভাতা) | earning       | the structure    |
| `FOOD`                                                      | Food (খাদ্য ভাতা)          | earning       | the structure    |
| `SPECIAL`                                                   | Special allowance          | earning       | a fixed amount   |
| `OVERTIME`, `ATTENDANCE_BONUS`, `FESTIVAL_BONUS`, `ARREARS` |                            | earning       | each run (M2–M3) |
| `ABSENCE`, `ADVANCE`, `PF_EMPLOYEE`, `TAX`                  |                            | deduction     | each run (M2–M3) |
| `PF_EMPLOYER`                                               | Employer PF                | employer cost | each run (M3)    |

Each component records whether it is part of gross salary, part of the overtime base
(basic and dearness allowance, Labour Act s.108), prorated by paid days, and how it is taxed
(used from M3).

### Formula engine (`packages/shared`)

- Arithmetic, comparisons and `min`, `max`, `round`, `floor`, `ceil`, `abs`, `if`, over
  decimals; component codes and inputs (`GROSS`, `BASIC`) as names.
- Parsed into a tree and evaluated by our own code: no `eval`, no JavaScript objects, no loops.
- Lines are ordered by what they use; a cycle or an unknown name is an error shown before the
  formula is saved.

### Salary structures

How a salary is split into components. HR enters either a gross or a basic amount; the
structure works out the rest. The country pack brings two:

- **RMG worker (2023 wage board):** medical Tk 750, conveyance Tk 450, food Tk 1,250, basic
  `round((GROSS − 2450) / 1.5)`, house rent the rest (half of basic). Every grade of the
  gazette comes out exactly.
- **Staff:** basic 60% of gross, house rent half of basic, medical 5% of gross, conveyance the
  rest.

### Minimum wages

The RMG minimum wage gazetted on 12 November 2023, in force from 1 December 2023, per grade:

| Grade      | Gross  | Basic | House rent | Medical | Conveyance | Food  |
| ---------- | ------ | ----- | ---------- | ------- | ---------- | ----- |
| Grade 1    | 14,750 | 8,200 | 4,100      | 750     | 450        | 1,250 |
| Grade 2    | 14,150 | 7,800 | 3,900      | 750     | 450        | 1,250 |
| Grade 3    | 13,550 | 7,400 | 3,700      | 750     | 450        | 1,250 |
| Grade 4    | 13,025 | 7,050 | 3,525      | 750     | 450        | 1,250 |
| Grade 5    | 12,500 | 6,700 | 3,350      | 750     | 450        | 1,250 |
| Apprentice | 9,875  | 4,950 | 2,475      | 750     | 450        | 1,250 |

A salary below its grade's minimum gross or basic is refused. The figures are marked
`needs_review` until checked against the gazette's text. So are the annual increments (5% of
basic, and 9% decided for December 2024, whose continuation is disputed), which are applied
from M3.

### Pay groups

Groups of people paid together: monthly by default, weekly where a factory pays weekly. Pay
periods and payment dates come with runs in M2.

### Employee pay

- **Effective-dated pay** per employee: structure, gross or basic amount, fixed amounts
  (special allowance), minimum-wage grade and pay group.
- **Maker-checker:** HR proposes a change with a date and a reason. Someone else with
  `payroll.approve` approves it in the Approvals inbox, which shows the old and new pay side
  by side. Approved pay is history; a wrong amount is replaced by a later change.
- **Self-service:** employees see their own current pay and its breakdown.

### Roles

| Role                | Payroll permissions                       |
| ------------------- | ----------------------------------------- |
| Workspace admin     | view, manage, approve                     |
| HR admin            | view, manage, approve                     |
| **Payroll officer** | view, manage (and read employees)         |
| **Finance officer** | view, approve (and read employees, audit) |
| HR officer, others  | none: salaries stay hidden                |

Payroll and finance officers must use two-step sign-in where admins must.

### What else it does

- **Structures that people are paid on keep their lines**, so past pay can always be worked
  out again; a change means a new structure. A gross-based structure's lines must add up to
  the gross (checked at Tk 12,500, 33,333 and 150,001 before saving).
- **Salary changes in the inbox:** a new `payroll` approval step, decided by anyone with
  `payroll.approve` except the person who proposed it. Approvers are notified (without
  amounts, which never go by email or SMS) and the proposer hears the decision.
- **One change at a time**, never before the latest approved pay; a change from the same date
  replaces it (shown as "replaced"). Arrears for earlier dates come with payroll runs (M2).
- **The audit log** records which structure, group and grade a change used, never amounts.
- **Existing workspaces** get the payroll defaults with `pnpm --filter @gp/db provision`
  (idempotent); new ones get them when they are created.
- **Seed:** everyone in `my-group` has pay (workers on RMG grades, staff on the staff
  structure), a finance officer login approves changes, and one raise waits in the inbox.

### Done when

- **Unit tests:** the formula engine (precedence, functions, decimals, errors, cycles, nothing
  outside its names); every RMG grade computed exactly by the RMG structure.
- **API end-to-end tests:** components and structures with formula validation; pay changes
  through maker-checker (the maker cannot approve their own change); one-person workspaces;
  the minimum-wage check; encryption at rest; who may see pay; isolation between workspaces.
- **Web:** HR sets up components, structures and pay groups with a live preview, changes an
  employee's pay and another person approves it, in English and Bangla; employees see their
  own pay.

**Checked:** formula unit tests (13), every RMG grade split exactly (10 country-pack tests),
10 API end-to-end tests, and the browser in English and Bangla: setup with the live preview,
the minimum wage table, a raise proposed by the admin and approved by the finance officer,
and an employee's own pay.

**Carried into later milestones from M1:**

- **Structure names in pay records** show in English in the Bangla view; components have
  Bangla names.
- **Field-level messages** for formulas are English, like the rest of the API's validation.
- **The RMG wage figures** stay `needs_review` until checked against the gazette's text.

## M2: Payroll runs & payslips

How runs work and why is in [ADR 009](../adr/009-payroll-runs.md).

### Runs

- **A run is a month for a pay group** (`/workspace/payroll/runs`). Its people are those
  whose pay on their last employed day of the month is in the group. Anyone without approved
  pay shows up in the default group's run as a problem.
- **The lifecycle:** draft → computed → waiting for approval → locked, or cancelled. Entering an
  amount or anything else that changes the pay sends a computed run back to draft until it is
  computed again. A cancelled run frees the month.
- **Maker-checker:** a run is sent for approval and decided in the Approvals inbox by someone
  else with `payroll.approve`. The inbox shows last month's totals beside it. With
  maker-checker off, sending locks the run at once.
- **Locked means locked:** computing, entering amounts and cancelling are refused.
- **The payment deadline** (s.123) is worked out when the run opens: the seventh working day
  after the month ends, skipping Fridays and the workspace's holidays. It is the default
  payment date, and a later one is shown in red.

### What a run computes (`run-engine.ts`)

- **Proration:** the month is split where pay changed (a raise from the 10th) and each part
  is paid for its calendar days. Joiners and leavers are paid for the days they were
  employed. Lines are rounded to whole taka, and the remainder goes to the structure's last
  line so the lines add up to the prorated gross.
- **Attendance:** from processed days only, never live attendance:
  - absent days, with a half day counting as 0.5;
  - worked days;
  - overtime hours;
  - leave without pay, from the leave type's `paid` flag.
- **Run formulas** (editable per component) with the BD defaults:
  - **Overtime:** `if(WORKER, round(OT_BASE * 2 * OT_HOURS / 208), 0)`. This is twice the
    hourly basic (and dearness allowance) for workers (s.108; 208 hours a month per the Labour
    Rules, still to be checked). Staff get none unless the workspace changes the formula.
  - **Absence:** `round(BASIC / 30 * ABSENT_DAYS)`, flagged when it exceeds the pay for those
    days (s.126).
  - **Leave without pay:** `round(GROSS / 30 * UNPAID_LEAVE_DAYS)`.
- **Run variables** for formulas: `GROSS`, `OT_BASE`, `PERIOD_DAYS`, `EMPLOYED_DAYS`,
  `PAID_DAYS`, `WORKED_DAYS`, `ABSENT_DAYS`, `UNPAID_LEAVE_DAYS`, `OT_HOURS`,
  `SERVICE_YEARS`, `SERVICE_MONTHS` and `WORKER`.
- **Entered amounts:** HR enters per person an advance to recover, arrears, a bonus, or an
  override of a formula, with a note.
- **Problems per person:**
  - Errors stop the run being sent: no pay, negative net, a broken formula, and days not
    processed once the month is over.
  - Warnings are for review: days with one punch, days not processed yet, the month not over,
    pay starting late, no attendance at all.
- **Review against last month:** each person's net is compared with the group's last locked
  run. A move of 10% or more, someone new, or someone gone is flagged as a "big change".

### Adjustment runs

A locked run can be adjusted, for everyone or for chosen people. The month is computed again
from today's data, and the run pays, per person and component, the difference from everything
already locked for that month: for example a back-dated raise from 1 July paid as 350 basic
and 175 house rent. People with no difference drop out. A month has one open adjustment at a
time, and an adjustment goes through the same approval and locking.

### Payslips

- **PDFs in English and Bangla:**
  - the company, the employee, department and joining date;
  - the days (in the period, paid, absent, leave without pay, overtime hours);
  - earnings and deductions, and the net pay in figures and in words (Taka in lakh and crore,
    or Bangla words ending in "টাকা মাত্র");
  - Bangla digits throughout the Bangla one.
- **Publishing** a locked run makes its payslips visible to the employees and notifies them
  (`payslip.published`) by email, push and the inbox, without amounts. The SMS, to the
  person's own phone, carries their net pay; a workspace can change that template.
- **Employees** see their payslips at `/workspace/payslips` and in the app (the Payslips card).
  The app opens a payslip in the app's language or the other one, and a payslip notification
  opens the list. HR can preview anyone's payslip from the run before or after publishing.

### What else it does

- **Large runs read a page at a time:** everyone, those with problems, those to fix, or big
  changes, with search by name or code. Only the 50 shown are decrypted.
- **Encrypted results:** each person's lines, totals and entered amounts are field-encrypted.
  The audit log records run events, never amounts.
- **Fixes found on the way:**
  - The Phase 0 placeholder `GET /tenant/payroll/runs` was shadowing the real route; it is
    removed.
  - An access-states test left a payroll grant on `trial-co`, which other test files saw in
    some orders; it now removes its grant.
  - Notifications now go out in bulk (500 at a time) with per-person values, for 20,000
    payslips.
- **Seed:** `scale-test` and any `SCALE_SLUG` workspace give everyone approved pay (workers on
  the RMG grades, line supervisors on the staff structure). An existing scale workspace is
  given pay if it has none.

### Performance at 20,000 employees

Measured on a MacBook Air (M-series) against `scale-20k`: 20,000 employees, 780,000 punches
over 20 working days (`apps/api/scripts/measure-payroll.mjs`).

| Step                                                     | Time                    |
| -------------------------------------------------------- | ----------------------- |
| Processing the month's attendance first (Phase 1)        | 44.9 s (500,000 days)   |
| **Computing the run for 20,000 people**                  | **3.4 s** (again 3.1 s) |
| A page of 50 people / page 200 / with problems / search  | 84 / 190 / 75 / 73 ms   |
| The run's summary                                        | 3 ms                    |
| One payslip PDF in Bangla (rendered on request)          | 1.4 s                   |
| Sending for approval with maker-checker off (locks)      | 7 ms                    |
| Publishing 20,000 payslips (notifications to the logins) | 2.2 s                   |

The target was under ten minutes. Computing reads everyone's pay records, processed days and
entered amounts in a few queries and works per person in memory, so it grows linearly. The
measurement ran in October, before the month ended, so everyone carries the "month not over"
warning.

### Done when

- **Unit tests:** the engine (a full month, overtime, absence and unpaid leave, a joiner,
  a mid-month raise, entered amounts, no attendance, workers-only overtime, unprocessed days,
  warnings and errors, a broken formula, the adjustment difference); amounts in words in
  English and Bangla.
- **API end-to-end tests (7):**
  - a month computed, entered amounts, maker-checker (the maker cannot approve), locking,
    payslips for HR at once and for the employee only after publishing, someone else's
    payslip refused, the notification, results encrypted at rest;
  - a back-dated raise paid through an adjustment;
  - variance flags, filters, search and paging;
  - errors that block approval, cancelling, weekly groups refused;
  - overtime, absence and missing punches from processed attendance;
  - who may see runs;
  - one-person workspaces.
- **Web:** a run opened, computed, an advance entered, recomputed, sent, approved by the
  finance officer, published, and the payslips read by the employee, in English and Bangla.
- **Mobile:** the payslips list and PDFs, and the notification opening them.

**Checked:**

- 156 API tests (engine unit tests and end-to-end), also passing in shuffled order eight times.
- Country-pack tests (30, including amounts in words) and Flutter (192 tests, analyze clean).
- The browser in English and Bangla: September run for my-group computed, an advance entered
  and recomputed, approved by the finance officer, published; the PDFs in both languages;
  Rahima's payslips and notification; October's run with overtime, absence and the
  missing-punch and unprocessed-day warnings.

**Carried into later milestones from M2:**

- **Weekly pay groups** cannot be run yet; runs are monthly.
- **The 208 hours a month** behind the hourly overtime rate and the 30-day absence divisor
  stay `needs_review` with counsel.
- **Compute runs in the request.** At 20,000 people it fits well inside the HTTP timeout. A
  background job with progress comes when runs grow past that.
- **Pay group, structure and company names** show in English in the Bangla view and payslip
  unless a Bangla name is set.

## M3: Tax, provident fund & bonuses

How these fit into runs and why is in [ADR 010](../adr/010-tax-fund-and-loans.md).

### What the law says, as encoded

Researched on 25 Oct 2026 from the gazettes on nbr.gov.bd (the Finance Ordinance 2025 and the
Finance Act 2026) and the NBR's English text of the Income Tax Act 2023. Every value is a
country-pack rule with its reference and `needs_review` until the tax consultant and counsel
sign it off.

| Rule                                                                                            | Income year 2025-26                                                                                                                        | Income year 2026-27                                   |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Threshold: general / women and 65+ / disability and third gender / war-wounded freedom fighters | Tk 400k / 450k / 525k / 550k (raised by the Finance Act 2026 after the year; deductions during it used 375k)                               | same                                                  |
| Disabled dependant                                                                              | +Tk 50k each (one parent claims)                                                                                                           | same                                                  |
| Bands above the threshold                                                                       | 300k at 10%, 400k at 15%, 500k at 20%, 2,000k at 25%, then 30% (the 5% band is gone)                                                       | same                                                  |
| Salary exemption                                                                                | a third of salary, at most Tk 5 lakh                                                                                                       | same                                                  |
| Investment rebate                                                                               | least of 3% of income, 15% of investment, Tk 10 lakh                                                                                       | least of 3%, 10%, Tk 7.5 lakh (start date to confirm) |
| Minimum tax                                                                                     | Tk 5,000 everywhere, if above the threshold (Tk 1,000 for new taxpayers)                                                                   | same                                                  |
| Investment caps                                                                                 | DPS Tk 1.2 lakh, savings certificates and mutual funds Tk 5 lakh a year                                                                    | same                                                  |
| Provident fund                                                                                  | Required with 100+ permanent workers from 17 Nov 2025 (Progoti pension as the alternative); 7–8% of basic each way; after a year's service | same; Act 43 of 2026 from 10 Apr 2026                 |
| Festival bonus                                                                                  | Two a year, each at most a month's basic, after a year's service (Labour Rules r.111, to confirm)                                          | same                                                  |

Overtime and festival bonuses are taxable salary (s.32). The employer's recognised-fund
contribution is not salary but counts for the rebate. Deposits are due within two weeks of
the month's end, and the withholding return is quarterly (s.146, s.177).

### Salary tax

- **Each run works it out:** the year's salary projected (earlier locked runs and openings,
  this month, and the recurring pay for the months left), the year's tax, less what was
  deducted, spread over the months left (s.86). Entered TAX overrides it. The working is
  stored and shown per person: projected salary, exemption, threshold, tax, rebate, minimum,
  deducted before, this month.
- **Taxpayer profile:** disability, war-wounded freedom fighter, disabled dependants. Gender
  and age come from the employee record.
- **Investment declarations:** employees declare per income year (savings certificates, DPS,
  life insurance, other funds, universal pension, shares, Zakat and others). Declared amounts
  count until payroll verifies them against proofs; then only what was accepted counts.
  Verified declarations are closed.
- **Openings:** salary, tax and provident fund paid before go-live in the year.
- **Challans:** the deposit for each locked run, which the certificate lists.
- **Salary certificate** in English or Bangla for HR and the employee: each run of the year
  with salary, tax and challan, and the totals.
- **Register:** everyone's salary and tax for the year as CSV for the withholding return.
- **Warnings:** a TIN missing where tax is deducted; an error where the pack has no rules for
  the year.

### Provident fund

- **Settings:** on or off, both rates, recognised for tax, and the vesting scale (by default
  nothing before 3 years, everything after). The settings page says when the law requires a
  fund (permanent workers against the threshold).
- **Members:** added by code or "every permanent employee once they have a year's service"
  (their membership starts on the anniversary). Contributions are on the basic paid in each
  run.
- **Ledger:** contributions posted when a run locks, opening balances from the old fund,
  yearly interest at the trustees' rate (once per date), loans out and back, and pay-outs.
- **Leaving:** the employer's unvested share is forfeited back to the fund; the statement says
  what the member is paid. The pay-out itself comes with final settlement (M4).

### Loans and advances

- Salary advances, company loans and loans from the provident fund (at most the member's own
  balance), each with an installment and a first month.
- **Maker-checker:** approved in the inbox by someone other than the maker.
- **Recovery:** runs recover the installment from the first month, never taking net pay below
  zero (a warning says when an installment was not recovered in full). An entered amount
  replaces the schedule, shared oldest first.
- **Repayments** are posted when the run locks; money paid in directly is recorded by hand.
  Fully repaid loans close.

### Bonuses and increments

- **Festival bonus runs:** a festival, the religions it is for (and whether people with none
  recorded count), a cut-off day, the share of basic (at most 100%) and the months of service
  (12 by default). Approved, locked and published like a month; the payslip and notification
  carry the festival's name.
- **Attendance bonus:** runs give formulas `LATE_DAYS` and `LEAVE_DAYS`, so a workspace sets
  its own rule, for example `if(WORKER && ABSENT_DAYS == 0 && LATE_DAYS == 0 && LEAVE_DAYS ==
0, 500, 0)`. The pack sets no amount, since none is statutory.
- **Annual increments:**
  - A percentage of basic (the RMG wage board's way) or of gross, from a date.
  - It can be limited to pay groups and structures, and to people with enough service.
  - The new gross is found by searching for the smallest amount that gives the target basic
    under the person's own structure.
  - Previewed with who is left out and why, then approved as one batch: every new pay record
    is approved together. Nobody approves a batch that raises their own pay.

### What else it does

- **My pay** for employees on the web: payslips, tax (the year so far, the latest working,
  certificates, and the declaration form), the provident fund statement, and their loans. The
  app gets the same.
- **Seed:** my-group runs a provident fund for its permanent workers with opening balances, has
  July–September tax openings for the staff who pay tax, one verified and one waiting
  declaration, and an advance waiting for the finance officer.
- **Fixes found on the way:** the approvals inbox used a `NOT IN` over a list that could hold
  NULLs (pay batches' own-pay check), which hid every manager's items; the list now leaves
  them out.

### Performance at 20,000 employees

Measured on a MacBook Air (M-series) against `scale-20k`: 20,000 employees, 800 supervisors
paid enough to pay tax, and July 2026 to May 2027 computed and locked first, so June 2027 reads
eleven months of the year for everyone (`FISCAL_YEAR=1 MONTH=2027-06
apps/api/scripts/measure-payroll.mjs`).

| Step                                                       | Time                                    |
| ---------------------------------------------------------- | --------------------------------------- |
| A month computed and locked, July 2026 → May 2027          | 3.8 s → 7.4 s, as the year so far grows |
| **June 2027 for 20,000 people, eleven months of tax read** | **6.3 s** (again 5.8 s)                 |
| A page of 50 / page 200 / with problems / search           | 114 / 168 / 84 / 73 ms                  |
| One payslip PDF in Bangla                                  | 0.8 s                                   |
| Locking (posting provident fund and loan entries)          | 0.2 s                                   |
| Publishing 20,000 payslips                                 | 2.1 s                                   |

M2 computed a month in 3.4 s; reading the year so far for tax roughly doubles it at the year's
end, still far inside the ten-minute target. One month
(September) took 22 s in that sequence, with other work running on the machine; the months
either side took 4–5 s.

### Done when

- **Unit tests:** the tax year (every band, rebate, minimum tax, thresholds and dependants,
  both years); the engine's tax projection, taxable salary, provident fund, loan recovery,
  late and leave variables, and festival bonus; fiscal years and adding months.
- **API end-to-end tests (6):**
  - tax with openings, a declaration declared then verified, a disability, locking, a
    challan, the next month's projection, the year view, certificates and the register;
  - the provident fund: contributions, a fund loan and its repayment, interest, leaving with
    forfeiture;
  - an advance through maker-checker, recovered and then repaid directly;
  - an increment of basic in one approval, with people left out and changes blocked meanwhile;
  - a festival bonus by religion and service, published with its payslip;
  - who sees what, and when the law requires a fund.
- **Web and mobile:** the pages above in English and Bangla, and the app's My pay.

**Checked:**

- 168 API tests in 17 files, also passing shuffled five times; country-pack tests (36,
  including both tax years) and shared tests (93).
- The browser in English and Bangla:
  - October's run with Farhan Rahman's tax worked out: ৳2,874, which is ৳35,613 for the year
    less ৳9,750 deducted, over nine months.
  - The provident fund and tax pages, and Kamal Hossain's declaration verified.
  - A 5% increment of basic for three RMG workers previewed, then approved by the finance
    officer together with Rahima's advance.
  - Rahima's My pay (her fund, her advance, her tax in Bangla) and her Bangla salary
    certificate.
- Flutter: 220 tests (192 before) and analyze clean for My pay's tax, declaration, fund and
  loans tabs. Checked against a fake API only, not on a device; the real API's answer for a
  non-member of the fund (an empty body) was checked by hand and the app reads it.

**Carried into later milestones from M3:**

- **Proofs:** declaration items can link a document, but uploading proofs from the
  declaration form comes later; payroll verifies from the documents it has.
- **PSR check (s.264):** paying management and supervisory staff needs proof of their tax
  return; recording and checking it comes with M5's reports.
- **Rebate start date** for the 10% and Tk 7.5 lakh, the Act 43/2026 two-thirds rule, the
  fund's statutory vesting and r.111 stay `needs_review`.
- **Minimum tax for new taxpayers** (Tk 1,000) needs a profile flag.
- **The RMG increment after 2025** (9% or 5%) is not settled; the increment tool takes any
  percentage.
- **The app's approvals list** shows loans, increments and runs as generic items; payroll
  approvals are decided on the web.

## Later milestones (outline; detailed when each starts)

- **M4 Settlement, gratuity & disbursement:**
  - Final settlement for each separation type: notice pay, unused earned leave, gratuity,
    the resignation benefit.
  - Gratuity provisioning, WPPF.
  - Bank advice files (BEFTN, NPSB), bKash and Nagad bulk files, cash pay sheets with
    signature columns, split payments, accounting export with cost centres.
- **M5 Reports & parallel runs:**
  - Payroll register, wage and overtime registers, tax and PF statements, bank
    reconciliation, management reports.
  - Golden tests from design partners' anonymised sheets; a reconciliation tool that
    compares our run with the current payroll line by line.
  - The payroll go-live checklist and three parallel cycles.

## Sources (checked 25 Oct 2026; confirm against the gazettes before release)

- RMG minimum wage 2023: [The Daily Star, gazette published](https://www.thedailystar.net/business/news/govt-publishes-gazette-new-rmg-wage-3468181),
  [TBS](https://www.tbsnews.net/bangladesh/labour-ministry-publishes-gazette-minimum-wage-rmg-set-tk12500-738286)
- RMG 9% increment, December 2024: [Dhaka Tribune, gazette](https://www.dhakatribune.com/business/370206/govt-issues-gazette-on-annual-wage-increment-hike),
  [The Financial Express, dispute over continuation](https://thefinancialexpress.com.bd/trade/row-brews-over-continuation-of-rmg-workers-wage-hike)
- Overtime at twice basic and dearness allowance (s.108): [BIPO Times, Sep 2022](https://www.biposervice.com/wp-content/uploads/2022/10/BIPO-Times-Sep-2022-en.pdf)
- Income tax 2025-26 and 2026-27: [Finance Act 2026 (gazette, 30 Jun 2026)](https://nbr.gov.bd/uploads/acts/Finance_Act_2026.pdf),
  [Finance Ordinance 2025 (gazette, 2 Jun 2025)](https://nbr.gov.bd/uploads/acts/5722-Ordinance-28-Law-02_June.pdf),
  [Income Tax Act 2023, NBR English text](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf),
  [KPMG / Rahman Rahman Huq, Bangladesh Tax 2026-27](https://assets.kpmg.com/content/dam/kpmg/bd/pdf/Tax/Bangladesh_Tax_2026.pdf),
  [PwC tax summary](https://taxsummaries.pwc.com/bangladesh/individual/taxes-on-personal-income)
- Provident fund for 100+ permanent workers: [WTW, Mar 2026](https://www.wtwco.com/en-us/insights/2026/03/bangladesh-new-mandate-for-provident-funds-for-large-employers),
  [Prothom Alo on Act 43 of 2026](https://en.prothomalo.com/bangladesh/7z52cjg8f2)
