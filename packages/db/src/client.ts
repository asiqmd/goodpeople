import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export function createDb(connectionString: string, options: { max?: number } = {}) {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  const db: Database = drizzle({ client: pool, schema });
  return { db, pool };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scopes the rest of an open transaction to one tenant. Row-level security policies read
 * `app.tenant_id`, so tenant tables return and accept only that tenant's rows.
 */
export async function scopeToTenant(tx: Tx, tenantId: string): Promise<void> {
  if (!UUID.test(tenantId)) throw new Error(`Invalid tenant id: ${tenantId}`);
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
}

export async function runAsTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await scopeToTenant(tx, tenantId);
    return fn(tx);
  });
}
