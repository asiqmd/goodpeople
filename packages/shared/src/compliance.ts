import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';

// Working-time and factory compliance (Phase 3 M3): alerts raised from attendance against
// the Labour Act's limits (adults, adolescents, women at night) and the company's own
// overtime caps, and from committees falling behind. Alerts never block or change pay.

export const COMPLIANCE_ALERT_KINDS = [
  // Adults (s.100, s.102, s.103)
  'daily_hours',
  'weekly_hours',
  'no_weekly_holiday',
  // The company's overtime caps (often a buyer's code)
  'overtime_daily',
  'overtime_weekly',
  'overtime_monthly',
  // Adolescents (s.34, s.37, s.41)
  'adolescent_daily',
  'adolescent_weekly',
  'adolescent_night',
  'adolescent_certificate',
  // Women between 10 pm and 6 am without consent (s.109)
  'women_night',
  // Committees (s.90A, s.205–207, s.332A)
  'committee_missing',
  'committee_meeting_overdue',
  'committee_minutes_late',
  'committee_term_ended',
] as const;
export type ComplianceAlertKind = (typeof COMPLIANCE_ALERT_KINDS)[number];

export const COMPLIANCE_ALERT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
export type ComplianceAlertStatus = (typeof COMPLIANCE_ALERT_STATUSES)[number];

/** Kinds the working-time check raises from attendance; the value and limit are minutes. */
export const HOURS_ALERT_KINDS = [
  'daily_hours',
  'weekly_hours',
  'overtime_daily',
  'overtime_weekly',
  'overtime_monthly',
  'adolescent_daily',
  'adolescent_weekly',
  'adolescent_night',
  'women_night',
] as const satisfies readonly ComplianceAlertKind[];
export type HoursAlertKind = (typeof HOURS_ALERT_KINDS)[number];

/** Every kind about one worker: the hours, a run of days without a holiday, a certificate. */
export const WORKER_ALERT_KINDS = [
  ...HOURS_ALERT_KINDS,
  'no_weekly_holiday',
  'adolescent_certificate',
] as const satisfies readonly ComplianceAlertKind[];
export type WorkerAlertKind = (typeof WORKER_ALERT_KINDS)[number];

/** A section of an act, as the country pack cites it. */
export interface LegalRef {
  act: string;
  section: string;
}

/**
 * What a worker alert records besides its value and limit. `reference` is the rule in force
 * on the period's first day; null for the company's own caps.
 */
export type WorkerAlertDetail = {
  reference: LegalRef | null;
  rule: string | null;
  workplace?: 'factory' | 'other';
  age?: number;
  daysWorked?: number;
  /** Local clock times (HH:MM) of the first and last punch, for a day. */
  firstIn?: string | null;
  lastOut?: string | null;
  /** The clock window the law protects, for night work. */
  window?: { from: string; to: string };
  /** For certificates: why there is none in force, and since when. */
  certificate?: {
    reason: 'missing' | 'expired';
    documentId: string | null;
    expiredOn: string | null;
  };
};

const isoDate = z.iso.date();
const minutes = (max: number) => z.coerce.number().int().min(0).max(max);
const DAY_MS = 86_400_000;

// ── Settings ─────────────────────────────────────────────────────────────────

export const complianceSettingsSchema = z.object({
  overtimeDailyCapMinutes: minutes(1440),
  overtimeWeeklyCapMinutes: minutes(7 * 1440),
  /** null: no monthly cap. */
  overtimeMonthlyCapMinutes: minutes(31 * 1440).nullable(),
  warnAtPercent: z.coerce.number().int().min(50).max(100),
});
export type ComplianceSettingsInput = z.infer<typeof complianceSettingsSchema>;

/** A limit the law sets, in minutes, with the section that sets it. */
export interface LegalLimit {
  minutes: number;
  reference: LegalRef;
}

/** The working-time limits in force today, for showing beside the company's caps. */
export interface WorkingTimeLaw {
  adultDaily: LegalLimit;
  adultWeekly: LegalLimit;
  /** The most overtime the adult limits leave room for (10 − 8 hours, 60 − 48 hours). */
  overtimeDaily: LegalLimit;
  overtimeWeekly: LegalLimit;
  weeklyHoliday: { days: number; reference: LegalRef };
  adolescentDaily: { factory: number; other: number; reference: LegalRef };
  adolescentWeekly: { factory: number; other: number; reference: LegalRef };
  adolescentNight: { from: string; to: string; reference: LegalRef };
  adolescentCertificate: { months: number; reference: LegalRef };
  womenNight: { from: string; to: string; reference: LegalRef };
}

export interface ComplianceSettingsView extends ComplianceSettingsInput {
  law: WorkingTimeLaw;
  updatedAt: string | null;
}

// ── The check ────────────────────────────────────────────────────────────────

