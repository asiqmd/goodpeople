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
  /** A sign-in code: SMS only, always sent. */
  'auth.otp',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** Events HR may switch channels for and edit; the sign-in code is fixed. */
export const CONFIGURABLE_EVENTS = NOTIFICATION_EVENTS.filter((e) => e !== 'auth.otp') as Exclude<
  NotificationEvent,
  'auth.otp'
>[];

/** Where each event goes unless HR changes it. SMS costs money, so it is off by default. */
export const DEFAULT_EVENT_CHANNELS: Record<NotificationEvent, readonly DeliveryChannel[]> = {
  'approval.requested': ['email', 'push'],
  'approval.decided': ['email', 'push'],
  'document.expiring': ['email'],
  'probation.ending': ['email'],
  'letter.issued': ['email', 'push'],
  'attendance.missing_punch': ['push'],
  'payslip.published': ['email', 'push'],
  'auth.otp': ['sms'],
};

export const DEVICE_PLATFORMS = ['android', 'ios', 'web'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const USER_LANGUAGES = ['en', 'bn'] as const;
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
