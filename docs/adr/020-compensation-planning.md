# ADR 020: Increment planning proposes pay through payroll, never around it

**Status:** accepted for Phase 4 M3 · 2026-11-01

## Decision

A compensation round belongs to one company and effective date. It snapshots released or
acknowledged final ratings, the job and approved pay. Grade ranges and the increment matrix
are copied into the round. Position in range means below the midpoint, midpoint through the
maximum, or above it. Matrices guide decisions; they do not impose a quota or a salary cap.

Managers see and propose only for their current direct reports, excluding themselves. HR
admins and workspace admins manage rounds within their company scopes. Ordinary HR officers
and payroll officers do not acquire access to all planning salaries. A proposal needs a
reason and a version; a submitted manager proposal is fixed for that manager, while HR may
revise it with a reason. All writes serialize on the round; optimistic line versions reject
lost updates. Reads do not write.

Company and optional unit budgets cap additional monthly gross pay, using decimal arithmetic.
HR may revise budgets during planning. Every line, including a zero increase, must be
submitted before the round is sent. Zero increases create no payroll records.

An RMG annual round is optional and independent of reviews. It selects wage-board workers
with twelve months' service and applies the effective-dated country-pack floor to basic,
independently of rating, matrix and range maximum. The 2023 award's 5% and the additional 4%
from December 2024 are recorded separately in time; both await counsel review. Prior pending
or approved annual increases through this workflow within twelve months prevent repetition.
External pay history is not automatically classified as annual increments.

Amounts and baseline snapshots are field-encrypted and tenant-bound. Rounds and lines have
forced row-level security and tenant-scoped foreign keys. Audit records identify changes and
reasons without copying salary amounts.

Sending checks every budget and source pay/job snapshot, then calls payroll's ordinary pay
proposal checks inside the same transaction. A failure rolls back all proposals, notification
outbox entries and links. The existing EmployeePayService exposes this transaction-level
operation, also used by its original endpoint. Compensation always requires maker-checker,
even when ordinary one-person payroll is allowed. Existing approval ownership checks prevent
the proposer or beneficiary approving. Repeated/concurrent sends cannot duplicate proposals.

The planning round becomes fixed once sent. Each line reads the current status of its linked
pay change. Approval affects effective-dated payroll as usual; rejection or withdrawal leaves
approved pay unchanged. A new round replans those decisions. Cancellation is available while
planning only. Promotions remain separate job changes.

## Consequences

- Stale rounds are cancelled and rebuilt rather than silently recalculated under a manager's
  old decision. HR sees the new baseline before submitting again.
- Approval is per person through existing payroll cards, rather than one all-or-nothing
  payroll decision for the entire round. Export itself is atomic.
- Planning is a web workflow. Approved pay and payslips remain available in web and mobile.
- The company view currently loads the whole round; pagination and bulk manager submission
  can follow after measuring larger compensation rounds.
- Counsel must confirm the RMG rule, applicability and eligibility before production use.
