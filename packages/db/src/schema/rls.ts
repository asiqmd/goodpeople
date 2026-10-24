/**
 * Every table protected by the tenant_isolation policy (migrations 0001, 0003, 0005, 0007).
 * The isolation test fails if a table with tenant data is missing here or in the database.
 */
export const RLS_TABLES = [
  'tenant_users',
  'legal_entities',
  'locations',
  'org_units',
  'designations',
  'grades',
  'cost_centres',
  'employees',
  'job_assignments',
  'employee_nominees',
  'employee_payment_accounts',
  'tenant_audit_log',
  'holiday_calendars',
  'holidays',
  'leave_types',
  'leave_requests',
  'approval_steps',
  'leave_ledger',
  'shifts',
  'shift_assignments',
  'roster_entries',
  'edge_agents',
  'attendance_devices',
  'regularization_requests',
  'attendance_punches',
  'attendance_days',
  'attendance_settings',
] as const;
