import { createHash } from 'node:crypto';
import { loadRootEnv } from '@gp/db';
import { z } from 'zod';

/**
 * SHA-256 of the secrets `.env.example` publishes (infra/.env.prod.example leaves them empty).
 * Anyone can sign tokens or decrypt data with those, so production refuses them.
 */
const EXAMPLE_SECRETS = new Set([
  '3cc6d54d23f26e3db1261b9f9b4fb81c66a5be906f02ec1a50e9606e60545b3e',
  '72e262b345cb412df5ed8d560346107dcda05562cebe464924ee98c2e0fd7b42',
]);

const isExampleSecret = (value: string) =>
  EXAMPLE_SECRETS.has(createHash('sha256').update(value).digest('hex'));

const inProduction = () => process.env.NODE_ENV === 'production';

const configSchema = z
  .object({
    DEPLOYMENT_MODE: z.enum(['managed', 'self_hosted', 'dedicated']).default('managed'),
    INSTALLATION_ID: z.uuid().optional(),
    INSTALLATION_TENANT_ID: z.uuid().optional(),
    LICENSE_PUBLIC_KEYS_JSON: z
      .string()
      .default('{}')
      .transform((raw, ctx) => {
        try {
          const value = JSON.parse(raw);
          if (
            !value ||
            Array.isArray(value) ||
            typeof value !== 'object' ||
            Object.keys(value).length > 8 ||
            Object.entries(value).some(
              ([k, v]) =>
                !/^[a-zA-Z0-9_-]{1,64}$/.test(k) || typeof v !== 'string' || v.length > 1000,
            )
          )
            throw new Error();
          return value as Record<string, string>;
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: 'Invalid offline license public-key trust store',
          });
          return z.NEVER;
        }
      }),
    RELEASE_VERSION: z
      .string()
      .regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/)
      .default('6.5.0-local'),
    PROCESS_ROLE: z.enum(['api', 'worker']).default('api'),
    PUBLIC_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    PUBLIC_RATE_LIMIT: z.coerce.number().int().min(1).max(600).default(120),
    PUBLIC_DAILY_QUOTA: z.coerce.number().int().min(1).default(20000),
    WEBHOOK_PRIVATE_HOSTS: z.string().default(''),
    WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
    WEBHOOK_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    WEBHOOK_QUEUE_LIMIT: z.coerce.number().int().min(1).max(1000000).default(10000),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(4),
    JOB_LEASE_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
    PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    /** Proxies in front of the API (Caddy: 1), so rate limits see the visitor's address. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    /** The OpenAPI pages at /docs: on in development, off in production unless turned on. */
    API_DOCS: z
      .enum(['on', 'off'])
      .default(() => (inProduction() ? 'off' : 'on'))
      .transform((v) => v === 'on'),
    /** JSON lines for a log collector (production), or Nest's readable lines. */
    LOG_FORMAT: z.enum(['json', 'pretty']).default(() => (inProduction() ? 'json' : 'pretty')),
    /** The quietest level logged. Health checks log at debug; tests log errors only. */
    LOG_LEVEL: z
      .enum(['debug', 'info', 'warn', 'error'])
      .default(() => (process.env.NODE_ENV === 'test' ? 'error' : 'info')),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_KEY_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,64}$/)
      .default('v1'),
    JWT_PREVIOUS_ACCESS_SECRET: z.string().min(32).optional(),
    JWT_PREVIOUS_KEY_ID: z.string().optional(),
    JWT_PREVIOUS_VALID_UNTIL: z.iso.datetime().optional(),
    SECURITY_STORE: z
      .enum(['memory', 'redis'])
      .default(() => (inProduction() ? 'redis' : 'memory')),
    REDIS_URL: z.url().optional(),
    SECURITY_NAMESPACE: z.string().min(1).max(100).default('gp:security:v1'),
    OIDC_PRIVATE_HOSTS: z.string().default(''),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    FIELD_ENCRYPTION_ACTIVE_KEY_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,32}$/)
      .optional(),
    FIELD_ENCRYPTION_KEYS_JSON: z
      .string()
      .default('{}')
      .transform((raw, ctx) => {
        try {
          const keys = JSON.parse(raw);
          if (
            !keys ||
            Array.isArray(keys) ||
            typeof keys !== 'object' ||
            Object.keys(keys).length > 8 ||
            Object.entries(keys).some(
              ([id, key]) =>
                !/^[a-zA-Z0-9_-]{1,32}$/.test(id) ||
                typeof key !== 'string' ||
                Buffer.from(key, 'base64').length !== 32,
            )
          )
            throw new Error();
          return keys as Record<string, string>;
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Invalid retained encryption-key ring' });
          return z.NEVER;
        }
      }),
    FIELD_ENCRYPTION_KEY: z
      .string()
      .min(40, 'FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
    /** Background work: attendance processing, completing separations. Tests turn it off. */
    BACKGROUND_JOBS: z
      .enum(['on', 'off'])
      .default('on')
      .transform((v) => v === 'on'),
    /** How often attendance is processed in the background. */
    ATTENDANCE_JOB_INTERVAL_MINUTES: z.coerce.number().min(1).default(15),
    /** Where documents go: a local directory, or an S3-compatible bucket. */
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_DIR: z.string().default('storage'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default('ap-south-1'),
    S3_ENDPOINT: z.url().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Chrome or Chromium for PDFs; found in the usual places when not set. */
    CHROME_PATH: z.string().optional(),
    /** What the status page's web check fetches; WEB_ORIGIN/login when not set. */
    STATUS_WEB_URL: z.url().optional(),
    /**
     * Admin roles (workspace admin, HR admin, platform super admin) must use two-step sign-in.
     * On in production; off in development so seeded logins sign in with a password alone.
     */
    REQUIRE_ADMIN_MFA: z
      .enum(['on', 'off'])
      .default('off')
      .transform((v) => v === 'on'),
    /** The API's own public address, where payment gateways send customers back and notify. */
    API_ORIGIN: z.string().default('http://localhost:4000'),
    /** Card payments for invoices through SSLCommerz; off when the store is not set. */
    SSLCOMMERZ_STORE_ID: z.string().optional(),
    SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
    SSLCOMMERZ_SANDBOX: z
      .enum(['on', 'off'])
      .default('on')
      .transform((v) => v === 'on'),
    /** bKash tokenized checkout; the merchant's onboarding gives the base URL and version. */
    BKASH_APP_KEY: z.string().optional(),
    BKASH_APP_SECRET: z.string().optional(),
    BKASH_USERNAME: z.string().optional(),
    BKASH_PASSWORD: z.string().optional(),
    BKASH_BASE_URL: z.url().default('https://tokenized.sandbox.bka.sh/v1.2.0-beta'),
    /** A pretend gateway that always succeeds: development and tests only, never production. */
    BILLING_FAKE_GATEWAY: z
      .enum(['on', 'off'])
      .default('off')
      .transform((v) => v === 'on'),
    /** Self-serve sign-up for 30-day trials; off for our own and self-hosted installations. */
    SIGNUP_ENABLED: z
      .enum(['on', 'off'])
      .default('on')
      .transform((v) => v === 'on'),
    /** Where notifications go. `log` writes them to the API log instead of sending them. */
    EMAIL_DRIVER: z.enum(['log', 'smtp', 'disabled']).default('log'),
    /** Lets a production server (a staging box) keep the `log` e-mail and SMS drivers. */
    ALLOW_LOG_SENDERS: z
      .enum(['on', 'off'])
      .default('off')
      .transform((v) => v === 'on'),
    SMTP_URL: z.string().optional(),
    EMAIL_FROM: z.string().default('Good People <no-reply@goodpeople.local>'),
    /** Good People's support team: told of every new ticket and every customer reply. */
    SUPPORT_INBOX_EMAIL: z.email().default('support@goodpeople.example'),
    SMS_DRIVER: z.enum(['log', 'sslwireless', 'disabled']).default('log'),
    SSLWIRELESS_URL: z.url().default('https://smsplus.sslwireless.com/api/v3/send-sms'),
    SSLWIRELESS_API_TOKEN: z.string().optional(),
    SSLWIRELESS_SID: z.string().optional(),
    PUSH_DRIVER: z.enum(['log', 'fcm', 'disabled']).default('log'),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    /** The service account's private key; `\n` in the value stands for line breaks. */
    FCM_PRIVATE_KEY: z.string().optional(),
  })
  .refine(
    (c) =>
      c.DEPLOYMENT_MODE === 'managed' ||
      c.EMAIL_DRIVER !== 'smtp' ||
      c.SUPPORT_INBOX_EMAIL !== 'support@goodpeople.example',
    { message: 'Installed SMTP requires an explicit customer SUPPORT_INBOX_EMAIL' },
  )
  .refine(
    (c) =>
      !c.FIELD_ENCRYPTION_ACTIVE_KEY_ID ||
      !!c.FIELD_ENCRYPTION_KEYS_JSON[c.FIELD_ENCRYPTION_ACTIVE_KEY_ID],
    { message: 'Active encryption key is missing' },
  )
  .refine(
    (c) =>
      c.DEPLOYMENT_MODE === 'managed' ||
      (!isExampleSecret(c.JWT_ACCESS_SECRET) && !isExampleSecret(c.FIELD_ENCRYPTION_KEY)),
    { message: 'Installed deployments refuse published demo secrets' },
  )
  .refine(
    (c) =>
      c.DEPLOYMENT_MODE === 'managed' ||
      (!!c.INSTALLATION_ID &&
        !!c.INSTALLATION_TENANT_ID &&
        c.REQUIRE_ADMIN_MFA &&
        !c.SIGNUP_ENABLED),
    {
      message:
        'Installed deployments require installation/tenant UUIDs, MFA and SIGNUP_ENABLED=off',
    },
  )
  .refine((c) => c.SECURITY_STORE !== 'redis' || !!c.REDIS_URL, {
    message: 'Redis security state requires REDIS_URL',
  })
  .refine((c) => !inProduction() || c.SECURITY_STORE === 'redis', {
    message: 'Production security state requires Redis',
  })
  .refine(
    (c) =>
      !c.JWT_PREVIOUS_ACCESS_SECRET ||
      (!!c.JWT_PREVIOUS_KEY_ID &&
        !!c.JWT_PREVIOUS_VALID_UNTIL &&
        c.JWT_PREVIOUS_KEY_ID !== c.JWT_ACCESS_KEY_ID),
    { message: 'Previous signing key needs a different ID and explicit overlap end' },
  )
  .refine(
    (c) =>
      c.STORAGE_DRIVER !== 's3' || (c.S3_BUCKET && c.S3_ACCESS_KEY_ID && c.S3_SECRET_ACCESS_KEY),
    { message: 'S3 storage needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY' },
  )
  .refine((c) => c.EMAIL_DRIVER !== 'smtp' || c.SMTP_URL, {
    message: 'EMAIL_DRIVER=smtp needs SMTP_URL, e.g. smtp://user:pass@smtp.example.com:587',
  })
  .refine((c) => c.SMS_DRIVER !== 'sslwireless' || (c.SSLWIRELESS_API_TOKEN && c.SSLWIRELESS_SID), {
    message: 'SMS_DRIVER=sslwireless needs SSLWIRELESS_API_TOKEN and SSLWIRELESS_SID',
  })
  .refine(
    (c) =>
      !inProduction() ||
      c.ALLOW_LOG_SENDERS ||
      (c.EMAIL_DRIVER !== 'log' && c.SMS_DRIVER !== 'log'),
    {
      message:
        'In production, set EMAIL_DRIVER=smtp and SMS_DRIVER=sslwireless: the log drivers send ' +
        'nothing (sign-in codes included). On a staging server, ALLOW_LOG_SENDERS=on keeps them.',
    },
  )
  .refine((c) => !inProduction() || !isExampleSecret(c.JWT_ACCESS_SECRET), {
    message:
      'JWT_ACCESS_SECRET is the published example: generate one with openssl rand -base64 48',
  })
  .refine((c) => !inProduction() || !isExampleSecret(c.FIELD_ENCRYPTION_KEY), {
    message:
      'FIELD_ENCRYPTION_KEY is the published example: generate one with openssl rand -base64 32',
  })
  .refine((c) => !inProduction() || !c.BILLING_FAKE_GATEWAY, {
    message: 'BILLING_FAKE_GATEWAY=on takes no money: never turn it on in production',
  })
  .refine(
    (c) => c.PUSH_DRIVER !== 'fcm' || (c.FCM_PROJECT_ID && c.FCM_CLIENT_EMAIL && c.FCM_PRIVATE_KEY),
    { message: 'PUSH_DRIVER=fcm needs FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY' },
  );

export type AppConfig = z.infer<typeof configSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(overrides: Partial<Record<keyof AppConfig, string>> = {}): AppConfig {
  loadRootEnv();
  const values = { ...process.env, ...overrides };
  if (values.DEPLOYMENT_MODE && values.DEPLOYMENT_MODE !== 'managed')
    for (const channel of ['EMAIL_DRIVER', 'SMS_DRIVER', 'PUSH_DRIVER'] as const)
      if (!values[channel]) values[channel] = 'disabled';
  return configSchema.parse(values);
}
