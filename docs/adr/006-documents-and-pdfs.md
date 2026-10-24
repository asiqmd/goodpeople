# ADR 006: Documents are encrypted by the API; PDFs come from headless Chrome

**Status:** accepted for Phase 1 M4 · 2026-10-24

## Decision

**Storage.** Documents (NID scans, contracts, letters, punch photos) live in a file store
behind one small interface: a local directory in development and on single servers, or any
S3-compatible bucket (AWS, MinIO) in production. Before a file reaches either, the API
encrypts it with AES-256-GCM:

- under a key derived from `FIELD_ENCRYPTION_KEY`
- bound to its workspace and document id as additional data

The store therefore never holds a readable document, and a file copied under another id or
into another workspace fails to decrypt. Files are accepted by their content (PDF, JPEG, PNG,
WebP), never by their name. Deleting a document deletes the file; the row stays as a record.

**PDFs.** Letters, ID cards and service books are HTML rendered by headless Chrome
(`puppeteer-core`, using the Chrome or Chromium on the machine), with Noto Sans Bengali
embedded. Each render is isolated:

- a fresh page with JavaScript off
- every network request blocked
- escaped content, and templates with no markup beyond bold and lists

## Why

- Bangladesh's data protection rules are still settling, and the vault holds identity
  documents: encryption must not depend on how a bucket is configured.
- Most PDF libraries do not shape Bangla conjuncts correctly; a browser does.
- Using the installed Chrome keeps a 150 MB browser download out of every install.

## Consequences

- Losing `FIELD_ENCRYPTION_KEY` loses the documents too; it must be backed up like the
  database, and rotating it needs a re-encryption job (the `GPF1` header leaves room).
- Servers need Chrome or Chromium installed (`CHROME_PATH`); without it PDF endpoints answer
  503 `pdf_unavailable`.
- Files pass through the API, not straight from the bucket. That is fine for documents of a
  few megabytes; large media would need signed URLs.
