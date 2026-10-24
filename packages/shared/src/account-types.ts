import type { PlatformRole, TenantRole } from './catalog.js';
import type { EmployeeRef } from './attendance-types.js';
import type {
  DeliveryChannel,
  DeliveryStatus,
  NotificationEvent,
  UserLanguage,
} from './notifications.js';
import type { Permission } from './permissions.js';

/** After a correct password, when the login has two-step sign-in. */
export interface MfaChallenge {
  mfaRequired: true;
  /** Short-lived proof of the password, exchanged with the code for a session. */
  mfaToken: string;
}

/** An admin whose role must use two-step sign-in, signing in before having set it up. */
export interface MfaSetupRequired {
  mfaSetupRequired: true;
  mfaToken: string;
}

export interface OtpRequestResult {
  /** Always true, whether or not the number has a login, so numbers cannot be probed. */
  sent: true;
  expiresInSeconds: number;
}

export interface MfaSetup {
  secret: string;
  /** For an authenticator app's QR code. */
  otpauthUrl: string;
}

export interface MfaEnabled {
  /** Shown once: each signs in once if the phone is lost. */
  recoveryCodes: string[];
}

/** The signed-in login (workspace or platform), with what it may do. */
export interface AccountView {
  kind: 'tenant' | 'platform';
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: TenantRole | PlatformRole;
  language: UserLanguage;
  /** Signs in with a password (a login with only a mobile number uses SMS codes). */
  hasPassword: boolean;
  mfaEnabled: boolean;
  /** The server requires two-step sign-in for this role, so it cannot be turned off. */
  mfaRequired: boolean;
  /** Recovery codes not yet used. */
  recoveryCodesLeft: number;
  permissions: Permission[];
}

export interface WorkspaceUserView {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: TenantRole;
  employee: EmployeeRef | null;
  mfaEnabled: boolean;
  disabled: boolean;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface WorkspaceUserCreated extends WorkspaceUserView {
  /** When no password was given: share it once; the person changes it after signing in. */
  temporaryPassword?: string;
}

export interface NotificationView {
  id: string;
  event: NotificationEvent;
  title: string;
  body: string;
  /** A path in the web app, e.g. /workspace/approvals. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationInbox {
  unread: number;
  items: NotificationView[];
}

export interface NotificationSettingsView {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  channels: Record<NotificationEvent, DeliveryChannel[]>;
  /** SMS sent this calendar month, against the plan's monthly credits (null: unlimited). */
  smsUsedThisMonth: number;
  smsLimit: number | null;
  /** How each channel is connected on this server, e.g. "smtp" or "log". */
  drivers: Record<DeliveryChannel, string>;
}

export interface NotificationTemplateView {
  event: NotificationEvent;
  language: UserLanguage;
  title: string;
  body: string;
  sms: string;
  customized: boolean;
  /** What the text may use, e.g. {{person.name}}. */
  placeholders: string[];
}

export interface DeliveryView {
  id: string;
  event: NotificationEvent | null;
  channel: DeliveryChannel;
  /** Masked: the end of an address or number only. */
  recipient: string;
  subject: string | null;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

/** What a workspace still needs before people rely on it, worked out from its data. */
export const SETUP_STEPS = [
  'company',
  'locations',
  'org',
  'employees',
  'logins',
  'hr_team',
  'admin_mfa',
  'shifts',
  'devices',
  'attendance_pins',
  'holidays',
  'leave_types',
  'email',
  'sms',
] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number];

export interface SetupStep {
  key: SetupStepKey;
  /** warning: usable, but worth finishing; not_needed: does not apply to this workspace. */
  status: 'done' | 'todo' | 'warning' | 'not_needed';
  /** Progress, where it is a count (e.g. 140 of 152 employees have a login). */
  done?: number;
  total?: number;
  /** Where to fix it in the web app. */
  link: string;
}

export interface SetupChecklist {
  steps: SetupStep[];
  done: number;
  total: number;
}
