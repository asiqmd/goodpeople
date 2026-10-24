import { z } from 'zod';
import { jobChangesSchema } from './hr-schemas.js';
import {
  LETTER_LANGUAGES,
  SEPARATION_STATUSES,
  SEPARATION_TYPES,
  UPLOAD_CATEGORIES,
} from './lifecycle.js';

const isoDate = z.iso.date();
const id = z.uuid();
const reason = z.string().trim().min(3).max(500);
/** Multipart form fields arrive as text. */
const formBoolean = z
  .union([z.boolean(), z.enum(['true', 'false', 'on'])])
  .transform((v) => v === true || v === 'true' || v === 'on');

// ── Documents ────────────────────────────────────────────────────────────────

/** The fields that come with an uploaded file. */
export const documentUploadSchema = z
  .object({
    category: z.enum(UPLOAD_CATEGORIES as [string, ...string[]]),
    title: z.string().trim().min(2).max(160),
    issuedOn: isoDate.optional(),
    expiresOn: isoDate.optional(),
    visibleToEmployee: formBoolean.default(false),
  })
  .refine((d) => !d.issuedOn || !d.expiresOn || d.expiresOn >= d.issuedOn, {
    message: 'A document cannot expire before it was issued',
    path: ['expiresOn'],
  });
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;

export const documentUpdateSchema = z
  .object({
    category: z.enum(UPLOAD_CATEGORIES as [string, ...string[]]),
    title: z.string().trim().min(2).max(160),
    issuedOn: isoDate.nullable(),
    expiresOn: isoDate.nullable(),
    visibleToEmployee: z.boolean(),
  })
  .partial();
export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;

export const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(365).default(60),
});

// ── Probation, job corrections and separation ────────────────────────────────

export const probationExtensionSchema = z.object({ until: isoDate, reason });
export type ProbationExtensionInput = z.infer<typeof probationExtensionSchema>;

/** Corrects a job history row in place; later rows take the new values unless they changed them. */
export const jobCorrectionSchema = z.object({ changes: jobChangesSchema, reason });
export type JobCorrectionInput = z.infer<typeof jobCorrectionSchema>;

const separationFields = {
  noticeDate: isoDate,
  lastWorkingDay: isoDate,
  reason,
};
const lastAfterNotice = (s: { noticeDate: string; lastWorkingDay: string }) =>
  s.lastWorkingDay >= s.noticeDate;

/** HR records a separation, effective as soon as it is saved. */
export const separationInputSchema = z
  .object({ type: z.enum(SEPARATION_TYPES), ...separationFields })
  .refine(lastAfterNotice, {
    message: 'The last working day cannot be before the notice',
    path: ['lastWorkingDay'],
  });
export type SeparationInput = z.infer<typeof separationInputSchema>;

/** An employee resigns; notice is given today and the request goes for approval. */
export const resignationInputSchema = z.object({ lastWorkingDay: isoDate, reason });
export type ResignationInput = z.infer<typeof resignationInputSchema>;

export const separationListQuerySchema = z.object({
  status: z.enum(SEPARATION_STATUSES).optional(),
});

// ── Letters ──────────────────────────────────────────────────────────────────

export const letterTemplateUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    subject: z.string().trim().min(2).max(200),
    body: z.string().trim().min(10).max(20_000),
    isActive: z.boolean(),
  })
  .partial();
export type LetterTemplateUpdate = z.infer<typeof letterTemplateUpdateSchema>;

/** Generates a letter; `extra` fills placeholders like {{extra.grossWages}}. */
export const letterGenerateSchema = z.object({
  templateId: id,
  date: isoDate.optional(),
  extra: z.record(z.string().regex(/^[a-zA-Z0-9_]{1,40}$/), z.string().trim().max(500)).default({}),
  visibleToEmployee: z.boolean().default(true),
});
export type LetterGenerateInput = z.infer<typeof letterGenerateSchema>;

export const idCardsSchema = z.object({
  employeeIds: z.array(id).min(1).max(200),
  language: z.enum(LETTER_LANGUAGES).default('en'),
  validUntil: isoDate.optional(),
});
export type IdCardsInput = z.infer<typeof idCardsSchema>;

// ── Imports ──────────────────────────────────────────────────────────────────

export const importCommitSchema = z.object({
  /** Import the valid rows and leave the rest; otherwise every row must be valid. */
  onlyValid: z.boolean().default(false),
});
