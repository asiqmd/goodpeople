import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { Database, Tx } from './client.js';
export interface JobFence {
  key: string;
  owner: string;
}
const storage = new AsyncLocalStorage<JobFence>();
export const currentJobFence = () => storage.getStore();
export const withJobFence = <T>(f: JobFence, fn: () => T): T => storage.run(f, fn);
/** Holding this shared lock serializes a business transaction with lease takeover. */
export async function assertJobFence(tx: Database | Tx) {
  const f = currentJobFence();
  if (!f) return;
  const result = await tx.execute(
    sql`select key from job_leases where key=${f.key} and owner=${f.owner}::uuid and lease_until>clock_timestamp() for share`,
  );
  if (!result.rows.length) throw new Error('Scheduled job lease has ended');
}
