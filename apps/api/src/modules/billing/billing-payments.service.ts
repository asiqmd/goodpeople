import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BD_SERVICE_TDS, bdVatOn } from '@gp/country-packs';
import {
  invoices,
  invoiceSettlements,
  runAsTenant,
  tenantUsers,
  type Database,
  type Tx,
} from '@gp/db';
import {
  Decimal,
  money,
  type DeductionInput,
  type InvoiceView,
  type ManualPaymentInput,
  type OnlineMethod,
  type StatementMatchView,
  type TenantWithAccess,
} from '@gp/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { AuthUser, PlatformUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { readSheet } from '../../common/sheets.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { AuditService } from '../audit/audit.service.js';
import { normalize } from '../payroll/reconciliation.js';
import {
  BillingService,
  requireSettings,
  settleInvoice,
  syncSubscription,
  taka,
} from './billing.service.js';
import { GATEWAYS, type GatewayMethod, type PaymentGateway } from './gateways/index.js';

type TenantUser = Extract<AuthUser, { kind: 'tenant' }>;
type SettlementRow = typeof invoiceSettlements.$inferSelect;

/** Where a customer's browser goes after a checkout, by what happened. */
export type ReturnOutcome = 'paid' | 'failed' | 'pending';

/** An invoice number in a bank narration, however the bank mangled its slashes. */
const INVOICE_IN_TEXT = /GP[\s/_-]*(\d{4})[\s/_-]*(\d{2})[\s/_-]*(\d{6})/i;

const COLUMN_ALIASES = {
  date: ['date', 'value date', 'txn date', 'transaction date', 'posting date', 'তারিখ'],
  narration: ['narration', 'description', 'particulars', 'details', 'remarks', 'বিবরণ'],
  credit: ['credit', 'deposit', 'cr', 'credit amount', 'amount', 'জমা'],
  reference: ['reference', 'ref', 'ref no', 'cheque no', 'chq no', 'transaction id', 'txn id'],
} as const;

const isStatementHeading = (cells: string[]) => {
  const names = new Set(cells.map(normalize));
  return (
    COLUMN_ALIASES.narration.some((a) => names.has(normalize(a))) &&
    COLUMN_ALIASES.credit.some((a) => names.has(normalize(a)))
  );
};

const columnOf = (headers: string[], aliases: readonly string[]) => {
  const names = headers.map(normalize);
  for (const alias of aliases) {
    const at = names.indexOf(normalize(alias));
    if (at >= 0) return at;
  }
  return -1;
};

const paymentLabel = (method: string): { en: string; bn: string } =>
  ({
    sslcommerz: { en: 'card (SSLCommerz)', bn: 'কার্ড (SSLCommerz)' },
    bkash: { en: 'bKash', bn: 'বিকাশ' },
    bank_transfer: { en: 'bank transfer', bn: 'ব্যাংক ট্রান্সফার' },
    cheque: { en: 'cheque', bn: 'চেক' },
    fake: { en: 'test payment', bn: 'পরীক্ষামূলক পেমেন্ট' },
  })[method] ?? { en: method, bn: method };

/**
 * Money and withholding against invoices: online checkouts (verified with the gateway, server
 * to server, before anything is recorded), bank transfers and cheques the platform records or
 * matches from a statement, and tax the customer withheld at source with its certificate.
 * Every settlement re-checks the invoice and the subscription, so paying restores access.
 */
@Injectable()
export class BillingPaymentsService {
  private readonly logger = new Logger(BillingPaymentsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GATEWAYS) private readonly gateways: Map<GatewayMethod, PaymentGateway>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  // ── Online ─────────────────────────────────────────────────────────────────

