import type { CheckoutRequest, CheckoutStart, PaymentGateway, VerifiedPayment } from './gateway.js';

/**
 * A gateway that takes no money, for development and tests only. Its checkout "page" is our
 * own success URL with ?fake=ok&ref=<payment id>, and every such return verifies.
 *
 * NEVER ENABLE IT IN PRODUCTION: anyone who opens that URL marks the payment paid. It exists
 * only while BILLING_FAKE_GATEWAY is on.
 */
export class FakeGateway implements PaymentGateway {
  readonly method = 'fake';

  async start(request: CheckoutRequest): Promise<CheckoutStart> {
    const separator = request.successUrl.includes('?') ? '&' : '?';
    const ref = encodeURIComponent(request.paymentId);
    return {
      redirectUrl: `${request.successUrl}${separator}fake=ok&ref=${ref}`,
      providerRef: null,
    };
  }

  /** Reports the payment named in `ref`; the caller checks it is the one expected. */
  async verify(params: Record<string, string>): Promise<VerifiedPayment> {
    const ref = params.ref;
    const ok = params.fake === 'ok' && !!ref;
    return {
      ok,
      paymentId: ok ? ref : null,
      // No amount: the caller keeps the one it stored.
      amount: null,
      providerRef: ok ? `FAKE-${ref}` : null,
      message: ok ? null : 'The fake payment was declined',
      raw: params,
    };
  }
}
