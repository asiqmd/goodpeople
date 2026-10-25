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
| **M4 Settlement, gratuity & disbursement** | Final settlement per separation type, gratuity, WPPF, bank and MFS payment files, cash sheets, split pay, accounting export                    | M3         | Done   |
| **M5 Reports & parallel runs**             | Statutory and management reports, golden tests from real (anonymised) sheets, reconciliation against the current payroll, go-live              | M4         | Done   |

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

## M4: Settlement, gratuity & disbursement

How these fit into runs and why is in [ADR 011](../adr/011-settlement-funds-and-payment.md).

### What the law says, as encoded

Researched on 25 Oct 2026 from the Labour Act as amended on bdlaws (Ordinance 65 of 2025, in
force 17 Nov 2025, re-enacted with the same text for these sections by Act 43 of 2026 from 10
Apr 2026), the Labour Rules 2015 and the Income Tax Act 2023. Every value is a country-pack
rule with its reference and `needs_review` until counsel signs it off.

| Rule                                  | Before 17 Nov 2025                                                                          | From 17 Nov 2025                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Wage for compensation and notice pay  | average basic (+ dearness, ad hoc) of the last 12 months (s.14(3))                          | the last month's                                                   |
| Resignation benefit (s.27(4))         | nothing under 5 years; 14 days a year from 5, 30 from 10 (or gratuity)                      | 7 days a year up to 3 years, 15 for 3–10, 30 from 10 (or gratuity) |
| Termination (s.26), permanent         | 120 days' notice or pay; 30 days a year or gratuity                                         | same                                                               |
| Retrenchment (s.20), discharge (s.22) | a year's service; 30 days a year or gratuity                                                | same                                                               |
| Dismissal (s.23(3))                   | 15 days a year after a year (none for theft, fraud or riot)                                 | same, now expressly for dismissed workers                          |
| Death (s.19)                          | more than 2 years; 30 days a year, 45 for a work accident, or gratuity                      | more than 1 year                                                   |
| Retirement (s.28)                     | at 60; 30 days a year or gratuity                                                           | same                                                               |
| Gratuity (s.2(10))                    | 30 days of the last wage a year, 45 past ten years; payable under the employer's scheme     | not amended                                                        |
| Part years                            | over six months count as a year for gratuity and death only                                 | same                                                               |
| Unused earned leave (s.11, s.119)     | paid at a day's full wage                                                                   | same                                                               |
| Dues paid within                      | 30 working days of the last day (s.30)                                                      | same                                                               |
| WPPF (Chapter XV)                     | 5% of net profit, 80:10:10; two thirds of the participation fund in cash                    | all of it in cash (s.242(1))                                       |
| WPPF beneficiaries                    | any rank but owners and directors; nine months employed, six in the year; dismissed forfeit | same                                                               |
| Tax on WPPF payouts (ITA s.88)        | 5% at source                                                                                | 10% from 1 Jul 2025 (Finance Act 2026; date to confirm)            |

Wages are paid in cash, by cheque or, at the worker's wish, to a bank account or by any digital
method (s.124). Rule 111 keeps the wage record in Form 38, signed by the worker over a revenue
stamp when paid. Bangladesh Bank limits a personal mobile wallet to a balance of Tk 5 lakh.
Neither BEFTN nor bKash or Nagad publish a standard salary file: banks and wallets each have
their own template, with the same content.

### Final settlement

- **Opened from a decided separation** (approved, or completed once the last day passes) on
  the Settlements tab: one settlement run for the leaver's last month, in their pay group,
  due 30 working days after the last day. Only one per separation.
- **What it pays:**
  - the last month to the last day, less what that month's locked runs already paid;
  - pay in lieu of notice the employer did not give, or notice the worker did not serve,
    recovered;
  - unused earned leave at a day's gross;
  - the separation's benefit by its slab, or gratuity at the last basic when the Act says
    "whichever is higher" and the workspace provides for gratuity;
  - every loan left, recovered in full;
  - tax worked out on all of it, as in any run.
- **Entered amounts win:** HR may enter any of the dues (for example nothing for a dismissal
  for theft), and the run uses that instead.
- **The working is kept** with the result and shown on the run, and on the Bangla or English
  statement (the payslip titled "Final settlement"): service in years and months, the wage
  basis, notice, leave and each benefit as years × days at the day's rate, the due date, and
  the provident fund paid out.
