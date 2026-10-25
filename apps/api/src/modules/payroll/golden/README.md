# Golden payroll cases

Each `*.json` file in this folder is one person-month (or one festival bonus): the inputs the
pay engine needs, and the payslip lines **worked out by hand from the rules**. `golden.spec.ts`
runs every file through the engine (`computePay` or `computeBonus` in `../run-engine.ts`) and
fails on any line or total that differs by one taka or more.

The expected amounts are never copied from the engine. They come from the Bangladesh pack's
rules (`packages/country-packs/src/bd/payroll.ts`), the engine's documented behaviour (below)
and arithmetic written out in the fixture's `working`. If the engine and the hand working
disagree, someone has to find out which one is wrong; that is the point of the test.

Run them with:

```sh
cd apps/api && pnpm vitest run src/modules/payroll/golden
```

## The rules a hand worker needs

These are what the engine does today, in the order it does it. Amounts are taka; every
`round` is to whole taka, half up (562.5 → 563).

1. **The salary split.** The structure turns the gross into components at full monthly
   amounts. `RMG_WORKER`: MEDICAL 750, CONVEYANCE 450, FOOD 1250,
   BASIC = round((GROSS − 2450) ÷ 1.5), HOUSE_RENT = GROSS − BASIC − 2450. `STAFF`:
   BASIC = round(GROSS × 0.6), HOUSE_RENT = round(BASIC × 0.5), MEDICAL = round(GROSS × 0.05),
   CONVEYANCE = the rest. Fixed amounts (SPECIAL) are added on top and count in gross.
2. **Proration by calendar days.** Each structure and fixed line is paid × days employed ÷ days
   in the period (31 for October), then rounded to whole taka. The rounding difference between
   the rounded lines and the rounded prorated gross (gross × days ÷ period days) is added to (or
   taken from) the structure's **last** line: HOUSE_RENT for `RMG_WORKER`, CONVEYANCE for
   `STAFF`. A full month needs no proration. Where pay changed mid-month, each record pays for its
   own days and the shares are added before rounding.
3. **Run formulas use the full monthly amounts** in force at the end of the period, not the
   prorated ones: OVERTIME = round(BASIC × 2 × OT hours ÷ 208) for workers only (staff get
   none); ABSENCE = round(BASIC ÷ 30 × absent days), a half day counting 0.5; UNPAID_LEAVE =
   round(GROSS ÷ 30 × days of leave without pay). Paid leave, weekly offs and holidays deduct
   nothing. An amount entered in `inputs` replaces the formula; components with no formula
   (ATTENDANCE_BONUS, ARREARS, ...) are paid only when entered.
4. **Provident fund** (members only): PF_EMPLOYEE and PF_EMPLOYER = round(BASIC paid this
   period × rate ÷ 100), on the prorated basic. PF_EMPLOYER is an employer cost: it is a line,
   but not an earning or a deduction.
5. **Advances and loans**, oldest first: each recovers min(outstanding, installment), and never
   more than the pay left after the other deductions. An entered amount is recovered instead.
6. **Totals.** Earnings = the earning lines; deductions = the deduction lines; net = earnings −
   deductions; employer cost = the employer-cost lines.
7. **Festival bonus** (`computeBonus`): due when completed months of service from `joinedOn` to
   the cut-off are at least `minServiceMonths` (a month completes on the same day of the month:
   1 Mar → 1 Mar next year is 12 months, 2 Mar → 1 Mar is 11). The bonus is
   round(BASIC × percentOfBasic ÷ 100), on the full monthly basic of the pay in force on the
   cut-off.

Salary tax is not in these cases yet: the tax years in `bd/tax.ts` are still marked
`needs_review`. A tax case would need the year's whole projection written out (see
`run-engine.ts`, "Salary tax").

## The fixture format

Amounts are strings in taka (`"6700"` or `"6700.00"`); dates are `YYYY-MM-DD`. Unknown fields
are an error, so a typo fails loudly. Component codes are the BD pack's
(`BD_PAY_COMPONENTS`): BASIC, HOUSE_RENT, MEDICAL, CONVEYANCE, FOOD, SPECIAL, OVERTIME,
ATTENDANCE_BONUS, FESTIVAL_BONUS, ARREARS, ABSENCE, UNPAID_LEAVE, ADVANCE, LOAN, PF_EMPLOYEE,
PF_EMPLOYER and the rest.

### Fields every case has

