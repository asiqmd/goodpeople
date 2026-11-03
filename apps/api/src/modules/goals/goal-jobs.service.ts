import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { goals } from '@gp/db';
import { todayIn } from '@gp/shared';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { storeRecordKpis } from './kpi-records.js';

/**
 * Once a day, stores what the records say for every open KPI read from them: the attendance
 * rate and output against target. Reading a goal works the value out without writing, so the
 * stored value is at most a day old for whatever reads the table. Storing the same value
 * twice changes nothing, so it may run as often as it likes.
 */
@Injectable()
export class GoalJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(GoalJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly tenantDb: TenantDb,
  ) {}

  onApplicationBootstrap() {
    // M2: only the separate, leased worker scheduler owns timers.
    void this.config.BACKGROUND_JOBS;
  }

  async onApplicationShutdown() {
    for (const timer of this.timers) clearInterval(timer);
    await this.running?.catch(() => undefined);
  }

  private async everyTenant() {
    for (const tenant of await this.entitlements.all()) {
      if (tenant.access.accessState === 'suspended') continue;
      if (!tenant.access.features.includes('performance')) continue;
      try {
        await runInTenantContext(tenant.id, () => this.refreshTenant());
      } catch (error) {
        this.logger.error(`Goal KPIs failed for ${tenant.slug}`, error as Error);
      }
    }
  }

  /** Stores today's value of the current workspace's open KPIs from the records. */
  refreshTenant(now = new Date()): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.kind, 'kpi'),
            ne(goals.source, 'manual'),
            inArray(goals.status, ['draft', 'agreed']),
          ),
        );
      // No lock: only the derived value and progress are written, and the next read or run
      // works them out again.
      return storeRecordKpis(tx, rows, todayIn('Asia/Dhaka', now));
    });
  }
}
