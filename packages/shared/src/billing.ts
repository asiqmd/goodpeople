import { z } from 'zod';
import { PLAN_CODES, type BillingMode, type PlanCode, type SubscriptionStatus } from './catalog.js';
import { moneySchema } from './payroll-schemas.js';

// Billing what Good People sells: a price per employee per month, invoiced monthly in arrears
// as a VAT invoice (Mushak 6.3), paid by card, bKash, bank transfer or cheque, less what
// customers withhold at source.

/** VAT service codes a subscription may be supplied under (NBR has not ruled for SaaS). */
export const VAT_SERVICE_CODES = ['S099.10', 'S099.20'] as const;
export type VatServiceCode = (typeof VAT_SERVICE_CODES)[number];

/** Plans a workspace chooses for itself; Enterprise is agreed with us. */
export const SELF_SERVE_PLANS = [
  'starter',
  'growth',
  'business',
] as const satisfies readonly PlanCode[];
export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

export const INVOICE_KINDS = ['invoice', 'credit_note'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_STATUSES = ['open', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** What settles an invoice: money received, or tax the customer withheld and certified. */
export const SETTLEMENT_KINDS = ['payment', 'vds', 'tds'] as const;
export type SettlementKind = (typeof SETTLEMENT_KINDS)[number];
export const SETTLEMENT_STATUSES = ['pending', 'succeeded', 'failed', 'rejected'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];
export const INVOICE_PAYMENT_METHODS = [
  'sslcommerz',
  'bkash',
  'bank_transfer',
  'cheque',
  'fake',
] as const;
export type InvoicePaymentMethod = (typeof INVOICE_PAYMENT_METHODS)[number];
export const ONLINE_METHODS = ['sslcommerz', 'bkash', 'fake'] as const;
export type OnlineMethod = (typeof ONLINE_METHODS)[number];

const isoDate = z.iso.date();
const positive = moneySchema.refine((v) => Number(v) > 0, 'Enter more than zero');
const percent = z.coerce.number().min(0).max(100);

// ── Platform settings ────────────────────────────────────────────────────────

export const billingSettingsSchema = z.object({
  supplierName: z.string().trim().min(2).max(200),
  supplierAddress: z.string().trim().min(5).max(400),
  bin: z
    .string()
    .trim()
    .regex(/^\d{9,13}(-\d{4})?$/, 'Use the 9 or 13 digit BIN'),
  tin: z
    .string()
    .trim()
    .regex(/^\d{12}$/, 'Use the 12 digit TIN')
    .nullable()
    .optional(),
  serviceCode: z.enum(VAT_SERVICE_CODES),
  /** Registered with NBR as a startup: no VAT and no VAT withheld (SRO 147-Ain/2026). */
  startupExempt: z.boolean(),
  dueDays: z.coerce.number().int().min(1).max(60),
  graceDays: z.coerce.number().int().min(0).max(60),
  bankDetails: z.string().trim().min(10).max(600),
});
export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;

export const planPriceSchema = z.object({
  planCode: z.enum(PLAN_CODES),
  /** Per staff employee per month, and the lower price per worker (factory floor). */
  staffSeat: positive,
  workerSeat: positive,
  /** The least a month costs, whatever the headcount. */
  minimum: moneySchema,
  effectiveFrom: isoDate,
});
export type PlanPriceInput = z.infer<typeof planPriceSchema>;

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{4,30}$/, 'Use 4–30 letters, digits or dashes'),
    percentOff: percent.nullable().optional(),
    amountOff: moneySchema.nullable().optional(),
    /** Months it applies for; none means every month. */
    months: z.coerce.number().int().min(1).max(36).nullable().optional(),
    maxRedemptions: z.coerce.number().int().min(1).nullable().optional(),
    validUntil: isoDate.nullable().optional(),
  })
  .refine((c) => Boolean(c.percentOff) !== Boolean(c.amountOff), {
    path: ['percentOff'],
    message: 'Give a percentage or an amount off, not both',
  });
export type CouponInput = z.infer<typeof couponSchema>;

export const partnerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.email(),
  address: z.string().trim().min(5).max(400),
  bin: z.string().trim().max(20).nullable().optional(),
  /** Off our price for the workspaces they bring and look after. */
  discountPercent: percent,
});
export type PartnerInput = z.infer<typeof partnerSchema>;

export const partnerAssignSchema = z.object({
  partnerId: z.uuid().nullable(),
  reason: z.string().trim().min(5).max(500),
});

// ── Workspace actions ────────────────────────────────────────────────────────

export const choosePlanSchema = z.object({
  planCode: z.enum(SELF_SERVE_PLANS),
  couponCode: z.string().trim().max(30).optional(),
  /** Who the invoices are addressed to; defaults to the workspace's first company. */
  buyerName: z.string().trim().min(2).max(200),
  buyerAddress: z.string().trim().min(5).max(400),
  buyerBin: z.string().trim().max(20).optional(),
});
export type ChoosePlanInput = z.infer<typeof choosePlanSchema>;

