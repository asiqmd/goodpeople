// The public legal pages (Phase 3 M5). Drafts until counsel signs them off; a new version of
// the terms is accepted at the next sign-up, and changes are announced to workspaces.

export const LEGAL_DOCUMENTS = ['terms', 'privacy', 'refunds', 'dpa'] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

/** The version of the terms (with the privacy policy and DPA) a sign-up accepts. */
export const TERMS_VERSION = '2026-11-01';
