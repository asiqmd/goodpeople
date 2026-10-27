import { Injectable } from '@nestjs/common';
import type { Heartbeat } from './status-state.js';

/** The background jobs the status page watches. */
export type WatchedJob = 'notifications' | 'attendance';

/**
 * Background jobs report each sweep here, and the status checks read it. In memory: a job
 * runs in this process, and a restart starts with no sweeps and a grace period.
 */
@Injectable()
export class JobHeartbeats {
  readonly startedAt = new Date();
  private readonly beats = new Map<WatchedJob, Heartbeat>();

  beat(job: WatchedJob, ok: boolean, at = new Date()): void {
    this.beats.set(job, { at, ok });
  }

  last(job: WatchedJob): Heartbeat | undefined {
    return this.beats.get(job);
  }
}