- **The month's regular run leaves the leaver out**, so nobody is paid twice.
- **Locking ends fund membership** and pays out the member's own money and the vested part of
  the employer's; the rest is forfeited back to the fund.

### Gratuity provision

- A report for any date (by default the last month end) of what the company would owe if
  every permanent employee left then, per person and in total, with the change since the
  previous month end: the month's charge, debit gratuity expense and credit the provision.
  CSV for the accounts.
- A setting turns gratuity off for workspaces without a scheme; the settlement then pays the
  separation's own benefit.

### Workers' participation fund

- **A year:** the accounting year, its dates and the net profit. The fund (5%), the three
  parts and the cash to pay are worked out under the rule for the year's end, and stored
  encrypted.
- **Beneficiaries** are worked out when needed: employed nine months, six of them in the year
  (a year may lower the six where the trust deed allows), not dismissed. Leavers keep their
  share.
- **Paying it:** one run per pay group, each beneficiary in the group getting the equal share
  less tax at source. The run is approved, locked and paid like any other, and due nine
  months after the year end.

### Paying runs

- **Payment accounts can be split:** a fixed amount to a secondary account (a wallet, say),
  the rest to the primary; cash when there is no account.
- **For a locked run:**
  - the total by channel (bank, each wallet, cash) and the accounts that need fixing,
    including a wallet payment over the Tk 5 lakh cap;
  - the bank transfer file and one file per wallet provider (CSV, for those who run payroll
    only, each download audited);
  - the cash pay sheet as Form 38 by unit, with a column to sign over a revenue stamp or
    thumbprint, in English or Bangla;
  - a covering advice to the bank;
  - the date it was paid, flagged when after the legal deadline.
