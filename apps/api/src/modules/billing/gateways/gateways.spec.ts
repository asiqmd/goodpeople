import {
  BkashGateway,
  createGateways,
  FakeGateway,
  SslCommerzGateway,
  type CheckoutRequest,
  type Fetch,
  type GatewayConfig,
} from './index.js';
import { paymentIdOf, tranIdOf } from './sslcommerz.js';

interface Call {
  url: URL;
  method: string;
  headers: Headers;
  body: string;
}

/** A fetch that records each request and answers with the JSON routed by path suffix. */
function fakeFetch(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchImpl: Fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body === undefined || init.body === null ? '' : String(init.body),
    });
    const route = Object.keys(routes).find((path) => url.pathname.endsWith(path));
    if (!route) throw new Error(`No answer for ${url.pathname}`);
    return Response.json(routes[route]);
  };
  const to = (path: string) => calls.filter((c) => c.url.pathname.endsWith(path));
  return { fetchImpl, calls, to };
}

/** fetch failing the way it does on a bad address: quoting the whole of it. */
const unreachable: Fetch = async (input) => {
  throw new TypeError(`Failed to parse URL from ${String(input)}`);
};

const request: CheckoutRequest = {
  paymentId: '0b7c6f1e-4a1d-4c39-9d64-2f3c1a7e5b10',
  invoiceNumber: 'GP-2026-00042',
  amount: '11500.00',
  customer: { name: 'Karim Garments Ltd', email: 'accounts@karim.example', phone: null },
  successUrl: 'https://api.example.com/billing/return/success',
  failUrl: 'https://api.example.com/billing/return/fail',
  cancelUrl: 'https://api.example.com/billing/return/cancel',
  notifyUrl: 'https://api.example.com/billing/notify/sslcommerz',
};

