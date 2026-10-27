import { z } from 'zod';
import { ASSIGNABLE_TENANT_ROLES } from './catalog.js';
import { bdMobileSchema } from './hr-schemas.js';
import { slugSchema } from './schemas.js';
import {
  CONFIGURABLE_EVENTS,
  DELIVERY_CHANNELS,
  DELIVERY_STATUSES,
  DEVICE_PLATFORMS,
  OTP_LENGTH,
  USER_LANGUAGES,
} from './notifications.js';

const code = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), 'Enter the 6-digit code');
const newPassword = z.string().min(10, 'Use at least 10 characters').max(200);

// ── Sign-in ──────────────────────────────────────────────────────────────────

/** Sign in with a mobile number: a code is sent by SMS if the number has a login. */
export const otpRequestSchema = z.object({ tenant: slugSchema, phone: bdMobileSchema });
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = otpRequestSchema.extend({ code });
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/** The second step after a password: an authenticator code, or a one-time recovery code. */
export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z
    .string()
    .trim()
    .regex(/^(\d{6}|[a-z0-9]{4}-[a-z0-9]{4})$/i, 'Enter the 6-digit code or a recovery code'),
});
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaConfirmSchema = z.object({ code });
export type MfaConfirmInput = z.infer<typeof mfaConfirmSchema>;

/** Setting up two-step sign-in during sign-in, when the role requires it. */
export const mfaEnrollStartSchema = z.object({ mfaToken: z.string().min(1) });
export const mfaEnrollSchema = mfaEnrollStartSchema.extend({ code });
export type MfaEnrollInput = z.infer<typeof mfaEnrollSchema>;
export const mfaDisableSchema = z.object({ password: z.string().min(1) });
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword,
    /** This session's refresh token: it stays signed in while every other session ends. */
    keepRefreshToken: z.string().optional(),
  })
  .refine((p) => p.newPassword !== p.currentPassword, {
    message: 'Choose a password you have not been using',
    path: ['newPassword'],
  });
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

export const preferencesSchema = z.object({ language: z.enum(USER_LANGUAGES) }).partial();
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const deviceSchema = z.object({
  platform: z.enum(DEVICE_PLATFORMS),
  token: z.string().trim().min(10).max(4096),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

// ── Workspace users (admins) ─────────────────────────────────────────────────

const contact = {
  email: z.email().nullable().optional(),
  /** Lets the person sign in with a code sent to this mobile number. */
  phone: bdMobileSchema.nullable().optional(),
};

export const userCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    role: z.enum(ASSIGNABLE_TENANT_ROLES),
    /** The employee this login belongs to, if any. */
    employeeId: z.uuid().optional(),
    password: newPassword.optional(),
    ...contact,
  })
  .refine((u) => u.email || u.phone, {
    message: 'Give an email address, a mobile number or both',
    path: ['email'],
  })
  .refine((u) => u.email || u.role === 'employee', {
    message: 'Staff roles sign in with an email address and password',
    path: ['email'],
  });
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    role: z.enum(ASSIGNABLE_TENANT_ROLES),
    disabled: z.boolean(),
    ...contact,
  })
  .partial();
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// ── Notifications ────────────────────────────────────────────────────────────

export const notificationSettingsSchema = z
  .object({
    emailEnabled: z.boolean(),
    smsEnabled: z.boolean(),
    pushEnabled: z.boolean(),
    channels: z.partialRecord(
      z.enum(CONFIGURABLE_EVENTS),
      z.array(z.enum(DELIVERY_CHANNELS)).max(3),
    ),
  })
  .partial();
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

export const notificationTemplateSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    body: z.string().trim().min(2).max(2000),
    /** Kept short: one SMS is 160 Latin or 70 Bangla characters. */
    sms: z.string().trim().min(2).max(320),
  })
  .partial();
export type NotificationTemplateInput = z.infer<typeof notificationTemplateSchema>;

export const notificationListQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
});

export const deliveryListQuerySchema = z.object({
  status: z.enum(DELIVERY_STATUSES).optional(),
});
