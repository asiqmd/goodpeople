import type {
  CommitteeDecision,
  CommitteeKind,
  CommitteeRole,
  CommitteeSelection,
  CommitteeSide,
  ComplianceAlertKind,
  ComplianceAlertStatus,
  GrievanceAuthor,
  GrievanceCategory,
  GrievanceChannel,
  GrievanceStatus,
  MaternityCaseStatus,
  MaternityPaymentOption,
  MaternityPayMethod,
  ProductionSource,
  UnionRole,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { employees, gender, locations, orgUnits } from './hr.js';
import { legalEntities, tenantUsers } from './tenant.js';
import { leaveRequests } from './leave.js';
import { tenants } from './platform.js';

// Phase 3 M3, the RMG pack: production and piece rates, working-time alerts, maternity
// benefit, committees and trade unions, grievances and kiosks. Every table is tenant data
// under row-level security (migration 0026). Amounts of pay are field-encrypted.

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: 'string' });
const tenantFk = (
  name: string,
  t: { tenantId: AnyPgColumn },
  column: AnyPgColumn,
  target: { tenantId: AnyPgColumn; id: AnyPgColumn },
) =>
  foreignKey({
    name,
    columns: [t.tenantId, column],
    foreignColumns: [target.tenantId, target.id],
  });

// ── Production ─────────────────────────────────────────────────────────────

/**
 * A sewing, cutting or finishing operation: its rate per piece for piece-rated workers, and
 * a daily target above which time-rated workers earn an incentive per piece.
 */
export const productionOperations = pgTable(
  'production_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    /** The buyer's style or order the operation belongs to, when rates differ by style. */
    style: text('style'),
    pieceRate: numeric('piece_rate', { precision: 10, scale: 4 }),
    dailyTarget: integer('daily_target'),
    incentiveRate: numeric('incentive_rate', { precision: 10, scale: 4 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('production_operations_tenant_id_uq').on(t.tenantId, t.id),
    unique('production_operations_tenant_code_uq').on(t.tenantId, t.code),
  ],
);

/**
 * What a worker made of an operation on a day. The rate, target and incentive are copied
 * from the operation when entered, so changing a rate never changes pay already earned.
 */
export const productionEntries = pgTable(
  'production_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    operationId: uuid('operation_id').notNull(),
    date: isoDate('date').notNull(),
    quantity: integer('quantity').notNull(),
    pieceRate: numeric('piece_rate', { precision: 10, scale: 4 }),
    dailyTarget: integer('daily_target'),
    incentiveRate: numeric('incentive_rate', { precision: 10, scale: 4 }),
    /** The worker's line (or unit) on the day, for line reports. */
    orgUnitId: uuid('org_unit_id'),
    source: text('source').$type<ProductionSource>().notNull().default('manual'),
    enteredBy: uuid('entered_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantFk('production_entries_employee_fk', t, t.employeeId, employees).onDelete('cascade'),
    tenantFk('production_entries_operation_fk', t, t.operationId, productionOperations),
    tenantFk('production_entries_org_unit_fk', t, t.orgUnitId, orgUnits),
    unique('production_entries_day_uq').on(t.tenantId, t.employeeId, t.date, t.operationId),
    index('production_entries_date_idx').on(t.tenantId, t.date),
    check('production_entries_quantity_ck', sql`${t.quantity} >= 0`),
  ],
);

// ── Working-time alerts ────────────────────────────────────────────────────

/** A workspace's own overtime caps, at or below the law's (often a buyer's code). */
export const complianceSettings = pgTable('compliance_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  overtimeDailyCapMinutes: integer('overtime_daily_cap_minutes').notNull().default(120),
  overtimeWeeklyCapMinutes: integer('overtime_weekly_cap_minutes').notNull().default(720),
  overtimeMonthlyCapMinutes: integer('overtime_monthly_cap_minutes'),
  /** Hours boards highlight people at this share of a cap. */
  warnAtPercent: integer('warn_at_percent').notNull().default(90),
  updatedBy: uuid('updated_by'),
  updatedAt: updatedAt(),
});

/**
 * A limit passed: by a person on a day, week or month, or by a committee. One row per
 * subject, kind and period, refreshed while the period is open.
 */
export const complianceAlerts = pgTable(
  'compliance_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    kind: text('kind').$type<ComplianceAlertKind>().notNull(),
    /** An employee's or a committee's id (or a legal entity's, for a missing committee). */
    subjectId: uuid('subject_id').notNull(),
    employeeId: uuid('employee_id'),
    periodStart: isoDate('period_start').notNull(),
    periodEnd: isoDate('period_end').notNull(),
    /** What was reached and the limit, in minutes for hours, else days or counts. */
    value: integer('value').notNull(),
    limit: integer('limit').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    status: text('status').$type<ComplianceAlertStatus>().notNull().default('open'),
    note: text('note'),
    acknowledgedBy: uuid('acknowledged_by'),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantFk('compliance_alerts_employee_fk', t, t.employeeId, employees).onDelete('cascade'),
    unique('compliance_alerts_subject_uq').on(t.tenantId, t.kind, t.subjectId, t.periodStart),
    index('compliance_alerts_open_idx').on(t.tenantId, t.status, t.periodStart),
  ],
);

