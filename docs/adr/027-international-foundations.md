# ADR 027: Explicit international context before country qualification

Date: 2 November 2026. Status: implemented as a local candidate; rollout qualification remains open.

## Decision

A workspace's country is an onboarding default. Legal employers have immutable country identities and effective-dated regime, payroll-currency, business-zone and calendar profiles. Employment profiles separately preserve citizenship, insurance and contract classification, original/translated names and supplied calendar provenance. Profile changes append versions; they do not rewrite a locked result.

BD/AE/SA registration is metadata, not permission to run a country pack. Only the existing BD private/Gregorian/BDT adapter is available. Unknown countries, regimes, calendar requirements and employee cohorts block statutory work. Existing BD source review statuses remain visible; no new reviewer or approval is asserted. Cross-employer job changes require reviewed settlement, service recognition and opening records, so the legacy shortcut is blocked. Execution of a reviewed international transfer is not implemented by this candidate.

New computed runs carry a versioned manifest of applicable rule versions across the period, references, review statuses and source hashes, plus company/profile references and cohort classification hashes. Approval compares the current context with the computed snapshot. Locked currency/context cannot be edited. Historical BD results without a manifest use an explicit read adapter; migrations do not reconstruct or certify historical rule approvals.

Money has a decimal amount and explicit ISO currency. Existing financial rows acquire BDT without changing their original columns or ciphertext. Currency cannot be relabelled. Pay, structure, group, employer, bank destination and run boundaries reject incompatible contexts. Grouped totals use exact minor units and stay separate by currency. There is no FX payment or combined-currency total.

UTC instants, IANA zones, Gregorian transport dates and display language are separate. Tenant requests resolve a known employer, employee, group or run context; ambiguous business zones require context. Scheduled statutory jobs pause for unreviewed or ambiguous contexts while maintenance and message delivery remain available. Nonexistent and ambiguous DST wall times reject instead of guessing. Supplied Hijri values retain provenance; no statutory conversion is qualified.

Foreign contact records accept international phones and explicit address countries without fabricated BD parents or identifiers. Foreign citizenship is explicit; BD probation dates and adolescent classification are not inferred for foreign jobs. Issued identifiers and bank numbers are field/tenant-bound ciphertext, with scoped permissions, masked responses and audit metadata. AE/SA bank records validate country/currency and IBAN checksum; saving a destination never initiates payment.

Arabic is a technical preview: translated international record flows and shared controls, RTL web/mobile layouts, bundled fonts, informational PDF rendering and an Arabic qualification guide. Existing untranslated content uses announced English fallback. This is not complete Arabic translation or Arabic legal approval; statutory Arabic output remains disabled. EN/BN resources and statutory templates remain available.

International subscription prices are an append-only, effective-dated USD/AED candidate book for platform finance. The callback contract harness verifies exact bytes, replay windows, duplicates/conflicts, currency, bounded refunds/credits and reconciliation. It is test-only. No merchant, production callback route or checkout is activated. Corporate billing remains separate from BD invoices and employee payroll.

## Evidence and rollout

The populated 0058→0064 rehearsal compared all original rows/columns in 163 tables, including existing people, financial ciphertext, documents and permissions. Six stored-file hashes matched. A configured non-Dhaka site zone was retained on the isolated copy. Development migration was additive, without seed/reset.

M5/M6 must qualify country law, cohorts, calendars, statutory documents and every gated consumer before enabling AE/SA processing. Arabic translation/content/legal review, real merchant sandbox/finance acceptance, and M3 Docker/Linux/offline/cross-host recovery qualification remain open. Local tests and synthetic MFA browser fixtures are implementation evidence, not production acceptance.

Technical references: [W3C direction guidance](https://www.w3.org/International/questions/qa-html-dir), [SIX currency reference](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html). Font provenance and OFL license ship with the mobile asset; PDF fonts use the pinned Fontsource package.
