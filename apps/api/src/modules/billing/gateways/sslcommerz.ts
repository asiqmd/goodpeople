import { money } from '@gp/shared';
import type {
  CheckoutRequest,
  CheckoutStart,
  Fetch,
  PaymentGateway,
  VerifiedPayment,
} from './gateway.js';

// SSLCommerz hosted checkout (API v4): cards, internet banking and wallets on SSLCommerz's own
// page. The customer comes back to our success, fail or cancel URL and SSLCommerz posts an IPN;
// both carry a `val_id`, which only the validation API turns into a confirmed payment.
// https://developer.sslcommerz.com/doc/v4/

export interface SslCommerzConfig {
  storeId: string;
  storePassword: string;
  sandbox: boolean;
}

/** The API insists on a phone number; a customer without one is sent with this placeholder. */
const NO_PHONE = '01700000000';
/** What one checkout may take, in taka. */
export const SSLCOMMERZ_LIMITS = { min: 10, max: 500_000 };

/**
 * tran_id takes 30 characters and a payment id is a 36-character UUID, so it travels as the
 * UUID's 16 bytes in base64url (22 characters) and is turned back on the way in.
 */
export const tranIdOf = (paymentId: string) =>
  Buffer.from(paymentId.replaceAll('-', ''), 'hex').toString('base64url');

export function paymentIdOf(tranId: string): string {
  if (!/^[\w-]{22}$/.test(tranId)) return tranId;
  const hex = Buffer.from(tranId, 'base64url').toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Name and email take 50 characters. */
const upTo50 = (text: string) => text.slice(0, 50);

interface SessionAnswer {
  status?: string;
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
}

interface Validation {
  status?: string;
  tran_id?: string;
  amount?: string;
  bank_tran_id?: string;
  error?: string;
}

export class SslCommerzGateway implements PaymentGateway {
  readonly method = 'sslcommerz';
  private readonly baseUrl: string;

  constructor(
    private readonly config: SslCommerzConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.baseUrl = config.sandbox
      ? 'https://sandbox.sslcommerz.com'
      : 'https://securepay.sslcommerz.com';
  }

  async start(request: CheckoutRequest): Promise<CheckoutStart> {
    const amount = Number(request.amount);
    if (amount < SSLCOMMERZ_LIMITS.min || amount > SSLCOMMERZ_LIMITS.max) {
      throw new Error('SSLCommerz takes Tk 10 to Tk 5,00,000 in one checkout');
    }
    const response = await this.fetchImpl(`${this.baseUrl}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        store_id: this.config.storeId,
        store_passwd: this.config.storePassword,
        total_amount: request.amount,
        currency: 'BDT',
        tran_id: tranIdOf(request.paymentId),
        success_url: request.successUrl,
        fail_url: request.failUrl,
        cancel_url: request.cancelUrl,
        ipn_url: request.notifyUrl,
        cus_name: upTo50(request.customer.name),
        cus_email: upTo50(request.customer.email),
        cus_phone: request.customer.phone ?? NO_PHONE,
        // Required, though a subscription ships nowhere.
        cus_add1: 'Dhaka',
        cus_city: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        shipping_method: 'NO',
        product_name: `Good People invoice ${request.invoiceNumber}`,
        product_category: 'software',
        product_profile: 'non-physical-goods',
        value_a: request.invoiceNumber,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as SessionAnswer;
    if (body.status !== 'SUCCESS' || !body.GatewayPageURL) {
      const reason = body.failedreason || `HTTP ${response.status}`;
      throw new Error(`SSLCommerz did not start the checkout: ${reason}`);
    }
    return { redirectUrl: body.GatewayPageURL, providerRef: body.sessionkey ?? null };
  }

  /**
   * Asks the validation API about the `val_id` that came back. A return without one (a failed
   * or cancelled checkout) is declined without asking. Throws only when SSLCommerz cannot be
   * asked, so a notification is retried rather than recorded as a failure.
   */
  async verify(params: Record<string, string>): Promise<VerifiedPayment> {
    const valId = params.val_id;
    if (!valId) {
      return {
        ok: false,
        paymentId: null,
        amount: null,
        providerRef: null,
        message: params.error || `SSLCommerz says ${params.status || 'nothing was paid'}`,
        raw: params,
      };
    }
    const query = new URLSearchParams({
      val_id: valId,
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    });
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/validator/api/validationserverAPI.php?${query}`,
        { signal: AbortSignal.timeout(15_000) },
      );
    } catch (error) {
      const timedOut = (error as Error).name === 'TimeoutError';
      // oxlint-disable-next-line preserve-caught-error -- the cause can quote the address, which carries the store password
      throw new Error(`SSLCommerz validation ${timedOut ? 'timed out' : 'could not be reached'}`);
    }
    const body = (await response.json().catch(() => ({}))) as Validation;
    if (!body.status) throw new Error(`SSLCommerz validation answered HTTP ${response.status}`);
    const ok = body.status === 'VALID' || body.status === 'VALIDATED';
    return {
      ok,
      paymentId: body.tran_id ? paymentIdOf(body.tran_id) : null,
      amount: body.amount ? money(body.amount) : null,
      providerRef: body.bank_tran_id ?? null,
      message: ok ? null : body.error || `SSLCommerz says ${body.status}`,
      raw: body,
    };
  }
}