// ── Maternity benefit ──────────────────────────────────────────────────────

/** One expected birth: notice, eligibility, the average wage and the benefit's days. */
export const maternityCases = pgTable(
  'maternity_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    /** The maternity leave the benefit pays for; its days are not paid again in payroll. */
    leaveRequestId: uuid('leave_request_id'),
    noticeOn: isoDate('notice_on').notNull(),
    expectedDeliveryOn: isoDate('expected_delivery_on').notNull(),
    deliveredOn: isoDate('delivered_on'),
    /** Proof of birth (a birth register extract or a doctor's certificate), when produced. */
    proofOn: isoDate('proof_on'),
    survivingChildren: integer('surviving_children').notNull().default(0),
    nomineeName: text('nominee_name'),
    nomineeRelation: text('nominee_relation'),
    paymentOption: text('payment_option').$type<MaternityPaymentOption>().notNull(),
    eligible: boolean('eligible').notNull(),
    ineligibleReason: text('ineligible_reason'),
    /** Wages in the three months before the notice and the days actually worked (s.48). */
    wageTotalEnc: text('wage_total_enc'),
    wageDaysWorked: integer('wage_days_worked'),
    averageDailyWageEnc: text('average_daily_wage_enc'),
    benefitDays: integer('benefit_days').notNull(),
    status: text('status').$type<MaternityCaseStatus>().notNull().default('open'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('maternity_cases_tenant_id_uq').on(t.tenantId, t.id),
    tenantFk('maternity_cases_employee_fk', t, t.employeeId, employees).onDelete('cascade'),
    tenantFk('maternity_cases_leave_fk', t, t.leaveRequestId, leaveRequests).onDelete('set null'),
    index('maternity_cases_employee_idx').on(t.tenantId, t.employeeId),
  ],
);

/** A part of the benefit: its days, amount, when it falls due and when it was paid. */
export const maternityPayments = pgTable(
  'maternity_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    caseId: uuid('case_id').notNull(),
    part: integer('part').notNull(),
    days: integer('days').notNull(),
    amountEnc: text('amount_enc').notNull(),
    dueOn: isoDate('due_on'),
    paidOn: isoDate('paid_on'),
    method: text('method').$type<MaternityPayMethod>(),
    reference: text('reference'),
    paidBy: uuid('paid_by'),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk('maternity_payments_case_fk', t, t.caseId, maternityCases).onDelete('cascade'),
    unique('maternity_payments_part_uq').on(t.tenantId, t.caseId, t.part),
  ],
);

// ── Committees and trade unions ────────────────────────────────────────────

export const committees = pgTable(
  'committees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    kind: text('kind').$type<CommitteeKind>().notNull(),
    /** The establishment it serves: a company, or one of its sites (a factory). */
    legalEntityId: uuid('legal_entity_id'),
    locationId: uuid('location_id'),
    name: text('name').notNull(),
    formedOn: isoDate('formed_on').notNull(),
    endsOn: isoDate('ends_on'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('committees_tenant_id_uq').on(t.tenantId, t.id),
    tenantFk('committees_entity_fk', t, t.legalEntityId, legalEntities),
    tenantFk('committees_location_fk', t, t.locationId, locations),
  ],
);

export const committeeMembers = pgTable(
  'committee_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    committeeId: uuid('committee_id').notNull(),
    /** An employee, or null for someone from outside (a doctor, a union federation). */
    employeeId: uuid('employee_id'),
    name: text('name').notNull(),
    /** For a member from outside; an employee's comes from their record. */
    gender: gender('gender'),
    side: text('side').$type<CommitteeSide>().notNull(),
    role: text('role').$type<CommitteeRole>().notNull().default('member'),
    selection: text('selection').$type<CommitteeSelection>().notNull(),
    fromOn: isoDate('from_on').notNull(),
    toOn: isoDate('to_on'),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk('committee_members_committee_fk', t, t.committeeId, committees).onDelete('cascade'),
    tenantFk('committee_members_employee_fk', t, t.employeeId, employees),
  ],
);

