---
title: Run a payroll month
summary: Open a month for a pay group, compute it, fix the problems, have someone else approve it and lock it.
category: payroll
order: 10
updated: 2026-10-27
related: /workspace/payroll/runs /workspace/approvals /workspace/payroll/parallel
---

A payroll run is one month for one pay group. Pay is worked out from approved pay, processed attendance and approved leave, and the run moves through **Draft**, **Computed**, **Waiting for approval** and **Locked**, or it is **Cancelled**. Payroll officers prepare runs; HR admins, finance officers and workspace admins can approve them.

## Open the month

1. Go to **Payroll** → **Payroll runs** and find **New run**.
2. Choose the **Pay group** and the **Month**. Leave **Payment date** empty to use the legal deadline.
3. Click **Open the month**.

The run includes everyone whose pay on their last employed day of the month is in that group. Someone with no approved pay shows up in the default group's run as a problem. A pay group has one regular run a month; cancelling a run frees the month. Runs are monthly: weekly pay groups cannot be run yet.

The run shows its **Legal deadline**: the seventh working day after the month ends (Labour Act s.123), skipping Fridays and the holidays in the workspace's calendar. A payment date after it is marked "after the legal deadline".

## Compute and review

Click **Compute**. Each person gets their earnings, deductions and net pay. Open a person to see every line, how their tax was worked out, and their payslip in English or Bangla.

Use the filters to work through the list:

- **To fix**: errors that stop the run being sent, such as no approved pay, deductions more than earnings, a broken formula, or past days whose attendance was not processed.
- **With problems**: errors and warnings. Warnings are for review and do not stop the run: days with one punch only, a month not over yet, pay starting late, no attendance at all, a missing TIN where tax is deducted, or an installment not recovered in full.
- **Big changes**: someone new this month, or a net pay 10% or more away from the group's last locked run.

To recover an advance, pay arrears or a bonus, or override a formula for one person, enter an amount on their row with a note. Entering or removing an amount sends the run back to **Draft**; click **Compute again** before sending it.

## Approve and lock

Click **Send for approval**. The run waits in **Approvals**, where someone else with payroll approval sees it beside last month's totals and decides it. Nobody approves a run they sent. A rejected run goes back to **Computed** for its maker to correct.

> In a one-person workspace, **Payroll** → **Settings** → **A second person approves pay changes** can be turned off. Sending a run then locks it at once, and the audit log keeps who did it.

A locked run never changes: computing, entering amounts and cancelling are refused. Then you can publish the payslips (see [Payslips](/help/payslips)) and pay people (see [Bank and wallet files](/help/bank-and-mfs-files)).

## Corrections after locking

On a locked regular run, click **Start an adjustment**. The month is computed again from today's data, and the adjustment pays the difference from what was already locked, person by person and line by line; people with no difference drop out. A month has one open adjustment at a time, and it is approved and locked like any run.

## Before payroll goes live

Run Good People alongside your current payroll for three months. On each run's page, upload the current payroll's sheet under **Register and parallel run** and compare. The **Parallel runs** tab counts the months in a row in which every pay group matched to the taka; three in a row means payroll is ready to go live. Lock these runs, but do not publish their payslips or send payment files while the old payroll still pays people.
