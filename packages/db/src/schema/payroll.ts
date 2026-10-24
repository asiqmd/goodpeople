import {
  PAY_BASES,
  PAY_CALCULATIONS,
  PAY_CHANGE_STATUSES,
  PAY_COMPONENT_KINDS,
  PAY_FREQUENCIES,
  TAX_TREATMENTS,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
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
import { employees } from './hr.js';
import { tenants } from './platform.js';

export const payComponentKind = pgEnum('pay_component_kind', PAY_COMPONENT_KINDS);
export const payCalculation = pgEnum('pay_calculation', PAY_CALCULATIONS);
export const taxTreatment = pgEnum('tax_treatment', TAX_TREATMENTS);
export const payFrequency = pgEnum('pay_frequency', PAY_FREQUENCIES);
export const payBasis = pgEnum('pay_basis', PAY_BASES);
export const payChangeStatus = pgEnum('pay_change_status', PAY_CHANGE_STATUSES);

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: 'string' });

/** A building block of pay (basic, house rent, overtime, tax), usable in formulas by its code. */
export const payComponents = pgTable(
  'pay_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    kind: payComponentKind('kind').notNull(),
    calculation: payCalculation('calculation').notNull(),
    taxTreatment: taxTreatment('tax_treatment').notNull().default('taxable'),
    inGross: boolean('in_gross').notNull().default(false),
    inOvertimeBase: boolean('in_overtime_base').notNull().default(false),
    prorate: boolean('prorate').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(100),
    isActive: boolean('is_active').notNull().default(true),
    /** From the country pack. */
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('pay_components_tenant_id_uq').on(t.tenantId, t.id),
    unique('pay_components_tenant_code_uq').on(t.tenantId, t.code),
  ],
);

/** How a gross or basic amount is split into components: one formula per component. */
export const salaryStructures = pgTable(
  'salary_structures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameBn: text('name_bn'),
    basis: payBasis('basis').notNull(),
    lines: jsonb('lines').$type<{ component: string; formula: string }[]>().notNull(),
    /** A country-pack minimum wage table, e.g. BD_RMG_2023. */
    wageBoard: text('wage_board'),
    isActive: boolean('is_active').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('salary_structures_tenant_id_uq').on(t.tenantId, t.id),
    unique('salary_structures_tenant_code_uq').on(t.tenantId, t.code),
  ],
);

/** People paid together on one schedule (monthly, or weekly in some factories). */
export const payGroups = pgTable(
  'pay_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    frequency: payFrequency('frequency').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('pay_groups_tenant_id_uq').on(t.tenantId, t.id),
    unique('pay_groups_tenant_code_uq').on(t.tenantId, t.code),
    uniqueIndex('pay_groups_default_uq')
      .on(t.tenantId)
      .where(sql`${t.isDefault}`),
  ],
);

export const payrollSettings = pgTable('payroll_settings', {
  tenantId: tenantId().primaryKey(),
  /** A second person with payroll.approve decides pay changes. */
  makerChecker: boolean('maker_checker').notNull().default(true),
  updatedAt: updatedAt(),
});

/**
 * An employee's pay from a date: approved records form their pay history; a proposed change
 * waits as pending until a second person decides it. The amounts (gross or basic, and fixed
 * amounts) are field-encrypted; a record never changes once decided.
 */
export const employeePay = pgTable(
  'employee_pay',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    effectiveFrom: isoDate('effective_from').notNull(),
    status: payChangeStatus('status').notNull(),
    structureId: uuid('structure_id').notNull(),
    payGroupId: uuid('pay_group_id').notNull(),
    /** { amount, fixed } as encrypted JSON. */
    amountsEnc: text('amounts_enc').notNull(),
    wageGrade: text('wage_grade'),
    reason: text('reason').notNull(),
    requestedBy: uuid('requested_by'),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('employee_pay_tenant_id_uq').on(t.tenantId, t.id),
    index('employee_pay_employee_idx').on(t.tenantId, t.employeeId, t.effectiveFrom),
    // One proposed change per person at a time.
    uniqueIndex('employee_pay_pending_uq')
      .on(t.employeeId)
      .where(sql`${t.status} = 'pending'`),
    foreignKey({
      name: 'employee_pay_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'employee_pay_structure_fk',
      columns: [t.tenantId, t.structureId],
      foreignColumns: [salaryStructures.tenantId, salaryStructures.id],
    }),
    foreignKey({
      name: 'employee_pay_group_fk',
      columns: [t.tenantId, t.payGroupId],
      foreignColumns: [payGroups.tenantId, payGroups.id],
    }),
  ],
);
