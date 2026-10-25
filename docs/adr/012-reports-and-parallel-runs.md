# ADR 012: Reports read locked results; parallel runs compare uploaded sheets to the taka

**Status:** accepted for Phase 2 M5 · 2026-10-25

## Decision

**Every report is worked out from the runs' encrypted results when asked for; nothing is
stored as a report.** The registers, the cost summary and the statements decrypt the items of
the runs they cover:

- the payroll register, Form 38 and Form 34 for one run;
- the cost summary for a month, against the month before;
- the s.177 quarter, the fund's year and the advances register for a fiscal year.

The cost of the last twelve months reads each run's encrypted totals instead of its items.
Management figures count only locked runs and say how many runs of the month were left out,
so a report never changes under someone who has already sent it on.

**Statutory registers follow the Labour Rules' forms, for workers.** Form 38 (wages) and
Form 34 (attendance and overtime, kept monthly as its note allows) are produced per run, for
the people the Act calls workers (not management staff). They come as CSV for the books and
as Bangla or English PDFs to print and sign. Overtime's hourly rate is worked from the
month's full basic (and dearness allowance), ×2 ÷ 208, as rule 102 says, not from the
prorated line. Registers carry the form and rule numbers, so an inspector can check them
against the gazette.

**A parallel run compares a run with a sheet of the payroll it replaces, person by person,
to the taka.** The sheet is whatever that payroll exports (Excel or CSV): we find its heading
row, propose which of its columns holds which of our components or totals, and remember the
mapping for next month. Comparison rounds money to whole taka and days and hours to two
decimals. People appear as matched, different (with each column's difference), or on one side
only. The sheet and the result are encrypted, since both hold pay, and each upload and
comparison is audited.

**Go-live is three months in a row in which every pay group matched.** The months come from
the regular runs and their latest comparisons. A month not compared yet at the newest end
does not break the streak; a difference or a gap does. The go-live checklist reads the same
streak.

**Golden tests are hand-worked person-months, run through the engine.** Each is a JSON case
with its inputs, the expected lines and the arithmetic behind each figure. They are never
copied from the engine's output. Partners' anonymised rows join in the same format. A case
the engine disagrees with stays, marked as a known difference with the reason, until the rule
or the engine is settled. It is not edited to pass.

**Bank reconciliation matches the bank's own report.** There is no national returns format
or code table, so a returns file or a full status report is read by its account column,
matched by account number (then amount), and the bank's words are the reason. What came back
is kept, encrypted, with the account cut to its last four digits.

## Why

- **Trust before go-live.** A design partner switches payroll only when the new system
  agrees with the old to the taka for months in a row. Making that comparison a product
  feature, not a spreadsheet exercise, makes it repeatable and auditable.
- **Inspectors read forms, not exports.** RMG audits and DIFE inspections ask for Form 38
  and Form 34 by number. Producing them from the same results as the payslips means the
  registers cannot disagree with what was paid.
- **No second copy of pay.** Computing reports from encrypted results keeps one source of
  truth, at the cost of decrypting on each view. That stays within seconds at 20,000
  employees.

## Consequences

- Chromium cannot print a register of 20,000 people as one document, so long registers are
  printed in parts of 1,500 rows, four at a time, and joined. A whole factory's register
  still takes 20–40 s on request; a background job can take it over if a workspace needs it.
- Sheets uploaded for comparison stay in the database, encrypted, as the record of the
  parallel months.
- Forms the pack has no data for (fines, damage deductions) and the headcount returns
  (Forms 80 and 81) are not produced yet.
