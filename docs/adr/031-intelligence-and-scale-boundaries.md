# ADR 031: Authorized metrics before intelligence and scale

Date: 3 November 2026 (Asia/Dhaka). Status: proposed implementation contract for Phase 6; design only.

## Context

Good People already has scoped group dashboards, effective-dated job assignments, locked payroll reports, anonymous-result suppression and durable workers. Phase 6's outline is analytics, an assistant and anomaly detection. Phase 5 M7 remains locally implemented with unassigned individuals, an overdue backup, two moderate dependencies and external qualifications open. Netro Systems Limited coordinates the work; its nomination does not supply independent professional review or grant access.

## Decision

Build a versioned metric contract and current-authority workforce query boundary first. Extend the NestJS modular monolith and supported PostgreSQL/Redis/worker topology. Begin with bounded authoritative reads; add tenant-protected rebuildable projections only when measured query plans justify them. Keep warehouse, vector-store, replica and service-split decisions evidence-based.

Authorization runs before aggregation, retrieval and cache lookup, and again before asynchronous result/download delivery. Tenant RLS, current company/relationship grants and source-field permissions compose; an analytics permission is not salary access. Historical company facts use current authority over that company and cannot expose another company's current employee details. Caches include effective scope and source/version dependencies; unreliable invalidation means no cache. Platform assurance and customer analytics remain separate.

Define each metric's period, business timezone/calendar, units, source status, currency, denominator, history coverage and correction behavior. Reconcile existing complete-history figures, version deliberate differences, and expose incomplete/suppressed/unavailable separately from zero. Foreign preview fixtures are not operating payroll facts. Sensitive aggregates retain field and inference protections; anonymous surveys never become identifiable facts.

The assistant is an optional consumer of approved documents and authorized typed metric tools. Model use is disabled pending provider/data/egress/quota decisions. It has no SQL, credentials, arbitrary network access, autonomous actions or employment/payroll decision authority. Retrieved instructions and output are untrusted. Validate citations, output and current permissions in code, preserve offline local search and test injection/exfiltration, stale sources and revocation. No provider was selected or contacted by this design.

Anomalies begin as explainable deterministic review items with versioned thresholds, source evidence, minimum samples and accountable human correction through existing workflows. They do not assert fraud, protected traits or personal employment risk, and cannot execute a correction or payroll approval.

Scale is measured on an agreed workload/deployment before optimization or capacity claims. Protect transactional workloads through bounded queries, fair tenant scheduling and existing fenced idempotent jobs. Qualify backfills, restatement, source-preserving rollback and actual application recovery. Extend M7 scope and independent evidence before production activation; old evidence cannot approve changed source.

## Consequences

M1 can ship useful workforce insight without a model vendor or new infrastructure. M2 financial/operating reports, M3 assistant, M4 anomaly review and M5 scale qualification reuse the same scoped metric and provenance contract. Feature/permission and signed-license changes are deliberate migrations, not automatic rights expansion. No clinical, legal or employment decision capability is implied by a chart or answer.

Metric/source adapters, policy tests and correction/rebuild behavior add work before broad reporting. They make derived data explainable and keep exported/model-mediated information subject to the protections already enforced on HR and pay. Data/projection/transcript retention and provider operation require explicit ownership and accepted policy rather than a new indefinite data copy.

See the [Phase 6 design and M1 handoff](../phases/phase-6.md), [ADR 001](001-modular-monolith.md), [Phase 5 authority boundaries](023-enterprise-authorization-boundaries.md) and [M7 dossier](../phases/m7-assurance-review.md).
