import { z } from 'zod';
import type { AttendanceStatus, DayType } from './attendance.js';
import type { ShiftRef } from './attendance-types.js';
import type { Ref } from './hr-types.js';
import type { LeaveBalanceView } from './leave-types.js';
import type { Money, RunKind } from './payroll.js';

// Kiosks (Phase 3 M3): a shared tablet at a factory where workers without smartphones sign
// in with their ID card's code and a PIN, set by an SMS code to their mobile number.

/** The SMS code that lets a worker set (or reset) their PIN. */
export const KIOSK_CODE_LENGTH = 6;
export const KIOSK_CODE_TTL_MINUTES = 10;
export const KIOSK_CODE_MAX_ATTEMPTS = 5;
/** Wrong PINs in a row before the worker is locked out of that kiosk for a while. */
export const KIOSK_PIN_MAX_FAILURES = 5;
export const KIOSK_LOCK_MINUTES = 15;
/** How long a signed-in worker's session lasts; the screen also signs out when left idle. */
export const KIOSK_SESSION_SECONDS = 180;
export const KIOSK_IDLE_SECONDS = 60;
/** The kiosk sends its device token as the bearer token and the worker's session in this header. */
export const KIOSK_SESSION_HEADER = 'x-kiosk-session';

/** All one digit (1111) or a run up or down (1234, 987654): the first PINs anyone tries. */
export function isWeakPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const steps = new Set(digits.slice(1).map((d, i) => d - digits[i]!));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0]!);
}

const employeeCode = z.string().trim().min(1).max(32);
const pinFormat = z.string().regex(/^\d{4,6}$/, 'Use 4 to 6 digits');

/** A new PIN: 4 to 6 digits, and not one that is guessed first. */
export const kioskPinSchema = pinFormat.refine((pin) => !isWeakPin(pin), {
  message: 'Choose a PIN that is harder to guess',
});

export const kioskInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  locationId: z.uuid(),
});
export type KioskInput = z.infer<typeof kioskInputSchema>;

export const kioskPinRequestSchema = z.object({ employeeCode });
export type KioskPinRequestInput = z.infer<typeof kioskPinRequestSchema>;

export const kioskPinSetSchema = z.object({
  employeeCode,
  code: z.string().regex(new RegExp(`^\\d{${KIOSK_CODE_LENGTH}}$`), 'Enter the 6-digit code'),
  pin: kioskPinSchema,
});
export type KioskPinSetInput = z.infer<typeof kioskPinSetSchema>;

export const kioskSignInSchema = z.object({ employeeCode, pin: pinFormat });
export type KioskSignInInput = z.infer<typeof kioskSignInSchema>;

export const kioskPayslipQuerySchema = z.object({
  language: z.enum(['en', 'bn']).default('bn'),
});

// ── Views ────────────────────────────────────────────────────────────────────

export interface KioskView {
  id: string;
  name: string;
  location: Ref | null;
  /** The secret's first characters, to tell kiosks apart; the token is never shown again. */
  tokenPrefix: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface KioskCreated extends KioskView {
  token: string;
}

/** What a kiosk learns about itself from its token. */
export interface KioskDeviceView {
  kiosk: { id: string; name: string; location: Ref | null };
  workspace: { name: string; slug: string };
  /** The workspace can be read but not changed: no PINs set, no leave applied for. */
  readOnly: boolean;
}

/** The same answer whether or not the code belongs to anyone. */
export interface KioskPinRequestResult {
  sent: true;
  expiresInSeconds: number;
  /** The last two digits of the number the code went to. */
  phoneEnding: string;
}

export interface KioskSession {
  sessionToken: string;
  expiresInSeconds: number;
  employee: { code: string; name: string; nameBn: string | null };
}

export interface KioskPayslip {
  itemId: string;
  kind: RunKind;
  festival: string | null;
  festivalBn: string | null;
  periodStart: string;
  periodEnd: string;
  net: Money;
}

/** A signed-in worker's screen. A part is null when the workspace's plan does not include it. */
export interface KioskMeView {
  employee: {
    code: string;
    name: string;
    nameBn: string | null;
    designation: string | null;
    designationBn: string | null;
    /** The line (or unit) the worker is in today. */
    line: string | null;
    lineBn: string | null;
  };
  workspace: { name: string; slug: string };
  timeZone: string;
  today: {
    date: string;
    status: AttendanceStatus;
    dayType: DayType;
    holidayName: string | null;
    shift: ShiftRef | null;
    leaveCode: string | null;
    /** Today's punches, oldest first. */
    punches: string[];
  } | null;
  month: {
    from: string;
    to: string;
    present: number;
    halfDay: number;
    absent: number;
    onLeave: number;
    missingPunch: number;
    overtimeMinutes: number;
  } | null;
  /** Yearly leave the worker can apply for here. */
  leave: LeaveBalanceView[] | null;
  /** The last published payslips, newest first. */
  payslips: KioskPayslip[] | null;
}
