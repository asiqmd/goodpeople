import {
  DECLARATION_STATUSES,
  INCREMENT_BASES,
  LOAN_KINDS,
  LOAN_STATUSES,
  PAY_BATCH_STATUSES,
  PF_ACCOUNTS,
  PF_ENTRY_KINDS,
  TAX_AREAS,
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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { employees } from './hr.js';
import { payrollRuns } from './payroll.js';
import { tenants } from './platform.js';

// Phase 2 M3: salary tax, the provident fund, loans and advances, and pay changes decided
// in batches (the annual increment). Amounts are field-encrypted like all pay.

export const taxArea = pgEnum('tax_area', TAX_AREAS);
export const declarationStatus = pgEnum('tax_declaration_status', DECLARATION_STATUSES);
export const pfEntryKind = pgEnum('pf_entry_kind', PF_ENTRY_KINDS);
export const pfAccount = pgEnum('pf_account', PF_ACCOUNTS);
export const loanKind = pgEnum('loan_kind', LOAN_KINDS);
export const loanStatus = pgEnum('loan_status', LOAN_STATUSES);
export const payBatchStatus = pgEnum('pay_batch_status', PAY_BATCH_STATUSES);
export const incrementBasis = pgEnum('increment_basis', INCREMENT_BASES);

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: 'string' });
const employeeFk = (name: string, t: { tenantId: AnyPgColumn; employeeId: AnyPgColumn }) =>
  foreignKey({
    name,
    columns: [t.tenantId, t.employeeId],
    foreignColumns: [employees.tenantId, employees.id],
  }).onDelete('cascade');

/** What changes a person's tax beyond their gender and age: the higher thresholds and area. */
export const taxProfiles = pgTable(
  'tax_profiles',
  {
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    disabled: boolean('disabled').notNull().default(false),
    freedomFighter: boolean('freedom_fighter').notNull().default(false),
    /** Dependants with a disability: each raises a parent's or guardian's threshold. */
    disabledDependants: integer('disabled_dependants').notNull().default(0),
    /** Where they live, for minimum tax; the workspace's default when null. */
    area: taxArea('area'),
    updatedBy: uuid('updated_by'),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('tax_profiles_employee_uq').on(t.tenantId, t.employeeId),
    employeeFk('tax_profiles_employee_fk', t),
  ],
);

/** An employee's investments for the rebate in one fiscal year, and payroll's check of them. */
export const taxDeclarations = pgTable(
  'tax_declarations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    /** e.g. "2026-27". */
    fiscalYear: text('fiscal_year').notNull(),
    status: declarationStatus('status').notNull().default('draft'),
    /** [{ kind, declared, verified, note, documentId }] as encrypted JSON. */
    itemsEnc: text('items_enc').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('tax_declarations_tenant_id_uq').on(t.tenantId, t.id),
    unique('tax_declarations_employee_year_uq').on(t.tenantId, t.employeeId, t.fiscalYear),
    employeeFk('tax_declarations_employee_fk', t),
  ],
);

/**
 * Salary, tax and provident fund paid before the workspace's first run in a fiscal year (a
 * go-live in October brings July to September from the old payroll), so the year's tax is
 * worked out on the whole year.
 */
export const taxOpenings = pgTable(
  'tax_openings',
  {
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    fiscalYear: text('fiscal_year').notNull(),
    /** { salary, tax, pf } as encrypted JSON. */
    amountsEnc: text('amounts_enc').notNull(),
    updatedBy: uuid('updated_by'),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('tax_openings_employee_year_uq').on(t.tenantId, t.employeeId, t.fiscalYear),
    employeeFk('tax_openings_employee_fk', t),
  ],
);

