# ADR 005: Attendance is computed from its inputs, and stored for payroll

**Status:** accepted for Phase 1 M3 · 2026-10-24

## Decision

An attendance day is a pure function of its inputs: the shift and day type the schedule gives
that date, approved leave and on-duty corrections, and the punches that fall in the day's
window (`evaluateDay` in `@gp/shared`). The API uses it two ways:

- **Screens compute it live** for the dates they show, so a new punch, an approved
  correction or a moved holiday is visible at once, and future days show the plan.
- **Processing stores it** in `attendance_days` for reports and, later, payroll. It runs in
  the same transaction as any change to an input (punch, leave decision, holiday, shift
  assignment, roster, correction, PIN claim) and every 15 minutes in the background, which
  settles days as they close and catches up after downtime. One processing runs at a time per
  workspace (an advisory lock), and the stored days are rewritten whole for the range.

Days before the workspace's attendance go-live date are never processed.

## Why

- Payroll needs a fixed record it can lock (Phase 2), but people need to see changes
  immediately; one function serving both keeps them from disagreeing.
- Devices and networks fail: punches arrive late and out of order, so a day must be
  recomputable from scratch, not updated incrementally.
- Keeping the rule in a pure, tested function makes edge cases (night shifts across
  midnight, half-day leave, work on a weekly off) testable without a database.

## Consequences

- Stored days can lag the live view by up to 15 minutes for days that close without any
  change (for example, an absence becoming final at night).
- Payroll must lock processed days before paying (Phase 2); processing will skip locked days.
- Large workspaces process all employees every run; if that becomes slow, processing moves to
  a queue per workspace without changing the function.