export const complianceCheckSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((q) => q.to >= q.from, { message: 'The end date is before the start', path: ['to'] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) < 93 * DAY_MS, {
    message: 'At most 93 days at a time',
    path: ['to'],
  });
export type ComplianceCheckInput = z.infer<typeof complianceCheckSchema>;

export interface ComplianceCheckResult {
  from: string;
  to: string;
  people: number;
  raised: number;
  updated: number;
  resolved: number;
  notified: number;
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export const complianceAlertQuerySchema = z.object({
  kind: z.enum(COMPLIANCE_ALERT_KINDS).optional(),
  status: z.enum(COMPLIANCE_ALERT_STATUSES).optional(),
  /** Alerts whose period overlaps from–to. */
  from: isoDate.optional(),
  to: isoDate.optional(),
  employeeId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ComplianceAlertQuery = z.infer<typeof complianceAlertQuerySchema>;

export const acknowledgeAlertSchema = z.object({
  note: z.string().trim().min(3).max(1000),
});
export type AcknowledgeAlertInput = z.infer<typeof acknowledgeAlertSchema>;

export interface ComplianceAlertView {
  id: string;
  kind: ComplianceAlertKind;
  subjectId: string;
  employee: EmployeeRef | null;
  /** The committee or company a committee alert is about. */
  subjectName: string | null;
  periodStart: string;
  periodEnd: string;
  value: number;
  limit: number;
  detail: Record<string, unknown> | null;
  status: ComplianceAlertStatus;
  note: string | null;
  acknowledgedBy: { id: string; name: string } | null;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceAlertPage {
  items: ComplianceAlertView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ComplianceOverview {
  kinds: { kind: ComplianceAlertKind; open: number; acknowledged: number }[];
  open: number;
  acknowledged: number;
  resolvedLast30Days: number;
  adolescents: number;
  adolescentsWithoutCertificate: number;
  womenWithNightConsent: number;
  latest: ComplianceAlertView[];
}

// ── Hours board ──────────────────────────────────────────────────────────────

export const hoursBoardQuerySchema = z.object({
  /** Any day of the week (Saturday to Friday); this week when left out. */
  week: isoDate.optional(),
  orgUnitId: z.uuid().optional(),
});
export type HoursBoardQuery = z.infer<typeof hoursBoardQuerySchema>;

export type HoursLevel = 'ok' | 'warn' | 'over';

export interface HoursBoardRow {
  employee: EmployeeRef;
  orgUnit: string | null;
  adolescent: boolean;
  workplace: 'factory' | 'other';
  daysWorked: number;
  workedMinutes: number;
  overtimeMinutes: number;
  longestDayMinutes: number;
  /** Overtime in the month to date (the month of the week's last day). */
  monthOvertimeMinutes: number;
  /** The law's weekly limit for this person (adult or adolescent), overtime included. */
  weeklyLimitMinutes: number;
  /** The highest share of a limit or cap reached, in percent. */
  percent: number;
  level: HoursLevel;
}

export interface HoursBoardView {
  weekStart: string;
  weekEnd: string;
  month: string;
  warnAtPercent: number;
  caps: { daily: number; weekly: number; monthly: number | null };
  law: WorkingTimeLaw;
  rows: HoursBoardRow[];
}

// ── Adolescents ──────────────────────────────────────────────────────────────

export const CERTIFICATE_STATES = ['valid', 'expiring', 'expired', 'missing'] as const;
export type CertificateState = (typeof CERTIFICATE_STATES)[number];

/** A certificate of fitness is flagged as expiring this many days before it lapses. */
export const CERTIFICATE_WARN_DAYS = 30;

export interface AdolescentRow {
  employee: EmployeeRef;
  dateOfBirth: string;
  age: number;
  adultOn: string;
  workplace: 'factory' | 'other';
  location: string | null;
  certificate: {
    state: CertificateState;
    documentId: string | null;
    title: string | null;
    validUntil: string | null;
  };
  weekWorkedMinutes: number;
  weekLimitMinutes: number;
  dailyLimitMinutes: number;
  openAlerts: number;
}

export interface AdolescentsView {
  weekStart: string;
  weekEnd: string;
  law: WorkingTimeLaw;
  rows: AdolescentRow[];
}

// ── Women at night ───────────────────────────────────────────────────────────

export const nightWorkQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
});
export type NightWorkQuery = z.infer<typeof nightWorkQuerySchema>;

export const nightConsentSchema = z.object({
  /** The day her written consent takes effect; null withdraws it. */
  consentFrom: isoDate.nullable(),
});
export type NightConsentInput = z.infer<typeof nightConsentSchema>;

export interface NightWorkRow {
  employee: EmployeeRef;
  location: string | null;
  consentFrom: string | null;
  /** Days in the last 30 that overlapped the night window. */
  nightDays: number;
  lastNight: string | null;
  openAlerts: number;
}

export interface NightWorkView {
  since: string;
  law: WorkingTimeLaw;
  rows: NightWorkRow[];
}
