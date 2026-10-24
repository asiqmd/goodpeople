import { databaseName, ensureDatabases, loadRootEnv, requireEnv } from '../index.js';

loadRootEnv();
const ownerUrl = requireEnv('DATABASE_OWNER_URL');
const name = databaseName(ownerUrl);
await ensureDatabases({
  adminUrl: requireEnv('DATABASE_ADMIN_URL'),
  ownerUrl,
  appUrl: requireEnv('DATABASE_URL'),
  databases: [name, `${name}_test`],
});
console.log(`Roles and databases ready: ${name}, ${name}_test`);
