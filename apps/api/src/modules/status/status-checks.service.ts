import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { statusChecks, statusDays, type Database } from '@gp/db';
import {
  addDays,
  BACKUP_STALE_HOURS,
  STATUS_COMPONENTS,
  STATUS_HISTORY_DAYS,
  todayIn,
  type StatusComponent,
} from '@gp/shared';
import { lt, sql } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { JobHeartbeats, type WatchedJob } from './job-heartbeats.js';
import { OperationsService } from './operations.service.js';
import { heartbeatCheck } from './status-state.js';
import { StatusProbes, within } from './status-probes.js';
import { StatusService } from './status.service.js';

export interface CheckResult {
  component: StatusComponent;
  ok: boolean;
  latencyMs: number | null;
  /** Why it failed, for staff. */
  detail: string | null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const KEEP_CHECKS_MS = 7 * 24 * HOUR_MS;
const PROBE_TIMEOUT_MS = 5_000;
/** Notifications are swept every 30 seconds. */
const NOTIFICATIONS_WINDOW_MS = 2 * MINUTE_MS;

const reason = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 300) || 'failed';

async function timed(probe: () => Promise<void>): Promise<Omit<CheckResult, 'component'>> {
  const started = performance.now();
  const latency = () => Math.round(performance.now() - started);
  try {
    await within(PROBE_TIMEOUT_MS, probe);
    return { ok: true, latencyMs: latency(), detail: null };
  } catch (error) {
    return { ok: false, latencyMs: latency(), detail: reason(error) };
  }
}

/**
 * Checks each part of the service every minute and keeps the result with its day's tally for
 * the status page. Once an hour it prunes old checks and looks for backups that have stopped.
 */
@Injectable()
export class StatusChecks implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StatusChecks.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<unknown> | undefined;
  private housekeptAt = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Database,
    private readonly probes: StatusProbes,
    private readonly heartbeats: JobHeartbeats,
    private readonly status: StatusService,
    private readonly operations: OperationsService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.BACKGROUND_JOBS) return;
    const run = () => {
      this.running ??= this.runChecks()
        .catch((error: Error) => this.logger.error('Status checks failed', error))
        .finally(() => (this.running = undefined));
    };
    this.timers = [setInterval(run, MINUTE_MS), setTimeout(run, 15_000)];
    for (const timer of this.timers) timer.unref();
  }

  async onApplicationShutdown() {
    for (const timer of this.timers) clearInterval(timer);
    await this.running;
  }

  /** Every check once, each recorded with its Dhaka day's tally. Returns what was recorded. */
  async runChecks(now = new Date()): Promise<CheckResult[]> {
    const results = (
      await Promise.all(STATUS_COMPONENTS.map((component) => this.check(component, now)))
    ).filter((r): r is CheckResult => r !== null);
    const day = todayIn('Asia/Dhaka', now);
    if (results.length > 0) {
      await this.db.transaction(async (tx) => {
        await tx.insert(statusChecks).values(results.map((r) => ({ ...r, checkedAt: now })));
        await tx
          .insert(statusDays)
          .values(
            results.map((r) => ({
              component: r.component,
              day,
              checks: 1,
              failures: r.ok ? 0 : 1,
            })),
          )
          .onConflictDoUpdate({
            target: [statusDays.component, statusDays.day],
            set: {
              checks: sql`${statusDays.checks} + excluded.checks`,
              failures: sql`${statusDays.failures} + excluded.failures`,
            },
          });
      });
    }
    this.status.clearCache();
    if (now.getTime() - this.housekeptAt >= HOUR_MS) {
      this.housekeptAt = now.getTime();
      await this.prune(now);
      await this.watchBackups(now);
    }
    return results;
  }

  /** Checks older than a week, and days older than the page shows, are dropped. */
  async prune(now = new Date()): Promise<void> {
    const firstDay = addDays(todayIn('Asia/Dhaka', now), 1 - STATUS_HISTORY_DAYS);
    await this.db
      .delete(statusChecks)
      .where(lt(statusChecks.checkedAt, new Date(now.getTime() - KEEP_CHECKS_MS)));
    await this.db.delete(statusDays).where(lt(statusDays.day, firstDay));
  }

  /**
   * Logs an error when no backup has succeeded for BACKUP_STALE_HOURS. Only once backups have
   * been recorded at all: an installation without the backup cron would otherwise log forever.
   * Returns whether it logged.
   */
  async watchBackups(now = new Date()): Promise<boolean> {
    const backups = await this.operations.backupState(now);
    if (!backups.anyRecorded || !backups.staleBackup) return false;
    const last = backups.lastBackupAt?.toISOString() ?? 'never';
    this.logger.error(
      `No successful backup in ${BACKUP_STALE_HOURS} hours (last: ${last}); check the backup cron and its log`,
    );
    return true;
  }

  private async check(component: StatusComponent, now: Date): Promise<CheckResult | null> {
    switch (component) {
      case 'api':
        return { component, ...(await timed(() => this.probes.database())) };
      case 'documents': {
        // The store, and the browser that letters and payslips are printed with.
        const store = await timed(() => this.probes.fileStore());
        return store.ok && !this.probes.chromium()
          ? { component, ...store, ok: false, detail: 'pdf_unavailable' }
          : { component, ...store };
      }
      case 'web':
        return { component, ...(await timed(() => this.probes.web())) };
      case 'notifications':
        return this.sweeps(component, NOTIFICATIONS_WINDOW_MS, now);
      case 'attendance':
        return this.sweeps(
          component,
          2 * this.config.ATTENDANCE_JOB_INTERVAL_MINUTES * MINUTE_MS,
          now,
        );
      case 'payments':
        // The gateways are not ours to probe; payments show only the incidents we post.
        return null;
    }
  }

  /** A background job's last sweep. With background jobs off nothing sweeps: not checked. */
  private sweeps(job: WatchedJob, windowMs: number, now: Date): CheckResult | null {
    if (!this.config.BACKGROUND_JOBS) return null;
    const result = heartbeatCheck(
      this.heartbeats.last(job),
      this.heartbeats.startedAt,
      windowMs,
      now,
    );
    return result && { component: job, latencyMs: null, ...result };
  }
}