export const payStartSchema = z.object({ method: z.enum(ONLINE_METHODS) });

/** Tax the customer withheld, with its certificate (VDS: Mushak 6.6). */
export const deductionSchema = z.object({
  kind: z.enum(['vds', 'tds']),
  amount: positive,
  certificateNo: z.string().trim().min(2).max(60),
  certificateDate: isoDate,
});
export type DeductionInput = z.infer<typeof deductionSchema>;

// ── Platform actions ─────────────────────────────────────────────────────────

export const manualPaymentSchema = z.object({
  method: z.enum(['bank_transfer', 'cheque']),
  amount: positive,
  reference: z.string().trim().min(2).max(120),
  receivedOn: isoDate,
});
export type ManualPaymentInput = z.infer<typeof manualPaymentSchema>;

export const creditNoteSchema = z.object({
  /** Value before VAT being credited. */
  amount: positive,
  reason: z.string().trim().min(5).max(300),
});
export type CreditNoteInput = z.infer<typeof creditNoteSchema>;

/** Finance accepts a withholding certificate once checked, or rejects it. */
export const deductionReviewSchema = z.object({
  accept: z.boolean(),
  reason: z.string().trim().min(3).max(300),
});

export const invoiceListQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  kind: z.enum(INVOICE_KINDS).optional(),
  tenantId: z.uuid().optional(),
  partnerId: z.uuid().optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const issueInvoicesSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10'),
});

// ── Views ────────────────────────────────────────────────────────────────────

export interface Party {
  name: string;
  address: string;
  bin: string | null;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
}

export interface SettlementView {
  id: string;
  kind: SettlementKind;
  method: InvoicePaymentMethod | null;
  status: SettlementStatus;
  amount: string;
  reference: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface InvoiceView {
  id: string;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  tenant: { id: string; name: string; slug: string } | null;
  partner: { id: string; name: string } | null;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  dueDate: string | null;
  supplier: Party;
  buyer: Party;
  lines: InvoiceLine[];
  subtotal: string;
  discount: string;
  /** Value before VAT. */
  taxable: string;
  serviceCode: VatServiceCode;
  vatRate: string;
  vat: string;
  total: string;
  /** What is still owed after payments, withholding and credit notes. */
  balance: string;
  /** For a credit note, the invoice it adjusts and why. */
  credits: { id: string; number: string } | null;
  reason: string | null;
  settlements: SettlementView[];
}

export interface PlanPriceView {
  id: string;
  planCode: PlanCode;
  staffSeat: string;
  workerSeat: string;
  minimum: string;
  effectiveFrom: string;
}

export interface BillingSettingsView extends BillingSettingsInput {
  tin: string | null;
  updatedAt: string | null;
}

export interface SeatCount {
  staff: number;
  workers: number;
}

/** A workspace's billing as its admins see it. */
export interface BillingOverview {
  billingMode: BillingMode;
  planCode: PlanCode;
  trialEndsAt: string | null;
  subscription: {
    status: SubscriptionStatus;
    paidThrough: string;
    startedOn: string | null;
    cancelAt: string | null;
  } | null;
  /** This month's people so far, and what they would cost under each self-serve plan. */
  seats: SeatCount;
  quotes: { planCode: SelfServePlan; price: PlanPriceView | null; estimate: string | null }[];
  coupon: { code: string; describe: string } | null;
  invoices: InvoiceView[];
  /** Online payment methods this server takes. */
  gateways: OnlineMethod[];
  bankDetails: string | null;
  vat: { serviceCode: VatServiceCode; rate: string; vdsRate: string; exempt: boolean };
  buyer: Party | null;
}

export interface CouponView {
  id: string;
  code: string;
  percentOff: string | null;
  amountOff: string | null;
  months: number | null;
  maxRedemptions: number | null;
  redemptions: number;
  validUntil: string | null;
  active: boolean;
}

export interface PartnerView {
  id: string;
  name: string;
  email: string;
  address: string;
  bin: string | null;
  discountPercent: string;
  tenants: { id: string; name: string; slug: string }[];
}

/** What a bank statement upload matched, by invoice number in the narration. */
export interface StatementMatchView {
  rows: number;
  recorded: { invoiceNumber: string; amount: string; reference: string }[];
  unmatched: { date: string; amount: string; narration: string }[];
}

/** The platform's billing at a glance. */
export interface BillingSummary {
  open: number;
  overdue: number;
  outstanding: string;
  /** Invoiced over the last full month. */
  lastMonth: string;
  paidTenants: number;
  trialTenants: number;
}
