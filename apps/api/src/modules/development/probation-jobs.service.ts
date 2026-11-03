import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { ProbationReviewsService } from './probation-reviews.service.js';

/**
 * Once a day, in every workspace with performance, asks managers for a review of each
 * probation ending within three weeks, and marks reviews HR has acted on since. Each review
 * is asked for once per probation end, however often this runs.
 */
@Injectable()
export class ProbationReviewJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ProbationReviewJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly probation: ProbationReviewsService,
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
        await runInTenantContext(tenant.id, () => this.askTenant());
      } catch (error) {
        this.logger.error(`Probation reviews failed for ${tenant.slug}`, error as Error);
      }
    }
  }

  /** For the current workspace. Returns how many reviews were asked for. */
  askTenant(now = new Date()): Promise<number> {
    return this.probation.askDue(now);
  }
}
