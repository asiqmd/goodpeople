# ADR 001: Start as a modular monolith

**Status:** accepted · 2026-10-24

## Decision

The API is one NestJS application, split into modules with strict boundaries
(`apps/api/src/modules/*`). Modules talk through their exported services. Later, also through
an event bus with a transactional outbox. Nothing is extracted into a separate service until
metrics show it needs to scale or deploy on its own (expected candidates: attendance ingest,
payroll compute, notifications).

## Why

- One team of 8+ developers ships faster with one deployable, one database and one test suite.
- Payroll, leave and attendance share data heavily. Distributed transactions between them
  would add failure modes we don't need yet.
- A self-hosted edition (Phase 5) is far simpler to install as one service.

## Consequences

- Module boundaries are enforced by review, not by the network: a module must not import
  another module's internals, only its exported service.
- Background work (payroll runs, imports) moves to BullMQ workers inside the same codebase
  before anything becomes a separate service.
