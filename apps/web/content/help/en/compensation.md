---
title: Budgeted increment rounds
summary: Plan pay increments from released review ratings and grade ranges, collect managers’ proposals, check budgets and send changes to payroll approval.
category: talent
order: 21
updated: 2026-11-01
related: /workspace/performance/compensation /workspace/performance/cycles /workspace/approvals
---

Under **Performance → Compensation planning**, workspace admins and HR admins create a round for one company and effective date. Managers see only the lines for their direct reports. Employees see their approved pay and payslips as usual; they do not see planning proposals.

## Set up a round

Choose a released review cycle. Only released or acknowledged reviews with a final rating count. Set a company budget for **additional monthly gross pay** and, optionally, limits for individual units. Unit limits are part of the company total, not extra money.

Enter monthly gross salary ranges for the grades in the round. The matrix suggests a gross increment percentage by final rating and position in the range: below midpoint, midpoint through maximum, or above maximum. The starting percentages are editable policy examples, not a statutory entitlement. A review recommendation is shown as guidance.

Creating the round keeps a snapshot of approved pay, the job, final ratings, ranges and suggestions. The **Not included** list explains missing pay, pending or later pay changes, missing ranges and ineligible employees.

## Propose, review and submit

Managers enter a gross increment percentage and a reason, save drafts and submit each line. Once submitted, a manager cannot change it. HR admins may revise it with a reason. Nobody proposes their own pay. A zero increment is an explicit decision and must also be submitted.

The server calculates the resulting basic and gross pay. The round shows the additional monthly cost, the company budget and unit subtotals. HR may adjust budgets while planning. Every line must be submitted and every limit met before **Send to payroll approval** succeeds.

## Payroll approval

Sending fixes the round and creates ordinary effective-dated pay changes. A second person with payroll approval decides each one in **Approvals**. The proposer and the person whose pay changes cannot approve it. Compensation rounds always use this control, even if one-person payroll is enabled.

A proposal alone does not change salary. Each line shows whether payroll approved, rejected or withdrew its change. Approved pay feeds the existing payroll engine from its effective date. A rejected or withdrawn change can be reconsidered in a new round.

If pay, the job or its formulas changed during planning, sending fails atomically: no partial set of pay proposals is kept. Cancel and rebuild the round from the new records. Cancellation is available only before sending and never changes pay. Promotions are made separately through job changes.

## RMG annual increments

The **RMG annual basic increment** option is for eligible workers paid on the RMG wage-board structure, with at least twelve months’ service. It may run without a review cycle. Its minimum basic increment comes from the effective-dated country pack, independently of ratings or the top of a range. An annual increase already pending or approved through this workflow within the previous twelve months is not repeated.

The rule is marked for labour counsel’s review. Confirm its applicability and each worker’s prior increment history before relying on it in production; increments granted outside these rounds are not classified automatically.
