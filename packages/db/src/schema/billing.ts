import type {
  InvoiceKind,
  InvoiceLine,
  InvoicePaymentMethod,
  InvoiceStatus,
  Party,
  SettlementKind,
  SettlementStatus,
  VatServiceCode,
} from '@gp/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { partners, planCode, platformUsers, tenants } from './platform.js';

// Billing for Good People's own subscriptions. Platform tables like `subscriptions`: they are
// about workspaces but hold no workspace data, so they have no row-level security, and the
// billing module filters every workspace-facing read by the signed-in workspace.

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => timestamptz('created_at').notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: 'string' });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/** Who we are on invoices, VAT, terms and where bank transfers go. One row. */
export const billingSettings = pgTable(
  'billing_settings',
  {
    id: integer('id').primaryKey().default(1),
    supplierName: text('supplier_name').notNull(),
    supplierAddress: text('supplier_address').notNull(),
    bin: text('bin').notNull(),
    tin: text('tin'),
    serviceCode: text('service_code').$type<VatServiceCode>().notNull().default('S099.10'),
    startupExempt: boolean('startup_exempt').notNull().default(false),
    dueDays: integer('due_days').notNull().default(10),
    graceDays: integer('grace_days').notNull().default(7),
    bankDetails: text('bank_details').notNull(),
    updatedBy: uuid('updated_by').references(() => platformUsers.id),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('billing_settings_one_row', sql`${t.id} = 1`)],
);

/** A plan's price from a date: per staff seat, per worker seat, and the least a month costs. */
export const planPrices = pgTable(
  'plan_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planCode: planCode('plan_code').notNull(),
    staffSeat: numeric('staff_seat', { precision: 10, scale: 2 }).notNull(),
    workerSeat: numeric('worker_seat', { precision: 10, scale: 2 }).notNull(),
    minimum: money('minimum').notNull().default('0'),
    effectiveFrom: isoDate('effective_from').notNull(),
    createdBy: uuid('created_by').references(() => platformUsers.id),
    createdAt: createdAt(),
  },
  (t) => [unique('plan_prices_plan_from_uq').on(t.planCode, t.effectiveFrom)],
);

export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  percentOff: numeric('percent_off', { precision: 5, scale: 2 }),
  amountOff: money('amount_off'),
  /** Months it applies for; null means every month. */
  months: integer('months'),
  maxRedemptions: integer('max_redemptions'),
  validUntil: isoDate('valid_until'),
  active: boolean('active').notNull().default(true),
  createdBy: uuid('created_by').references(() => platformUsers.id),
  createdAt: createdAt(),
});

/** A workspace's coupon and how many months of it have been used. One at a time. */
export const couponRedemptions = pgTable('coupon_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  couponId: uuid('coupon_id')
    .notNull()
    .references(() => coupons.id),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  monthsUsed: integer('months_used').notNull().default(0),
  redeemedAt: createdAt(),
});

/** The last serial used, per fiscal year and kind: invoices and credit notes run separately. */
export const invoiceCounters = pgTable(
  'invoice_counters',
  {
    fiscalYear: text('fiscal_year').notNull(),
    kind: text('kind').$type<InvoiceKind>().notNull(),
    last: integer('last').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.fiscalYear, t.kind] })],
);

/**
 * A VAT invoice (Mushak 6.3) or credit note (6.7). The parties and lines are snapshots: an
 * issued invoice never changes, apart from its status as it is paid.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    kind: text('kind').$type<InvoiceKind>().notNull(),
    status: text('status').$type<InvoiceStatus>().notNull().default('open'),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    partnerId: uuid('partner_id').references(() => partners.id),
    periodStart: isoDate('period_start'),
    periodEnd: isoDate('period_end'),
    /** The date and time of issue, both of which Mushak 6.3 shows. */
    issuedAt: timestamptz('issued_at').notNull().defaultNow(),
    dueDate: isoDate('due_date'),
    supplier: jsonb('supplier').$type<Party>().notNull(),
    buyer: jsonb('buyer').$type<Party>().notNull(),
    lines: jsonb('lines').$type<InvoiceLine[]>().notNull(),
    subtotal: money('subtotal').notNull(),
    discount: money('discount').notNull().default('0'),
    taxable: money('taxable').notNull(),
    serviceCode: text('service_code').$type<VatServiceCode>().notNull(),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull(),
    vat: money('vat').notNull(),
    total: money('total').notNull(),
    /** A credit note's invoice, and why it was issued. */
    creditsInvoiceId: uuid('credits_invoice_id'),
    reason: text('reason'),
    paidAt: timestamptz('paid_at'),
    createdBy: uuid('created_by').references(() => platformUsers.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('invoices_tenant_idx').on(t.tenantId, t.issuedAt),
    // One invoice per workspace (or partner) per month, unless it was voided.
    uniqueIndex('invoices_tenant_period_uq')
      .on(t.tenantId, t.periodStart)
      .where(sql`${t.kind} = 'invoice' and ${t.status} <> 'void' and ${t.tenantId} is not null`),
    uniqueIndex('invoices_partner_period_uq')
      .on(t.partnerId, t.periodStart)
      .where(sql`${t.kind} = 'invoice' and ${t.status} <> 'void' and ${t.partnerId} is not null`),
  ],
);

/** What settles an invoice: a payment (online or recorded) or tax withheld with its certificate. */
export const invoiceSettlements = pgTable(
  'invoice_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    kind: text('kind').$type<SettlementKind>().notNull(),
    method: text('method').$type<InvoicePaymentMethod>(),
    status: text('status').$type<SettlementStatus>().notNull(),
    amount: money('amount').notNull(),
    /** A cheque or bank reference, or a withholding certificate's number and date. */
    reference: text('reference'),
    /** The gateway's id for the checkout, then its transaction reference. */
    providerRef: text('provider_ref'),
    raw: jsonb('raw'),
    recordedBy: uuid('recorded_by').references(() => platformUsers.id),
    /** A workspace user who recorded a deduction (no foreign key: their table is per workspace). */
    recordedByUser: uuid('recorded_by_user'),
    createdAt: createdAt(),
    settledAt: timestamptz('settled_at'),
  },
  (t) => [index('invoice_settlements_invoice_idx').on(t.invoiceId)],
);
