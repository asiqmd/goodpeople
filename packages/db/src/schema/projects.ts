import type { ProjectCostKind, ProjectStatus, TimesheetStatus } from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { employees } from './hr.js';
import { tenants } from './platform.js';
import { legalEntities } from './tenant.js';

// Phase 3 M4, the NGO pack: donors and the projects they fund, how each person's salary is
// split across projects (planned, effective-dated), and monthly timesheets of the work
// actually done. Tenant data under row-level security (migration 0028).

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: 'string' });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
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

export const donors = pgTable(
  'donors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    country: text('country'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('donors_tenant_id_uq').on(t.tenantId, t.id),
    unique('donors_tenant_code_uq').on(t.tenantId, t.code),
  ],
);

/**
 * Work funded by a donor (or the organisation's own funds when there is none): its FD-6
 * approval by the NGO Affairs Bureau, its period, and the budgets salaries are charged against.
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    donorId: uuid('donor_id'),
    /** The donor's award or agreement number. */
    grantReference: text('grant_reference'),
    fd6ApprovalNo: text('fd6_approval_no'),
    fd6ApprovedOn: isoDate('fd6_approved_on'),
    startsOn: isoDate('starts_on').notNull(),
    endsOn: isoDate('ends_on'),
    /** The approved expenditure (FD-6), which the 20% administration cap is a share of. */
    approvedBudget: money('approved_budget'),
    /** The part of it for staff, which salaries charged are tracked against. */
    staffBudget: money('staff_budget'),
    status: text('status').$type<ProjectStatus>().notNull().default('active'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('projects_tenant_id_uq').on(t.tenantId, t.id),
    unique('projects_tenant_code_uq').on(t.tenantId, t.code),
    tenantFk('projects_entity_fk', t, t.legalEntityId, legalEntities),
    tenantFk('projects_donor_fk', t, t.donorId, donors),
  ],
);

/**
 * The planned share of a person's salary charged to a project from a date: the basis until
 * an approved timesheet shows the work actually done. Shares for a day add up to at most
 * 100; the rest stays with the person's own unit.
 */
export const employeeAllocations = pgTable(
  'employee_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    projectId: uuid('project_id').notNull(),
    percent: numeric('percent', { precision: 5, scale: 2 }).notNull(),
    costKind: text('cost_kind').$type<ProjectCostKind>().notNull().default('programme'),
    fromOn: isoDate('from_on').notNull(),
    toOn: isoDate('to_on'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    tenantFk('employee_allocations_employee_fk', t, t.employeeId, employees).onDelete('cascade'),
    tenantFk('employee_allocations_project_fk', t, t.projectId, projects),
    index('employee_allocations_employee_idx').on(t.tenantId, t.employeeId, t.fromOn),
    check('employee_allocations_percent_ck', sql`${t.percent} > 0 and ${t.percent} <= 100`),
  ],
);

/** A person's month of work by project, certified by them and approved by their manager. */
export const timesheets = pgTable(
  'timesheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    /** The first day of the month. */
    month: isoDate('month').notNull(),
    status: text('status').$type<TimesheetStatus>().notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByEmployeeId: uuid('decided_by_employee_id'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('timesheets_tenant_id_uq').on(t.tenantId, t.id),
    unique('timesheets_month_uq').on(t.tenantId, t.employeeId, t.month),
    tenantFk('timesheets_employee_fk', t, t.employeeId, employees).onDelete('cascade'),
    tenantFk('timesheets_decided_by_fk', t, t.decidedByEmployeeId, employees),
  ],
);

/**
 * Hours on a day: for a project, or (no project) work not charged to any. An entry made
 * offline carries the client's id, so sending it again changes nothing.
 */
export const timesheetEntries = pgTable(
  'timesheet_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    timesheetId: uuid('timesheet_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    date: isoDate('date').notNull(),
    projectId: uuid('project_id'),
    hours: numeric('hours', { precision: 4, scale: 2 }).notNull(),
    note: text('note'),
    clientId: uuid('client_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    tenantFk('timesheet_entries_timesheet_fk', t, t.timesheetId, timesheets).onDelete('cascade'),
    tenantFk('timesheet_entries_employee_fk', t, t.employeeId, employees).onDelete('cascade'),
    tenantFk('timesheet_entries_project_fk', t, t.projectId, projects),
    unique('timesheet_entries_day_uq')
      .on(t.tenantId, t.timesheetId, t.date, t.projectId)
      .nullsNotDistinct(),
    uniqueIndex('timesheet_entries_client_uq')
      .on(t.tenantId, t.clientId)
      .where(sql`${t.clientId} is not null`),
    check('timesheet_entries_hours_ck', sql`${t.hours} >= 0 and ${t.hours} <= 24`),
  ],
);
