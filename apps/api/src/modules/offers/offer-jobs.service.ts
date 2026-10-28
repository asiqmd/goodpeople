import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { offers } from '@gp/db';
import { todayIn } from '@gp/shared';
import { and, eq, lt } from 'drizzle-orm';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { offerEvent } from './offer-records.js';

const DAY_MS = 24 * 60 * 60_000;

/**
 * Once a day, marks offers sent but not answered by their last day `expired`. The candidate's
 * link already refuses an answer after that day; this makes the record say so.
 */
@Injectable()
export class OfferJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OfferJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly tenantDb: TenantDb,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.BACKGROUND_JOBS) return;
    const expire = () => {
      this.running ??= this.everyTenant().finally(() => (this.running = undefined));
    };
    this.timers = [setInterval(expire, DAY_MS), setTimeout(expire, 60_000)];
    for (const timer of this.timers) timer.unref();
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
        await runInTenantContext(tenant.id, () => this.expireTenant());
      } catch (error) {
        this.logger.error(`Expiring offers failed for ${tenant.slug}`, error as Error);
      }
    }
  }

  /** Expires the current workspace's lapsed offers; returns how many. */
  expireTenant(today = todayIn()): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const lapsed = await tx
        .update(offers)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(and(eq(offers.status, 'sent'), lt(offers.expiresOn, today)))
        .returning();
      for (const offer of lapsed) await offerEvent(tx, offer, 'expired', null);
      return lapsed.length;
    });
  }
}
