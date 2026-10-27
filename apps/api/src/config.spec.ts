import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadConfig } from './config.js';

/** A value as `.env.example` publishes it. */
const example = (key: string) =>
  readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8').match(
    new RegExp(`^${key}=(.+)$`, 'm'),
  )![1]!;

describe('config in production', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));
  afterEach(() => vi.unstubAllEnvs());

  const real = {
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64'),
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    EMAIL_DRIVER: 'smtp',
    SMTP_URL: 'smtp://user:pass@smtp.example.com:587',
    SMS_DRIVER: 'sslwireless',
    SSLWIRELESS_API_TOKEN: 'token',
    SSLWIRELESS_SID: 'sid',
    // The local .env may turn these on for development.
    BILLING_FAKE_GATEWAY: 'off',
    ALLOW_LOG_SENDERS: 'off',
  } as const;

  it('refuses to boot with a log driver for e-mail or SMS', () => {
    expect(() => loadConfig({ ...real, EMAIL_DRIVER: 'log', SMS_DRIVER: 'log' })).toThrow(
      /ALLOW_LOG_SENDERS=on/,
    );
    expect(() => loadConfig({ ...real, EMAIL_DRIVER: 'log' })).toThrow(/EMAIL_DRIVER=smtp/);
    expect(() => loadConfig({ ...real, SMS_DRIVER: 'log' })).toThrow(/SMS_DRIVER=sslwireless/);
  });

  it('refuses the published example secrets and the pretend gateway', () => {
    expect(() => loadConfig({ ...real, JWT_ACCESS_SECRET: example('JWT_ACCESS_SECRET') })).toThrow(
      /JWT_ACCESS_SECRET is the published example/,
    );
    expect(() =>
      loadConfig({ ...real, FIELD_ENCRYPTION_KEY: example('FIELD_ENCRYPTION_KEY') }),
    ).toThrow(/FIELD_ENCRYPTION_KEY is the published example/);
    expect(() => loadConfig({ ...real, BILLING_FAKE_GATEWAY: 'on' })).toThrow(
      /BILLING_FAKE_GATEWAY=on takes no money/,
    );
  });

  it('boots with real senders and secrets, or log drivers when a staging server allows them', () => {
    const config = loadConfig(real);
    expect(config).toMatchObject({
      EMAIL_DRIVER: 'smtp',
      SMS_DRIVER: 'sslwireless',
      ALLOW_LOG_SENDERS: false,
      LOG_FORMAT: 'json',
      API_DOCS: false,
    });
    expect(loadConfig({ ...real, API_DOCS: 'on' }).API_DOCS).toBe(true);
    const staging = loadConfig({
      ...real,
      EMAIL_DRIVER: 'log',
      SMS_DRIVER: 'log',
      ALLOW_LOG_SENDERS: 'on',
    });
    expect(staging.ALLOW_LOG_SENDERS).toBe(true);
  });

  it('keeps development’s drivers, examples and docs outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      loadConfig({
        EMAIL_DRIVER: 'log',
        SMS_DRIVER: 'log',
        JWT_ACCESS_SECRET: example('JWT_ACCESS_SECRET'),
        BILLING_FAKE_GATEWAY: 'on',
      }),
    ).toMatchObject({ EMAIL_DRIVER: 'log', LOG_FORMAT: 'pretty', API_DOCS: true });
  });
});
