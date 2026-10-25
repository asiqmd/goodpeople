import { money } from '@gp/shared';
import type {
  CheckoutRequest,
  CheckoutStart,
  Fetch,
  PaymentGateway,
  VerifiedPayment,
} from './gateway.js';

// bKash tokenized checkout, URL-based and without an agreement (mode 0011). The customer
// approves on bKash's page and comes back to the callback URL with
// ?paymentID=…&status=success|failure|cancel; no money moves until we execute the payment.
// https://developer.bka.sh

export interface BkashConfig {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  /** e.g. https://tokenized.sandbox.bka.sh/v1.2.0-beta; onboarding decides the live one. */
  baseUrl: string;
}

/** Grant tokens last an hour and grants are rate-limited, so one serves until shortly before. */
const TOKEN_TTL_MS = 55 * 60_000;

interface BkashAnswer {
  statusCode?: string;
  statusMessage?: string;
  /** Some failures answer in this shape instead. */
  errorCode?: string;
  errorMessage?: string;
  id_token?: string;
  paymentID?: string;
  bkashURL?: string;
  trxID?: string;
  transactionStatus?: string;
  amount?: string;
  merchantInvoiceNumber?: string;
  /** The status query's name for merchantInvoiceNumber. */
  merchantInvoice?: string;
}

const succeeded = (a: BkashAnswer) => a.statusCode === '0000';
const completed = (a: BkashAnswer) => succeeded(a) && a.transactionStatus === 'Completed';
const messageOf = (a: BkashAnswer) => a.statusMessage || a.errorMessage || null;

const declined = (message: string, raw: unknown): VerifiedPayment => ({
  ok: false,
  paymentId: null,
  amount: null,
  providerRef: null,
  message,
  raw,
});

const paid = (a: BkashAnswer, raw: unknown): VerifiedPayment => ({
  ok: true,
  paymentId: a.merchantInvoiceNumber ?? a.merchantInvoice ?? null,
  amount: a.amount ? money(a.amount) : null,
  providerRef: a.trxID ?? null,
  message: null,
  raw,
});

export class BkashGateway implements PaymentGateway {
  readonly method = 'bkash';
  /** Shared by concurrent requests, so a burst of checkouts asks for one grant. */
  private token: { value: Promise<string>; expiresAt: number } | undefined;

  constructor(
    private readonly config: BkashConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async start(request: CheckoutRequest): Promise<CheckoutStart> {
    const answer = await this.call('/tokenized/checkout/create', {
      mode: '0011',
      payerReference: request.invoiceNumber,
      callbackURL: request.successUrl,
      amount: request.amount,
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: request.paymentId,
    });
    if (!succeeded(answer) || !answer.bkashURL || !answer.paymentID) {
      throw new Error(
        `bKash did not start the checkout: ${messageOf(answer) ?? 'no payment page'}`,
      );
    }
    return { redirectUrl: answer.bkashURL, providerRef: answer.paymentID };
  }

  /**
   * Executes the payment the callback names, which is what takes the money. Throws only when
   * bKash cannot be asked, so the return can be checked again rather than recorded as failed.
   */
  async verify(
    params: Record<string, string>,
    expected: { providerRef: string | null },
  ): Promise<VerifiedPayment> {
    if (params.status !== 'success') {
      return declined(`bKash says ${params.status || 'nothing was paid'}`, params);
    }
    const paymentID = params.paymentID;
    if (!paymentID || paymentID !== expected.providerRef) {
      return declined('The bKash payment is not the one started for this payment', params);
    }
    const executed = await this.call('/tokenized/checkout/execute', { paymentID });
    if (completed(executed)) return paid(executed, executed);
    // Execute refuses a payment it already executed (a repeated callback, a retry after a
    // timeout); the status query says either way whether the money was taken.
    const status = await this.call('/tokenized/checkout/payment/status', { paymentID });
    const raw = { execute: executed, status };
    if (completed(status)) return paid(status, raw);
    const message = messageOf(executed) ?? `bKash says ${status.transactionStatus ?? 'unpaid'}`;
    return declined(message, raw);
  }

  /** Posts to the checkout API; throws when the answer is not bKash's (no status code). */
  private async call(path: string, body: object): Promise<BkashAnswer> {
    const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: await this.idToken(),
        'X-APP-Key': this.config.appKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      // Execute can be slow to answer; a timeout here is retried through the status query.
      signal: AbortSignal.timeout(30_000),
    });
    // bKash ended the token early: the next call signs in again.
    if (response.status === 401) this.token = undefined;
    const answer = (await response.json().catch(() => ({}))) as BkashAnswer;
    if (!answer.statusCode && !answer.errorCode) {
      throw new Error(`bKash ${path} answered HTTP ${response.status}`);
    }
    return answer;
  }

  private idToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const value = this.grant();
    this.token = { value, expiresAt: Date.now() + TOKEN_TTL_MS };
    // A failed grant is not kept, so the next call asks again.
    value.catch(() => {
      if (this.token?.value === value) this.token = undefined;
    });
    return value;
  }

  private async grant(): Promise<string> {
    const response = await this.fetchImpl(`${this.config.baseUrl}/tokenized/checkout/token/grant`, {
      method: 'POST',
      headers: {
        username: this.config.username,
        password: this.config.password,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ app_key: this.config.appKey, app_secret: this.config.appSecret }),
      signal: AbortSignal.timeout(15_000),
    });
    const answer = (await response.json().catch(() => ({}))) as BkashAnswer;
    if (!answer.id_token) {
      throw new Error(`bKash sign-in failed: ${messageOf(answer) ?? `HTTP ${response.status}`}`);
    }
    return answer.id_token;
  }
}
