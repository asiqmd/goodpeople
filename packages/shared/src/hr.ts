// Core HR vocabularies.

export const GENDERS = ['male', 'female', 'third_gender'] as const;
export type Gender = (typeof GENDERS)[number];

/** Drives which festival bonus an employee receives (Phase 2). */
export const RELIGIONS = ['islam', 'hinduism', 'buddhism', 'christianity', 'other'] as const;
export type Religion = (typeof RELIGIONS)[number];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const MARITAL_STATUSES = ['single', 'married', 'widowed', 'divorced', 'separated'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

/** The worker classes of Labour Act s.4, plus contractual for management staff. */
export const EMPLOYMENT_TYPES = [
  'permanent',
  'probationer',
  'apprentice',
  'badli',
  'casual',
  'temporary',
  'seasonal',
  'contractual',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** "Worker" in the Labour Act sense, versus officers and management staff. */
export const WORKER_CATEGORIES = ['worker', 'staff'] as const;
export type WorkerCategory = (typeof WORKER_CATEGORIES)[number];

export const LOCATION_KINDS = [
  'head_office',
  'factory',
  'branch',
  'field_office',
  'warehouse',
  'other',
] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const ORG_UNIT_KINDS = ['department', 'section', 'line', 'team'] as const;
export type OrgUnitKind = (typeof ORG_UNIT_KINDS)[number];

export const JOB_EVENTS = [
  'hire',
  'confirmation',
  'transfer',
  'promotion',
  'increment',
  'redesignation',
  'change',
  'separation',
] as const;
export type JobEvent = (typeof JOB_EVENTS)[number];

/** Events HR records through the job-change endpoint. Hire and separation have their own flows. */
export const JOB_CHANGE_EVENTS = [
  'confirmation',
  'transfer',
  'promotion',
  'increment',
  'redesignation',
  'change',
] as const;
export type JobChangeEvent = (typeof JOB_CHANGE_EVENTS)[number];

export const EMPLOYEE_STATUSES = ['active', 'separated'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const PAYMENT_METHODS = ['bank', 'mfs', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MFS_PROVIDERS = ['bkash', 'nagad', 'rocket', 'upay'] as const;
export type MfsProvider = (typeof MFS_PROVIDERS)[number];

/** Tenant roles that manage org structure and employee records. */
export const HR_ROLES = ['tenant_admin', 'hr_admin'] as const;
