import type { TenantRole } from './catalog.js';

/**
 * What a workspace login may do. Routes ask for a permission, never for a role, so a new role
 * template is a new line in ROLE_PERMISSIONS rather than a change across the code.
 */
export const PERMISSIONS = [
  /** See everyone's records and team views; without it, people see themselves and their team. */
  'employees.read',
  'employees.write',
  /** NID, birth registration, passport and TIN in clear. */
  'employees.identity',
  'org.manage',
  /** Leave types, holiday calendars, everyone's leave and balances. */
  'leave.manage',
  /** Shifts, rosters, devices, punches, attendance settings and reports. */
  'attendance.manage',
  /** The documents vault, letters, ID cards and service books. */
  'documents.manage',
  /** Probation and separations. */
  'lifecycle.manage',
  'imports.run',
  /** Decide the HR step of approvals. */
  'approvals.hr',
  /** Notification channels, templates and the delivery log. */
  'notifications.manage',
  /** Workspace logins, their roles and security. */
  'users.manage',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  tenant_admin: ALL,
  hr_admin: ALL.filter((p) => p !== 'users.manage'),
  hr_officer: [
    'employees.read',
    'employees.write',
    'employees.identity',
    'leave.manage',
    'attendance.manage',
    'documents.manage',
    'lifecycle.manage',
    'imports.run',
    'approvals.hr',
  ],
  attendance_officer: ['employees.read', 'attendance.manage'],
  auditor: ['employees.read', 'audit.read'],
  employee: [],
};

export function can(role: TenantRole | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

/** Roles that see the HR side of the workspace at all. */
export const isStaffRole = (role: TenantRole | undefined) =>
  !!role && ROLE_PERMISSIONS[role].length > 0;

/** Roles that must use two-step sign-in where the server requires it for admins. */
export const MFA_REQUIRED_ROLES: readonly TenantRole[] = ['tenant_admin', 'hr_admin'];
