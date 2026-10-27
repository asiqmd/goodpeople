import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { attendanceSettings } from '@gp/db';
import { addDays, todayIn } from '@gp/shared';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { JobHeartbeats } from '../status/job-heartbeats.js';
import { AttendanceProcessor, settingsOf } from './processor.service.js';

/** How far back the background run catches up after downtime. */
const CATCH_UP_DAYS = 35;

/**
 * Background processing. Every run stores each workspace's days from the last day it reached
 * (re-doing that day, which may have closed since) through today, so yesterday's absences
 * and missing punches are settled and a restart catches up on its own.
 */
@Injectable()
export class AttendanceJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AttendanceJobs.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly tenantDb: TenantDb,
    private readonly processor: AttendanceProcessor,
    private readonly heartbeats: JobHeartbeats,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.BACKGROUND_JOBS) return;
    const minutes = this.config.ATTENDANCE_JOB_INTERVAL_MINUTES;
    // Each run's outcome feeds the status page's attendance check.
    const tick = () => {
      this.running ??= this.runAll()
        .then(
          (failed) => this.heartbeats.beat('attendance', failed === 0),
          (error: Error) => {
            this.heartbeats.beat('attendance', false);
            this.logger.error('Attendance processing failed', error);
          },
        )
        .finally(() => (this.running = undefined));
    };
    setTimeout(tick, 5_000).unref();
    this.timer = setInterval(tick, minutes * 60_000);
    this.timer.unref();
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
  }

  /** Processes every workspace that tracks attendance. Returns how many failed. */
  async runAll(): Promise<number> {
    let failed = 0;
    for (const tenant of await this.entitlements.all()) {
      const { accessState, features } = tenant.access;
      if (accessState === 'suspended' || !features.includes('attendance')) continue;
      try {
        await runInTenantContext(tenant.id, () => this.runTenant());
      } catch (error) {
        failed++;
        this.logger.error(`Attendance processing failed for ${tenant.slug}`, error as Error);
      }
    }
    return failed;
  }

  /** Processes one workspace (the current tenant context). Returns the days written. */
  runTenant(): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const settings = await settingsOf(tx);
      const today = todayIn();
      const earliest = addDays(today, -CATCH_UP_DAYS);
      let from = settings.processedThrough
        ? addDays(settings.processedThrough, -1)
        : settings.trackingFrom;
      if (from < earliest) from = earliest;
      const written = await this.processor.process(tx, { from, to: today });
      await tx.update(attendanceSettings).set({ processedThrough: today });
      return written;
    });
  }
}
