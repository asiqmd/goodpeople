import { createDb, loadRootEnv, requireEnv, seed } from '../index.js';

loadRootEnv();
if (process.env.DEPLOYMENT_MODE && process.env.DEPLOYMENT_MODE !== 'managed')
  throw new Error('This command is unavailable for an installed enterprise deployment');

const { db, pool } = createDb(requireEnv('DATABASE_OWNER_URL'), { max: 2 });
try {
  const { created } = await seed(db, {
    superAdminEmail: requireEnv('SEED_SUPER_ADMIN_EMAIL'),
    password: requireEnv('SEED_PASSWORD'),
    fieldKey: requireEnv('FIELD_ENCRYPTION_KEY'),
  });
  console.log(
    created.length ? `Seeded tenants: ${created.join(', ')}` : 'Seed data already present',
  );
} finally {
  await pool.end();
}
