import {
  ATTENDANCE_FLAGS,
  ATTENDANCE_STATUSES,
  DAY_TYPES,
  DEVICE_VENDORS,
  PUNCH_DIRECTIONS,
  PUNCH_SOURCES,
  REGULARIZATION_KINDS,
  REGULARIZATION_STATUSES,
  SELF_PUNCH_MODES,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { employees, locations } from './hr.js';
import { approvalStepKind, leaveRequests } from './leave.js';
import { tenants } from './platform.js';

export const punchSource = pgEnum('punch_source', PUNCH_SOURCES);
export const punchDirection = pgEnum('punch_direction', PUNCH_DIRECTIONS);
export const deviceVendor = pgEnum('device_vendor', DEVICE_VENDORS);
export const dayType = pgEnum('day_type', DAY_TYPES);
export const attendanceStatus = pgEnum('attendance_status', ATTENDANCE_STATUSES);
export const attendanceFlag = pgEnum('attendance_flag', ATTENDANCE_FLAGS);
export const regularizationKind = pgEnum('regularization_kind', REGULARIZATION_KINDS);
export const regularizationStatus = pgEnum('regularization_status', REGULARIZATION_STATUSES);
export const selfPunchMode = pgEnum('self_punch_mode', SELF_PUNCH_MODES);

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const instant = (name: string) => timestamp(name, { withTimezone: true });
const isoDate = (name: string) => date(name, { mode: 'string' });

/** Working hours. Times are local to the employee's location; an early end runs past midnight. */
export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    breakMinutes: integer('break_minutes').notNull().default(60),
    lateGraceMinutes: integer('late_grace_minutes').notNull().default(10),
    earlyOutGraceMinutes: integer('early_out_grace_minutes').notNull().default(0),
    halfDayMinutes: integer('half_day_minutes').notNull().default(240),
    fullDayMinutes: integer('full_day_minutes').notNull().default(360),
    overtimeEnabled: boolean('overtime_enabled').notNull().default(true),
    overtimeMinMinutes: integer('overtime_min_minutes').notNull().default(30),
    overtimeRoundingMinutes: integer('overtime_rounding_minutes').notNull().default(30),
    /** The shift of anyone without an assignment or roster entry. */
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('shifts_tenant_id_uq').on(t.tenantId, t.id),
    unique('shifts_tenant_code_uq').on(t.tenantId, t.code),
    uniqueIndex('shifts_default_uq')
      .on(t.tenantId)
      .where(sql`${t.isDefault}`),
  ],
);

/** Effective-dated: the open row (no effective_to) is the employee's current shift. */
export const shiftAssignments = pgTable(
  'shift_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    shiftId: uuid('shift_id').notNull(),
    effectiveFrom: isoDate('effective_from').notNull(),
    effectiveTo: isoDate('effective_to'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    index('shift_assignments_employee_idx').on(t.tenantId, t.employeeId, t.effectiveFrom),
    uniqueIndex('shift_assignments_open_uq')
      .on(t.employeeId)
      .where(sql`${t.effectiveTo} is null`),
    foreignKey({
      name: 'shift_assignments_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'shift_assignments_shift_fk',
      columns: [t.tenantId, t.shiftId],
      foreignColumns: [shifts.tenantId, shifts.id],
    }),
  ],
);

/** A dated roster entry overrides the assignment: a shift on that day, or a day off (null). */
export const rosterEntries = pgTable(
  'roster_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    date: isoDate('date').notNull(),
    shiftId: uuid('shift_id'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('roster_entries_employee_date_uq').on(t.tenantId, t.employeeId, t.date),
    foreignKey({
      name: 'roster_entries_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'roster_entries_shift_fk',
      columns: [t.tenantId, t.shiftId],
      foreignColumns: [shifts.tenantId, shifts.id],
    }),
  ],
);

/**
 * A site's Edge Agent. Its token is `gpe.<tenant>.<agent>.<secret>`; only a SHA-256 of the
 * secret is stored.
 */
