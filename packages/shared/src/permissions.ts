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
  /** Salaries: seeing them, proposing changes, and approving changes (the second person). */
  'payroll.view',
  'payroll.manage',
  'payroll.approve',
  /** Workspace logins, their roles and security. */
  'users.manage',
  /** The workspace's plan, invoices and payments to Good People. */
  'billing.manage',
  'audit.read',
  /** Working-time alerts, committees and unions, and the buyer-audit reports. */
  'compliance.manage',
  /** Workers' grievances; harassment cases stay with the complaint committee. */
  'grievances.manage',
  /** Piece rates, operations and daily production. */
  'production.manage',
  /** Donors, projects, salary splits, everyone's timesheets and donor reports. */
  'projects.manage',
  /** Every support ticket the workspace has raised, and letting Good People support in. */
  'support.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  tenant_admin: ALL,
  hr_admin: ALL.filter(
    (p) => p !== 'users.manage' && p !== 'billing.manage' && p !== 'support.manage',
  ),
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
    'compliance.manage',
  ],
  attendance_officer: ['employees.read', 'attendance.manage', 'production.manage'],
  payroll_officer: [
    'employees.read',
    'payroll.view',
    'payroll.manage',
    'production.manage',
    'projects.manage',
  ],
  finance_officer: [
    'employees.read',
    'payroll.view',
    'payroll.approve',
    'audit.read',
    'billing.manage',
    'projects.manage',
  ],
  auditor: ['employees.read', 'audit.read'],
  employee: [],
  // Sees what the workspace admin sees, except identity numbers in clear, and can change
  // nothing: a support session refuses every write (Phase 3 M5).
  support: ALL.filter((p) => p !== 'employees.identity' && p !== 'support.manage'),
};

export function can(role: TenantRole | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

/** Roles that see the HR side of the workspace at all. */
export const isStaffRole = (role: TenantRole | undefined) =>
  !!role && ROLE_PERMISSIONS[role].length > 0;

/** Roles that must use two-step sign-in where the server requires it for admins. */
export const MFA_REQUIRED_ROLES: readonly TenantRole[] = [
  'tenant_admin',
  'hr_admin',
  'payroll_officer',
  'finance_officer',
];
