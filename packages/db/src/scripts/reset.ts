import { createDb, loadRootEnv, requireEnv, resetSchema, runMigrations, seed } from '../index.js';

loadRootEnv();
if (process.env.DEPLOYMENT_MODE && process.env.DEPLOYMENT_MODE !== 'managed')
  throw new Error('This command is unavailable for an installed enterprise deployment');

if (process.env.NODE_ENV === 'production')
  throw new Error('Refusing to reset a production database');
const ownerUrl = requireEnv('DATABASE_OWNER_URL');
await resetSchema(ownerUrl, requireEnv('DATABASE_URL'));
await runMigrations(ownerUrl);
const { db, pool } = createDb(ownerUrl, { max: 2 });
try {
  await seed(db, {
    superAdminEmail: requireEnv('SEED_SUPER_ADMIN_EMAIL'),
    password: requireEnv('SEED_PASSWORD'),
    fieldKey: requireEnv('FIELD_ENCRYPTION_KEY'),
  });
} finally {
  await pool.end();
}
console.log('Database reset, migrated and seeded');