export const edgeAgents = pgTable(
  'edge_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    agentVersion: text('agent_version'),
    queued: integer('queued'),
    lastSeenAt: instant('last_seen_at'),
    revokedAt: instant('revoked_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [unique('edge_agents_tenant_id_uq').on(t.tenantId, t.id)],
);

/** A biometric device, registered the first time its agent reports it. */
export const attendanceDevices = pgTable(
  'attendance_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    agentId: uuid('agent_id'),
    locationId: uuid('location_id'),
    vendor: deviceVendor('vendor').notNull(),
    serialNumber: text('serial_number').notNull(),
    name: text('name').notNull(),
    lastSeenAt: instant('last_seen_at'),
    lastIp: text('last_ip'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('attendance_devices_tenant_id_uq').on(t.tenantId, t.id),
    unique('attendance_devices_tenant_serial_uq').on(t.tenantId, t.serialNumber),
    foreignKey({
      name: 'attendance_devices_agent_fk',
      columns: [t.tenantId, t.agentId],
      foreignColumns: [edgeAgents.tenantId, edgeAgents.id],
    }),
    foreignKey({
      name: 'attendance_devices_location_fk',
      columns: [t.tenantId, t.locationId],
      foreignColumns: [locations.tenantId, locations.id],
    }),
  ],
);

export const regularizationRequests = pgTable(
  'regularization_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    date: isoDate('date').notNull(),
    kind: regularizationKind('kind').notNull(),
    /** Local times as asked; they become punches when approved. */
    inTime: time('in_time'),
    outTime: time('out_time'),
    reason: text('reason').notNull(),
    status: regularizationStatus('status').notNull().default('pending'),
    appliedBy: uuid('applied_by').notNull(),
    createdAt: createdAt(),
    decidedAt: instant('decided_at'),
    cancelledAt: instant('cancelled_at'),
  },
  (t) => [
    unique('regularization_requests_tenant_id_uq').on(t.tenantId, t.id),
    index('regularization_requests_employee_idx').on(t.tenantId, t.employeeId, t.date),
    uniqueIndex('regularization_requests_pending_uq')
      .on(t.employeeId, t.date)
      .where(sql`${t.status} = 'pending'`),
    foreignKey({
      name: 'regularization_requests_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
  ],
);

/**
 * Every punch, from any source. Device punches arrive with the device's user number and are
 * matched to an employee by their attendance PIN; unmatched ones wait until HR sets it.
 * Punches are never deleted: HR voids a wrong one with a reason.
 */
export const attendancePunches = pgTable(
  'attendance_punches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id'),
    punchedAt: instant('punched_at').notNull(),
    source: punchSource('source').notNull(),
    direction: punchDirection('direction').notNull().default('unknown'),
    deviceId: uuid('device_id'),
    deviceUserId: text('device_user_id'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    accuracyM: doublePrecision('accuracy_m'),
    distanceM: integer('distance_m'),
    insideGeofence: boolean('inside_geofence'),
    regularizationId: uuid('regularization_id'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    voidedAt: instant('voided_at'),
    voidedBy: uuid('voided_by'),
    voidReason: text('void_reason'),
  },
  (t) => [
    // Agents resend after network failures; the same device, user and second is one punch.
    unique('attendance_punches_device_uq').on(t.tenantId, t.deviceId, t.deviceUserId, t.punchedAt),
    index('attendance_punches_employee_idx').on(t.tenantId, t.employeeId, t.punchedAt),
    index('attendance_punches_unmatched_idx')
      .on(t.tenantId, t.deviceUserId)
      .where(sql`${t.employeeId} is null`),
    foreignKey({
      name: 'attendance_punches_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'attendance_punches_device_fk',
      columns: [t.tenantId, t.deviceId],
      foreignColumns: [attendanceDevices.tenantId, attendanceDevices.id],
    }),
    foreignKey({
      name: 'attendance_punches_regularization_fk',
      columns: [t.tenantId, t.regularizationId],
      foreignColumns: [regularizationRequests.tenantId, regularizationRequests.id],
    }),
  ],
);

/** The processed result of one employee's day; recomputed whenever its inputs change. */
export const attendanceDays = pgTable(
  'attendance_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    date: isoDate('date').notNull(),
    shiftId: uuid('shift_id'),
    dayType: dayType('day_type').notNull(),
    status: attendanceStatus('status').notNull(),
    firstIn: instant('first_in'),
    lastOut: instant('last_out'),
    workedMinutes: integer('worked_minutes').notNull().default(0),
    lateMinutes: integer('late_minutes').notNull().default(0),
    earlyOutMinutes: integer('early_out_minutes').notNull().default(0),
    overtimeMinutes: integer('overtime_minutes').notNull().default(0),
    leaveRequestId: uuid('leave_request_id'),
    leaveDays: numeric('leave_days', { precision: 2, scale: 1, mode: 'number' })
      .notNull()
      .default(0),
    flags: attendanceFlag('flags')
      .array()
      .notNull()
      .default(sql`'{}'`),
    processedAt: instant('processed_at').notNull().defaultNow(),
  },
  (t) => [
    unique('attendance_days_employee_date_uq').on(t.tenantId, t.employeeId, t.date),
    index('attendance_days_date_idx').on(t.tenantId, t.date),
    foreignKey({
      name: 'attendance_days_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'attendance_days_shift_fk',
      columns: [t.tenantId, t.shiftId],
      foreignColumns: [shifts.tenantId, shifts.id],
    }),
    foreignKey({
      name: 'attendance_days_leave_fk',
      columns: [t.tenantId, t.leaveRequestId],
      foreignColumns: [leaveRequests.tenantId, leaveRequests.id],
    }),
  ],
);

/** One row per workspace. */
export const attendanceSettings = pgTable('attendance_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  selfPunch: selfPunchMode('self_punch').notNull().default('geofenced'),
  regularizationChain: approvalStepKind('regularization_chain')
    .array()
    .notNull()
    .default(sql`'{manager}'`),
  /** How many days back an employee may ask to correct. */
  regularizationWindowDays: integer('regularization_window_days').notNull().default(30),
  /** Attendance go-live: earlier days are never processed, so nobody shows as absent. */
  trackingFrom: isoDate('tracking_from')
    .notNull()
    .default(sql`current_date`),
  /** The last day the background processing has reached. */
  processedThrough: isoDate('processed_through'),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});
