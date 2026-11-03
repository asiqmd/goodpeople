import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
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

export async function runMigrations(
  ownerUrl: string,
  options: {
    migrationsFolder?: string;
    beforeUpgrade?: (state: { pending: boolean; schemaVersion: number }) => Promise<unknown>;
  } = {},
) {
  const folder = options.migrationsFolder ?? MIGRATIONS;
  const lock = new pg.Client({
    connectionString: ownerUrl,
    application_name: 'gp-migration-owner',
  });
  let connectionError: Error | undefined;
  lock.on('error', (error) => {
    connectionError = error;
  });
  await lock.connect();
  try {
    await lock.query('select pg_advisory_lock(72381126003)');
    const exists = await lock.query("select to_regclass('drizzle.__drizzle_migrations') present");
    if (exists.rows[0]?.present) {
      const known = readMigrationFiles({ migrationsFolder: folder });
      const applied = await lock.query(
        'select hash,created_at from drizzle.__drizzle_migrations order by created_at',
      );
      for (const row of applied.rows) {
        const migration = known.find((m) => m.folderMillis === Number(row.created_at));
        if (!migration || migration.hash !== row.hash)
          throw new Error(
            'Migration history does not match this release; refuse upgrade or downgrade',
          );
      }
    }
    const history = readMigrationFiles({ migrationsFolder: folder });
    const appliedLatest = await lock
      .query('select max(created_at) latest from drizzle.__drizzle_migrations')
      .catch(() => ({ rows: [{ latest: null }] }));
    const pending = history.some(
      (entry) => entry.folderMillis > Number(appliedLatest.rows[0]?.latest ?? 0),
    );
    if (pending || options.beforeUpgrade) {
      const installedTable = await lock.query(
        "select to_regclass('public.enterprise_installations') present",
      );
      if (installedTable.rows[0]?.present) {
        const installed = await lock.query('select count(*)::int n from enterprise_installations');
        if (installed.rows[0].n) {
          if (!options.beforeUpgrade)
            throw new Error(
              'Installed upgrades require a verified release and restored recovery point; use enterprise-cli migrate',
            );
          await options.beforeUpgrade({
            pending,
            schemaVersion: Number(
              JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'))
                .entries.at(-1)
                .tag.split('_')[0],
            ),
          });
        }
      }
    }
    await migrate(drizzle(lock), { migrationsFolder: folder });
    if (connectionError) throw connectionError;
  } finally {
    await lock.query('select pg_advisory_unlock(72381126003)').catch(() => undefined);
    await lock.end();
  }
}

export { databaseName };
