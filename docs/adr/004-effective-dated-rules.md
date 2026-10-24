# ADR 004: Statutory rules are effective-dated configuration

**Status:** accepted for Phase 1+ · 2026-10-24

## Decision

Statutory rules live in versioned country packs as parameters, never as constants in code.
That covers leave entitlements, OT rates, working-hour caps, wage-board grades, tax slabs and
thresholds, PF and gratuity rules, and holidays. Each parameter carries:

- a legal reference (act and section)
- an effective-from date, and an effective-to date when superseded
- test cases, including the expected values for a worked example
- the reviewer who signed it off (labour lawyer or tax consultant)

Calculations ask for "the rule in force on date D", so re-running an old month uses that
month's rules.

## Why

- Bangladesh labour law changed by ordinance on 17 Nov 2025, again by Act No. 43 of 2026
  (effective 10 Apr 2026), and a tripartite committee may change it again.
- Income-tax thresholds change with every budget, and the fiscal year runs July to June.
- Public sources disagree on some 2025/26 details, so rules must be easy to correct without
  a code release.

## Consequences

- **Phase 1:** builds the rules engine (`packages/country-packs`, not created yet), starting
  with leave and holidays. Phase 2 adds payroll and tax.
- **Golden tests:** anonymized payroll sheets from design partners become fixtures, and CI
  blocks any change that alters their results.
