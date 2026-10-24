# ADR 008: Pay is formulas over encrypted amounts, changed by two people

**Status:** accepted for Phase 2 M1 · 2026-10-25

## Decision

**Formulas.** A salary structure is a set of lines, one formula per pay component, such as
`round((GROSS - 2450) / 1.5)` for an RMG worker's basic. Formulas are parsed and evaluated by
our own small interpreter (`packages/shared/src/formula.ts`):

- decimals only (`decimal.js`, half-up rounding), with `+ − × ÷`, comparisons and `min`,
  `max`, `round`, `floor`, `ceil`, `abs`, `if`;
- names are component codes and inputs (`GROSS`, later `PAID_DAYS`, `OT_HOURS`); nothing else
  is reachable, and lines are ordered by what they use, with cycles refused;
- a structure that anyone's pay uses keeps its lines, so past pay can always be worked out
  again. A different split means a new structure.

**Encrypted, effective-dated pay.** An employee's pay is a series of records, each a
structure, an amount (gross or basic), fixed amounts and a minimum-wage grade, in force from a
date. The amounts are field-encrypted like identity numbers; the database never holds a
readable salary, and the audit log records which structure and grade a change used, not how
much.

**Maker-checker.** A pay change is proposed by someone with `payroll.manage` and approved by
someone else with `payroll.approve`, through the shared approvals inbox (a `payroll` step).
The proposer can neither see it in their inbox nor approve it. A workspace with a one-person
payroll can turn the second approval off; only someone with both permissions can, and the
audit log records it. Payroll runs (M2) will use the same rule.

## Why

- HR teams in Bangladesh split salaries in their own ways (50% basic, 60%, the wage board's
  fixed allowances). Formulas they can read keep those rules in data, not code, and the
  editor's live preview shows the result before anything is saved.
- `eval` or a general scripting language would let a formula reach the server. A tiny
  interpreter over decimals cannot, and binary floating point would lose paisa.
- Salary data is the most sensitive data the system holds after identity numbers, and pay
  fraud is the most common payroll risk: encryption at rest and a second person on every
  change address both.

## Consequences

- Reports that add up salaries decrypt in the API, not in SQL. For payroll runs (M2) the
  computed results are stored per run; aggregate reports read those.
- Formulas cannot loop or call out; anything they cannot express (tax slabs, PF rules) is a
  country-pack function used by the run, not a formula.
- With maker-checker on, a workspace needs two people who can approve pay; the payroll
  settings page warns when it has fewer.
