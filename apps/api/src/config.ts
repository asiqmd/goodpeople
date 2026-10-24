import { loadRootEnv } from '@gp/db';
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  FIELD_ENCRYPTION_KEY: z.string().min(40, 'FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
});

export type AppConfig = z.infer<typeof configSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(overrides: Partial<Record<keyof AppConfig, string>> = {}): AppConfig {
  loadRootEnv();
  return configSchema.parse({ ...process.env, ...overrides });
}