- **The journal:** a balanced CSV by account and cost centre (the unit's code). Each
  component can name its own ledger account; otherwise the settings' accounts for salary
  expense, net pay, tax, provident fund, loans, gratuity and the participation fund apply.
  Gratuity paid out draws on the provision; a fund payout settles the fund's liability.

### What else it does

- **References:** each run's payments carry a reference such as `SAL-2026-09`, `FS-2026-09`
  or `WPPF-2025-26`.
- **The app** marks final settlement and participation fund payslips.
- **Fixes found on the way:**
  - the run page's deadline note always quoted s.123; it now gives each kind's own (s.30,
    s.234, before the festival);
  - bonus and fund payouts no longer show "0 of 0 days paid".

### Performance at 20,000 employees

Measured on a MacBook Air (M-series) against `scale-20k` after October 2026 was computed,
locked and published (`apps/api/scripts/measure-payroll.mjs scale-20k`, which now goes on to
pay the run):

| Step                                                      | Time            |
| --------------------------------------------------------- | --------------- |
| Payment summary by channel                                | 0.56 s          |
| Bank file / journal                                       | 0.55 s / 0.48 s |
| Cash pay sheet PDF in Bangla, 20,000 people (~600 pages)  | 11.2 s          |
| Gratuity provision, first page (20,000 people, two dates) | 1.7 s           |
| Gratuity provision CSV                                    | 0.9 s           |
| A participation fund year (20,000 beneficiaries)          | 0.4 s           |

The cash sheet is the slow one: a whole factory in one PDF. It is downloaded once a month, so
it stays a direct download for now; a background job can take it over if larger workspaces
need it.

### Done when

- **Unit tests:**
  - service in months and years, with part years counted only where the Act says so;
  - each separation across the 2025 amendment, gratuity against compensation, the wage basis
    and the participation fund's cash share;
  - splitting pay across accounts.
- **API end-to-end tests (6 new):**
  - a termination settled: notice, gratuity over compensation, leave, the fund paid out,
    the regular run leaving the leaver out, and the Bangla statement;
  - a resignation recovering notice not served;
  - the gratuity provision and its CSV;
  - the participation fund: the split, beneficiaries, a run with tax at source, and its
    journal;
  - payment files, the cash sheet, advice and payment date;
  - a balanced journal by account and unit.
- **Web and mobile:** the pages above in English and Bangla, and the app's payslip marks.

**Checked:**

- 178 API tests in 20 files, also passing shuffled ten times out of eleven; country-pack
  tests (49, 13 of them new), shared (93) and the Edge Agent's (64). The one shuffled
  failure was an older notifications test counting sent emails after the dispatcher could
  already have sent one on its own; it now counts before the request.
- The browser in English and Bangla:
  - Anjali Das terminated with 60 of 120 days' notice. Her settlement shows 4 years 2
    months, ৳15,134 notice pay, 22 days' leave at ৳460 a day, and 4 × 30 days'
    compensation (৳30,268), net ৳68,792. Her fund of ৳10,600 is shown as paid separately.
    The Bangla statement PDF was checked.
  - The gratuity provision on 30 Sep 2026: ৳20.4 lakh for 8 people, with this month's
    ৳8,500 from Rahima's service passing six and a half years.
  - The 2025-26 participation fund on ৳2.5 crore of profit: ৳10 lakh to 8 beneficiaries,
    ৳1.25 lakh each less 10% tax. Its run was locked, then the payments card split it
    across bank, bKash and cash.
- Flutter: 221 tests and analyze clean.

**Carried into later milestones from M4:**

- **Bank and wallet templates:** the files carry what BEFTN uploads and B2C disbursements
  ask for; per-bank column layouts (and RTGS for payments of Tk 1 lakh or more) come with
  the first design partners' banks.
- **Rules to confirm with counsel:** where the 7-day resignation tier starts, the wage
  gratuity is counted on, leave at gross, the scope of s.23(3), the 10% WPPF tax's start
  date and whether it is final, and the Labour Rules amendments since 2022.
- **Average wage for older separations:** the 12-month average uses the basic in force at
  each month end, not dearness or ad hoc pay.
- **Tax on gratuity:** gratuity and compensation are taxed as salary; any exemption the tax
  consultant confirms is a component setting.
- **Sector funds:** 100% export-oriented industries pay into a sector Central Fund instead
  of a company WPPF; recording that comes with the RMG pack.
- **Statutory registers** (Form 38 as a register rather than a pay sheet) come with M5.

## M5: Reports & parallel runs

How these fit together and why is in [ADR 012](../adr/012-reports-and-parallel-runs.md). The
payroll go-live steps are in [go-live.md](../ops/go-live.md#5-payroll-go-live-phase-2).

### What the law says, as encoded

Researched on 25 Oct 2026 from the Labour Rules 2015 (the DIFE copy, with its forms read from
the scans), the Labour Act as amended, and the Income Tax Act 2023 as amended by the Finance
Act 2026.

| Register or return                     | Reference                       | What we produce                                                                     |
| -------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| Wage register and wage slip            | s.121; rule 111; **Form 38**    | Per run, for workers: Form 38's columns, signed over a revenue stamp. CSV and PDF   |
| Daily attendance and overtime register | s.108; rule 102(4); **Form 34** | Per run's month (the form allows monthly): hours each day, payable OT, rate, amount |
| Advances                               | s.129; rule 117; **Form 40**    | Per fiscal year: each advance and every instalment recovered. CSV                   |
| Salary tax withholding return          | ITA s.177, quarterly            | Per quarter (due 25 Oct, Jan, Apr, Jul): salary, tax and challans per person. CSV   |
| Provident fund members' year           | rules 252–256                   | Per fiscal year: brought forward, contributions, interest, loans, carried forward   |
| Retention                              | rule 363                        | Registers are kept three years; nothing in payroll is deleted                       |

- **Overtime** is twice the hourly basic (and dearness allowance), the monthly amount over
  208 (rule 102(1)). Days over ten hours are shaded on Form 34.
- **Not done here:** the fines register (Form 12) and damage deductions (Form 39), since the
  pack has no fine or damage components, and the half-yearly and annual returns (Forms 80
  and 81), which are about headcount and hours, not pay.
- **Bank returns:** BEFTN return codes have no published table, so the bank's own reason
  text is shown, with a code where the bank gives one (R02 and so on).

### Parallel runs

- **Upload:** on a computed or locked run, upload the payroll still in use for that month
  (Excel or CSV, one row per person). The heading row is found by its employee code column,
  even under title rows.
- **Columns:** proposed from codes, names in English or Bangla and common headings ("OT
  Amount", "Net Pay", "Gross Salary"). The workspace's last mapping is proposed again where
  its headings are still there. Columns can be any component or a total: gross, earnings,
  deductions, net, paid days, absent days, overtime hours.
- **Compare:** person by person. Money matches when it agrees to the taka, days and hours
  to two decimals. People only on one side are listed. A person split over several rows is
  added up. Amounts may have separators, taka signs, Bangla digits or brackets.
- **Result:**
  - per column, how many matched and both totals;
  - per person, each difference;
  - everything as CSV.
    Sheets and results are encrypted; each upload and comparison is audited.
- **Parallel runs page:** each month's regular runs and their latest comparison. Months in
  a row where every pay group matched count towards the three the go-live test needs. The
  newest months, not compared yet, do not break the streak.
- **Go-live checklist:** three payroll steps: approved pay for everyone active, payment
  accounts (a warning, since cash is allowed), and parallel runs.

### Golden tests

`apps/api/src/modules/payroll/golden/` holds person-months worked out by hand, as JSON with
the arithmetic for every figure. A spec runs each through the engine and fails on any
difference of a taka or more, and on any line the case does not expect. The seven cases so
far come from the BD pack's rules. Design partners' anonymised rows go in the same format
(its README explains how). A case the engine disagrees with is kept and marked
`knownDifference` until the rule is settled.

The seven:

- a G5 worker's full month with overtime and an attendance bonus;
- a G2 worker who joined mid-month (proration, with the taka a rounding leaves going to the
  last line);
- a worker with absent days, a half day and leave without pay;
- staff with a provident fund and an advance capped at what is outstanding;
- a festival bonus at exactly a year's service, and none a day short;
- a worker who left mid-month with absence and overtime.

The engine agreed with every hand-worked figure.

### Reports

- **What a month cost**, by unit, company, site or pay group: headcount, gross, overtime
  (taka and hours), earnings, deductions, net, the employer's costs and the total, against
  last month. Only locked runs count; runs not locked yet are named as left out.
- **The last twelve months** as columns from one baseline, with a readout on hover or
  focus, and the same figures as a table.
- **The payroll register** for any computed run: every component in sort order, by unit
  with subtotals, signed off at the foot. CSV and a landscape PDF in English or Bangla.
- **Downloads** for the fiscal year: the withholding return by quarter, the advances
  register, the tax register, the fund's year, and the gratuity provision.

### Bank reconciliation

- On a paid run, upload the bank's or wallet provider's report: a returns file (only what
  bounced) or a status report (every payment).
- Rows are matched to our payments by account number, then amount.
- The result lists what came back, with the bank's reason and the last four digits of the
  account: credited, returned, ours the report does not mention, and rows that are not ours.
- The returned payments download as CSV, to be paid in cash or in the next run.

### Performance at 20,000 employees

Measured on a MacBook Air (M-series) against `scale-20k` after October 2026 was computed,
locked and published (`apps/api/scripts/measure-payroll.mjs scale-20k` now goes on to the
reports):

| Step                                                           | Time            |
| -------------------------------------------------------------- | --------------- |
| Payroll register / Form 34 as CSV                              | 0.7 s / 1.6 s   |
| Cost summary by unit / twelve months of cost                   | 0.44 s / 0.05 s |
| Upload a 20,000-row sheet / compare it with the run            | 0.04 s / 0.52 s |
| Payroll register PDF in Bangla (~700 pages)                    | 21 s            |
| Form 38 PDF in Bangla (691 pages) / Form 34 PDF (~1,000 pages) | 25 s / 40 s     |

**Found at scale:** Chromium could not print a register of 20,000 people as one document
("Printing failed"). Registers now print in parts of 1,500 rows, four at a time, joined into
one PDF (`pdf-lib`). Numbering runs on across parts, a unit's subtotal follows its last row,
and the totals close the last part. Whole-factory PDFs still take 20–40 s; they are monthly
downloads, and a background job can take them over if a workspace needs it.

### Done when

- **Unit tests:** reading payroll sheets (CSV quoting, heading rows, Bangla digits),
  proposing columns, comparing to the taka, months in a row, printing a register in
  parts; and the seven golden cases.
- **API end-to-end tests (3 new):**
  - a parallel run: a CSV with a difference, a person missing and an extra, then the
    corrected sheet as Excel matching every person; the go-live checklist;
  - the payroll register as CSV and Bangla PDF, and what May cost by pay group and unit, its
    trend, and the fund register;
  - a bank's returns file and status report against a paid run; Form 38, Form 34, the
    advances register and the s.177 quarter.
- **Web:** the Reports and Parallel runs tabs, the comparison page, the run page's registers
  and comparisons, and the payments card's bank report, in English and Bangla. The app needed
  nothing new: these are HR's pages.

**Checked:**

- 199 API tests in 24 files (178 before M5), country-pack tests (49), shared (93) and the
  Edge Agent's (64). Shuffled runs at first failed twice in three on an older notifications
  test: `send()` could join a dispatcher run already under way that had not seen the new
  email. The test now dispatches until the email goes, as the next sweep would, and the
  failing seeds and three more shuffled runs pass.
- The browser in English and Bangla, with July to October 2026 run for my-group:
  - July, August and September compared with "old payroll" sheets built from their
    registers. September first had Nusrat Jahan ৳50 off, found and listed. After the
    corrected sheet, the Parallel runs page reads three months in a row, ready to go live,
    with October not compared yet. The go-live checklist shows the same.
  - What September cost by unit, company, site and pay group against August, the
    twelve-month chart with its hover readout, and every download on the Reports tab.
  - September's payroll register, Form 38 and Form 34 in both languages. October's Form 34
    shades Rahima's 10.3-hour day and pays her 2 OT hours at ৳81.73 (৳163, as the run did).
  - A bank returns file for September listing Farhan Rahman's ৳91,604 as returned
    ("Account dormant", •••• 2345).
- Flutter: 221 tests, analyze clean (no app changes in M5).

**Carried into later phases from M5:**

- **Design partners' sheets:** the golden tests and the three parallel months need real,
  anonymised payrolls; the format and the tools are ready for them.
- **Withholding return format:** the NBR's e-TDS upload template is not public; the
  quarterly CSV carries what it asks for, and an exact template comes with the first tax
  consultant's file.
- **PSR (s.264):** management, administrative and production-supervisory staff must show
  proof of a tax return before being paid (no taka threshold since the Finance Act 2026);
  recording and checking it comes with the employee tax profile.
- **Forms 12, 39, 80 and 81**, and confirming whether the 2022 and 2026 Labour Rules
  amendments changed the forms used here.
- **Return codes:** a code table per sponsor bank, when one is shared.

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
- Final settlement, gratuity and WPPF after the 2025/26 amendments: [Labour Act 2006 as amended (bdlaws)](http://bdlaws.minlaw.gov.bd/act-print-952.html),
  [Ordinance 65 of 2025](http://bdlaws.minlaw.gov.bd/act-details-1578.html),
  [Act 43 of 2026](http://bdlaws.minlaw.gov.bd/act-print-1672.html),
  [OGR Legal guide, Nov 2025](https://cdn5.ogrlegal.com/files/guide/Guide-2025-Labour-Law-Amend.pdf),
  [MiHCM on Act 43, Aug 2026](https://mihcm.com/blog/the-bangladesh-labour-amendment-act-2026-what-changed-and-what-hr-must-do-now)
- Wage records (Rule 111, Form 38): [Labour Rules 2015 (DIFE copy)](https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-dife-chittagong/2024/12/522f3f452b02462a9464be1819640c94.pdf)
- WPPF payout tax (s.88): [Income Tax Act 2023, consolidated (bdlaws)](http://bdlaws.minlaw.gov.bd/act-print-1429.html)
- Mobile wallet limits: [TBS, 27 Mar 2025](https://www.tbsnews.net/economy/mfs-transaction-limit-refixed-daily-maximum-cash-tk50000-cash-out-tk30000-1103256)
- Registers and returns (M5): [Labour Rules 2015 (DIFE copy)](https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-dife-chittagong/2024/12/522f3f452b02462a9464be1819640c94.pdf),
  [DIFE register and form list](https://dife.khulna.gov.bd/pages/static-pages/69812dfe35ce18e1c06fa1b0),
  [Income Tax Act 2023, consolidated (bdlaws)](http://bdlaws.minlaw.gov.bd/act-print-1429.html),
  [e-TDS user manual](https://etds.gov.bd/user-manual/eTDS_User_Manual_v1.1.pdf)
