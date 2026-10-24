import {
  BLOOD_GROUPS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  JOB_EVENTS,
  LOCATION_KINDS,
  MARITAL_STATUSES,
  ORG_UNIT_KINDS,
  PAYMENT_METHODS,
  RELIGIONS,
  WORKER_CATEGORIES,
  type Address,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.js';
import { legalEntities, tenantUsers } from './tenant.js';

export const locationKind = pgEnum('location_kind', LOCATION_KINDS);
export const orgUnitKind = pgEnum('org_unit_kind', ORG_UNIT_KINDS);
export const workerCategory = pgEnum('worker_category', WORKER_CATEGORIES);
export const employmentType = pgEnum('employment_type', EMPLOYMENT_TYPES);
export const jobEvent = pgEnum('job_event', JOB_EVENTS);
export const gender = pgEnum('gender', GENDERS);
export const religion = pgEnum('religion', RELIGIONS);
export const maritalStatus = pgEnum('marital_status', MARITAL_STATUSES);
export const bloodGroup = pgEnum('blood_group', BLOOD_GROUPS);
export const employeeStatus = pgEnum('employee_status', EMPLOYEE_STATUSES);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: 'string' });

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: locationKind('kind').notNull(),
    address: jsonb('address').$type<Address>(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    geofenceRadiusM: integer('geofence_radius_m'),
    timeZone: text('time_zone').notNull().default('Asia/Dhaka'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('locations_tenant_id_uq').on(t.tenantId, t.id),
    unique('locations_tenant_code_uq').on(t.tenantId, t.code),
    foreignKey({
      name: 'locations_legal_entity_fk',
      columns: [t.tenantId, t.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
  ],
);

/** Department → section → line → team, within one legal entity. */
export const orgUnits = pgTable(
  'org_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    parentId: uuid('parent_id'),
    kind: orgUnitKind('kind').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('org_units_tenant_id_uq').on(t.tenantId, t.id),
    unique('org_units_tenant_code_uq').on(t.tenantId, t.code),
    foreignKey({
      name: 'org_units_legal_entity_fk',
      columns: [t.tenantId, t.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
    foreignKey({
      name: 'org_units_parent_fk',
      columns: [t.tenantId, t.parentId],
      foreignColumns: [t.tenantId, t.id],
    }),
  ],
);

export const designations = pgTable(
  'designations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    workerCategory: workerCategory('worker_category').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('designations_tenant_id_uq').on(t.tenantId, t.id),
    unique('designations_tenant_code_uq').on(t.tenantId, t.code),
  ],
);

export const grades = pgTable(
  'grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    rank: integer('rank').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('grades_tenant_id_uq').on(t.tenantId, t.id),
    unique('grades_tenant_code_uq').on(t.tenantId, t.code),
  ],
);

export const costCentres = pgTable(
  'cost_centres',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('cost_centres_tenant_id_uq').on(t.tenantId, t.id),
    unique('cost_centres_tenant_code_uq').on(t.tenantId, t.code),
  ],
);

/**
 * The person. Identity numbers are encrypted (see FieldCipher); `nid_hash` is a keyed blind
 * index that keeps NIDs unique per tenant. Job details live in job_assignments.
 */
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeCode: text('employee_code').notNull(),
    userId: uuid('user_id'),
    status: employeeStatus('status').notNull().default('active'),
    fullName: text('full_name').notNull(),
    fullNameBn: text('full_name_bn'),
    fatherName: text('father_name').notNull(),
    motherName: text('mother_name').notNull(),
    spouseName: text('spouse_name'),
    dateOfBirth: isoDate('date_of_birth').notNull(),
    gender: gender('gender').notNull(),
    religion: religion('religion'),
    maritalStatus: maritalStatus('marital_status'),
    bloodGroup: bloodGroup('blood_group'),
    nationality: text('nationality').notNull().default('BD'),
    mobilePhone: text('mobile_phone').notNull(),
    workEmail: text('work_email'),
    personalEmail: text('personal_email'),
    presentAddress: jsonb('present_address').$type<Address>().notNull(),
    permanentAddress: jsonb('permanent_address').$type<Address>().notNull(),
    emergencyContact: jsonb('emergency_contact').$type<{
      name: string;
      relation: string;
      phone: string;
    }>(),
    nidEnc: text('nid_enc'),
    nidHash: text('nid_hash'),
    birthRegistrationEnc: text('birth_registration_enc'),
    passportEnc: text('passport_enc'),
    tinEnc: text('tin_enc'),
    /** Start of continuous service; unchanged by inter-company transfers. */
    joinedOn: isoDate('joined_on').notNull(),
    probationEndsOn: isoDate('probation_ends_on'),
    confirmedOn: isoDate('confirmed_on'),
    separatedOn: isoDate('separated_on'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('employees_tenant_id_uq').on(t.tenantId, t.id),
    unique('employees_tenant_code_uq').on(t.tenantId, t.employeeCode),
    uniqueIndex('employees_tenant_nid_uq')
      .on(t.tenantId, t.nidHash)
      .where(sql`${t.nidHash} is not null`),
    unique('employees_user_uq').on(t.userId),
    index('employees_tenant_name_idx').on(t.tenantId, t.fullName),
    foreignKey({
      name: 'employees_user_fk',
      columns: [t.tenantId, t.userId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
  ],
);

/**
 * Effective-dated job history. The row with no `effective_to` is the latest; the one in
 * force on a date D has effective_from <= D and (effective_to is null or effective_to >= D).
 */
export const jobAssignments = pgTable(
  'job_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    event: jobEvent('event').notNull(),
    effectiveFrom: isoDate('effective_from').notNull(),
    effectiveTo: isoDate('effective_to'),
    legalEntityId: uuid('legal_entity_id').notNull(),
    locationId: uuid('location_id'),
    orgUnitId: uuid('org_unit_id'),
    designationId: uuid('designation_id'),
    gradeId: uuid('grade_id'),
    costCentreId: uuid('cost_centre_id'),
    managerId: uuid('manager_id'),
    employmentType: employmentType('employment_type').notNull(),
    workerCategory: workerCategory('worker_category').notNull(),
    reason: text('reason'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    index('job_assignments_employee_idx').on(t.tenantId, t.employeeId, t.effectiveFrom),
    uniqueIndex('job_assignments_open_uq')
      .on(t.employeeId)
      .where(sql`${t.effectiveTo} is null`),
    foreignKey({
      name: 'job_assignments_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'job_assignments_legal_entity_fk',
      columns: [t.tenantId, t.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
    foreignKey({
      name: 'job_assignments_location_fk',
      columns: [t.tenantId, t.locationId],
      foreignColumns: [locations.tenantId, locations.id],
    }),
    foreignKey({
      name: 'job_assignments_org_unit_fk',
      columns: [t.tenantId, t.orgUnitId],
      foreignColumns: [orgUnits.tenantId, orgUnits.id],
    }),
    foreignKey({
      name: 'job_assignments_designation_fk',
      columns: [t.tenantId, t.designationId],
      foreignColumns: [designations.tenantId, designations.id],
    }),
    foreignKey({
      name: 'job_assignments_grade_fk',
      columns: [t.tenantId, t.gradeId],
      foreignColumns: [grades.tenantId, grades.id],
    }),
    foreignKey({
      name: 'job_assignments_cost_centre_fk',
      columns: [t.tenantId, t.costCentreId],
      foreignColumns: [costCentres.tenantId, costCentres.id],
    }),
    foreignKey({
      name: 'job_assignments_manager_fk',
      columns: [t.tenantId, t.managerId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
  ],
);

export const employeeNominees = pgTable(
  'employee_nominees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    name: text('name').notNull(),
    relation: text('relation').notNull(),
    sharePercent: integer('share_percent').notNull(),
    dateOfBirth: isoDate('date_of_birth'),
    phone: text('phone'),
    createdAt: createdAt(),
  },
  (t) => [
    index('employee_nominees_employee_idx').on(t.tenantId, t.employeeId),
    foreignKey({
      name: 'employee_nominees_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
  ],
);

export const employeePaymentAccounts = pgTable(
  'employee_payment_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    method: paymentMethod('method').notNull(),
    provider: text('provider'),
    branchName: text('branch_name'),
    routingNumber: text('routing_number'),
    accountName: text('account_name'),
    accountNumberEnc: text('account_number_enc'),
    accountNumberLast4: text('account_number_last4'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('employee_payment_accounts_employee_idx').on(t.tenantId, t.employeeId),
    uniqueIndex('employee_payment_accounts_primary_uq')
      .on(t.employeeId)
      .where(sql`${t.isPrimary}`),
    foreignKey({
      name: 'employee_payment_accounts_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
  ],
);

/** Who changed what inside a workspace. Append-only; never holds decrypted identity numbers. */
export const tenantAuditLog = pgTable(
  'tenant_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: createdAt(),
  },
  (t) => [index('tenant_audit_log_entity_idx').on(t.tenantId, t.entityType, t.entityId)],
);

/** Tables protected by the tenant_isolation policy. Tests assert this list matches the database. */
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
] as const;
