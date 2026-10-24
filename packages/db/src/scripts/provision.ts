import { eq } from 'drizzle-orm';
import {
  createDb,
  loadRootEnv,
  provisionCountryDefaults,
  requireEnv,
  runAsTenant,
  tenants,
} from '../index.js';

/**
 * Brings every workspace up to the country pack's current defaults after an upgrade (for
 * example payroll components added in Phase 2). Idempotent: nothing a workspace has is changed.
 */
loadRootEnv();
const { db, pool } = createDb(requireEnv('DATABASE_OWNER_URL'), { max: 1 });
try {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
  const all = await db.select().from(tenants).where(eq(tenants.countryPack, 'BD'));
  for (const tenant of all) {
    await runAsTenant(db, tenant.id, (tx) =>
      provisionCountryDefaults(tx, tenant.id, { countryPack: 'BD', today }),
    );
  }
  console.log(`Provisioned ${all.length} workspace${all.length === 1 ? '' : 's'}`);
} finally {
  await pool.end();
}
