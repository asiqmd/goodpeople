import { BkashGateway } from './bkash.js';
import { FakeGateway } from './fake.js';
import type { Fetch, GatewayMethod, PaymentGateway } from './gateway.js';
import { SslCommerzGateway } from './sslcommerz.js';

export * from './gateway.js';
export { BkashGateway, type BkashConfig } from './bkash.js';
export { FakeGateway } from './fake.js';
export { SslCommerzGateway, type SslCommerzConfig } from './sslcommerz.js';

/** Nest's token for the configured gateways, a Map from method to gateway. */
export const GATEWAYS = Symbol('GATEWAYS');

export interface GatewayConfig {
  SSLCOMMERZ_STORE_ID?: string;
  SSLCOMMERZ_STORE_PASSWORD?: string;
  SSLCOMMERZ_SANDBOX: boolean;
  BKASH_APP_KEY?: string;
  BKASH_APP_SECRET?: string;
  BKASH_USERNAME?: string;
  BKASH_PASSWORD?: string;
  BKASH_BASE_URL: string;
  BILLING_FAKE_GATEWAY: boolean;
}

/** The gateways customers can pay with: each one whose credentials are set. */
export function createGateways(
  config: GatewayConfig,
  fetchImpl?: Fetch,
): Map<GatewayMethod, PaymentGateway> {
  const gateways = new Map<GatewayMethod, PaymentGateway>();
  if (config.SSLCOMMERZ_STORE_ID && config.SSLCOMMERZ_STORE_PASSWORD) {
    const sslcommerz = new SslCommerzGateway(
      {
        storeId: config.SSLCOMMERZ_STORE_ID,
        storePassword: config.SSLCOMMERZ_STORE_PASSWORD,
        sandbox: config.SSLCOMMERZ_SANDBOX,
      },
      fetchImpl,
    );
    gateways.set(sslcommerz.method, sslcommerz);
  }
  if (
    config.BKASH_APP_KEY &&
    config.BKASH_APP_SECRET &&
    config.BKASH_USERNAME &&
    config.BKASH_PASSWORD
  ) {
    const bkash = new BkashGateway(
      {
        appKey: config.BKASH_APP_KEY,
        appSecret: config.BKASH_APP_SECRET,
        username: config.BKASH_USERNAME,
        password: config.BKASH_PASSWORD,
        baseUrl: config.BKASH_BASE_URL.replace(/\/+$/, ''),
      },
      fetchImpl,
    );
    gateways.set(bkash.method, bkash);
  }
  // Takes no money: development and tests only (see FakeGateway).
  if (config.BILLING_FAKE_GATEWAY) gateways.set('fake', new FakeGateway());
  return gateways;
}