describe('SSLCommerz', () => {
  const config = { storeId: 'goodp01', storePassword: 'goodp01@ssl', sandbox: true };

  it('starts a checkout with the form fields and IPN address SSLCommerz expects', async () => {
    const http = fakeFetch({
      '/gwprocess/v4/api.php': {
        status: 'SUCCESS',
        sessionkey: 'F1A2B3C4',
        GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/testcdeF1A2B3C4',
      },
    });
    const start = await new SslCommerzGateway(config, http.fetchImpl).start(request);

    expect(start).toEqual({
      redirectUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/testcdeF1A2B3C4',
      providerRef: 'F1A2B3C4',
    });
    const [call] = http.calls;
    expect(call!.method).toBe('POST');
    expect(call!.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(call!.body))).toMatchObject({
      store_id: 'goodp01',
      store_passwd: 'goodp01@ssl',
      total_amount: '11500.00',
      currency: 'BDT',
      tran_id: tranIdOf(request.paymentId),
      success_url: request.successUrl,
      fail_url: request.failUrl,
      cancel_url: request.cancelUrl,
      ipn_url: request.notifyUrl,
      cus_name: 'Karim Garments Ltd',
      cus_email: 'accounts@karim.example',
      cus_phone: '01700000000',
      shipping_method: 'NO',
      product_name: 'Good People invoice GP-2026-00042',
      product_profile: 'non-physical-goods',
      value_a: 'GP-2026-00042',
    });
  });

  it('throws the gateway reason when it will not start', async () => {
    const http = fakeFetch({
      '/gwprocess/v4/api.php': {
        status: 'FAILED',
        failedreason: 'Store Credential Error Or Store is De-active',
      },
    });
    await expect(new SslCommerzGateway(config, http.fetchImpl).start(request)).rejects.toThrow(
      'Store Credential Error Or Store is De-active',
    );
  });

  it('confirms a valid payment with the validation API', async () => {
    const http = fakeFetch({
      '/validationserverAPI.php': {
        status: 'VALID',
        tran_id: tranIdOf(request.paymentId),
        val_id: '2610251234abcd',
        amount: '11500',
        bank_tran_id: '26102512345K1abcd',
        currency: 'BDT',
      },
    });
    const verified = await new SslCommerzGateway(config, http.fetchImpl).verify({
      val_id: '2610251234abcd',
      tran_id: 'whatever the browser says',
    });

    expect(verified).toMatchObject({
      ok: true,
      paymentId: request.paymentId,
      amount: '11500.00',
      providerRef: '26102512345K1abcd',
      message: null,
    });
    const [call] = http.calls;
    expect(call!.method).toBe('GET');
    expect(Object.fromEntries(call!.url.searchParams)).toEqual({
      val_id: '2610251234abcd',
      store_id: 'goodp01',
      store_passwd: 'goodp01@ssl',
      format: 'json',
    });
  });

  it('accepts a payment validated before, and declines an invalid transaction', async () => {
    const again = fakeFetch({
      '/validationserverAPI.php': {
        status: 'VALIDATED',
        tran_id: tranIdOf(request.paymentId),
        amount: '1',
      },
    });
    expect((await new SslCommerzGateway(config, again.fetchImpl).verify({ val_id: 'v1' })).ok).toBe(
      true,
    );

    const invalid = fakeFetch({ '/validationserverAPI.php': { status: 'INVALID_TRANSACTION' } });
    const verified = await new SslCommerzGateway(config, invalid.fetchImpl).verify({
      val_id: 'forged',
    });
    expect(verified).toMatchObject({ ok: false, paymentId: null, amount: null });
    expect(verified.message).toContain('INVALID_TRANSACTION');
  });

  it('declines a return without val_id without asking the gateway', async () => {
    const http = fakeFetch({});
    const verified = await new SslCommerzGateway(config, http.fetchImpl).verify({
      status: 'CANCELLED',
      tran_id: request.paymentId,
    });
    expect(verified).toMatchObject({
      ok: false,
      paymentId: null,
      message: 'SSLCommerz says CANCELLED',
    });
    expect(http.calls).toHaveLength(0);
  });

  it('keeps the store password out of the error when validation cannot be reached', async () => {
    const error = await new SslCommerzGateway(config, unreachable)
      .verify({ val_id: 'v1' })
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('goodp01@ssl');
  });

  it('talks to the sandbox or the live host', async () => {
    const answer = { status: 'SUCCESS', GatewayPageURL: 'https://pay.example/x' };
    const sandbox = fakeFetch({ '/api.php': answer });
    const live = fakeFetch({ '/api.php': answer });
    await new SslCommerzGateway(config, sandbox.fetchImpl).start(request);
    await new SslCommerzGateway({ ...config, sandbox: false }, live.fetchImpl).start(request);
    expect(sandbox.calls[0]!.url.origin).toBe('https://sandbox.sslcommerz.com');
    expect(live.calls[0]!.url.origin).toBe('https://securepay.sslcommerz.com');
  });

  it('sends the payment id within tran_id’s 30 characters, and reads it back', () => {
    const tranId = tranIdOf(request.paymentId);
    expect(tranId).toHaveLength(22);
    expect(paymentIdOf(tranId)).toBe(request.paymentId);
    expect(paymentIdOf('something else')).toBe('something else');
  });

  it('refuses an amount SSLCommerz cannot take, before asking it', async () => {
    const http = fakeFetch({});
    await expect(
      new SslCommerzGateway(config, http.fetchImpl).start({ ...request, amount: '612000.00' }),
    ).rejects.toThrow('Tk 10 to Tk 5,00,000');
    expect(http.calls).toHaveLength(0);
  });
});

