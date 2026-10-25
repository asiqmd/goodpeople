import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { bdVatFor } from '@gp/country-packs';
import {
  billingSettings,
  couponRedemptions,
  coupons,
  employees,
  invoiceCounters,
  invoices,
  invoiceSettlements,
  legalEntities,
  partners,
  planPrices,
  plans,
  runAsTenant,
  subscriptions,
  tenants,
  type Database,
  type Tx,
} from '@gp/db';
import {
  addDays,
  Decimal,
  fiscalYearOf,
  formatAddress,
  money,
  PLAN_CATALOG,
  SELF_SERVE_PLANS,
  todayIn,
  type BillingOverview,
  type BillingSettingsInput,
  type BillingSettingsView,
  type BillingSummary,
  type ChoosePlanInput,
  type CouponInput,
  type CouponView,
  type CreditNoteInput,
  type InvoiceKind,
  type InvoiceListQuery,
  type InvoiceView,
  type Party,
  type PartnerInput,
  type PartnerView,
  type PlanCode,
  type PlanPriceInput,
  type PlanPriceView,
  type SeatCount,
  type TenantWithAccess,
} from '@gp/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { AuthUser, PlatformUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { runInTenantContext } from '../../common/request-context.js';
import { DB, TenantDb } from '../../db/db.module.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService, usersWith } from '../notifications/notifications.service.js';
import { PdfService } from '../letters/pdf.service.js';
import { jobsOn } from '../payroll/run-context.js';
import { balanceOf, monthBounds, quoteMonth, withVat, type CouponTerms } from './billing-math.js';
import { GATEWAYS, type PaymentGateway, type GatewayMethod } from './gateways/index.js';
import { invoiceFileName, invoiceHtml } from './invoice-pdf.js';

type InvoiceRow = typeof invoices.$inferSelect;
type SettingsRow = typeof billingSettings.$inferSelect;

/** The end of a day in Dhaka, as an instant: access stays full through the whole day. */
export const endOfDay = (date: string) => new Date(`${date}T23:59:59.999+06:00`);
const planName = (code: PlanCode) => PLAN_CATALOG.find((p) => p.code === code)!.name;
const monthOf = (date: string) => date.slice(0, 7);
const previousMonth = (month: string) => monthOf(addDays(`${month}-01`, -1));

