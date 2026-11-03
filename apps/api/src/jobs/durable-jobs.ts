import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { jobLeases, withJobFence, type Database } from '@gp/db';
import { eq, and, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
@Injectable()
export class DurableJobs {
  constructor(
    @Inject(DB) private db: Database,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) {}
  async run<T>(
    key: string,
    intervalMs: number,
    fn: () => Promise<T>,
  ): Promise<{ ran: boolean; value?: T }> {
    const result = await this.start(key, intervalMs, fn);
    return result.ran ? { ran: true, value: await result.completion } : { ran: false };
  }
  /** Claims before returning; a scheduler can bound active jobs without leasing a waiting queue. */
  async start<T>(
    key: string,
    intervalMs: number,
    fn: () => Promise<T>,
  ): Promise<{ ran: false } | { ran: true; completion: Promise<T> }> {
    const owner = randomUUID(),
      seconds = this.config.JOB_LEASE_SECONDS,
      interval = Math.max(1, Math.floor(intervalMs / 1000));
    const result = await this.db
      .execute(sql`with clock as(select clock_timestamp() stamp,to_timestamp(floor(extract(epoch from clock_timestamp())/${interval})*${interval}) slot)
   insert into job_leases(key,owner,lease_until,heartbeat_at,started_at) select ${key},${owner}::uuid,stamp+make_interval(secs=>${seconds}),stamp,stamp from clock
   on conflict(key) do update set owner=excluded.owner,lease_until=excluded.lease_until,heartbeat_at=excluded.heartbeat_at,started_at=excluded.started_at
   where (job_leases.lease_until is null or job_leases.lease_until<=clock_timestamp()) and (job_leases.completed_slot is null or job_leases.completed_slot<(select slot from clock)) returning key,(select slot from clock) slot`);
    if (!result.rows.length) return { ran: false };
    const slot = new Date(String(result.rows[0]!.slot));
    return { ran: true, completion: this.execute(key, owner, slot, fn) };
  }
  private async execute<T>(key: string, owner: string, slot: Date, fn: () => Promise<T>) {
    const seconds = this.config.JOB_LEASE_SECONDS;
    const timer = setInterval(
      () => {
        void this.db
          .update(jobLeases)
          .set({
            heartbeatAt: sql`clock_timestamp()`,
            leaseUntil: sql`clock_timestamp()+make_interval(secs=>${seconds})`,
          })
          .where(
            and(
              eq(jobLeases.key, key),
              eq(jobLeases.owner, owner),
              sql`${jobLeases.leaseUntil}>clock_timestamp()`,
            ),
          )
          .catch(() => undefined);
      },
      Math.max(1000, (seconds * 1000) / 3),
    );
    timer.unref();
    try {
      const value = await withJobFence({ key, owner }, fn);
      await this.db
        .update(jobLeases)
        .set({
          owner: null,
          leaseUntil: null,
          finishedAt: new Date(),
          heartbeatAt: new Date(),
          completedSlot: slot,
          ok: true,
          lastError: null,
        })
        .where(and(eq(jobLeases.key, key), eq(jobLeases.owner, owner)));
      return value;
    } catch (error) {
      await this.db
        .update(jobLeases)
        .set({
          owner: null,
          leaseUntil: new Date(Date.now() + 30000),
          finishedAt: new Date(),
          ok: false,
          lastError: 'job_failed',
        })
        .where(and(eq(jobLeases.key, key), eq(jobLeases.owner, owner)));
      throw error;
    } finally {
      clearInterval(timer);
    }
  }
}
