import type { CompensationCreateInput, EmployeeRef } from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { employees, jobAssignments, orgUnits } from './hr.js';
import { employeePay } from './payroll.js';
import { reviews, reviewCycles } from './performance.js';
import { tenants } from './platform.js';
import { legalEntities } from './tenant.js';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const instant = (name: string) => timestamp(name, { withTimezone: true });
const fk = (
  name: string,
  t: { tenantId: AnyPgColumn },
  column: AnyPgColumn,
  target: { tenantId: AnyPgColumn; id: AnyPgColumn },
) =>
  foreignKey({ name, columns: [t.tenantId, column], foreignColumns: [target.tenantId, target.id] });

export const compensationRounds = pgTable(
  'compensation_rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    name: text('name').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    cycleId: uuid('cycle_id'),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    rmgAnnual: boolean('rmg_annual').notNull().default(false),
    matrix: jsonb('matrix').$type<CompensationCreateInput['matrix']>().notNull(),
    ranges: jsonb('ranges').$type<CompensationCreateInput['ranges']>().notNull(),
    budgets: jsonb('budgets').$type<CompensationCreateInput['budgets']>().notNull(),
    skipped: jsonb('skipped')
      .$type<{ employee: EmployeeRef; reason: string }[]>()
      .notNull()
      .default([]),
    status: text('status').$type<'open' | 'payroll' | 'cancelled'>().notNull().default('open'),
    createdBy: uuid('created_by').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    exportedAt: instant('exported_at'),
  },
  (t) => [
    unique('compensation_rounds_tenant_id_uq').on(t.tenantId, t.id),
    fk('compensation_rounds_company_fk', t, t.legalEntityId, legalEntities),
    fk('compensation_rounds_cycle_fk', t, t.cycleId, reviewCycles),
    check('compensation_rounds_status_ck', sql`${t.status} in ('open', 'payroll', 'cancelled')`),
  ],
);

export const compensationLines = pgTable(
  'compensation_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    roundId: uuid('round_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    orgUnitId: uuid('org_unit_id'),
    jobId: uuid('job_id').notNull(),
    sourcePayId: uuid('source_pay_id').notNull(),
    reviewId: uuid('review_id'),
    rating: integer('rating'),
    incrementRecommended: boolean('increment_recommended').notNull().default(false),
    amountsEnc: text('amounts_enc').notNull(),
    submitted: boolean('submitted').notNull().default(false),
    reason: text('reason'),
    version: integer('version').notNull().default(0),
    updatedBy: uuid('updated_by'),
    payChangeId: uuid('pay_change_id'),
  },
  (t) => [
    unique('compensation_lines_tenant_id_uq').on(t.tenantId, t.id),
    unique('compensation_lines_person_uq').on(t.roundId, t.employeeId),
    fk('compensation_lines_round_fk', t, t.roundId, compensationRounds).onDelete('cascade'),
    fk('compensation_lines_employee_fk', t, t.employeeId, employees),
    fk('compensation_lines_unit_fk', t, t.orgUnitId, orgUnits),
    fk('compensation_lines_job_fk', t, t.jobId, jobAssignments),
    fk('compensation_lines_source_pay_fk', t, t.sourcePayId, employeePay),
    fk('compensation_lines_review_fk', t, t.reviewId, reviews),
    fk('compensation_lines_pay_change_fk', t, t.payChangeId, employeePay),
    check('compensation_lines_rating_ck', sql`${t.rating} is null or ${t.rating} between 1 and 5`),
  ],
);
