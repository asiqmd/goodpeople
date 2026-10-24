import { loadRootEnv } from '@gp/db';
import { z } from 'zod';

const configSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    /** Proxies in front of the API (Caddy: 1), so rate limits see the visitor's address. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
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
    /**
     * Admin roles (workspace admin, HR admin, platform super admin) must use two-step sign-in.
     * On in production; off in development so seeded logins sign in with a password alone.
     */
    REQUIRE_ADMIN_MFA: z
      .enum(['on', 'off'])
      .default('off')
      .transform((v) => v === 'on'),
    /** Where notifications go. `log` writes them to the API log instead of sending them. */
    EMAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
    SMTP_URL: z.string().optional(),
    EMAIL_FROM: z.string().default('Good People <no-reply@goodpeople.local>'),
    SMS_DRIVER: z.enum(['log', 'sslwireless']).default('log'),
    SSLWIRELESS_URL: z.url().default('https://smsplus.sslwireless.com/api/v3/send-sms'),
    SSLWIRELESS_API_TOKEN: z.string().optional(),
    SSLWIRELESS_SID: z.string().optional(),
    PUSH_DRIVER: z.enum(['log', 'fcm']).default('log'),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    /** The service account's private key; `\n` in the value stands for line breaks. */
    FCM_PRIVATE_KEY: z.string().optional(),
  })
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
    (c) => c.PUSH_DRIVER !== 'fcm' || (c.FCM_PROJECT_ID && c.FCM_CLIENT_EMAIL && c.FCM_PRIVATE_KEY),
    { message: 'PUSH_DRIVER=fcm needs FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY' },
  );

export type AppConfig = z.infer<typeof configSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(overrides: Partial<Record<keyof AppConfig, string>> = {}): AppConfig {
  loadRootEnv();
  return configSchema.parse({ ...process.env, ...overrides });
}
