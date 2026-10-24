import {
  APPROVAL_STATUSES,
  APPROVAL_STEP_KINDS,
  HALF_DAYS,
  LEAVE_ACCRUALS,
  LEAVE_REQUEST_STATUSES,
  LEDGER_KINDS,
  STATUTORY_LEAVES,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { employees, gender } from './hr.js';
import { tenants } from './platform.js';

export const statutoryLeave = pgEnum('statutory_leave', STATUTORY_LEAVES);
export const leaveAccrual = pgEnum('leave_accrual', LEAVE_ACCRUALS);
export const approvalStepKind = pgEnum('approval_step_kind', APPROVAL_STEP_KINDS);
export const approvalStatus = pgEnum('approval_status', APPROVAL_STATUSES);
export const leaveRequestStatus = pgEnum('leave_request_status', LEAVE_REQUEST_STATUSES);
export const halfDay = pgEnum('half_day', HALF_DAYS);
export const ledgerKind = pgEnum('leave_ledger_kind', LEDGER_KINDS);

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: 'string' });
const dayCount = (name: string) => numeric(name, { precision: 6, scale: 1, mode: 'number' });

/**
 * A workspace's leave policy for one kind of leave. Statutory kinds are provisioned from the
 * country pack; the statute stays a floor (see @gp/country-packs).
 */
export const leaveTypes = pgTable(
  'leave_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    statutoryKey: statutoryLeave('statutory_key'),
    paid: boolean('paid').notNull().default(true),
    accrual: leaveAccrual('accrual').notNull(),
    daysPerYear: dayCount('days_per_year'),
    workedDaysPerLeaveDay: integer('worked_days_per_leave_day'),
    maxDaysPerRequest: integer('max_days_per_request'),
    carryForwardMax: dayCount('carry_forward_max').notNull().default(0),
    minServiceDays: integer('min_service_days').notNull().default(0),
    gender: gender('gender'),
    countsOffDays: boolean('counts_off_days').notNull().default(false),
    allowHalfDay: boolean('allow_half_day').notNull().default(true),
    approvalChain: approvalStepKind('approval_chain')
      .array()
      .notNull()
      .default(sql`'{manager}'`),
    requiresDocumentAfterDays: integer('requires_document_after_days'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('leave_types_tenant_id_uq').on(t.tenantId, t.id),
    unique('leave_types_tenant_code_uq').on(t.tenantId, t.code),
    uniqueIndex('leave_types_tenant_statutory_uq')
      .on(t.tenantId, t.statutoryKey)
      .where(sql`${t.statutoryKey} is not null`),
  ],
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    leaveTypeId: uuid('leave_type_id').notNull(),
    startDate: isoDate('start_date').notNull(),
    endDate: isoDate('end_date').notNull(),
    halfDay: halfDay('half_day'),
    days: dayCount('days').notNull(),
    reason: text('reason').notNull(),
    status: leaveRequestStatus('status').notNull().default('pending'),
    needsDocument: boolean('needs_document').notNull().default(false),
    /** The workspace login that submitted it: the employee, or HR on their behalf. */
    appliedBy: uuid('applied_by').notNull(),
    createdAt: createdAt(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    unique('leave_requests_tenant_id_uq').on(t.tenantId, t.id),
    index('leave_requests_employee_idx').on(t.tenantId, t.employeeId, t.startDate),
    index('leave_requests_dates_idx').on(t.tenantId, t.startDate, t.endDate),
    foreignKey({
      name: 'leave_requests_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'leave_requests_leave_type_fk',
      columns: [t.tenantId, t.leaveTypeId],
      foreignColumns: [leaveTypes.tenantId, leaveTypes.id],
    }),
  ],
);

/**
 * Steps of an approval. Generic over the thing approved (subject); leave is the first
 * subject, attendance regularization and lifecycle events follow.
 */
export const approvalSteps = pgTable(
  'approval_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    stepNo: integer('step_no').notNull(),
    kind: approvalStepKind('kind').notNull(),
    /** For manager steps: the employee who decides. HR steps go to any HR admin. */
    approverEmployeeId: uuid('approver_employee_id'),
    status: approvalStatus('status').notNull(),
    decidedByUserId: uuid('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('approval_steps_subject_step_uq').on(t.subjectId, t.stepNo),
    index('approval_steps_inbox_idx').on(t.tenantId, t.status, t.approverEmployeeId),
    foreignKey({
      name: 'approval_steps_approver_fk',
      columns: [t.tenantId, t.approverEmployeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
  ],
);

/** Balance movements. Entitlement and carry-forward are computed from policy, not stored. */
export const leaveLedger = pgTable(
  'leave_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    leaveTypeId: uuid('leave_type_id').notNull(),
    leaveYear: integer('leave_year').notNull(),
    kind: ledgerKind('kind').notNull(),
    /** Positive adds to the balance, negative takes from it. */
    days: dayCount('days').notNull(),
    requestId: uuid('request_id'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    index('leave_ledger_balance_idx').on(t.tenantId, t.employeeId, t.leaveTypeId, t.leaveYear),
    foreignKey({
      name: 'leave_ledger_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'leave_ledger_leave_type_fk',
      columns: [t.tenantId, t.leaveTypeId],
      foreignColumns: [leaveTypes.tenantId, leaveTypes.id],
    }),
    foreignKey({
      name: 'leave_ledger_request_fk',
      columns: [t.tenantId, t.requestId],
      foreignColumns: [leaveRequests.tenantId, leaveRequests.id],
    }),
  ],
);
