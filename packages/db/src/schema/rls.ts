/**
 * Every table protected by the tenant_isolation policy (migrations 0001, 0003, 0005).
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
] as const;
