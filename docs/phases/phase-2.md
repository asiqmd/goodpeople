# Phase 2: Payroll & Bangladesh statutory compliance

**Goal:** three consecutive monthly payrolls run alongside each design partner's current
process and **match it to the taka**, and 20,000 employees compute in under ten minutes.

Phase 2 builds on Phase 1's processed attendance, leave and lifecycle. It ships in five
milestones; each is merged only when its tests pass and it has been walked through in the
browser.

| Milestone                                  | Scope                                                                                                                                          | Depends on | Status |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| **M1 Pay foundations**                     | Pay components, a safe formula engine, salary structures, minimum wages, pay groups, employee pay with maker-checker                           | Phase 1    | Done   |
| **M2 Payroll runs & payslips**             | Pay periods, attendance and leave inputs, proration, overtime, the run lifecycle with locking, adjustment runs, EN/BN payslips                 | M1         |        |
| **M3 Tax, provident fund & bonuses**       | Salary income tax (projection, declarations, proofs, certificates), PF, festival and attendance bonuses, loans and advances, annual increments | M2         |        |
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

## Later milestones (outline; detailed when each starts)

- **M2 Payroll runs & payslips:**
  - Pay periods per group; inputs from processed attendance (paid days, absence, overtime
    hours) and approved leave without pay.
  - Proration, overtime at twice the hourly basic (s.108), absence deductions within the
    Act's limits.
  - Runs: draft → computed → reviewed against last month → approved → locked; adjustment
    runs; wages due within seven working days of the period (s.123).
  - EN/BN payslip PDFs, sent by email and the app, with an SMS summary.
  - The engine measured against 20,000 employees.
- **M3 Tax, provident fund & bonuses:**
  - Salary tax under the Income Tax Act 2023: yearly projection with monthly deduction,
    the salary exemption, investment rebate with declarations and proofs, minimum tax,
    salary certificates and data for the employer's returns.
  - Provident fund: membership, contributions, ledger, loans, and the 2025/26 amendment's
    duty for larger employers.
  - Two festival bonuses by religion, attendance bonus, loans and advances, annual
    increments.
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
