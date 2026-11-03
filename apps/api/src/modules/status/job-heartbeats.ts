import { DB } from '../../db/db.module.js';
import { sql } from 'drizzle-orm';
import type { Database } from '@gp/db';
import { Injectable, Inject, Optional } from '@nestjs/common';
import type { Heartbeat } from './status-state.js';

/** The background jobs the status page watches. */
export type WatchedJob = 'notifications' | 'attendance';

/**
 * Background jobs report each sweep here, and the status checks read it. In memory: a job
 * runs in this process, and a restart starts with no sweeps and a grace period.
 */
@Injectable()
export class JobHeartbeats {
  @Optional() @Inject(DB) private db?: Database;
  async read(job: WatchedJob): Promise<Heartbeat | undefined> {
    const memory = this.last(job);
    if (memory || !this.db) return memory;
    const rows = await this.db.execute(
      sql`select max(coalesce(finished_at,heartbeat_at)) as at,bool_and(coalesce(ok,true)) as ok from job_leases where key like ${job + ':%'}`,
    );
    const row = rows.rows[0];
    return row?.at ? { at: new Date(String(row.at)), ok: row.ok === true } : undefined;
  }

  readonly startedAt = new Date();
  private readonly beats = new Map<WatchedJob, Heartbeat>();

  beat(job: WatchedJob, ok: boolean, at = new Date()): void {
    this.beats.set(job, { at, ok });
  }

  last(job: WatchedJob): Heartbeat | undefined {
    return this.beats.get(job);
  }
}