describe('bKash', () => {
  const config = {
    appKey: 'app-key',
    appSecret: 'app-secret',
    username: 'sandboxTokenizedUser02',
    password: 'merchant-pass',
    baseUrl: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
  };
  const granted = {
    statusCode: '0000',
    statusMessage: 'Successful',
    id_token: 'id-token-1',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'refresh-1',
  };
  const created = {
    statusCode: '0000',
    statusMessage: 'Successful',
    paymentID: 'TR0011abc123',
    bkashURL: 'https://sandbox.payment.bkash.com/?paymentId=TR0011abc123&hash=xyz',
    transactionStatus: 'Initiated',
    merchantInvoiceNumber: request.paymentId,
  };
  const executed = {
    statusCode: '0000',
    statusMessage: 'Successful',
    paymentID: 'TR0011abc123',
    trxID: 'CJP1ABCDEF',
    transactionStatus: 'Completed',
    amount: '11500',
    currency: 'BDT',
    merchantInvoiceNumber: request.paymentId,
  };
  const callback = { paymentID: 'TR0011abc123', status: 'success', signature: 'abc' };
  const expected = { providerRef: 'TR0011abc123' };

  it('signs in once and reuses the token for checkout and verification', async () => {
    const http = fakeFetch({
      '/token/grant': granted,
      '/checkout/create': created,
      '/checkout/execute': executed,
    });
    const bkash = new BkashGateway(config, http.fetchImpl);
    await bkash.start(request);
    await bkash.start(request);
    await bkash.verify(callback, expected);

    const [grant, ...rest] = http.calls;
    expect(http.to('/token/grant')).toHaveLength(1);
    expect(grant!.headers.get('username')).toBe('sandboxTokenizedUser02');
    expect(grant!.headers.get('password')).toBe('merchant-pass');
    expect(JSON.parse(grant!.body)).toEqual({ app_key: 'app-key', app_secret: 'app-secret' });
    expect(rest).toHaveLength(3);
    for (const call of rest) {
      expect(call.headers.get('authorization')).toBe('id-token-1');
      expect(call.headers.get('x-app-key')).toBe('app-key');
    }
  });

  it('creates a URL-based checkout without an agreement', async () => {
    const http = fakeFetch({ '/token/grant': granted, '/checkout/create': created });
    const start = await new BkashGateway(config, http.fetchImpl).start(request);

    expect(start).toEqual({ redirectUrl: created.bkashURL, providerRef: 'TR0011abc123' });
    const [create] = http.to('/checkout/create');
    expect(create!.url.href).toBe(
      'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/create',
    );
    expect(JSON.parse(create!.body)).toEqual({
      mode: '0011',
      payerReference: 'GP-2026-00042',
      callbackURL: request.successUrl,
      amount: '11500.00',
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: request.paymentId,
    });
  });

  it('throws the gateway message when it will not create the checkout', async () => {
    const http = fakeFetch({
      '/token/grant': granted,
      '/checkout/create': { statusCode: '2001', statusMessage: 'Invalid App Key' },
    });
    await expect(new BkashGateway(config, http.fetchImpl).start(request)).rejects.toThrow(
      'Invalid App Key',
    );
  });

  it('declines a callback for another payment, or a cancelled one, without executing', async () => {
    const http = fakeFetch({ '/token/grant': granted, '/checkout/execute': executed });
    const bkash = new BkashGateway(config, http.fetchImpl);

    const other = await bkash.verify({ ...callback, paymentID: 'TR0011other' }, expected);
    expect(other).toMatchObject({ ok: false, paymentId: null, providerRef: null });
    expect(await bkash.verify(callback, { providerRef: null })).toMatchObject({ ok: false });

    const cancelled = await bkash.verify({ ...callback, status: 'cancel' }, expected);
    expect(cancelled).toMatchObject({ ok: false, message: 'bKash says cancel' });
    expect(http.calls).toHaveLength(0);
  });

  it('executes an approved payment and reports the transaction', async () => {
    const http = fakeFetch({ '/token/grant': granted, '/checkout/execute': executed });
    const verified = await new BkashGateway(config, http.fetchImpl).verify(callback, expected);

    expect(verified).toEqual({
      ok: true,
      paymentId: request.paymentId,
      amount: '11500.00',
      providerRef: 'CJP1ABCDEF',
      message: null,
      raw: executed,
    });
    expect(JSON.parse(http.to('/checkout/execute')[0]!.body)).toEqual({
      paymentID: 'TR0011abc123',
    });
  });

  it('asks for the status when the payment was already executed', async () => {
    const http = fakeFetch({
      '/token/grant': granted,
      '/checkout/execute': {
        statusCode: '2062',
        statusMessage: 'The payment has already been completed',
      },
      '/payment/status': {
        statusCode: '0000',
        statusMessage: 'Successful',
        paymentID: 'TR0011abc123',
        trxID: 'CJP1ABCDEF',
        transactionStatus: 'Completed',
        amount: '11500.00',
        merchantInvoice: request.paymentId,
      },
    });
    const verified = await new BkashGateway(config, http.fetchImpl).verify(callback, expected);

    expect(verified).toMatchObject({
      ok: true,
      paymentId: request.paymentId,
      amount: '11500.00',
      providerRef: 'CJP1ABCDEF',
    });
    expect(JSON.parse(http.to('/payment/status')[0]!.body)).toEqual({ paymentID: 'TR0011abc123' });
  });

  it('declines in execute’s words when the status shows no money taken', async () => {
    const http = fakeFetch({
      '/token/grant': granted,
      '/checkout/execute': { statusCode: '2023', statusMessage: 'Insufficient Balance' },
      '/payment/status': { statusCode: '0000', transactionStatus: 'Initiated' },
    });
    const verified = await new BkashGateway(config, http.fetchImpl).verify(callback, expected);
    expect(verified).toMatchObject({ ok: false, message: 'Insufficient Balance' });
  });
});