| Field             | Meaning                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `name`            | What the case is, in a line ("RMG worker, grade G5, full month with overtime").                                           |
| `source`          | Where it came from: `"hand-worked from the BD pack rules"`, or the partner sheet and row (anonymised).                    |
| `kind`            | `"pay"` for a month's pay (`computePay`), `"bonus"` for a festival bonus (`computeBonus`).                                |
| `joinedOn`        | The joining date.                                                                                                         |
| `pay`             | Approved pay records, oldest first (see below). Usually one.                                                              |
| `expected`        | The payslip worked out by hand (see below).                                                                               |
| `working`         | The arithmetic for every expected number, one short string per step (see "Writing the working").                          |
| `knownDifference` | Optional. Set when the engine disagrees with the hand working and the engine is believed wrong. The case is then skipped. |

A pay record:

| Field           | Meaning                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `effectiveFrom` | The first day this pay applies.                                                                                                  |
| `structure`     | `"RMG_WORKER"` or `"STAFF"` (the pack's `BD_SALARY_STRUCTURES`).                                                                 |
| `amount`        | The monthly gross the structure splits.                                                                                          |
| `grade`         | Optional, for structures with a wage table (`RMG_WORKER`: G1–G5, APPRENTICE). The spec checks the pay meets the grade's minimum. |
| `fixed`         | Optional fixed amounts by component, e.g. `{ "SPECIAL": "2000" }`.                                                               |

### A month's pay (`"kind": "pay"`)

| Field         | Meaning                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `period`      | `{ "start": "2026-10-01", "end": "2026-10-31" }`.                                                                          |
| `today`       | Optional; the day the run is worked out. Defaults to the day after the period ends.                                        |
| `separatedOn` | Optional; the last day employed (and paid) for a leaver. `null` or absent otherwise.                                       |
| `worker`      | `true` for a worker under the Labour Act (overtime applies), `false` for staff.                                            |
| `attendance`  | `null` when attendance is not tracked (every employed day is paid), or `{ "days": ... }` or `{ "summary": ... }`, below.   |
| `inputs`      | Optional amounts entered for the run, by component: `{ "ATTENDANCE_BONUS": "700" }`. An entered amount replaces a formula. |
| `pf`          | Optional provident fund rates, percent of basic: `{ "employeeRate": "7.5", "employerRate": "7.5" }`.                       |
| `loans`       | Optional advances and loans being recovered, oldest first (below).                                                         |

A loan is `{ "loanId": "adv-1", "component": "ADVANCE", "installment": "5000", "outstanding":
"3500" }`: `component` is ADVANCE, LOAN or PF_LOAN, and `outstanding` is what was left before
this month.

**Attendance.** The spec makes one attendance day for every employed day of the period (from
the later of `joinedOn` and the period start, to the earlier of `separatedOn` and the period
end), each `present` unless the fixture says otherwise. Say otherwise in one of two ways:

- `"days"`: exceptions by date. Each takes `status` (`present`, `half_day`, `absent`,
  `on_leave`, `off`, `missing_punch`, `pending`; default `present`), `otHours` (hours of
  overtime that day, 1.5 = 90 minutes), `leaveDays` (default 1 for `on_leave`, else 0),
  `unpaidLeave` (`true` for leave without pay) and `late`. A date outside the employed days is
  an error.

  ```json
  "attendance": {
    "days": {
      "2026-10-07": { "status": "absent" },
      "2026-10-14": { "status": "half_day" },
      "2026-10-21": { "status": "on_leave", "unpaidLeave": true },
      "2026-10-05": { "otHours": 2 }
    }
  }
  ```

- `"summary"`: counts, as a payroll sheet has them. `absentDays`, `halfDays`,
  `unpaidLeaveDays`, `paidLeaveDays`, `lateDays` (whole days) and `otHours` (the month's total).
  The spec puts them on the first employed days in that order; which dates they fall on does not
  change the pay. 2.5 days absent is `"absentDays": 2, "halfDays": 1`.

  ```json
  "attendance": { "summary": { "absentDays": 1, "otHours": 6 } }
  ```

**Expected:**

| Field          | Meaning                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `lines`        | Every non-zero payslip line, by component code: `{ "BASIC": "6700", "OVERTIME": "1031" }`. Include PF_EMPLOYER. |
| `earnings`     | Total earnings.                                                                                                 |
| `deductions`   | Total deductions.                                                                                               |
| `net`          | Earnings − deductions.                                                                                          |
| `employerCost` | Optional; total employer cost (PF_EMPLOYER).                                                                    |

### A festival bonus (`"kind": "bonus"`)

| Field      | Meaning                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `bonus`    | `{ "cutOff": "2027-03-01", "percentOfBasic": 100, "minServiceMonths": 12 }`: the bonus rule.                                  |
| `pay`      | The pay records; the one in force on the cut-off is used.                                                                     |
| `expected` | `qualifies` (`true` or `false`), then `lines`, `earnings`, `deductions` and `net` as above (all `{}` and `"0"` when not due). |

## What the spec checks

For each fixture:

- the file matches the format above (unknown fields, unknown components and malformed amounts
  fail);
- every expected line code, and the words Earnings, Deductions and Net, appear in `working`;
- each `grade` exists in the structure's wage table and the pay meets its minimum;
- the engine's status is `ok` (warnings are fine; its problems are printed otherwise);
- every expected line and total equals the engine's, both rounded to whole taka (half up);
- the engine pays no non-zero line the fixture does not expect;
- for a bonus, the engine agrees on whether it is due.

A fixture with `knownDifference` runs the same comparison and is reported as **skipped** while
the difference is there. Once the engine agrees, the case fails until `knownDifference` is
removed, so a fixed engine is noticed.

## Writing the working

- One step per string, from the rule to the number:
  `"BASIC = round((12500 − 2450) ÷ 1.5) = round(6700) = 6700"`.
- Show the formula with names, then the numbers, then the rounding: `round(616.67) = 617`. Keep
  two decimals in intermediate results.
- Give every expected line and every total its own step, naming the code (the spec checks the
  code appears). Lines that are not prorated or that come straight from an input still get one
  (`"ATTENDANCE_BONUS = 700 (entered)"`).
- Say where the days come from (`"Employed 12–31 Oct = 20 of 31 days"`) and which rule applies
  when it is not obvious (the balancing line, half rounding up, staff getting no overtime).
- Work it out with a calculator or by hand from the rules above, **not** by running the engine.
  If you are unsure of a rule, read the pack and `run-engine.ts`, and write down the reading you
  used.

## Turning a row of a partner's payroll sheet into a fixture

1. **Anonymise first.** Never copy a name, employee ID, NID, phone, bank or wallet number into a
   fixture. Name the case by role and month ("Partner B, sewing operator, Oct 2026") and set
   `source` to the sheet and row: `"Partner B October 2026 sheet, row 14 (anonymised)"`. Dates
   can stay; if one must change, move `joinedOn` by whole years and re-check the service months.
2. **Pay.** The sheet's gross → `pay[0].amount`; its grade → `grade`; the structure the partner
   uses → `structure` (`RMG_WORKER` for garment workers on the wage board split, `STAFF` for
   officers on basic 60%). Fixed allowances outside the structure → `fixed`. A pay change in the
   month → a second record with its `effectiveFrom`.
3. **Dates.** Joining date → `joinedOn`; a leaver's last working day → `separatedOn`; the month →
   `period`.
4. **Attendance.** The sheet's absent days, half days, leave without pay, paid leave, late days
   and overtime hours → `attendance.summary`. If attendance is not tracked for the person (staff
   often), use `null`.
5. **Entered amounts.** Attendance bonus, arrears and other amounts the sheet adds by hand →
   `inputs`. Advance and loan recoveries → `loans` with the installment and what was outstanding
   before the month (or `inputs` when the sheet recovers an amount off schedule). PF rates →
   `pf`.
6. **Expected.** Work every line out by hand from the rules and compare it with the sheet:
   - they agree: use the amount, and write the working;
   - the sheet's arithmetic is wrong: use the rule's amount and note the sheet's figure in the
     working;
   - the partner follows a different rule (absence on gross, a 26-day month, an attendance bonus
     formula): either enter the partner's amount in `inputs` and say so in the working, or leave
     the row out. The fixtures test the pack's rules; a partner rule the pack lacks is a feature
     request, not a fixture;
   - the sheet has a line the pack has no component for (a revenue stamp, a canteen deduction):
     leave it out of the fixture and show the sheet's net less it in the working.
7. Run the spec. If the engine disagrees, re-check the working against the pack and the rules
   above first. If the engine still looks wrong, or the rule is ambiguous, keep the fixture, set
   `knownDifference` to the reasoning, and raise it; never change the expected amounts to match
   the engine.
