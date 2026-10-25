import { z } from 'zod';
import type { Ref } from './hr-types.js';

// Grievances (Phase 3 M3): a channel any worker can use without signing in, anonymous by
// default, followed up with a reference and a PIN. Harassment goes to the complaint
// committee only (s.332A); formal complaints keep the Labour Act's 30 days (s.33).

export const GRIEVANCE_CATEGORIES = [
  'wages',
  'hours',
  'leave',
  'safety',
  'harassment',
  'discrimination',
  'facilities',
  'other',
] as const;
export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number];

export const GRIEVANCE_STATUSES = ['new', 'in_review', 'responded', 'resolved', 'closed'] as const;
export type GrievanceStatus = (typeof GRIEVANCE_STATUSES)[number];

export const GRIEVANCE_CHANNELS = ['web', 'kiosk', 'staff'] as const;
export type GrievanceChannel = (typeof GRIEVANCE_CHANNELS)[number];

export const GRIEVANCE_AUTHORS = ['reporter', 'staff'] as const;
export type GrievanceAuthor = (typeof GRIEVANCE_AUTHORS)[number];

/** Where a worker raises one themselves; staff record the rest. */
export const GRIEVANCE_PUBLIC_CHANNELS = [
  'web',
  'kiosk',
] as const satisfies readonly GrievanceChannel[];

/** Statuses that stop the s.33 clock. */
export const GRIEVANCE_DONE_STATUSES = [
  'resolved',
  'closed',
] as const satisfies readonly GrievanceStatus[];

/** Seen only by the complaint committee (s.332A). */
export const RESTRICTED_GRIEVANCE_CATEGORIES = [
  'harassment',
] as const satisfies readonly GrievanceCategory[];

/**
 * A reference's characters: digits and capitals that cannot be misread for one another when
 * copied from a phone or a slip of paper (no 0/O, 1/I/L or U/V).
 */
export const GRIEVANCE_REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ';
export const GRIEVANCE_REFERENCE_LENGTH = 6;
const REFERENCE_PATTERN = new RegExp(
  `^GR-[${GRIEVANCE_REFERENCE_ALPHABET}]{${GRIEVANCE_REFERENCE_LENGTH}}$`,
);

/** Wrong PINs a reference allows before it locks, and for how long. */
export const GRIEVANCE_PIN_ATTEMPTS = 5;
export const GRIEVANCE_LOCK_MINUTES = 15;

export const GRIEVANCE_TEXT_MIN = 10;
export const GRIEVANCE_TEXT_MAX = 5000;

/** Bangla keyboards type Bangla digits (০–৯); PINs compare as ASCII digits. */
export const asciiDigits = (value: string) =>
  value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));

/** `gr 7k3p9q`, `GR7K3P9Q` and `7K3P9Q` are all `GR-7K3P9Q`. */
export function normalizeGrievanceReference(value: string): string {
  const compact = value.toUpperCase().replace(/[\s-]/g, '');
  const body =
    compact.length === GRIEVANCE_REFERENCE_LENGTH + 2 && compact.startsWith('GR')
      ? compact.slice(2)
      : compact;
  return `GR-${body}`;
}

export const isGrievanceReference = (value: string) => REFERENCE_PATTERN.test(value);

export const grievanceReferenceSchema = z
  .string()
  .max(20)
  .transform(normalizeGrievanceReference)
  .refine(isGrievanceReference, 'Enter the reference you were given, like GR-7K3P9Q');

export const grievancePinSchema = z
  .string()
  .trim()
  .max(20)
  .transform(asciiDigits)
  .refine((pin) => /^\d{4,8}$/.test(pin), 'Use 4 to 8 digits');

const grievanceText = z
  .string()
  .trim()
  .min(GRIEVANCE_TEXT_MIN, `Write at least ${GRIEVANCE_TEXT_MIN} characters`)
  .max(GRIEVANCE_TEXT_MAX, `Keep it under ${GRIEVANCE_TEXT_MAX} characters`);

// ── Raising one and following it up (no sign-in) ─────────────────────────────

