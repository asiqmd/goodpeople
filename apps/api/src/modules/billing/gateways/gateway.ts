// Card and wallet payment gateways behind one interface. A gateway is asked to start a
// checkout (it returns the page to send the customer to) and later to verify, server to
// server, what the customer's return or the gateway's notification claims. Nothing a browser
// sends back is trusted until `verify` confirms it with the gateway.

export const GATEWAY_METHODS = ['sslcommerz', 'bkash', 'fake'] as const;
export type GatewayMethod = (typeof GATEWAY_METHODS)[number];

export interface CheckoutRequest {
  /** Our payment's id: the gateway's transaction id / merchant reference. */
  paymentId: string;
  invoiceNumber: string;
  /** In taka, two decimals, e.g. "11500.00". */
  amount: string;
  customer: { name: string; email: string; phone: string | null };
  /** Where the customer's browser comes back to, by outcome. */
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  /** Where the gateway posts its server-to-server notification, when it has one. */
  notifyUrl: string;
}

export interface CheckoutStart {
  /** The gateway's page to send the customer to. */
  redirectUrl: string;
  /** The gateway's own id for this checkout, when it gives one now (bKash's paymentID). */
  providerRef: string | null;
}

export interface VerifiedPayment {
  /** True only when the gateway says the money was taken. */
  ok: boolean;
  /** Our payment id as the gateway reports it, to check against the one expected. */
  paymentId: string | null;
  amount: string | null;
  /** The gateway's transaction reference (SSLCommerz bank_tran_id, bKash trxID). */
  providerRef: string | null;
  /** Why it failed, in the gateway's words. */
  message: string | null;
  /** The gateway's answer, kept for the audit trail. */
  raw: unknown;
}

export interface PaymentGateway {
  readonly method: GatewayMethod;
  start(request: CheckoutRequest): Promise<CheckoutStart>;
  /**
   * Confirms a payment from what came back: the query of the customer's return or the
   * notification's body (SSLCommerz `val_id`; bKash `paymentID`). `expected` is our payment's
   * stored provider reference, when the gateway issued one at start.
   */
  verify(
    params: Record<string, string>,
    expected: { providerRef: string | null },
  ): Promise<VerifiedPayment>;
}

/** fetch, injectable so tests can answer for the gateway. */
export type Fetch = typeof fetch;
