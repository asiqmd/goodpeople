import { createDb, databaseName, ensureDatabases, resetSchema, runMigrations, seed } from '@gp/db';
import { testEnv } from './test-env.js';

/** Rebuilds the test database from migrations and seed data before every run. */
export default async function setup() {
  const env = testEnv();
  if (env.adminUrl) {
    await ensureDatabases({
      adminUrl: env.adminUrl,
      ownerUrl: env.ownerUrl,
      appUrl: env.appUrl,
      databases: [databaseName(env.ownerUrl)],
    });
  }
  await resetSchema(env.ownerUrl, env.appUrl);
  await runMigrations(env.ownerUrl);
  const { db, pool } = createDb(env.ownerUrl, { max: 2 });
  try {
    await seed(db, { superAdminEmail: env.superAdminEmail, password: env.password });
  } finally {
    await pool.end();
  }
}