export const committeeMeetings = pgTable(
  'committee_meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    committeeId: uuid('committee_id').notNull(),
    heldOn: isoDate('held_on').notNull(),
    agenda: text('agenda'),
    minutes: text('minutes'),
    attendees: integer('attendees'),
    /** When the minutes went to the Director of Labour (participation: within 7 days). */
    minutesSentOn: isoDate('minutes_sent_on'),
    decisions: jsonb('decisions').$type<CommitteeDecision[]>().notNull().default([]),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk('committee_meetings_committee_fk', t, t.committeeId, committees).onDelete('cascade'),
    index('committee_meetings_held_idx').on(t.tenantId, t.committeeId, t.heldOn),
  ],
);

export const tradeUnions = pgTable(
  'trade_unions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id'),
    name: text('name').notNull(),
    registrationNo: text('registration_no'),
    registeredOn: isoDate('registered_on'),
    federation: text('federation'),
    /** The collective bargaining agent (s.202). */
    isCba: boolean('is_cba').notNull().default(false),
    /** Subscriptions deducted from members' wages who consented (s.204). */
    checkOff: boolean('check_off').notNull().default(false),
    monthlySubscription: numeric('monthly_subscription', { precision: 10, scale: 2 }),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('trade_unions_tenant_id_uq').on(t.tenantId, t.id),
    tenantFk('trade_unions_entity_fk', t, t.legalEntityId, legalEntities),
  ],
);

export const unionMemberships = pgTable(
  'union_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    unionId: uuid('union_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    role: text('role').$type<UnionRole>().notNull().default('member'),
    joinedOn: isoDate('joined_on').notNull(),
    leftOn: isoDate('left_on'),
    /** The member's written consent to deduction from wages; null: paid directly. */
    checkOffConsentOn: isoDate('check_off_consent_on'),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk('union_memberships_union_fk', t, t.unionId, tradeUnions).onDelete('cascade'),
    tenantFk('union_memberships_employee_fk', t, t.employeeId, employees).onDelete('cascade'),
    unique('union_memberships_uq').on(t.tenantId, t.unionId, t.employeeId, t.joinedOn),
  ],
);

// ── Grievances ────────────────────────────────────────────────────────────

/**
 * A grievance. Anonymous ones keep no trace of who raised them: no login, no address, no
 * device. The reporter follows up with the reference and a PIN (only its hash is kept).
 */
export const grievances = pgTable(
  'grievances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    reference: text('reference').notNull(),
    pinHash: text('pin_hash').notNull(),
    category: text('category').$type<GrievanceCategory>().notNull(),
    bodyEnc: text('body_enc').notNull(),
    anonymous: boolean('anonymous').notNull().default(true),
    /** Set only when the worker chose to give their name. */
    reporterEmployeeId: uuid('reporter_employee_id'),
    locationId: uuid('location_id'),
    channel: text('channel').$type<GrievanceChannel>().notNull(),
    status: text('status').$type<GrievanceStatus>().notNull().default('new'),
    /** Harassment: visible to the complaint committee's members only (s.332A). */
    restricted: boolean('restricted').notNull().default(false),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('grievances_tenant_id_uq').on(t.tenantId, t.id),
    unique('grievances_reference_uq').on(t.tenantId, t.reference),
    tenantFk('grievances_reporter_fk', t, t.reporterEmployeeId, employees).onDelete('set null'),
    tenantFk('grievances_location_fk', t, t.locationId, locations),
  ],
);

export const grievanceMessages = pgTable(
  'grievance_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    grievanceId: uuid('grievance_id').notNull(),
    author: text('author').$type<GrievanceAuthor>().notNull(),
    staffUserId: uuid('staff_user_id'),
    bodyEnc: text('body_enc').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk('grievance_messages_grievance_fk', t, t.grievanceId, grievances).onDelete('cascade'),
    tenantFk('grievance_messages_staff_fk', t, t.staffUserId, tenantUsers),
  ],
);

// ── Kiosks ────────────────────────────────────────────────────────────────

/** A shared tablet. Its token is `gpk.<tenant>.<kiosk>.<secret>`; only the secret's hash is kept. */
export const kiosks = pgTable(
  'kiosks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    locationId: uuid('location_id'),
    name: text('name').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    secretHash: text('secret_hash').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('kiosks_tenant_id_uq').on(t.tenantId, t.id),
    tenantFk('kiosks_location_fk', t, t.locationId, locations),
  ],
);

/** An SMS code that lets a worker set their kiosk PIN, hashed, short-lived. */
export const kioskPinCodes = pgTable(
  'kiosk_pin_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    kioskId: uuid('kiosk_id'),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk('kiosk_pin_codes_employee_fk', t, t.employeeId, employees).onDelete('cascade'),
    tenantFk('kiosk_pin_codes_kiosk_fk', t, t.kioskId, kiosks).onDelete('set null'),
    index('kiosk_pin_codes_employee_idx').on(t.tenantId, t.employeeId, t.createdAt),
  ],
);
