// Lifecycle, documents, letters and imports.

/** How employment ends, following the Labour Act's own terms (ss.19–28). */
export const SEPARATION_TYPES = [
  'resignation',
  'termination',
  'dismissal',
  'discharge',
  'retrenchment',
  'retirement',
  'death',
  'contract_end',
] as const;
export type SeparationType = (typeof SEPARATION_TYPES)[number];

/** approved: decided, waiting for the last working day; completed: the employee has left. */
export const SEPARATION_STATUSES = [
  'pending',
  'approved',
  'completed',
  'rejected',
  'cancelled',
] as const;
export type SeparationStatus = (typeof SEPARATION_STATUSES)[number];

export const DOCUMENT_CATEGORIES = [
  'photo',
  'nid',
  'birth_certificate',
  'passport',
  'educational_certificate',
  'experience_certificate',
  'appointment_letter',
  'contract',
  'medical_certificate',
  /** An adolescent's certificate of fitness (Labour Act s.34, s.37), valid 12 months. */
  'fitness_certificate',
  'police_verification',
  'nominee_form',
  'letter',
  'punch_selfie',
  'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Categories HR picks when uploading; letters and selfies are made by the system. */
export const UPLOAD_CATEGORIES = DOCUMENT_CATEGORIES.filter(
  (c) => c !== 'letter' && c !== 'punch_selfie',
) as Exclude<DocumentCategory, 'letter' | 'punch_selfie'>[];

export const DOCUMENT_SOURCES = ['upload', 'generated'] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

/** File types the vault accepts, recognised by their first bytes as well as their name. */
export const DOCUMENT_TYPES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF…WEBP
} as const;
export type DocumentContentType = keyof typeof DOCUMENT_TYPES;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_SELFIE_BYTES = 2 * 1024 * 1024;

/** The content type a file's first bytes show, if the vault accepts it. */
export function sniffContentType(bytes: Uint8Array): DocumentContentType | null {
  for (const [type, magic] of Object.entries(DOCUMENT_TYPES)) {
    if (magic.every((b, i) => bytes[i] === b)) {
      if (type === 'image/webp' && String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP') continue;
      return type as DocumentContentType;
    }
  }
  return null;
}

export const LETTER_LANGUAGES = ['en', 'bn'] as const;
export type LetterLanguage = (typeof LETTER_LANGUAGES)[number];

/** Placeholders a letter template can use, grouped as the editor shows them. */
export const MERGE_FIELDS = [
  'employee.name',
  'employee.code',
  'employee.fatherName',
  'employee.motherName',
  'employee.address',
  'employee.permanentAddress',
  'employee.joinedOn',
  'employee.dateOfBirth',
  'job.designation',
  'job.department',
  'job.location',
  'job.grade',
  'job.employmentType',
  'company.name',
  'company.address',
  'letter.date',
  'letter.refNo',
  'probation.endsOn',
  'confirmation.date',
  'change.effectiveFrom',
  'change.reason',
  'separation.noticeDate',
  'separation.lastWorkingDay',
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+(?:\.[a-zA-Z0-9_]+)+)\s*\}\}/g;

/**
 * Fills {{placeholders}}. A placeholder without a value stays as it is and is reported, so
 * HR can supply it (extra.* fields) or fix the template before anything is issued.
 */
export function fillTemplate(
  text: string,
  values: Readonly<Record<string, string | null | undefined>>,
): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const filled = text.replace(PLACEHOLDER, (match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null || value === '') {
      missing.add(key);
      return match;
    }
    return value;
  });
  return { text: filled, missing: [...missing] };
}

/** Every placeholder a template uses, for asking HR about extra.* fields up front. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

export const IMPORT_STATUSES = ['validated', 'committed', 'expired'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];
export const MAX_IMPORT_ROWS = 2000;