describe('fake gateway', () => {
  it('sends the customer straight back and verifies that return', async () => {
    const fake = new FakeGateway();
    const start = await fake.start({ ...request, successUrl: `${request.successUrl}?method=fake` });
    expect(start.redirectUrl).toBe(
      `${request.successUrl}?method=fake&fake=ok&ref=${request.paymentId}`,
    );
    const query = Object.fromEntries(new URL(start.redirectUrl).searchParams);
    expect(await fake.verify(query)).toMatchObject({
      ok: true,
      paymentId: request.paymentId,
      amount: null,
      providerRef: `FAKE-${request.paymentId}`,
    });

    expect((await fake.start(request)).redirectUrl).toBe(
      `${request.successUrl}?fake=ok&ref=${request.paymentId}`,
    );
    expect(await fake.verify({ ref: request.paymentId })).toMatchObject({ ok: false });
  });
});

describe('choosing gateways', () => {
  const none: GatewayConfig = {
    SSLCOMMERZ_SANDBOX: true,
    BKASH_BASE_URL: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
    BILLING_FAKE_GATEWAY: false,
  };

  it('offers only the gateways whose credentials are set', () => {
    expect(createGateways(none).size).toBe(0);
    expect([
      ...createGateways({
        ...none,
        SSLCOMMERZ_STORE_ID: 'goodp01',
        SSLCOMMERZ_STORE_PASSWORD: 'secret',
        BKASH_APP_KEY: 'app-key',
        BKASH_APP_SECRET: 'app-secret',
        BKASH_USERNAME: 'merchant',
      }).keys(),
    ]).toEqual(['sslcommerz']);

    const all = createGateways({
      ...none,
      SSLCOMMERZ_STORE_ID: 'goodp01',
      SSLCOMMERZ_STORE_PASSWORD: 'secret',
      BKASH_APP_KEY: 'app-key',
      BKASH_APP_SECRET: 'app-secret',
      BKASH_USERNAME: 'merchant',
      BKASH_PASSWORD: 'merchant-pass',
      BILLING_FAKE_GATEWAY: true,
    });
    expect([...all.keys()]).toEqual(['sslcommerz', 'bkash', 'fake']);
    expect(all.get('sslcommerz')).toBeInstanceOf(SslCommerzGateway);
    expect(all.get('bkash')).toBeInstanceOf(BkashGateway);
    expect(all.get('fake')).toBeInstanceOf(FakeGateway);
  });
});