/** The tax a run deducted, as deposited to the government (challan), for certificates. */
export const taxDeposits = pgTable(
  'tax_deposits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    runId: uuid('run_id').notNull(),
    challanNo: text('challan_no').notNull(),
    depositedOn: isoDate('deposited_on').notNull(),
    amountEnc: text('amount_enc').notNull(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('tax_deposits_run_uq').on(t.tenantId, t.runId),
    foreignKey({
      name: 'tax_deposits_run_fk',
      columns: [t.tenantId, t.runId],
      foreignColumns: [payrollRuns.tenantId, payrollRuns.id],
    }).onDelete('cascade'),
  ],
);

/** Provident fund membership; contributions start with the first run from `joinedOn`. */
export const pfMembers = pgTable(
  'pf_members',
  {
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    joinedOn: isoDate('joined_on').notNull(),
    leftOn: isoDate('left_on'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('pf_members_employee_uq').on(t.tenantId, t.employeeId),
    employeeFk('pf_members_employee_fk', t),
  ],
);

/** One movement in a member's fund; the balance is the sum of the entries. */
export const pfEntries = pgTable(
  'pf_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    date: isoDate('date').notNull(),
    kind: pfEntryKind('kind').notNull(),
    account: pfAccount('account').notNull(),
    /** Signed: money into the account is positive. */
    amountEnc: text('amount_enc').notNull(),
    runId: uuid('run_id'),
    loanId: uuid('loan_id'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    index('pf_entries_employee_idx').on(t.tenantId, t.employeeId, t.date),
    employeeFk('pf_entries_employee_fk', t),
    foreignKey({
      name: 'pf_entries_run_fk',
      columns: [t.tenantId, t.runId],
      foreignColumns: [payrollRuns.tenantId, payrollRuns.id],
    }),
  ],
);

/** An advance, a company loan or a loan from the provident fund, repaid through runs. */
export const employeeLoans = pgTable(
  'employee_loans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    employeeId: uuid('employee_id').notNull(),
    kind: loanKind('kind').notNull(),
    status: loanStatus('status').notNull().default('pending'),
    /** { principal, installment } as encrypted JSON. */
    amountsEnc: text('amounts_enc').notNull(),
    /** The first month repaid, e.g. "2026-11". */
    startMonth: text('start_month').notNull(),
    reason: text('reason').notNull(),
    requestedBy: uuid('requested_by'),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('employee_loans_tenant_id_uq').on(t.tenantId, t.id),
    index('employee_loans_employee_idx').on(t.tenantId, t.employeeId),
    employeeFk('employee_loans_employee_fk', t),
  ],
);

/** A repayment, from a run (on locking) or paid in directly. */
export const loanRepayments = pgTable(
  'loan_repayments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    loanId: uuid('loan_id').notNull(),
    runId: uuid('run_id'),
    date: isoDate('date').notNull(),
    amountEnc: text('amount_enc').notNull(),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    index('loan_repayments_loan_idx').on(t.tenantId, t.loanId),
    foreignKey({
      name: 'loan_repayments_loan_fk',
      columns: [t.tenantId, t.loanId],
      foreignColumns: [employeeLoans.tenantId, employeeLoans.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'loan_repayments_run_fk',
      columns: [t.tenantId, t.runId],
      foreignColumns: [payrollRuns.tenantId, payrollRuns.id],
    }),
  ],
);

/** Pay changes for many people decided at once, such as the annual increment. */
export const payBatches = pgTable(
  'pay_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    effectiveFrom: isoDate('effective_from').notNull(),
    basis: incrementBasis('basis').notNull(),
    /** The increment in percent, e.g. 5.00. */
    percent: numeric('percent', { precision: 6, scale: 2 }).notNull(),
    status: payBatchStatus('status').notNull().default('pending'),
    people: integer('people').notNull().default(0),
    reason: text('reason').notNull(),
    requestedBy: uuid('requested_by'),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('pay_batches_tenant_id_uq').on(t.tenantId, t.id),
    // One batch waiting at a time keeps people from being in two.
    uniqueIndex('pay_batches_pending_uq')
      .on(t.tenantId)
      .where(sql`${t.status} = 'pending'`),
  ],
);
