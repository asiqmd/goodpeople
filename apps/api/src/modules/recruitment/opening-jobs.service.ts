import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { jobOpenings, tenantAuditLog } from '@gp/db';
import { todayIn } from '@gp/shared';
import { and, eq, lt } from 'drizzle-orm';
import { currentTenantId, runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';

/**
 * Once an hour, closes the open jobs whose closing date has passed, so the careers page and
 * Google stop showing them. Running more often than daily only makes the day's close prompt.
 */
@Injectable()
export class OpeningJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OpeningJobs.name);
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
      if (!tenant.access.features.includes('recruitment')) continue;
      try {
        await runInTenantContext(tenant.id, () => this.closeTenant());
      } catch (error) {
        this.logger.error(`Closing past jobs failed for ${tenant.slug}`, error as Error);
      }
    }
  }

  /** Closes the current workspace's jobs past their closing date. Returns their ids. */
  closeTenant(now = new Date()): Promise<string[]> {
    const today = todayIn('Asia/Dhaka', now);
    return this.tenantDb.run(async (tx) => {
      const closed = await tx
        .update(jobOpenings)
        .set({ status: 'closed', closedAt: now, updatedAt: now })
        .where(and(eq(jobOpenings.status, 'open'), lt(jobOpenings.closesOn, today)))
        .returning({ id: jobOpenings.id, closesOn: jobOpenings.closesOn });
      if (closed.length) {
        // Closed by the system on its date, so no login made the change.
        await tx.insert(tenantAuditLog).values(
          closed.map((o) => ({
            tenantId: currentTenantId(),
            actorUserId: null,
            action: 'opening.close',
            entityType: 'job_opening',
            entityId: o.id,
            before: { status: 'open' },
            after: { status: 'closed', closesOn: o.closesOn },
          })),
        );
      }
      return closed.map((o) => o.id);
    });
  }
}