  /** Starts paying what is owed on an invoice; returns the gateway's page. */
  async startCheckout(
    user: TenantUser,
    tenant: TenantWithAccess,
    invoiceId: string,
    method: OnlineMethod,
  ): Promise<{ redirectUrl: string }> {
    const gateway = this.gateways.get(method);
    if (!gateway) throw badRequest('method_unavailable', 'This payment method is not available');
    const invoice = await this.billing.invoiceFor(invoiceId, tenant.id);
    const owed = new Decimal(invoice.balance);
    if (invoice.kind !== 'invoice' || invoice.status !== 'open' || owed.lessThanOrEqualTo(0)) {
      throw conflict('nothing_owed', 'Nothing is owed on this invoice');
    }
    const [me] = await runAsTenant(this.db, tenant.id, (tx) =>
      tx
        .select({ name: tenantUsers.name, email: tenantUsers.email, phone: tenantUsers.phone })
        .from(tenantUsers)
        .where(eq(tenantUsers.id, user.id)),
    );
    const [payment] = await this.db
      .insert(invoiceSettlements)
      .values({
        invoiceId,
        kind: 'payment',
        method,
        status: 'pending',
        amount: invoice.balance,
        recordedByUser: user.id,
      })
      .returning();
    const back = (outcome: string) =>
      `${this.config.API_ORIGIN}/billing/return/${method}/${payment!.id}?outcome=${outcome}`;
    try {
      const start = await gateway.start({
        paymentId: payment!.id,
        invoiceNumber: invoice.number,
        amount: invoice.balance,
        customer: {
          name: invoice.buyer.name,
          email: me?.email ?? `billing+${tenant.slug}@goodpeople.invalid`,
          phone: me?.phone ?? null,
        },
        successUrl: back('success'),
        failUrl: back('fail'),
        cancelUrl: back('cancel'),
        notifyUrl: `${this.config.API_ORIGIN}/billing/notify/${method}`,
      });
      await this.db
        .update(invoiceSettlements)
        .set({ providerRef: start.providerRef })
        .where(eq(invoiceSettlements.id, payment!.id));
      return { redirectUrl: start.redirectUrl };
    } catch (error) {
      const message = (error as Error).message;
      await this.db
        .update(invoiceSettlements)
        .set({ status: 'failed', raw: { error: message }, settledAt: new Date() })
        .where(eq(invoiceSettlements.id, payment!.id));
      this.logger.warn(`Checkout for ${invoice.number} by ${method} did not start: ${message}`);
      throw conflict('gateway_failed', message);
    }
  }

  /**
   * The customer's browser is back from the gateway (by GET or POST). Confirms the payment with
   * the gateway and says where to send them.
   */
  async handleReturn(
    method: string,
    paymentId: string,
    params: Record<string, string>,
  ): Promise<{ outcome: ReturnOutcome; invoiceNumber: string | null }> {
    const [payment] = await this.db
      .select({ settlement: invoiceSettlements, number: invoices.number })
      .from(invoiceSettlements)
      .innerJoin(invoices, eq(invoices.id, invoiceSettlements.invoiceId))
      .where(and(eq(invoiceSettlements.id, paymentId), eq(invoiceSettlements.kind, 'payment')));
    if (!payment || payment.settlement.method !== method) {
      return { outcome: 'failed', invoiceNumber: null };
    }
    const outcome = await this.confirm(payment.settlement, params);
    return { outcome, invoiceNumber: payment.number };
  }

  /** A gateway's server-to-server notification (SSLCommerz's IPN). */
  async notified(method: string, params: Record<string, string>): Promise<void> {
    const gateway = this.gateways.get(method as GatewayMethod);
    if (!gateway) return;
    const verified = await gateway.verify(params, { providerRef: null });
    if (!verified.ok || !verified.paymentId) return;
    const [payment] = await this.db
      .select()
      .from(invoiceSettlements)
      .where(
        and(
          eq(invoiceSettlements.id, verified.paymentId),
          eq(invoiceSettlements.method, method as GatewayMethod),
        ),
      );
    if (payment) await this.record(payment, verified);
  }

