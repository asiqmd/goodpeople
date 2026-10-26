# ADR 016: Salaries follow the work actually done, and groups share policy with company exceptions

**Status:** accepted for Phase 3 M4 · 2026-10-27

## Decision

### NGO pack

**Projects carry their grant and their approval.** A project belongs to one company and,
when a donor funds it, to that donor. It records:

- the grant reference;
- the NGO Affairs Bureau's FD-6 approval (number and date);
- its period;
- the approved expenditure, and the part of it for staff.

Foreign-funded work may only happen inside approved projects (Foreign Donations Act 2016,
s.6), so the FD-6 approval sits on the project rather than in a note.

**A person's salary is split by shares, planned first and actual when known.**

- **Planned:** HR records a planned split as allocations: a percent of a person's salary for a
  project from a date, as programme or administration cost. A day's allocations add up to at
  most 100%; the rest stays with the person's own unit.
- **Actual:** an approved monthly timesheet replaces the plan for that month. Each project's
  share is its hours over all the hours on the timesheet, and hours not charged to a project
  stay with the unit.
- **Why actual wins:** donors charge salaries on effort actually spent, and budget estimates
  only stand until the actual effort is known (2 CFR 200.430(i); the EU asks for monthly
  timesheets signed by the person and their supervisor). The month's split always shows
  which basis it came from.

**The split happens in the journal, not in payroll.**

- **Payroll unchanged:** payroll computes pay exactly as before; projects never change what
  anyone is paid.
- **The journal:** its expense lines are split per person by the month's shares, in a new
  Project column next to the cost centre. Each part is rounded to the paisa, and the rounding
  difference goes on the largest part, so every person's parts add up to the unsplit amount.
- **Liabilities:** these lines (net pay, tax, provident fund) are owed to people and
  authorities, not charged to donors, so they are not split.

**Timesheets are certified, approved, then fixed.**

- **Filling in:** a person fills in their month by day and project, prefilled from attendance
  and the plan.
- **Submitting:** they submit it with a declaration that the hours are the work actually done.
- **Approving:** their manager approves it through the same approvals engine as leave. A
  rejection sends it back to them.
- **Reopening:** HR may reopen an approved timesheet until that month's payroll is locked.
- **Locked pay fixes the split:** once a month's pay is locked, the journal has posted it.
  From then on, that month's timesheet can no longer be submitted, approved or reopened, and
  shares cannot be added or ended over its days. The journal and the donor reports for the
  month are final.

**Field staff fill timesheets offline.**

- **Saving:** the app stores each entry with an id it made itself.
- **Syncing:** it sends the entries in one batch when a connection returns. Sending the same
  entry twice changes nothing, and refused entries come back with their reason, like offline
  punches.

**Donor reports are read from the same records.**

- **Reports:** the personnel cost schedule (CSV and PDF) and the monthly timesheet PDFs come
  from payroll, the shares and the timesheets.
- **Administration cap:** the project cost report shows administration charged against 20% of
  the approved expenditure (s.6(5)) as a warning, never a block. Like working-time alerts,
  the record must stay true even when a limit is passed.

### Group pack

**Group policy, company overrides.**

- **The group's policy:** what the workspace sets today: leave types, attendance rules,
  provident fund rates and overtime caps.
- **A company's override:** a company may override chosen values of one area (for a leave type,
  its days a year, carry-forward and days per request). Anything not overridden follows the
  group, so a change to group policy reaches every company that has not chosen otherwise.
- **Statutory floors:** overrides cannot go below the Labour Act's minimums for statutory
  leave.

**Shared-service HR sees only its companies.**

- **Limiting a login:** a login can be limited to some of the group's companies. Without
  limits it sees every company, as before. The workspace admin cannot be limited.
- **What is limited:** people and HR's pages for one person, team views, leave and correction
  lists, rosters, documents, letters and ID cards, probation and separations, compliance,
  the group dashboard, and the approvals HR decides.
- **Hidden records:** someone outside the scope is "not found", so the scope does not reveal
  who exists.
- **Payroll is not limited:** payroll stays workspace-wide in this milestone, because payroll
  officers work by pay group, and a pay group can span companies.

**Group dashboards** show headcount, joiners, leavers, attrition, women's share, overtime,
absence, open compliance alerts and payroll cost, per company and for the group.

- **Payroll cost:** shown only to those who may see pay.
- **Scope:** a limited login sees only its companies.

**Plans.**

- `projects` (the NGO pack) comes with Growth and up.
- The group pack (`multi_entity`) comes with Business and up.

## Why

- **Shares rather than a cost-centre per project:** a person works on several projects at
  once, and the split changes month by month. A single cost centre on the job cannot say "60%
  water, 40% education".
- **Splitting in the journal keeps payroll's figures and its golden tests untouched.** Projects
  are an accounting view of the same pay.
- **Actual over planned** is what donors audit. Keeping the plan as the fallback means a month
  without an approved timesheet still posts, and the report shows the basis.
- **Overrides by exception** match how groups work: one HR policy, with a few company
  differences agreed with unions or buyers. Copying the whole policy per company would let
  the companies drift apart.
- **Not found rather than forbidden** for records outside a scope: what a login may not see,
  it should not learn exists.

## Consequences

- **Counsel:** the FDVA rules are marked `needs_review` until counsel confirms them. That
  includes the 20% administration cap and how "approved expenditure" is read for multi-year
  projects.
- **Exported before locking:** a journal exported before the month's pay is locked can
  still change, if a timesheet is approved or reopened, or a share changed, in the meantime.
- **Payroll scopes:** limiting payroll by company would need pay groups per company. It is
  left for a workspace that asks.
- **Per-company leave balances:** a company override applies from the next accrual or request.
  Balances already granted are not recomputed.
