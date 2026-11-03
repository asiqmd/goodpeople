// Notifications, sign-in by phone and two-step sign-in.

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Channels that leave the app, each a delivery with its own status. */
export const DELIVERY_CHANNELS = ['email', 'sms', 'push'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export const DELIVERY_STATUSES = ['queued', 'sent', 'failed', 'skipped'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** What people are told about. Each has a template per language and default channels. */
export const NOTIFICATION_EVENTS = [
  'identity.emergency_used',
  /** A request waits for your decision (leave, correction, resignation). */
  'approval.requested',
  /** Your request was approved or rejected. */
  'approval.decided',
  /** A document expires within 30 days, or has expired. */
  'document.expiring',
  /** Someone's probation ends within 14 days. */
  'probation.ending',
  /** HR issued a letter to you. */
  'letter.issued',
  /** Yesterday has only one punch. */
  'attendance.missing_punch',
  /** A payroll run was locked and its payslips published. */
  'payslip.published',
  /** Good People issued the workspace's monthly invoice (to those who manage billing). */
  'billing.invoice_issued',
  /** A payment of an invoice was received. */
  'billing.payment_received',
  /** An invoice is due soon, overdue, or the workspace went read-only for it. */
  'billing.payment_due',
  /** The free trial ends in a week, tomorrow, or has ended. */
  'trial.ending',
  /** A working-time limit was passed, or a committee fell behind (to HR and the manager). */
  'compliance.alert',
  /** A worker raised a grievance (to those who handle them; never its content). */
  'grievance.received',
  /** A maternity benefit payment falls due within three working days. */
  'maternity.payment_due',
  /** Your timesheet for last month is not yet submitted (staff charged to projects). */
  'timesheet.due',
  /** The account your salary is paid to was changed (a security notice to the employee). */
  'payment_account.changed',
  /** A candidate applied to an opening (to recruiters and its hiring manager). */
  'recruitment.application',
  /** You are on an interview, or it moved or was cancelled (to the interviewers). */
  'recruitment.interview',
  /** A candidate accepted or declined an offer (to recruiters and the hiring manager). */
  'recruitment.offer',
  /** A review step, goals to agree or a probation review waits for you. */
  'performance.task',
  /** Your review is released for you to read and acknowledge. */
  'performance.released',
  'learning.notice',
  'engagement.notice',
  'services.notice',
  /** A sign-in code: SMS only, always sent. */
  'auth.otp',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/**
 * Events whose channels and wording HR cannot change: the sign-in code, and the salary
 * account notice, which must reach the employee even when HR made the change.
 */
export const FIXED_EVENTS = [
  'identity.emergency_used',
  'auth.otp',
  'payment_account.changed',
] as const;
export type FixedEvent = (typeof FIXED_EVENTS)[number];
export const isFixedEvent = (event: NotificationEvent): event is FixedEvent =>
  (FIXED_EVENTS as readonly string[]).includes(event);

/** Events HR may switch channels for and edit. */
export const CONFIGURABLE_EVENTS = NOTIFICATION_EVENTS.filter((e) => !isFixedEvent(e)) as Exclude<
  NotificationEvent,
  FixedEvent
>[];

/** Where each event goes unless HR changes it. SMS costs money, so it is off by default. */
export const DEFAULT_EVENT_CHANNELS: Record<NotificationEvent, readonly DeliveryChannel[]> = {
  'identity.emergency_used': ['email', 'push'],
  'approval.requested': ['email', 'push'],
  'approval.decided': ['email', 'push'],
  'document.expiring': ['email'],
  'probation.ending': ['email'],
  'letter.issued': ['email', 'push'],
  'attendance.missing_punch': ['push'],
  'payslip.published': ['email', 'push'],
  'billing.invoice_issued': ['email'],
  'billing.payment_received': ['email'],
  'billing.payment_due': ['email'],
  'trial.ending': ['email'],
  'compliance.alert': ['email', 'push'],
  'grievance.received': ['email', 'push'],
  'maternity.payment_due': ['email'],
  'timesheet.due': ['email', 'push'],
  'payment_account.changed': ['email', 'sms', 'push'],
  'recruitment.application': ['email'],
  'recruitment.interview': ['email', 'push'],
  'recruitment.offer': ['email', 'push'],
  'performance.task': ['email', 'push'],
  'performance.released': ['email', 'push'],
  'learning.notice': ['email', 'push'],
  'engagement.notice': ['push'],
  'services.notice': ['email', 'push'],
  'auth.otp': ['sms'],
};

export const DEVICE_PLATFORMS = ['android', 'ios', 'web'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const USER_LANGUAGES = ['en', 'bn', 'ar'] as const;
export type UserLanguage = (typeof USER_LANGUAGES)[number];

/** A sign-in code by SMS: digits, minutes valid, wrong guesses allowed. */
export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;

/** One-time recovery codes given when two-step sign-in is turned on. */
export const MFA_RECOVERY_CODES = 8;

// GSM-7 covers plain English; anything else (Bangla) is sent as UCS-2 with fewer characters.
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€';

/** How many SMS one message costs: 160 GSM-7 or 70 Unicode characters, less when split. */
export function smsSegments(text: string): number {
  if (!text) return 0;
  const chars = [...text];
  const gsm = chars.every((c) => GSM7.includes(c) || GSM7_EXTENDED.includes(c));
  if (gsm) {
    const length = chars.reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0);
    return length <= 160 ? 1 : Math.ceil(length / 153);
  }
  return chars.length <= 70 ? 1 : Math.ceil(chars.length / 67);
}