  /** Asks the gateway and records the answer once; a repeated return just reads it back. */
  private async confirm(
    payment: SettlementRow,
    params: Record<string, string>,
  ): Promise<ReturnOutcome> {
    if (payment.status === 'succeeded') return 'paid';
    if (payment.status !== 'pending') return 'failed';
    const gateway = this.gateways.get(payment.method as GatewayMethod);
    if (!gateway) return 'pending';
    let verified;
    try {
      verified = await gateway.verify(params, { providerRef: payment.providerRef });
    } catch (error) {
      // The gateway could not be asked: the notification or the next look will settle it.
      this.logger.warn(`Could not verify payment ${payment.id}: ${(error as Error).message}`);
      return 'pending';
    }
    if (!verified.ok || verified.paymentId !== payment.id) {
      await this.db
        .update(invoiceSettlements)
        .set({
          status: 'failed',
          raw: { message: verified.message, answer: verified.raw },
          settledAt: new Date(),
        })
        .where(
          and(eq(invoiceSettlements.id, payment.id), eq(invoiceSettlements.status, 'pending')),
        );
      return 'failed';
    }
    return (await this.record(payment, verified)) ? 'paid' : 'failed';
  }

  /** Marks a verified payment received, once, at the amount the gateway confirmed. */
  private async record(
    payment: SettlementRow,
    verified: { amount: string | null; providerRef: string | null; raw: unknown },
  ): Promise<boolean> {
    const amount = verified.amount ?? payment.amount;
    if (!new Decimal(amount).equals(payment.amount)) {
      this.logger.warn(
        `Payment ${payment.id} was started for ${payment.amount} and the gateway confirmed ${amount}`,
      );
    }
    const done = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(invoiceSettlements)
        .set({
          status: 'succeeded',
          amount: money(amount),
          reference: verified.providerRef,
          raw: verified.raw as object,
          settledAt: new Date(),
        })
        .where(and(eq(invoiceSettlements.id, payment.id), eq(invoiceSettlements.status, 'pending')))
        .returning();
      if (!updated) return null;
      return this.afterSettling(tx, payment.invoiceId);
    });
    if (done) await this.tellPaid(done, amount, payment.method ?? 'payment', payment.id);
    return Boolean(done) || payment.status === 'succeeded';
  }

  // ── Recorded by the platform ───────────────────────────────────────────────

  /** A bank transfer or cheque received, recorded by finance. */
  async recordManual(actor: PlatformUser, invoiceId: string, input: ManualPaymentInput) {
    const invoice = await this.billing.invoiceFor(invoiceId);
    if (invoice.kind !== 'invoice' || invoice.status === 'void') {
      throw new NotFoundException('Invoice not found');
    }
    if (new Decimal(input.amount).greaterThan(invoice.balance)) {
      throw badRequest('more_than_owed', `Only ${taka('en', invoice.balance)} is owed`);
    }
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(invoiceSettlements)
        .values({
          invoiceId,
          kind: 'payment',
          method: input.method,
          status: 'succeeded',
          amount: input.amount,
          reference: input.reference,
          recordedBy: actor.id,
          settledAt: new Date(`${input.receivedOn}T12:00:00+06:00`),
        })
        .returning({ id: invoiceSettlements.id });
      await this.afterSettling(tx, invoiceId);
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'billing.payment',
        tenantId: invoice.tenant?.id ?? null,
        reason: `${input.method} ${input.reference}`,
        after: { invoice: invoice.number, ...input },
      });
      return row!.id;
    });
    await this.tellPaid(
      { invoice, tenantId: invoice.tenant?.id ?? null },
      input.amount,
      input.method,
      id,
    );
    return this.billing.invoiceFor(invoiceId);
  }

  /**
   * A bank statement: every credit whose narration names an open invoice is recorded as a bank
   * transfer, once (the same reference and amount is never recorded twice).
   */
  async matchStatement(
    actor: PlatformUser,
    file: { buffer: Buffer; originalname: string },
  ): Promise<StatementMatchView> {
    const sheet = await readSheet(file, isStatementHeading);
    const at = {
      date: columnOf(sheet.headers, COLUMN_ALIASES.date),
      narration: columnOf(sheet.headers, COLUMN_ALIASES.narration),
      credit: columnOf(sheet.headers, COLUMN_ALIASES.credit),
      reference: columnOf(sheet.headers, COLUMN_ALIASES.reference),
    };
    if (at.narration < 0 || at.credit < 0) {
      throw badRequest('statement_columns', 'The statement needs a narration and a credit column');
    }
    const credits = sheet.rows.flatMap((row) => {
      const amount = Number((row[at.credit] ?? '').replace(/[,\s৳]|tk/gi, ''));
      if (!Number.isFinite(amount) || amount <= 0) return [];
      const narration = row[at.narration] ?? '';
      const found = INVOICE_IN_TEXT.exec(narration);
      return [
        {
          date: at.date >= 0 ? (row[at.date] ?? '') : '',
          amount: money(amount),
          narration,
          number: found ? `GP/${found[1]}-${found[2]}/${found[3]}` : null,
          reference:
            (at.reference >= 0 && row[at.reference]) ||
            `${row[at.date] ?? ''} ${narration}`.trim().slice(0, 120),
        },
      ];
    });
    const numbers = [...new Set(credits.flatMap((c) => (c.number ? [c.number] : [])))];
    const found = numbers.length
      ? await this.db
          .select({
            id: invoices.id,
            number: invoices.number,
            status: invoices.status,
            kind: invoices.kind,
          })
          .from(invoices)
          .where(inArray(invoices.number, numbers))
      : [];
    const byNumber = new Map(found.filter((i) => i.kind === 'invoice').map((i) => [i.number, i]));
    const view: StatementMatchView = { rows: sheet.rows.length, recorded: [], unmatched: [] };
    const touched = new Set<string>();
    for (const credit of credits) {
      const invoice = credit.number ? byNumber.get(credit.number) : undefined;
      if (!invoice || invoice.status === 'void') {
        view.unmatched.push({
          date: credit.date,
          amount: credit.amount,
          narration: credit.narration,
        });
        continue;
      }
      const recorded = await this.db.transaction(async (tx) => {
        const [already] = await tx
          .select({ id: invoiceSettlements.id })
          .from(invoiceSettlements)
          .where(
            and(
              eq(invoiceSettlements.invoiceId, invoice.id),
              eq(invoiceSettlements.method, 'bank_transfer'),
              eq(invoiceSettlements.reference, credit.reference),
              eq(invoiceSettlements.amount, credit.amount),
            ),
          );
        if (already) return false;
        await tx.insert(invoiceSettlements).values({
          invoiceId: invoice.id,
          kind: 'payment',
          method: 'bank_transfer',
          status: 'succeeded',
          amount: credit.amount,
          reference: credit.reference,
          raw: { statement: file.originalname, date: credit.date, narration: credit.narration },
          recordedBy: actor.id,
          settledAt: new Date(),
        });
        await this.afterSettling(tx, invoice.id);
        return true;
      });
      if (recorded) {
        touched.add(invoice.id);
        view.recorded.push({
          invoiceNumber: invoice.number,
          amount: credit.amount,
          reference: credit.reference,
        });
      }
    }
    if (view.recorded.length) {
      await this.db.transaction((tx) =>
        this.audit.record(tx, {
          actorId: actor.id,
          action: 'billing.statement',
          tenantId: null,
          reason: `Bank statement ${file.originalname}`,
          after: { recorded: view.recorded.length, unmatched: view.unmatched.length },
        }),
      );
    }
    return view;
  }

  // ── Tax withheld at source ─────────────────────────────────────────────────

  /**
   * VAT (VDS, with Mushak 6.6) or income tax (TDS) the customer withheld. It counts against the
   * invoice at once, so withholding never makes a workspace look unpaid, and the platform
   * accepts or rejects it once the certificate is checked.
   */
  async recordDeduction(
    user: TenantUser,
    tenant: TenantWithAccess,
    invoiceId: string,
    input: DeductionInput,
  ): Promise<InvoiceView> {
    const invoice = await this.billing.invoiceFor(invoiceId, tenant.id);
    if (invoice.kind !== 'invoice' || invoice.status === 'void') {
      throw new NotFoundException('Invoice not found');
    }
    const cap = deductionCap(invoice, input.kind);
    const already = invoice.settlements
      .filter((s) => s.kind === input.kind && s.status !== 'rejected')
      .reduce((sum, s) => sum.plus(s.amount), new Decimal(0));
    if (already.plus(input.amount).greaterThan(cap)) {
      throw badRequest(
        'deduction_too_large',
        cap.isZero()
          ? `No ${input.kind.toUpperCase()} applies to this invoice`
          : `At most ${taka('en', money(cap))} of ${input.kind.toUpperCase()} applies to this invoice`,
      );
    }
    if (new Decimal(input.amount).greaterThan(invoice.balance)) {
      throw badRequest('more_than_owed', `Only ${taka('en', invoice.balance)} is owed`);
    }
    await this.db.transaction(async (tx) => {
      await tx.insert(invoiceSettlements).values({
        invoiceId,
        kind: input.kind,
        status: 'pending',
        amount: input.amount,
        reference: `${input.certificateNo} (${input.certificateDate})`,
        recordedByUser: user.id,
      });
      await this.afterSettling(tx, invoiceId);
      await this.audit.record(tx, {
        actorId: null,
        action: `billing.${input.kind}`,
        tenantId: tenant.id,
        reason: `Certificate ${input.certificateNo}`,
        after: { invoice: invoice.number, ...input, by: user.id },
      });
    });
    return this.billing.invoiceFor(invoiceId, tenant.id);
  }

  /** Accepts a withholding certificate once checked, or rejects it (the amount is owed again). */
  async reviewDeduction(
    actor: PlatformUser,
    settlementId: string,
    accept: boolean,
    reason: string,
  ) {
    const [row] = await this.db
      .select()
      .from(invoiceSettlements)
      .where(
        and(
          eq(invoiceSettlements.id, settlementId),
          inArray(invoiceSettlements.kind, ['vds', 'tds']),
        ),
      );
    if (!row) throw new NotFoundException('Deduction not found');
    if (row.status !== 'pending') throw conflict('already_reviewed', 'This deduction was reviewed');
    await this.db.transaction(async (tx) => {
      await tx
        .update(invoiceSettlements)
        .set({
          status: accept ? 'succeeded' : 'rejected',
          recordedBy: actor.id,
          settledAt: new Date(),
        })
        .where(eq(invoiceSettlements.id, settlementId));
      const after = await this.afterSettling(tx, row.invoiceId);
      await this.audit.record(tx, {
        actorId: actor.id,
        action: accept ? 'billing.deduction_accepted' : 'billing.deduction_rejected',
        tenantId: after?.tenantId ?? null,
        reason,
        after: { kind: row.kind, amount: row.amount, reference: row.reference },
      });
    });
    return this.billing.invoiceFor(row.invoiceId);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** The invoice paid or reopened, and the workspace's access re-checked. */
  private async afterSettling(tx: Tx, invoiceId: string) {
    await settleInvoice(tx, invoiceId);
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (invoice?.tenantId) {
      await syncSubscription(tx, invoice.tenantId, await requireSettings(tx));
    }
    return invoice ? { invoice, tenantId: invoice.tenantId } : null;
  }

  private async tellPaid(
    done: { invoice: { id: string; number: string }; tenantId: string | null },
    amount: string,
    method: string,
    settlementId: string,
  ) {
    if (!done.tenantId) return;
    await this.billing.notify(
      done.tenantId,
      'billing.payment_received',
      {
        'invoice.number': { en: done.invoice.number, bn: done.invoice.number },
        'payment.amount': { en: taka('en', amount), bn: taka('bn', amount) },
        'payment.method': paymentLabel(method),
      },
      `billing.payment_received:${settlementId}`,
    );
  }
}

/**
 * The most a customer may withhold: VAT at the service's VDS rate on the value before VAT
 * (nothing when the supply was exempt), or income tax at 10% of it (ITA 2023, s.90).
 */
export function deductionCap(
  invoice: Pick<InvoiceView, 'taxable' | 'vatRate' | 'serviceCode' | 'issuedAt'>,
  kind: 'vds' | 'tds',
): Decimal {
  const taxable = new Decimal(invoice.taxable);
  if (kind === 'tds')
    return taxable.times(BD_SERVICE_TDS.percent).dividedBy(100).toDecimalPlaces(2);
  if (Number(invoice.vatRate) === 0) return new Decimal(0);
  const vdsRate = bdVatOn(invoice.issuedAt.slice(0, 10)).services[invoice.serviceCode].vdsRate;
  return taxable
    .times(Math.min(vdsRate, Number(invoice.vatRate)))
    .dividedBy(100)
    .toDecimalPlaces(2);
}
