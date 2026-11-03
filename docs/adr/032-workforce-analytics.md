# ADR 032: Workforce counts from authorized assignment history

Date: 3 November 2026 (Asia/Dhaka). Status: accepted for Phase 6 M1 local implementation.

## Decision

Expose three versioned `workforce.v1` metrics through the typed tenant Analytics API: closing headcount, month-to-date continuous-service joiners and completed leavers. Count each employment record once per metric. Separation day is excluded from closing headcount; this matches the group dashboard and does not determine last-day pay. Attribute joins and departures to the assignment at the event date; transfers do not create new joiners. A missing, overlapping or inconsistent assignment returns a null incomplete measurement, including the affected group total. Empty valid scopes return an exact zero.

Require both `analytics` and `core_hr` features, and the intersection of `analytics.view` and `employees.read` company/relationship rights before fetching or aggregating source facts. Explicit denial wins. Current own/direct-report authority applies to historical queries; former and ended reports cannot retain access through stale assignments. Support, platform and machine principals cannot use these human tenant routes.

Add the workforce permission deliberately to the existing tenant_admin/hr_admin ALL templates. Ordinary employee and hr_officer templates receive no new permission. Custom grants support all/own/direct-report relationships with the same current checks as the directory. Identity relationship configuration allows analytics.view alongside the two existing directory rights; other workflow restrictions remain. Workforce counts require no pay, identity, contact or bank field grants, and queries never select those fields.

Exclude analytics from every existing plan's default feature list, including Enterprise. Do not seed or rewrite stored plans, entitlements or installed licenses. Managed activation requires an explicit feature grant; self-hosted installations also require a newly issued compatible signed license covering analytics and core_hr. No commercial availability or price change is implied.

## Snapshot and bounds

Keep PostgreSQL RLS and the existing authority/session SHARE locks. Analytics opts into REPEATABLE READ, sets a local 5-second statement timeout, and retries serialization failure once. The transaction cannot be declared SQL READ ONLY because authority uses locking SELECTs; the analytics adapter itself performs only SELECTs. Existing transaction callers keep their prior isolation.

Bound queries to 50 authorized companies, 10,000 candidate employment records and 50,000 assignment rows. Only allow the ISO Gregorian as-of date, company IDs and optional site ID. Reject unknown/duplicate parameters and future selected-business dates. Use dated company context, or the explicit existing legacy Bangladesh context only when no legal-profile history exists. Gaps, unsupported calendars and invalid zones are unavailable. A selected site narrows its company and supplies its business clock; group queries share a civil period and disclose individual company zones. Current-day results are provisional.

Read one consistent source snapshot. Return definitions, normalized period, source revision, UTC dataAsOf/computedAt, authorized scope and quality reasons. Source hashing includes only authorized date-relevant inputs and results; hidden-company facts, personal names and irrelevant future changes do not influence it. Company labels are current metadata, not asserted historical names. Send private/no-store; there is no result cache, projection, backfill, export or model provider.

## Consequences

No SQL migration or new infrastructure is needed for this bounded first slice. Schema 0071 remains unchanged. Tiny synthetic query-plan observations establish a local baseline only; scale targets and supported hosting remain M5 work. Historic incomplete data is visible rather than silently repaired, and backdated corrections restate the source revision.

The API/pure/shared tests, native synthetic reconciliation and EN/BN/Arabic-preview browser checks accompany the [M1 record](../phases/phase-6.md#m1-implementation-record). Existing group and payroll behavior is retained. Production pilot review, accountable individuals, Arabic review, source-history quality, M7 assurance and earlier provider/host/country gates remain independent. Prior M7 attestations do not qualify this changed source.
