import {
  createDb,
  hashPassword,
  loadRootEnv,
  platformUsers,
  requireEnv,
  upsertPlanCatalog,
} from '../index.js';

/**
 * Production's first step after migrating: the plan catalogue and one super admin, and nothing
 * else (no demo workspaces). Safe to run again: plans are refreshed and an existing e-mail is
 * left as it is.
 *
 *   GP_ADMIN_EMAIL=ops@example.com GP_ADMIN_PASSWORD=… node dist/scripts/create-super-admin.js
 */
loadRootEnv();
const email = process.env.GP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.GP_ADMIN_PASSWORD ?? '';
const name = process.env.GP_ADMIN_NAME?.trim() || 'Super Admin';
if (!email || !email.includes('@')) throw new Error('Set GP_ADMIN_EMAIL');
if (password.length < 12) throw new Error('Set GP_ADMIN_PASSWORD to at least 12 characters');

const { db, pool } = createDb(requireEnv('DATABASE_OWNER_URL'), { max: 1 });
try {
  await upsertPlanCatalog(db);
  const created = await db
    .insert(platformUsers)
    .values({ email, name, role: 'super_admin', passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: platformUsers.id });
  console.log(
    created.length
      ? `Plans ready. Created super admin ${email}; turn on two-step sign-in at first sign-in.`
      : `Plans ready. ${email} already exists; nothing else changed.`,
  );
} finally {
  await pool.end();
}
