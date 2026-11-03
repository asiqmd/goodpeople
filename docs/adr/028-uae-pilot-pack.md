# ADR 028: UAE coverage and independently compared candidate calculations

Date: 2 November 2026. Status: local candidate; country activation remains closed.

## Decision

M5 adds an explicit UAE pilot workspace at `/workspace/uae`, backed by `/tenant/uae`.
It does not route UAE employment through Bangladesh payroll, leave, tax, PF, WPPF,
recruitment, settlement, documents or bank-export consumers. M4's guards remain in force.
The candidate is available only with payroll entitlement, MFA, identity/pay permissions,
all HR field read grants and company-wide relationships within the actor's company scope.
Review notes are free text, so restricted-field readers cannot access this delegate surface.
Writes need the corresponding organization, identity, payroll preparation or comparison right.
M1’s existing custom-payroll assignment restriction remains: these permissions cannot be
assigned as selected-company custom grants. Legacy selected-company accounts remain scoped
by the candidate service; no M1 restriction was relaxed to make this workspace available.

Employer and worker coverage are separate dated proposals. An employer records its actual
regime, full/part-time model, end-of-service arrangement, working-time exclusions, explicit
weekly rest pattern and contract notice/probation terms. DIFC, ADGM, government, domestic,
other free-zone, alternative-savings and excluded-hours arrangements can be recorded but
cannot calculate. Initial calculations require the federal private/Gregorian/AED/Dubai
profile, full-time service and an explicit onshore work-location declaration. Cross-border
and secondment cases remain blocked.

Worker proposals preserve the authority, scheme, participation history, contribution salary
and its basis date, separately from citizenship and the current employer joining date.
GPSSA 1999 and 2023 are distinct cohorts. GCC extension, other authorities and unknown
classifications block; a missing classification never means zero contributions. The
non-GCC expatriate cohort is deliberately limited to the listed pilot citizenship codes
in `ae/calculator.ts`. The proposal includes individual fixed-term/end-date and notice/probation terms, without
inheriting employer defaults as employee entitlements. It is not a registration, medical assessment or eligibility
decision. A dated `full_time` employment profile is also required. Pension partial months
and unpaid/reduced-pay pension periods require separate reviewed handling and block.

## Rules and calculation boundary

The pack version is `5.5.0-candidate.1`. Its reproducible manifest contains rule references,
instrument dates where established, a bounded candidate application window, definition
hashes and explicit review/source gaps. Its window is 1 June through 2 November 2026;
historical service can begin earlier. This window is a research limit, not a claim that all
instruments commenced in June. The old pension law's commencement date is deliberately
unset pending original-text review. Every rule remains `needs_review`, with no invented
named reviewer, covered approved scenario or original-document hash. Retrieved official
search text is research; it does not substitute for original consolidated Arabic/English
sources or current local review. See [the review dossier](../phases/m5-uae-review.md).

Exact integer minor units and explicit component rounding are used for calendar-month
salary, join/leave proration, ordinary sick-pay bands, dated ordinary/night/rest/holiday
claims, specified lawful-deduction categories and explicit GPSSA contributions. No BD tax
or fund result is imported. The working-time candidate checks daily and cumulative claim
limits, rolling three-week supplied totals, Ramadan reduction, shift-night exceptions and
the recorded rest pattern. Inputs are attested examples, not imported/approved attendance;
religion and confirmed religious holiday dates are never inferred.

The candidate conventions requiring local review are visible before calculation:
calendar-day monthly proration, a 30-day/eight-hour overtime divisor, actual/365 credited
service and component half-up rounding. Rest/holiday cash claims use an additional ordinary
daily wage plus half a basic day, prorated by worked minutes. Contract improvements,
minimum-wage applicability, medical/work-injury extensions, pension proration, holiday
confirmation, day-count interpretations and other exceptions remain qualification work.
These proposals are not presented as universal statutory conventions.

