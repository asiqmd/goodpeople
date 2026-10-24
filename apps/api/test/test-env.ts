import { databaseName, loadRootEnv, requireEnv, seedAdminEmail, withDatabase } from '@gp/db';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

/** The same server and roles as development, against `<name>_test`. */
export function testEnv() {
  loadRootEnv();
  const owner = requireEnv('DATABASE_OWNER_URL');
  const name = `${databaseName(owner)}_test`;
  return {
    adminUrl: process.env.DATABASE_ADMIN_URL,
    ownerUrl: withDatabase(owner, name),
    appUrl: withDatabase(requireEnv('DATABASE_URL'), name),
    superAdminEmail: requireEnv('SEED_SUPER_ADMIN_EMAIL'),
    password: requireEnv('SEED_PASSWORD'),
    fieldKey: requireEnv('FIELD_ENCRYPTION_KEY'),
  };
}

export async function bootApp(): Promise<INestApplication> {
  // Tests process attendance explicitly; the background job would race them.
  const app = await createApp(
    loadConfig({ DATABASE_URL: testEnv().appUrl, ATTENDANCE_JOB_INTERVAL_MINUTES: '0' }),
  );
  await app.init();
  return app;
}

export const api = (app: INestApplication) => request(app.getHttpServer());

export async function platformToken(app: INestApplication, email = testEnv().superAdminEmail) {
  const res = await api(app)
    .post('/platform/auth/login')
    .send({ email, password: testEnv().password })
    .expect(200);
  return res.body.accessToken as string;
}

export async function tenantLogin(
  app: INestApplication,
  slug: string,
  password = testEnv().password,
) {
  const res = await api(app)
    .post('/auth/login')
    .send({ tenant: slug, email: seedAdminEmail(slug), password })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

let counter = 0;
/** A workspace slug unique to this test run. */
export const uniqueSlug = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${counter++}`;
