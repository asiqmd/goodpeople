import { loadRootEnv, requireEnv, runMigrations } from '../index.js';

loadRootEnv();
await runMigrations(requireEnv('DATABASE_OWNER_URL'));
console.log('Migrations applied');