export const grievanceSubmitSchema = z.object({
  category: z.enum(GRIEVANCE_CATEGORIES),
  text: grievanceText,
  locationId: z.uuid().optional(),
  /** Only when the worker chooses to be named. */
  name: z.string().trim().min(2, 'Enter your name').max(120).optional(),
  employeeCode: z.string().trim().min(1).max(40).transform(asciiDigits).optional(),
  pin: grievancePinSchema,
  channel: z.enum(GRIEVANCE_PUBLIC_CHANNELS).default('web'),
});
export type GrievanceSubmitInput = z.input<typeof grievanceSubmitSchema>;

export const grievanceFollowUpSchema = z.object({
  reference: grievanceReferenceSchema,
  pin: grievancePinSchema,
});
export type GrievanceFollowUpInput = z.input<typeof grievanceFollowUpSchema>;

export const grievanceReporterReplySchema = grievanceFollowUpSchema.extend({ text: grievanceText });
export type GrievanceReporterReplyInput = z.input<typeof grievanceReporterReplySchema>;

/** What the speak-up page needs: whose page it is, its sites, the categories and the law's deadline. */
export interface SpeakUpInfo {
  workspace: { name: string; slug: string };
  sites: Ref[];
  categories: GrievanceCategory[];
  deadline: GrievanceDeadline;
}

export interface GrievanceSubmitted {
  reference: string;
  createdAt: string;
}

export interface GrievanceMessageView {
  author: GrievanceAuthor;
  text: string;
  createdAt: string;
}

/** What the reporter sees with the reference and PIN. Staff stay unnamed. */
export interface GrievanceFollowUp {
  reference: string;
  category: GrievanceCategory;
  status: GrievanceStatus;
  createdAt: string;
  /** The grievance itself first, then the replies. */
  thread: GrievanceMessageView[];
}

// ── Staff ────────────────────────────────────────────────────────────────────

export const grievanceListQuerySchema = z.object({
  status: z.enum(GRIEVANCE_STATUSES).optional(),
  category: z.enum(GRIEVANCE_CATEGORIES).optional(),
});
export type GrievanceListQuery = z.infer<typeof grievanceListQuerySchema>;

export const grievanceStaffReplySchema = z.object({ text: grievanceText });
export type GrievanceStaffReplyInput = z.infer<typeof grievanceStaffReplySchema>;

export const grievanceStatusSchema = z.object({ status: z.enum(GRIEVANCE_STATUSES) });
export type GrievanceStatusInput = z.infer<typeof grievanceStatusSchema>;

export interface GrievanceSummary {
  id: string;
  reference: string;
  category: GrievanceCategory;
  status: GrievanceStatus;
  channel: GrievanceChannel;
  anonymous: boolean;
  restricted: boolean;
  location: Ref | null;
  createdAt: string;
  closedAt: string | null;
  /** Days since it was raised, up to when it was resolved or closed. */
  ageDays: number;
  /** The day the employer should have decided by (s.33). */
  dueOn: string;
  overdue: boolean;
  /** The reporter wrote last: it waits for an answer. */
  awaitingReply: boolean;
  lastMessageAt: string;
}

/** The s.33 deadline as applied, with its reference. */
export interface GrievanceDeadline {
  days: number;
  reference: { act: string; section: string };
}

export interface GrievanceList {
  items: GrievanceSummary[];
  deadline: GrievanceDeadline;
  /**
   * No complaint committee member can open grievances here, so harassment cases show to
   * everyone who handles grievances. The Labour Act needs one (s.332A).
   */
  committeeMissing: boolean;
}

export interface GrievanceThreadMessage extends GrievanceMessageView {
  /** The staff login who answered (staff only see this). */
  staff: Ref | null;
}

export interface GrievanceDetail extends GrievanceSummary {
  /** Null when anonymous. The employee is set only when the code matched an active employee. */
  reporter: {
    name: string | null;
    employeeCode: string | null;
    employee: (Ref & { employeeCode: string }) | null;
  } | null;
  thread: GrievanceThreadMessage[];
  deadline: GrievanceDeadline;
  committeeMissing: boolean;
}