/**
 * Good People's own billing: what each plan costs per seat, the plan a workspace chooses, its
 * monthly VAT invoice in arrears, credit notes, and the subscription that access follows. The
 * subscription is paid through the due date of the oldest unpaid invoice; Phase 0's access rules
 * then give a grace period and make the workspace read-only.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GATEWAYS) private readonly gateways: Map<GatewayMethod, PaymentGateway>,
    private readonly tenantDb: TenantDb,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly pdf: PdfService,
  ) {}

  // ── Settings, prices, coupons and partners (platform) ──────────────────────

  async settings(): Promise<BillingSettingsView | null> {
    const row = await settingsOf(this.db);
    return row ? settingsView(row) : null;
  }

  async saveSettings(
    actor: PlatformUser,
    input: BillingSettingsInput,
  ): Promise<BillingSettingsView> {
    const values = { ...input, tin: input.tin ?? null, updatedBy: actor.id, updatedAt: new Date() };
    await this.db.transaction(async (tx) => {
      await tx
        .insert(billingSettings)
        .values({ id: 1, ...values })
        .onConflictDoUpdate({ target: billingSettings.id, set: values });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'billing.settings',
        tenantId: null,
        reason: 'Billing settings',
        after: { ...input, bankDetails: undefined },
      });
    });
    return (await this.settings())!;
  }

  async prices(): Promise<PlanPriceView[]> {
    const rows = await this.db
      .select()
      .from(planPrices)
      .orderBy(asc(planPrices.planCode), desc(planPrices.effectiveFrom));
    return rows.map(priceView);
  }

  async addPrice(actor: PlatformUser, input: PlanPriceInput): Promise<PlanPriceView> {
    const [row] = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(planPrices)
        .values({ ...input, createdBy: actor.id })
        .onConflictDoUpdate({
          target: [planPrices.planCode, planPrices.effectiveFrom],
          set: { staffSeat: input.staffSeat, workerSeat: input.workerSeat, minimum: input.minimum },
        })
        .returning();
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'billing.price',
        tenantId: null,
        reason: `Price for ${input.planCode} from ${input.effectiveFrom}`,
        after: input,
      });
      return inserted;
    });
    return priceView(row!);
  }

  /** Prices in force today, by plan, for the public pricing page. */
  async currentPrices(): Promise<PlanPriceView[]> {
    const today = todayIn();
    const out: PlanPriceView[] = [];
    for (const plan of PLAN_CATALOG) {
      const price = await priceOn(this.db, plan.code, today);
      if (price) out.push(priceView(price));
    }
    return out;
  }

  async coupons(): Promise<CouponView[]> {
    const rows = await this.db.select().from(coupons).orderBy(desc(coupons.createdAt));
    const counts = await this.db
      .select({ couponId: couponRedemptions.couponId, n: sql<number>`count(*)::int` })
      .from(couponRedemptions)
      .groupBy(couponRedemptions.couponId);
    const used = new Map(counts.map((c) => [c.couponId, c.n]));
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      percentOff: c.percentOff,
      amountOff: c.amountOff,
      months: c.months,
      maxRedemptions: c.maxRedemptions,
      redemptions: used.get(c.id) ?? 0,
      validUntil: c.validUntil,
      active: c.active,
    }));
  }

  async addCoupon(actor: PlatformUser, input: CouponInput): Promise<CouponView> {
    const [taken] = await this.db.select().from(coupons).where(eq(coupons.code, input.code));
    if (taken) throw conflict('coupon_exists', `The coupon ${input.code} exists`);
    await this.db.transaction(async (tx) => {
      await tx.insert(coupons).values({
        code: input.code,
        percentOff: input.percentOff ? String(input.percentOff) : null,
        amountOff: input.amountOff ?? null,
        months: input.months ?? null,
        maxRedemptions: input.maxRedemptions ?? null,
        validUntil: input.validUntil ?? null,
        createdBy: actor.id,
      });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'billing.coupon',
        tenantId: null,
        reason: `Coupon ${input.code}`,
        after: input,
      });
    });
    return (await this.coupons()).find((c) => c.code === input.code)!;
  }

  async partners(): Promise<PartnerView[]> {
    const rows = await this.db.select().from(partners).orderBy(asc(partners.name));
    const theirs = rows.length
      ? await this.db
          .select({
            id: tenants.id,
            name: tenants.name,
            slug: tenants.slug,
            partnerId: tenants.partnerId,
          })
          .from(tenants)
          .where(
            inArray(
              tenants.partnerId,
              rows.map((p) => p.id),
            ),
          )
      : [];
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      address: p.address,
      bin: p.bin,
      discountPercent: p.discountPercent,
      tenants: theirs
        .filter((t) => t.partnerId === p.id)
        .map(({ id, name, slug }) => ({ id, name, slug })),
    }));
  }

  async addPartner(actor: PlatformUser, input: PartnerInput): Promise<PartnerView> {
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(partners)
        .values({
          ...input,
          bin: input.bin ?? null,
          discountPercent: String(input.discountPercent),
        })
        .returning({ id: partners.id });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'billing.partner',
        tenantId: null,
        reason: `Partner ${input.name}`,
        after: input,
      });
      return row!.id;
    });
    return (await this.partners()).find((p) => p.id === id)!;
  }

  /** Puts a workspace with a partner (billed to them), or takes it back. */
  async assignPartner(
    actor: PlatformUser,
    tenantId: string,
    partnerId: string | null,
    reason: string,
  ) {
    await this.db.transaction(async (tx) => {
      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
      if (!tenant) throw new NotFoundException('Workspace not found');
      await tx
        .update(tenants)
        .set({
          partnerId,
          ...(partnerId ? { billingMode: 'partner' as const, accessExpiresAt: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'tenant.partner',
        tenantId,
        reason,
        before: { partnerId: tenant.partnerId, billingMode: tenant.billingMode },
        after: { partnerId },
      });
    });
  }

  // ── A workspace's billing ──────────────────────────────────────────────────

  async overview(tenant: TenantWithAccess): Promise<BillingOverview> {
    const today = todayIn();
    const [sub] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenant.id));
    const settings = await settingsOf(this.db);
    const seats = await seatsOf(this.db, tenant.id, `${monthOf(today)}-01`, today);
    const vat = settings
      ? bdVatFor(settings.serviceCode, today, { startup: settings.startupExempt })
      : null;
    const redemption = await this.redemptionOf(tenant.id);
    const quotes = [];
    for (const code of SELF_SERVE_PLANS) {
      const price = await priceOn(this.db, code, today);
      quotes.push({
        planCode: code,
        price: price ? priceView(price) : null,
        estimate: price
          ? quoteMonth({
              planName: planName(code),
              seats,
              price,
              month: monthOf(today),
              coupon: redemption?.terms ?? null,
              vatRate: vat?.rate ?? 0,
            }).total
          : null,
      });
    }
    return {
      billingMode: tenant.billingMode,
      planCode: tenant.planCode,
      trialEndsAt: tenant.billingMode === 'trial' ? tenant.accessExpiresAt : null,
      subscription: sub
        ? {
            status: sub.status,
            paidThrough: sub.currentPeriodEnd.toISOString(),
            startedOn: sub.startedOn,
            cancelAt: sub.cancelAt,
          }
        : null,
      seats,
      quotes,
      coupon: redemption ? { code: redemption.terms.code, describe: redemption.describe } : null,
      invoices: await this.invoiceViews(eq(invoices.tenantId, tenant.id)),
      gateways: [...this.gateways.keys()],
      bankDetails: settings?.bankDetails ?? null,
      vat: {
        serviceCode: settings?.serviceCode ?? 'S099.10',
        rate: String(vat?.rate ?? 0),
        vdsRate: String(vat?.vdsRate ?? 0),
        exempt: vat?.exempt ?? false,
      },
      buyer: sub?.buyer ?? (await this.defaultBuyer(tenant.id)),
    };
  }

  /**
   * A workspace chooses (or changes) its plan: a trial becomes paid from today, billed monthly
   * in arrears from today, with the coupon if one is given.
   */
  async choosePlan(user: AuthUser, tenant: TenantWithAccess, input: ChoosePlanInput) {
    if (tenant.billingMode !== 'trial' && tenant.billingMode !== 'paid') {
      throw conflict('billing_bypassed', 'This workspace is not billed by Good People');
    }
    const today = todayIn();
    const settings = await requireSettings(this.db);
    if (!(await priceOn(this.db, input.planCode, today))) {
      throw conflict('no_price', 'This plan has no price yet; contact us');
    }
    const [plan] = await this.db.select().from(plans).where(eq(plans.code, input.planCode));
    const buyer: Party = {
      name: input.buyerName,
      address: input.buyerAddress,
      bin: input.buyerBin || null,
    };
    await this.db.transaction(async (tx) => {
      if (input.couponCode) await this.redeem(tx, tenant.id, input.couponCode, today);
      await tx
        .update(tenants)
        .set({
          billingMode: 'paid',
          planId: plan!.id,
          accessExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenant.id));
      const [existing] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenant.id));
      if (existing) {
        await tx
          .update(subscriptions)
          .set({
            buyer,
            cancelAt: null,
            status: existing.status === 'canceled' ? 'active' : existing.status,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.tenantId, tenant.id));
      } else {
        await tx.insert(subscriptions).values({
          tenantId: tenant.id,
          provider: 'goodpeople',
          status: 'active',
          currentPeriodEnd: endOfDay(addDays(monthBounds(monthOf(today)).end, settings.dueDays)),
          graceDays: settings.graceDays,
          startedOn: today,
          buyer,
        });
      }
      await this.audit.record(tx, {
        actorId: null,
        action: 'tenant.plan',
        tenantId: tenant.id,
        reason: `Chose ${input.planCode} in the workspace`,
        before: { billingMode: tenant.billingMode, planCode: tenant.planCode },
        after: {
          billingMode: 'paid',
          planCode: input.planCode,
          by: user.id,
          coupon: input.couponCode ?? null,
        },
      });
    });
  }

  /** Stops at the end of this month: that month is the last invoiced, then read-only. */
  async cancel(tenant: TenantWithAccess) {
    const [sub] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenant.id));
    if (!sub || tenant.billingMode !== 'paid')
      throw conflict('no_subscription', 'There is no plan to cancel');
    const cancelAt = monthBounds(monthOf(todayIn())).end;
    await this.db.transaction(async (tx) => {
      await tx
        .update(subscriptions)
        .set({ cancelAt, updatedAt: new Date() })
        .where(eq(subscriptions.tenantId, tenant.id));
      await this.audit.record(tx, {
        actorId: null,
        action: 'tenant.cancel',
        tenantId: tenant.id,
        reason: 'Cancelled in the workspace',
        after: { cancelAt },
      });
    });
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  /**
   * Every paid workspace's and partner's invoice for a month. Ones already issued are kept and
   * not counted, so running a month again is safe.
   */
  async issueMonth(month: string, actor: PlatformUser | null = null, today = todayIn()) {
    if (month >= monthOf(today)) {
      throw badRequest('month_not_over', 'A month is invoiced once it has ended');
    }
    const paid = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .innerJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
      .where(and(eq(tenants.billingMode, 'paid'), eq(subscriptions.provider, 'goodpeople')));
    let issued = 0;
    for (const t of paid) if (await this.issueFor(t.id, month, actor)) issued += 1;
    for (const p of await this.db.select({ id: partners.id }).from(partners)) {
      if (await this.issueForPartner(p.id, month, actor)) issued += 1;
    }
    return { month, issued };
  }

  /**
   * A workspace's invoice for a month: its seats at its plan's price, the coupon, then VAT.
   * Null when there is nothing to issue, including when the month was issued before.
   */
  async issueFor(
    tenantId: string,
    month: string,
    actor: PlatformUser | null = null,
  ): Promise<InvoiceRow | null> {
    const { start, end } = monthBounds(month);
    const [row] = await this.db
      .select({ tenant: tenants, plan: plans.code, sub: subscriptions })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .innerJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId));
    if (!row || row.tenant.billingMode !== 'paid') return null;
    const { tenant, sub } = row;
    if (!sub.startedOn || sub.startedOn > end || (sub.cancelAt && sub.cancelAt < start))
      return null;
    const [existing] = await this.db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.periodStart, start),
          eq(invoices.kind, 'invoice'),
          ne(invoices.status, 'void'),
        ),
      );
    if (existing) return null;
    const settings = await requireSettings(this.db);
    const price = await priceOn(this.db, row.plan, sub.startedOn > start ? sub.startedOn : start);
    if (!price) throw conflict('no_price', `The ${row.plan} plan has no price for ${month}`);
    const issuedOn = todayIn();
    const vat = bdVatFor(settings.serviceCode, issuedOn, { startup: settings.startupExempt });
    const redemption = await this.redemptionOf(tenantId);
    const quote = quoteMonth({
      planName: planName(row.plan),
      seats: await seatsOf(this.db, tenantId, sub.startedOn > start ? sub.startedOn : start, end),
      price,
      month,
      fromDay: sub.startedOn > start ? Number(sub.startedOn.slice(8, 10)) : undefined,
      coupon: redemption?.terms ?? null,
      vatRate: vat.rate,
    });
    const invoice = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(invoices)
        .values({
          number: await nextNumber(tx, 'invoice', issuedOn),
          kind: 'invoice',
          tenantId,
          periodStart: start,
          periodEnd: end,
          dueDate: addDays(issuedOn, settings.dueDays),
          supplier: supplierOf(settings),
          buyer: sub.buyer ??
            (await this.defaultBuyer(tenantId)) ?? { name: tenant.name, address: '', bin: null },
          ...quote,
          serviceCode: settings.serviceCode,
          vatRate: String(vat.rate),
          createdBy: actor?.id ?? null,
        })
        .returning();
      if (redemption && Number(quote.discount) > 0) {
        await tx
          .update(couponRedemptions)
          .set({ monthsUsed: sql`${couponRedemptions.monthsUsed} + 1` })
          .where(eq(couponRedemptions.tenantId, tenantId));
      }
      // A cancelled plan ends with the month it was cancelled in.
      if (sub.cancelAt && sub.cancelAt <= end) {
        await tx
          .update(subscriptions)
          .set({ status: 'canceled' })
          .where(eq(subscriptions.tenantId, tenantId));
      }
      await syncSubscription(tx, tenantId, settings);
      return created!;
    });
    await this.notify(
      tenantId,
      'billing.invoice_issued',
      invoiceValues(invoice),
      `billing.invoice_issued:${invoice.id}`,
    );
    this.logger.log(`Invoice ${invoice.number} for ${tenant.slug}, ${month}: ${invoice.total}`);
    return invoice;
  }

  /** A partner's workspaces for a month, on one invoice at the partner's discount (null as above). */
  async issueForPartner(
    partnerId: string,
    month: string,
    actor: PlatformUser | null = null,
  ): Promise<InvoiceRow | null> {
    const { start, end } = monthBounds(month);
    const [partner] = await this.db.select().from(partners).where(eq(partners.id, partnerId));
    if (!partner) return null;
    const theirs = await this.db
      .select({ tenant: tenants, plan: plans.code })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .where(and(eq(tenants.partnerId, partnerId), eq(tenants.billingMode, 'partner')));
    if (theirs.length === 0) return null;
    const [existing] = await this.db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.partnerId, partnerId),
          eq(invoices.periodStart, start),
          eq(invoices.kind, 'invoice'),
          ne(invoices.status, 'void'),
        ),
      );
    if (existing) return null;
    const settings = await requireSettings(this.db);
    const issuedOn = todayIn();
    const vat = bdVatFor(settings.serviceCode, issuedOn, { startup: settings.startupExempt });
    const lines = [];
    let subtotal = new Decimal(0);
    for (const { tenant, plan } of theirs) {
      const price = await priceOn(this.db, plan, start);
      if (!price) throw conflict('no_price', `The ${plan} plan has no price for ${month}`);
      const q = quoteMonth({
        planName: `${tenant.name} (${planName(plan)})`,
        seats: await seatsOf(this.db, tenant.id, start, end),
        price,
        month,
        vatRate: 0,
      });
      lines.push(...q.lines);
      subtotal = subtotal.plus(q.subtotal);
    }
    const discount = subtotal
      .times(partner.discountPercent)
      .dividedBy(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const quote = withVat(lines, subtotal, discount, vat.rate);
    const [invoice] = await this.db.transaction(async (tx) =>
      tx
        .insert(invoices)
        .values({
          number: await nextNumber(tx, 'invoice', issuedOn),
          kind: 'invoice',
          partnerId,
          periodStart: start,
          periodEnd: end,
          dueDate: addDays(issuedOn, settings.dueDays),
          supplier: supplierOf(settings),
          buyer: { name: partner.name, address: partner.address, bin: partner.bin },
          ...quote,
          serviceCode: settings.serviceCode,
          vatRate: String(vat.rate),
          createdBy: actor?.id ?? null,
        })
        .returning(),
    );
    return invoice!;
  }

  /** A credit note (Mushak 6.7) against an invoice, for value before VAT, at its VAT rate. */
  async creditNote(
    actor: PlatformUser,
    invoiceId: string,
    input: CreditNoteInput,
  ): Promise<InvoiceView> {
    const [invoice] = await this.db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!invoice || invoice.kind !== 'invoice' || invoice.status === 'void') {
      throw new NotFoundException('Invoice not found');
    }
    const credited = await this.db
      .select({ taxable: invoices.taxable })
      .from(invoices)
      .where(and(eq(invoices.creditsInvoiceId, invoiceId), eq(invoices.kind, 'credit_note')));
    const left = new Decimal(invoice.taxable).minus(
      credited.reduce((s, c) => s.plus(c.taxable), new Decimal(0)),
    );
    if (new Decimal(input.amount).greaterThan(left)) {
      throw badRequest('credit_too_large', `At most ${money(left)} can still be credited`);
    }
    const settings = await requireSettings(this.db);
    const amount = new Decimal(input.amount);
    const quote = withVat(
      [
        {
          description: `Credit against ${invoice.number}: ${input.reason}`,
          quantity: 1,
          unitPrice: money(amount),
          amount: money(amount),
        },
      ],
      amount,
      new Decimal(0),
      Number(invoice.vatRate),
    );
    const id = await this.db.transaction(async (tx) => {
      const [note] = await tx
        .insert(invoices)
        .values({
          number: await nextNumber(tx, 'credit_note', todayIn()),
          kind: 'credit_note',
          status: 'paid',
          tenantId: invoice.tenantId,
          partnerId: invoice.partnerId,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          supplier: supplierOf(settings),
          buyer: invoice.buyer,
          ...quote,
          serviceCode: invoice.serviceCode,
          vatRate: invoice.vatRate,
          creditsInvoiceId: invoiceId,
          reason: input.reason,
          createdBy: actor.id,
        })
        .returning({ id: invoices.id });
      await settleInvoice(tx, invoiceId);
      if (invoice.tenantId) await syncSubscription(tx, invoice.tenantId, settings);
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'billing.credit_note',
        tenantId: invoice.tenantId,
        reason: input.reason,
        after: { invoice: invoice.number, amount: input.amount },
      });
      return note!.id;
    });
    return (await this.invoiceViews(eq(invoices.id, id)))[0]!;
  }

  /** The platform's invoice list, filtered. */
  list(query: InvoiceListQuery): Promise<InvoiceView[]> {
    const where = [
      query.status && eq(invoices.status, query.status),
      query.kind && eq(invoices.kind, query.kind),
      query.tenantId && eq(invoices.tenantId, query.tenantId),
      query.partnerId && eq(invoices.partnerId, query.partnerId),
    ].filter((c): c is SQL => Boolean(c));
    return this.invoiceViews(where.length ? and(...where) : undefined);
  }

  /** Invoices and credit notes, newest first, with what settled them. */
  async invoiceViews(where?: SQL): Promise<InvoiceView[]> {
    const rows = await this.db
      .select({
        invoice: invoices,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        partnerName: partners.name,
      })
      .from(invoices)
      .leftJoin(tenants, eq(tenants.id, invoices.tenantId))
      .leftJoin(partners, eq(partners.id, invoices.partnerId))
      .where(where)
      .orderBy(desc(invoices.issuedAt))
      .limit(500);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.invoice.id);
    const settlements = await this.db
      .select()
      .from(invoiceSettlements)
      .where(inArray(invoiceSettlements.invoiceId, ids))
      .orderBy(asc(invoiceSettlements.createdAt));
    const notes = await this.db
      .select({
        id: invoices.id,
        number: invoices.number,
        credits: invoices.creditsInvoiceId,
        total: invoices.total,
      })
      .from(invoices)
      .where(and(inArray(invoices.creditsInvoiceId, ids), eq(invoices.kind, 'credit_note')));
    const numbers = new Map<string, string>();
    const creditedIds = rows.flatMap((r) =>
      r.invoice.creditsInvoiceId ? [r.invoice.creditsInvoiceId] : [],
    );
    if (creditedIds.length) {
      for (const r of await this.db
        .select({ id: invoices.id, number: invoices.number })
        .from(invoices)
        .where(inArray(invoices.id, creditedIds))) {
        numbers.set(r.id, r.number);
      }
    }
    return rows.map(({ invoice: i, tenantName, tenantSlug, partnerName }) => {
      const mine = settlements.filter((s) => s.invoiceId === i.id);
      const balance =
        i.kind === 'credit_note'
          ? new Decimal(0)
          : balanceOf(
              i.total,
              mine,
              notes.filter((n) => n.credits === i.id).map((n) => n.total),
            );
      return {
        id: i.id,
        number: i.number,
        kind: i.kind,
        status: i.status,
        tenant:
          i.tenantId && tenantName ? { id: i.tenantId, name: tenantName, slug: tenantSlug! } : null,
        partner: i.partnerId && partnerName ? { id: i.partnerId, name: partnerName } : null,
        periodStart: i.periodStart,
        periodEnd: i.periodEnd,
        issuedAt: i.issuedAt.toISOString(),
        dueDate: i.dueDate,
        supplier: i.supplier,
        buyer: i.buyer,
        lines: i.lines,
        subtotal: i.subtotal,
        discount: i.discount,
        taxable: i.taxable,
        serviceCode: i.serviceCode,
        vatRate: i.vatRate,
        vat: i.vat,
        total: i.total,
        balance: money(Decimal.max(balance, 0)),
        credits: i.creditsInvoiceId
          ? { id: i.creditsInvoiceId, number: numbers.get(i.creditsInvoiceId) ?? '' }
          : null,
        reason: i.reason,
        settlements: mine.map((s) => ({
          id: s.id,
          kind: s.kind,
          method: s.method,
          status: s.status,
          amount: s.amount,
          reference: s.reference,
          createdAt: s.createdAt.toISOString(),
          settledAt: s.settledAt?.toISOString() ?? null,
        })),
      };
    });
  }

  async invoiceFor(id: string, tenantId?: string): Promise<InvoiceView> {
    const [view] = await this.invoiceViews(
      tenantId ? and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)) : eq(invoices.id, id),
    );
    if (!view) throw new NotFoundException('Invoice not found');
    return view;
  }

  /** Mushak-6.3 or 6.7 as a PDF, in English or Bangla. */
  async invoicePdf(id: string, language: 'en' | 'bn', tenantId?: string) {
    const invoice = await this.invoiceFor(id, tenantId);
    const settings = await settingsOf(this.db);
    const bytes = await this.pdf.render(
      invoiceHtml(invoice, language, { bankDetails: settings?.bankDetails ?? null }),
    );
    return { bytes, fileName: invoiceFileName(invoice, language) };
  }

  async summary(): Promise<BillingSummary> {
    const today = todayIn();
    const open = await this.invoiceViews(
      and(eq(invoices.status, 'open'), eq(invoices.kind, 'invoice')),
    );
    const lastMonth = previousMonth(monthOf(today));
    const [invoiced] = await this.db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)::text` })
      .from(invoices)
      .where(
        and(
          eq(invoices.kind, 'invoice'),
          eq(invoices.periodStart, `${lastMonth}-01`),
          ne(invoices.status, 'void'),
        ),
      );
    const counts = await this.db
      .select({ mode: tenants.billingMode, n: sql<number>`count(*)::int` })
      .from(tenants)
      .groupBy(tenants.billingMode);
    return {
      open: open.length,
      overdue: open.filter((i) => i.dueDate && i.dueDate < today).length,
      outstanding: money(open.reduce((s, i) => s.plus(i.balance), new Decimal(0))),
      lastMonth: money(invoiced?.total ?? 0),
      paidTenants: counts.find((c) => c.mode === 'paid')?.n ?? 0,
      trialTenants: counts.find((c) => c.mode === 'trial')?.n ?? 0,
    };
  }

  // ── Shared with payments and jobs ──────────────────────────────────────────

  /** Tells the workspace's billing people (billing.manage), each in their language. */
  async notify(
    tenantId: string,
    event:
      | 'billing.invoice_issued'
      | 'billing.payment_received'
      | 'billing.payment_due'
      | 'trial.ending',
    values: Record<string, { en: string; bn: string }>,
    dedupeKey: string,
  ): Promise<number> {
    try {
      return await runInTenantContext(tenantId, () =>
        this.tenantDb.run(async (tx) =>
          this.notifications.notify(tx, {
            event,
            recipients: await usersWith(tx, 'billing.manage'),
            values,
            link: '/workspace/billing',
            dedupeKey,
          }),
        ),
      );
    } catch (error) {
      this.logger.error(`Billing notice to ${tenantId} failed: ${(error as Error).message}`);
      return 0;
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async redeem(tx: Tx, tenantId: string, code: string, today: string) {
    const [coupon] = await tx
      .select()
      .from(coupons)
      .where(eq(coupons.code, code.trim().toUpperCase()));
    if (!coupon || !coupon.active || (coupon.validUntil && coupon.validUntil < today)) {
      throw badRequest('coupon_invalid', 'This coupon is not valid');
    }
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.couponId, coupon.id))) as [{ n: number }];
    if (coupon.maxRedemptions !== null && n >= coupon.maxRedemptions) {
      throw badRequest('coupon_used_up', 'This coupon has been used up');
    }
    const [mine] = await tx
      .select()
      .from(couponRedemptions)
      .where(eq(couponRedemptions.tenantId, tenantId));
    if (mine) throw conflict('coupon_already', 'This workspace already has a coupon');
    await tx.insert(couponRedemptions).values({ couponId: coupon.id, tenantId });
  }

  /** The workspace's coupon, while it still has months to give. */
  private async redemptionOf(
    tenantId: string,
  ): Promise<{ terms: CouponTerms; describe: string } | null> {
    const [row] = await this.db
      .select({ r: couponRedemptions, c: coupons })
      .from(couponRedemptions)
      .innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
      .where(eq(couponRedemptions.tenantId, tenantId));
    if (!row || (row.c.months !== null && row.r.monthsUsed >= row.c.months)) return null;
    const off = row.c.percentOff ? `${Number(row.c.percentOff)}% off` : `Tk ${row.c.amountOff} off`;
    const left =
      row.c.months === null ? 'every month' : `${row.c.months - row.r.monthsUsed} more month(s)`;
    return {
      terms: { code: row.c.code, percentOff: row.c.percentOff, amountOff: row.c.amountOff },
      describe: `${off}, ${left}`,
    };
  }

  /** The workspace's first company, as the default buyer on its invoices. */
  private async defaultBuyer(tenantId: string): Promise<Party | null> {
    const [entity] = await runAsTenant(this.db, tenantId, (tx) =>
      tx.select().from(legalEntities).orderBy(asc(legalEntities.createdAt)).limit(1),
    );
    return entity
      ? {
          name: entity.legalName ?? entity.name,
          address: entity.address ? formatAddress(entity.address, 'en') : '',
          bin: entity.bin,
        }
      : null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function settingsOf(db: Database | Tx): Promise<SettingsRow | null> {
  const [row] = await db.select().from(billingSettings).where(eq(billingSettings.id, 1));
  return row ?? null;
}

export async function requireSettings(db: Database | Tx): Promise<SettingsRow> {
  const row = await settingsOf(db);
  if (!row) throw conflict('billing_not_set_up', 'Billing is not set up yet');
  return row;
}

const settingsView = (row: SettingsRow): BillingSettingsView => ({
  supplierName: row.supplierName,
  supplierAddress: row.supplierAddress,
  bin: row.bin,
  tin: row.tin,
  serviceCode: row.serviceCode,
  startupExempt: row.startupExempt,
  dueDays: row.dueDays,
  graceDays: row.graceDays,
  bankDetails: row.bankDetails,
  updatedAt: row.updatedAt.toISOString(),
});

const supplierOf = (s: SettingsRow): Party => ({
  name: s.supplierName,
  address: s.supplierAddress,
  bin: s.bin,
});

const priceView = (p: typeof planPrices.$inferSelect): PlanPriceView => ({
  id: p.id,
  planCode: p.planCode,
  staffSeat: p.staffSeat,
  workerSeat: p.workerSeat,
  minimum: p.minimum,
  effectiveFrom: p.effectiveFrom,
});

/** The plan's price in force on a date. */
export async function priceOn(db: Database | Tx, planCode: PlanCode, on: string) {
  const [row] = await db
    .select()
    .from(planPrices)
    .where(and(eq(planPrices.planCode, planCode), lte(planPrices.effectiveFrom, on)))
    .orderBy(desc(planPrices.effectiveFrom))
    .limit(1);
  return row ?? null;
}

/**
 * People employed at any time between two dates, as staff or workers by their job at the end:
 * a worker seat is the lower price for the factory floor.
 */
export async function seatsOf(
  db: Database,
  tenantId: string,
  from: string,
  to: string,
): Promise<SeatCount> {
  return runAsTenant(db, tenantId, async (tx) => {
    const people = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          lte(employees.joinedOn, to),
          or(isNull(employees.separatedOn), gte(employees.separatedOn, from)),
        ),
      );
    const jobs = await jobsOn(
      tx,
      people.map((p) => p.id),
      to,
    );
    let workers = 0;
    for (const p of people) if (jobs.get(p.id)?.workerCategory === 'worker') workers += 1;
    return { staff: people.length - workers, workers };
  });
}

/** The next serial for the fiscal year of a date: invoices and credit notes have their own. */
async function nextNumber(tx: Tx, kind: InvoiceKind, on: string): Promise<string> {
  const fiscalYear = fiscalYearOf(on);
  const [row] = await tx
    .insert(invoiceCounters)
    .values({ fiscalYear, kind, last: 1 })
    .onConflictDoUpdate({
      target: [invoiceCounters.fiscalYear, invoiceCounters.kind],
      set: { last: sql`${invoiceCounters.last} + 1` },
    })
    .returning({ last: invoiceCounters.last });
  return `${kind === 'invoice' ? 'GP' : 'GP-CN'}/${fiscalYear}/${String(row!.last).padStart(6, '0')}`;
}

/** Marks an invoice paid once nothing is owed, or open again if something was undone. */
export async function settleInvoice(tx: Tx, invoiceId: string) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice || invoice.kind !== 'invoice' || invoice.status === 'void') return;
  const settlements = await tx
    .select()
    .from(invoiceSettlements)
    .where(eq(invoiceSettlements.invoiceId, invoiceId));
  const notes = await tx
    .select({ total: invoices.total })
    .from(invoices)
    .where(and(eq(invoices.creditsInvoiceId, invoiceId), eq(invoices.kind, 'credit_note')));
  const owed = balanceOf(
    invoice.total,
    settlements,
    notes.map((n) => n.total),
  );
  if (owed.lessThanOrEqualTo(0) && invoice.status === 'open') {
    await tx
      .update(invoices)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(invoices.id, invoiceId));
  } else if (owed.greaterThan(0) && invoice.status === 'paid') {
    await tx
      .update(invoices)
      .set({ status: 'open', paidAt: null })
      .where(eq(invoices.id, invoiceId));
  }
}

/**
 * Access follows the invoices: paid through the due date of the oldest unpaid one (past due
 * once that has passed), or through next month's due date when nothing is owed.
 */
export async function syncSubscription(
  tx: Tx,
  tenantId: string,
  settings: SettingsRow,
  today = todayIn(),
) {
  const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
  if (!sub || sub.provider !== 'goodpeople') return;
  const [oldest] = await tx
    .select({ dueDate: invoices.dueDate })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.kind, 'invoice'),
        eq(invoices.status, 'open'),
      ),
    )
    .orderBy(asc(invoices.dueDate))
    .limit(1);
  let currentPeriodEnd: Date;
  let status = sub.status;
  if (oldest?.dueDate) {
    currentPeriodEnd = endOfDay(oldest.dueDate);
    if (status !== 'canceled') status = oldest.dueDate < today ? 'past_due' : 'active';
  } else if (status === 'canceled' && sub.cancelAt) {
    currentPeriodEnd = endOfDay(sub.cancelAt);
  } else {
    currentPeriodEnd = endOfDay(addDays(monthBounds(monthOf(today)).end, settings.dueDays));
    status = 'active';
  }
  await tx
    .update(subscriptions)
    .set({ currentPeriodEnd, status, graceDays: settings.graceDays, updatedAt: new Date() })
    .where(eq(subscriptions.tenantId, tenantId));
}

const locale = (language: 'en' | 'bn') => (language === 'bn' ? 'bn-BD' : 'en-GB');

/** A date as people write it, in English or Bangla. */
export const longDate = (language: 'en' | 'bn', d: string | null) =>
  d
    ? new Intl.DateTimeFormat(locale(language), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${d}T00:00:00Z`))
    : '';

/** Taka, grouped the South Asian way, with Bangla digits in Bangla. */
export const taka = (language: 'en' | 'bn', v: string) =>
  `${language === 'bn' ? '৳' : 'Tk '}${new Intl.NumberFormat(
    language === 'bn' ? 'bn-BD' : 'en-IN',
    {
      maximumFractionDigits: 2,
    },
  ).format(Number(v))}`;

const monthName = (language: 'en' | 'bn', start: string | null) =>
  start
    ? new Intl.DateTimeFormat(locale(language), {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${start}T00:00:00Z`))
    : '';

/** An invoice's notification values, in English and Bangla. */
export function invoiceValues(i: InvoiceRow) {
  return {
    'invoice.number': { en: i.number, bn: i.number },
    'invoice.period': { en: monthName('en', i.periodStart), bn: monthName('bn', i.periodStart) },
    'invoice.total': { en: taka('en', i.total), bn: taka('bn', i.total) },
    'invoice.due': { en: longDate('en', i.dueDate), bn: longDate('bn', i.dueDate) },
  };
}