Leave previews cover annual floors, ordinary sick and maternity bands, parental, covered
bereavement and study scenarios. They require attested eligibility and applicable event
windows; a preview posts no request, approval or ledger entry. The annual floor is not an
accrued balance or carry-over calculation. Probation sickness, injury/medical extensions,
carry-over and disputed eligibility are outside these scenarios.

Settlement previews cover explicitly supported expatriate gratuity and supplied positive
leave/notice/outstanding-wage claims for one employer. Service days and unpaid exclusions
are visible. The candidate does not apply old resignation reductions, pool employers,
execute a separation, deduct offsets, settle a pension or decide a disputed compensation
claim. The cap/day-count convention and every entitlement need independent local review.

## Immutable evidence, without activation by attestation

New tables are force-RLS protected, with tenant/company/employee composite relationships.
Worker definitions, pilot inputs/results/context, comparisons, review evidence and sandbox
files/returns are tenant/field encrypted and bound to their own row IDs. Responses do not
expose ciphertext. Audit entries contain identifiers and preview mode, not wage or identity
contents. Financial previews and evidence are append-only; coverage closes an open version
and appends its replacement. This candidate's retention/purge procedure is a privacy gate.

A calculation stores its manifest, exact effective coverage/job/employment context and
calculation hashes. A changed source preserves the original preview and marks its context
stale; comparing or creating a new sandbox file then requires a replacement. Comparison
records contain all employee-level gross, employee/employer/government contribution,
deduction and net amounts. Missing/extra employees and any minor-unit difference are
visible. An independently labelled comparison requires a second login. Synthetic examples
never count toward the three-period independent gate. Both labels are attestations; neither
certifies a professional reviewer or marks the rulebook approved.

Comparisons and returns use monotonically ordered sequences under parent-row locks,
not timestamp ordering. Changed replay bodies conflict. The latest comparison must match
before a sandbox file is created. Reviewer evidence records the manifest, named reviewer,
date, source-document hash/reference, rule keys and covered scenario references. No UI/API
switch can self-approve or activate the country pack. Country consumer qualification and
actual release review remain necessary even when an evidence register has entries.

## Wage-file boundary and documents

The Emirates Islamic public SIF guide was downloaded and hashed. It is a candidate format,
not the pilot agent's current acceptance. The sandbox produces EDR/optional EVP/SCR examples
with synthetic identifiers, a conspicuous invalid-for-upload header, `.txt` naming and an
exact download hash. It never reads real bank or permit identifiers. An upload reference,
accepted/rejected return and exact reconciliation can be simulated with durable deduplication.
Partial rejection is terminal for that sandbox batch; corrections create a new batch.
Acceptance/reconciliation never asserts payment or creates a payable, accounting or WPS
compliance record. The production export route remains blocked; no bank/MOHRE upload runs.

EN/BN/AR workspace copy and RTL layout reuse M4's font/direction pipeline. Informational
financial PDFs are visibly unreviewed previews, with manifest/calculation references.
They are not issued payslips, reviewed employment letters or legally approved Arabic text.
All existing statutory document and Arabic legal-template boundaries stay closed for AE.

## Rollout

Rehearse the additive 0064 to 0067 migration on a populated native copy, comparing every
original table column/row and stored file. Preserve earlier dirty work and installed-release
upgrade controls. Use a separate synthetic M5 workspace for native acceptance.

Required external gates: original consolidated sources and local named rule/cohort review;
worked exceptions and independent three-period/settlement evidence; English/Arabic legal
and payslip/letter review; privacy/retention and hosting/transfer review; current bank-agent
schema, acceptance, rejection/correction and actual reconciliation evidence; qualification
of every affected consumer. M1 provider, M2 delivery/load/failover, M3 signed-release/
Linux/offline/physical recovery and M4 Arabic/MoR gates carry forward. Local checks are not
commercial, legal, provider or production acceptance.
