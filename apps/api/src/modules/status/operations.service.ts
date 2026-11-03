import { Inject, Injectable } from '@nestjs/common';
import { backupRuns, statusChecks, type Database } from '@gp/db';
import {
  BACKUP_STALE_HOURS,
  VERIFY_STALE_DAYS,
  type BackupRunKind,
  type OperationsView,
  type ReadinessView,
} from '@gp/shared';
import { and, desc, eq } from 'drizzle-orm';
import { SecurityState } from '../../common/security-state.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { StatusProbes, within } from './status-probes.js';

const HOUR_MS = 3_600_000;
const RUNS_SHOWN = 30;
const PROBE_TIMEOUT_MS = 5_000;
/** /ready is public: health checkers poll it, and a burst must not hammer the document store. */
const READY_CACHE_MS = 5_000;

const passes = (probe: () => Promise<void>) =>
  within(PROBE_TIMEOUT_MS, probe).then(
    () => 'ok' as const,
    () => 'failed' as const,
  );

/** Readiness, the latest checks and the backups recorded by the backup scripts. */
@Injectable()
export class OperationsService {
  private ready: { until: number; result: Promise<ReadinessView> } | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Database,
    private readonly probes: StatusProbes,
    private readonly security: SecurityState,
  ) {}

  /** The database, the document store and Chromium; cached for a few seconds unless `fresh`. */
  readiness(fresh = false): Promise<ReadinessView> {
    const now = Date.now();
    if (fresh || !this.ready || this.ready.until <= now) {
      this.ready = { until: now + READY_CACHE_MS, result: this.checkReadiness() };
    }
    return this.ready.result;
  }

  /** Forgets the cached readiness, for tests. */
  clearCache(): void {
    this.ready = undefined;
  }

  private async checkReadiness(): Promise<ReadinessView> {
    const [database, documents, security] = await Promise.all([
      passes(() => this.probes.database()),
      passes(() => this.probes.fileStore()),
      passes(() => this.security.ping()),
    ]);
    const checks: ReadinessView['checks'] = {
      database,
      documents,
      security,
      chromium: this.probes.chromium() ? 'ok' : 'failed',
    };
    return {
      status: Object.values(checks).every((c) => c === 'ok') ? 'ready' : 'not_ready',
      checks,
    };
  }

  /** The newest successful backup and drill, whether either is overdue, and if any run is known. */
  async backupState(now = new Date()) {
    const [lastBackup, lastDrill, anyRun] = await Promise.all([
      this.lastSuccess('backup'),
      this.lastSuccess('verify'),
      this.db.select({ id: backupRuns.id }).from(backupRuns).limit(1),
    ]);
    const olderThan = (at: Date | null, ms: number) => !at || now.getTime() - at.getTime() > ms;
    return {
      lastBackupAt: lastBackup,
      lastDrillAt: lastDrill,
      staleBackup: olderThan(lastBackup, BACKUP_STALE_HOURS * HOUR_MS),
      staleDrill: olderThan(lastDrill, VERIFY_STALE_DAYS * 24 * HOUR_MS),
      anyRecorded: anyRun.length > 0,
    };
  }

  async overview(): Promise<OperationsView> {
    const [backups, runs, checks, readiness] = await Promise.all([
      this.backupState(),
      this.db.select().from(backupRuns).orderBy(desc(backupRuns.finishedAt)).limit(RUNS_SHOWN),
      this.db
        .selectDistinctOn([statusChecks.component])
        .from(statusChecks)
        .orderBy(statusChecks.component, desc(statusChecks.checkedAt)),
      this.readiness(true),
    ]);
    return {
      backgroundJobs: this.config.BACKGROUND_JOBS,
      backups: {
        lastBackupAt: backups.lastBackupAt?.toISOString() ?? null,
        lastDrillAt: backups.lastDrillAt?.toISOString() ?? null,
        staleBackup: backups.staleBackup,
        staleDrill: backups.staleDrill,
        runs: runs.map((r) => ({
          id: r.id,
          kind: r.kind,
          ok: r.ok,
          label: r.label,
          host: r.host,
          startedAt: r.startedAt.toISOString(),
          finishedAt: r.finishedAt.toISOString(),
          sizeBytes: r.sizeBytes,
          detail: r.detail,
        })),
      },
      checks: checks.map((c) => ({
        component: c.component,
        checkedAt: c.checkedAt.toISOString(),
        ok: c.ok,
        latencyMs: c.latencyMs,
        detail: c.detail,
      })),
      readiness,
    };
  }

  private async lastSuccess(kind: BackupRunKind): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: backupRuns.finishedAt })
      .from(backupRuns)
      .where(and(eq(backupRuns.kind, kind), eq(backupRuns.ok, true)))
      .orderBy(desc(backupRuns.finishedAt))
      .limit(1);
    return row?.at ?? null;
  }
}
