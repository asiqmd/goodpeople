import {
  PAY_BASES,
  PAY_CALCULATIONS,
  PAY_CHANGE_STATUSES,
  PAY_COMPONENT_KINDS,
  PAY_FREQUENCIES,
  RUN_KINDS,
  RUN_STATUSES,
  TAX_TREATMENTS,
  DEFAULT_GL_ACCOUNTS,
  type BonusRule,
  type GlAccounts,
  type PaymentCheckView,
  type PfVestingStep,
  type ReconciliationMapping,
  type ReconciliationStatus,
  type ReconciliationSummary,
  type RunProblem,
  type TaxArea,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { employees } from './hr.js';
import { legalEntities } from './tenant.js';
import { separations } from './lifecycle.js';
import { tenants } from './platform.js';

export const payComponentKind = pgEnum('pay_component_kind', PAY_COMPONENT_KINDS);
export const payCalculation = pgEnum('pay_calculation', PAY_CALCULATIONS);
export const taxTreatment = pgEnum('tax_treatment', TAX_TREATMENTS);
export const payFrequency = pgEnum('pay_frequency', PAY_FREQUENCIES);
export const payBasis = pgEnum('pay_basis', PAY_BASES);
export const payChangeStatus = pgEnum('pay_change_status', PAY_CHANGE_STATUSES);
export const runKind = pgEnum('payroll_run_kind', RUN_KINDS);
export const runStatus = pgEnum('payroll_run_status', RUN_STATUSES);

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
    /** Run components: worked out in each run (overtime, absence); null means entered. */
    runFormula: text('run_formula'),
    /** The ledger account for the journal export; the settings' default when null. */
    glAccount: text('gl_account'),
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
    currency: text('currency').notNull().default('BDT'),
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
    currency: text('currency').notNull().default('BDT'),
    legalEntityId: uuid('legal_entity_id'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    frequency: payFrequency('frequency').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('pay_groups_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
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
  /** Runs work out each month's salary tax (TAX) unless an amount is entered. */
  autoTax: boolean('auto_tax').notNull().default(true),
  /** Where people live for minimum tax, unless their tax profile says otherwise. */
  taxArea: text('tax_area').$type<TaxArea>().notNull().default('dhaka_chattogram_city'),
  /** The provident fund: contributions in runs for members, as percent of basic. */
  pfEnabled: boolean('pf_enabled').notNull().default(false),
  pfEmployeeRate: numeric('pf_employee_rate', { precision: 5, scale: 2 }).notNull().default('7'),
  pfEmployerRate: numeric('pf_employer_rate', { precision: 5, scale: 2 }).notNull().default('7'),
  /** Recognised by the tax authority: contributions count for the investment rebate. */
  pfRecognised: boolean('pf_recognised').notNull().default(true),
  /** How much of the employer's contributions a leaver keeps, by completed years. */
  pfVesting: jsonb('pf_vesting')
    .$type<PfVestingStep[]>()
    .notNull()
    .default([
      { afterYears: 0, percent: 0 },
      { afterYears: 3, percent: 100 },
    ]),
  /** Account codes for the journal export. */
  glAccounts: jsonb('gl_accounts').$type<GlAccounts>().notNull().default(DEFAULT_GL_ACCOUNTS),
  /** Gratuity is provided for (a gratuity scheme or the Act's gratuity on separation). */
  gratuityEnabled: boolean('gratuity_enabled').notNull().default(true),
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
    currency: text('currency').notNull().default('BDT'),
    employeeId: uuid('employee_id').notNull(),
    effectiveFrom: isoDate('effective_from').notNull(),
    status: payChangeStatus('status').notNull(),
    /** Set when the change is one of a batch decided together (the annual increment). */
    batchId: uuid('batch_id'),
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

/**
 * One pay group's payroll for a period: a regular run, or an adjustment correcting a locked
 * one. Its results are stored per person; once locked, nothing about it changes.
 */
export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    payGroupId: uuid('pay_group_id').notNull(),
    statutoryContext: jsonb('statutory_context').$type<Record<string, unknown>>(),
    kind: runKind('kind').notNull(),
    parentRunId: uuid('parent_run_id'),
    /** An adjustment's people; everyone in its parent run when null. */
    scopeEmployeeIds: uuid('scope_employee_ids').array(),
    periodStart: isoDate('period_start').notNull(),
    periodEnd: isoDate('period_end').notNull(),
    paymentDue: isoDate('payment_due').notNull(),
    paymentDate: isoDate('payment_date').notNull(),
    status: runStatus('status').notNull().default('draft'),
    /** A bonus run's festival and rules; null for other runs. */
    bonus: jsonb('bonus').$type<BonusRule>(),
    /** A settlement run's separation. */
    separationId: uuid('separation_id'),
    /** A WPPF run's distribution. */
    wppfId: uuid('wppf_id'),
    /** When the money actually went out (s.123 asks for it by the due date). */
    paidOn: isoDate('paid_on'),
    headcount: integer('headcount').notNull().default(0),
    /** { earnings, deductions, net, employerCost } as encrypted JSON. */
    totalsEnc: text('totals_enc'),
    errors: integer('errors').notNull().default(0),
    warnings: integer('warnings').notNull().default(0),
    flagged: integer('flagged').notNull().default(0),
    createdBy: uuid('created_by'),
    computedAt: timestamp('computed_at', { withTimezone: true }),
    submittedBy: uuid('submitted_by'),
    decidedBy: uuid('decided_by'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('payroll_runs_tenant_id_uq').on(t.tenantId, t.id),
    // One regular run per group and period, unless it was cancelled.
    uniqueIndex('payroll_runs_regular_uq')
      .on(t.tenantId, t.payGroupId, t.periodStart)
      .where(sql`${t.kind} = 'regular' and ${t.status} <> 'cancelled'`),
    index('payroll_runs_period_idx').on(t.tenantId, t.periodStart),
    foreignKey({
      name: 'payroll_runs_group_fk',
      columns: [t.tenantId, t.payGroupId],
      foreignColumns: [payGroups.tenantId, payGroups.id],
    }),
    foreignKey({
      name: 'payroll_runs_parent_fk',
      columns: [t.tenantId, t.parentRunId],
      foreignColumns: [t.tenantId, t.id],
    }),
    foreignKey({
      name: 'payroll_runs_separation_fk',
      columns: [t.tenantId, t.separationId],
      foreignColumns: [separations.tenantId, separations.id],
    }),
  ],
);

/** One person's result in a run: lines and totals encrypted, problems in the clear. */
export const payrollRunItems = pgTable(
  'payroll_run_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    runId: uuid('run_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    status: text('status').$type<'ok' | 'error'>().notNull(),
    problems: jsonb('problems').$type<RunProblem[]>().notNull().default([]),
    /** Lines, totals and variables as encrypted JSON. */
    resultEnc: text('result_enc').notNull(),
    flagged: boolean('flagged').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique('payroll_run_items_tenant_id_uq').on(t.tenantId, t.id),
    unique('payroll_run_items_run_employee_uq').on(t.runId, t.employeeId),
    index('payroll_run_items_employee_idx').on(t.tenantId, t.employeeId),
    foreignKey({
      name: 'payroll_run_items_run_fk',
      columns: [t.tenantId, t.runId],
      foreignColumns: [payrollRuns.tenantId, payrollRuns.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'payroll_run_items_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
  ],
);

/** An amount HR enters for one person in one run (arrears, an advance to recover, a bonus). */
export const payrollInputs = pgTable(
  'payroll_inputs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    runId: uuid('run_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    component: text('component').notNull(),
    amountEnc: text('amount_enc').notNull(),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('payroll_inputs_uq').on(t.runId, t.employeeId, t.component),
    foreignKey({
      name: 'payroll_inputs_run_fk',
      columns: [t.tenantId, t.runId],
      foreignColumns: [payrollRuns.tenantId, payrollRuns.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'payroll_inputs_employee_fk',
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
  ],
);

/**
 * A run compared with the payroll it replaces (a parallel run): the uploaded sheet, how its
 * columns map to ours, and the result. The sheet and result hold pay, so both are encrypted;
 * the headings and counts are not.
 */
export const payrollReconciliations = pgTable(
  'payroll_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    runId: uuid('run_id').notNull(),
    fileName: text('file_name').notNull(),
    headers: jsonb('headers').$type<string[]>().notNull(),
    rowCount: integer('row_count').notNull(),
    /** The rows under the headings, as encrypted JSON. */
    sheetEnc: text('sheet_enc').notNull(),
    mapping: jsonb('mapping').$type<ReconciliationMapping>(),
    status: text('status').$type<ReconciliationStatus>().notNull().default('draft'),
    summary: jsonb('summary').$type<ReconciliationSummary>(),
    /** Column totals and the people who differ, as encrypted JSON. */
    resultEnc: text('result_enc'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    comparedBy: uuid('compared_by'),
    comparedAt: timestamp('compared_at', { withTimezone: true }),
  },
  (t) => [
    unique('payroll_reconciliations_tenant_id_uq').on(t.tenantId, t.id),
    index('payroll_reconciliations_run_idx').on(t.tenantId, t.runId),
    foreignKey({
      name: 'payroll_reconciliations_run_fk',
      columns: [t.tenantId, t.runId],
      foreignColumns: [payrollRuns.tenantId, payrollRuns.id],
    }).onDelete('cascade'),
  ],
);

/**
 * A bank's or wallet provider's report on a run's payments (a returns file or a full status
 * report), matched to what we sent. The result names accounts, so it is encrypted.
 */
export const paymentChecks = pgTable(
  'payment_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    currency: text('currency').notNull().default('BDT'),
    runId: uuid('run_id').notNull(),
    fileName: text('file_name').notNull(),
    summary: jsonb('summary').$type<PaymentCheckView['summary']>().notNull(),
    resultEnc: text('result_enc').notNull(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('payment_checks_tenant_id_uq').on(t.tenantId, t.id),
    index('payment_checks_run_idx').on(t.tenantId, t.runId),
    foreignKey({
      name: 'payment_checks_run_fk',
      columns: [t.tenantId, t.runId],
      foreignColumns: [payrollRuns.tenantId, payrollRuns.id],
    }).onDelete('cascade'),
  ],
);
