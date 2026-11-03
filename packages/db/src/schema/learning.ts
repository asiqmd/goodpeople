import type { LearningCategory } from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { employees, designations, locations } from './hr.js';
import { tenants } from './platform.js';
import { legalEntities } from './tenant.js';
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const instant = (name: string) => timestamp(name, { withTimezone: true });
const day = (name: string) => date(name, { mode: 'string' });
const fk = (
  name: string,
  t: { tenantId: AnyPgColumn },
  column: AnyPgColumn,
  target: { tenantId: AnyPgColumn; id: AnyPgColumn },
) =>
  foreignKey({ name, columns: [t.tenantId, column], foreignColumns: [target.tenantId, target.id] });
export const learningCourses = pgTable(
  'learning_courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn').notNull(),
    description: text('description').notNull().default(''),
    descriptionBn: text('description_bn').notNull().default(''),
    category: text('category').$type<LearningCategory>().notNull(),
    validityMonths: integer('validity_months'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('learning_courses_tenant_id_uq').on(t.tenantId, t.id),
    unique('learning_courses_code_uq').on(t.tenantId, t.code),
    check(
      'learning_courses_validity_ck',
      sql`${t.validityMonths} is null or ${t.validityMonths} between 1 and 120`,
    ),
  ],
);
export const learningRequirements = pgTable(
  'learning_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    courseId: uuid('course_id').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    designationId: uuid('designation_id').notNull(),
    effectiveFrom: day('effective_from').notNull(),
    effectiveTo: day('effective_to'),
    graceDays: integer('grace_days').notNull().default(0),
  },
  (t) => [
    unique('learning_requirements_tenant_id_uq').on(t.tenantId, t.id),
    fk('learning_requirements_course_fk', t, t.courseId, learningCourses),
    fk('learning_requirements_company_fk', t, t.legalEntityId, legalEntities),
    fk('learning_requirements_designation_fk', t, t.designationId, designations),
    check(
      'learning_requirements_dates_ck',
      sql`${t.effectiveTo} is null or ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
    check('learning_requirements_grace_ck', sql`${t.graceDays} between 0 and 365`),
  ],
);
export const learningSessions = pgTable(
  'learning_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    courseId: uuid('course_id').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    locationId: uuid('location_id'),
    startsAt: instant('starts_at').notNull(),
    endsAt: instant('ends_at').notNull(),
    trainer: text('trainer').notNull(),
    venue: text('venue').notNull(),
    capacity: integer('capacity').notNull(),
    status: text('status')
      .$type<'planned' | 'completed' | 'cancelled'>()
      .notNull()
      .default('planned'),
    note: text('note'),
    createdBy: uuid('created_by').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('learning_sessions_tenant_id_uq').on(t.tenantId, t.id),
    fk('learning_sessions_course_fk', t, t.courseId, learningCourses),
    fk('learning_sessions_company_fk', t, t.legalEntityId, legalEntities),
    fk('learning_sessions_location_fk', t, t.locationId, locations),
    check('learning_sessions_dates_ck', sql`${t.endsAt} > ${t.startsAt}`),
    check('learning_sessions_capacity_ck', sql`${t.capacity} between 1 and 5000`),
    check('learning_sessions_status_ck', sql`${t.status} in ('planned','completed','cancelled')`),
  ],
);
export const learningEnrolments = pgTable(
  'learning_enrolments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    status: text('status')
      .$type<'enrolled' | 'cancelled' | 'attended' | 'absent'>()
      .notNull()
      .default('enrolled'),
    enrolledBy: uuid('enrolled_by').notNull(),
  },
  (t) => [
    unique('learning_enrolments_tenant_id_uq').on(t.tenantId, t.id),
    unique('learning_enrolments_person_uq').on(t.sessionId, t.employeeId),
    fk('learning_enrolments_session_fk', t, t.sessionId, learningSessions),
    fk('learning_enrolments_employee_fk', t, t.employeeId, employees),
    check(
      'learning_enrolments_status_ck',
      sql`${t.status} in ('enrolled','cancelled','attended','absent')`,
    ),
  ],
);
export const learningCertificates = pgTable(
  'learning_certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    enrolmentId: uuid('enrolment_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    courseId: uuid('course_id').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    courseName: text('course_name').notNull(),
    courseNameBn: text('course_name_bn').notNull(),
    trainer: text('trainer').notNull(),
    completedOn: day('completed_on').notNull(),
    expiresOn: day('expires_on'),
    revokedAt: instant('revoked_at'),
    revokeReason: text('revoke_reason'),
    recordedBy: uuid('recorded_by').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('learning_certificates_tenant_id_uq').on(t.tenantId, t.id),
    unique('learning_certificates_enrolment_uq').on(t.enrolmentId),
    fk('learning_certificates_enrolment_fk', t, t.enrolmentId, learningEnrolments),
    fk('learning_certificates_employee_fk', t, t.employeeId, employees),
    fk('learning_certificates_course_fk', t, t.courseId, learningCourses),
    fk('learning_certificates_company_fk', t, t.legalEntityId, legalEntities),
    check(
      'learning_certificates_expiry_ck',
      sql`${t.expiresOn} is null or ${t.expiresOn} >= ${t.completedOn}`,
    ),
  ],
);
export const fireDrills = pgTable(
  'fire_drills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    locationId: uuid('location_id').notNull(),
    heldOn: day('held_on').notNull(),
    nextDueOn: day('next_due_on').notNull(),
    participants: integer('participants').notNull(),
    evacuationSeconds: integer('evacuation_seconds').notNull(),
    conductor: text('conductor').notNull(),
    findings: text('findings').notNull(),
    actions: text('actions').notNull(),
    voidedAt: instant('voided_at'),
    voidReason: text('void_reason'),
    recordedBy: uuid('recorded_by').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('fire_drills_tenant_id_uq').on(t.tenantId, t.id),
    fk('fire_drills_company_fk', t, t.legalEntityId, legalEntities),
    fk('fire_drills_location_fk', t, t.locationId, locations),
    check('fire_drills_dates_ck', sql`${t.nextDueOn} > ${t.heldOn}`),
    check('fire_drills_people_ck', sql`${t.participants} > 0`),
    check('fire_drills_seconds_ck', sql`${t.evacuationSeconds} > 0`),
  ],
);
