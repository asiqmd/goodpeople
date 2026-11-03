import { currentJobFence, assertJobFence } from './job-fence.js';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const tenantBoundaries = new WeakMap<object, string>();
export function createDb(
  connectionString: string,
  options: { max?: number; integrationRetentionDays?: number; tenantId?: string } = {},
) {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  const db: Database = drizzle({ client: pool, schema });
  const transact = db.transaction.bind(db);
  db.transaction = <T>(
    fn: (tx: Tx) => Promise<T>,
    config?: Parameters<Database['transaction']>[1],
  ) =>
    transact(async (tx) => {
      if (options.tenantId) tenantBoundaries.set(tx, options.tenantId);
      await assertJobFence(tx);
      if (options.integrationRetentionDays)
        await tx.execute(
          sql`select set_config('app.integration_retention_days', ${String(options.integrationRetentionDays)}, true)`,
        );
      return fn(tx);
    }, config);
  // Direct platform queries in jobs receive the same fencing as tenant transactions.
  const query = pool.query.bind(pool);
  pool.query = ((...args: unknown[]) => {
    const fence = currentJobFence();
    if (!fence) return Reflect.apply(query, pool, args);
    return (async () => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const held = await client.query(
          'select key from job_leases where key=$1 and owner=$2::uuid and lease_until>clock_timestamp() for share',
          [fence.key, fence.owner],
        );
        if (!held.rows.length) throw new Error('Scheduled job lease has ended');
        const result = await Reflect.apply(client.query, client, args);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    })();
  }) as typeof pool.query;
  return { db, pool };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scopes the rest of an open transaction to one tenant. Row-level security policies read
 * `app.tenant_id`, so tenant tables return and accept only that tenant's rows.
 */
export async function scopeToTenant(tx: Tx, tenantId: string): Promise<void> {
  const bound = tenantBoundaries.get(tx);
  if (bound && bound !== tenantId) throw new Error('Tenant does not belong to this installation');
  if (!UUID.test(tenantId)) throw new Error(`Invalid tenant id: ${tenantId}`);
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
}

export async function runAsTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
  config?: Parameters<Database['transaction']>[1],
): Promise<T> {
  return db.transaction(async (tx) => {
    await scopeToTenant(tx, tenantId);
    return fn(tx);
  }, config);
}
