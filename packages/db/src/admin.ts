import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createDb } from './client.js';
import { databaseName, withDatabase } from './env.js';

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

interface Role {
  name: string;
  password: string;
}

const roleOf = (url: string): Role => {
  const u = new URL(url);
  return { name: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
};

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureRole(client: pg.Client, role: Role, options: string) {
  const { rowCount } = await client.query('select 1 from pg_roles where rolname = $1', [role.name]);
  const verb = rowCount ? 'ALTER' : 'CREATE';
  await client.query(
    `${verb} ROLE ${client.escapeIdentifier(role.name)} WITH ${options} PASSWORD ${client.escapeLiteral(role.password)}`,
  );
}

/** The app role reads and writes tables but cannot create them or bypass row-level security. */
async function grantAppAccess(client: pg.Client, owner: string, app: string) {
  const o = client.escapeIdentifier(owner);
  const a = client.escapeIdentifier(app);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${a}`);
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${o} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${a}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${o} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${a}`,
  );
}

/**
 * Creates the owner and app roles and the databases (dev + test). Idempotent; needs a
 * superuser connection (DATABASE_ADMIN_URL).
 */
export async function ensureDatabases(opts: {
  adminUrl: string;
  ownerUrl: string;
  appUrl: string;
  databases: string[];
}) {
  const owner = roleOf(opts.ownerUrl);
  const app = roleOf(opts.appUrl);
  await withClient(opts.adminUrl, async (admin) => {
    await ensureRole(admin, owner, 'LOGIN NOSUPERUSER NOBYPASSRLS');
    await ensureRole(admin, app, 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE');
    for (const name of opts.databases) {
      const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [
        name,
      ]);
      if (!rowCount) {
        await admin.query(
          `CREATE DATABASE ${admin.escapeIdentifier(name)} OWNER ${admin.escapeIdentifier(owner.name)}`,
        );
      }
    }
  });
  for (const name of opts.databases) {
    await withClient(withDatabase(opts.adminUrl, name), (client) =>
      grantAppAccess(client, owner.name, app.name),
    );
  }
}

/** Drops every table, type and migration record, leaving an empty schema. Dev and test only. */
export async function resetSchema(ownerUrl: string, appUrl: string) {
  const owner = roleOf(ownerUrl);
  const app = roleOf(appUrl);
  await withClient(ownerUrl, async (client) => {
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await grantAppAccess(client, owner.name, app.name);
  });
}

export async function runMigrations(ownerUrl: string) {
  const { db, pool } = createDb(ownerUrl, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  } finally {
    await pool.end();
  }
}

export { databaseName };
