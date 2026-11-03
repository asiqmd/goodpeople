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
import { SeparationsService } from './separations.service.js';

/** Completes separations whose last working day has passed, hourly, in every workspace. */
@Injectable()
export class LifecycleJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LifecycleJobs.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly separations: SeparationsService,
  ) {}

  onApplicationBootstrap() {
    // M2: only the separate, leased worker scheduler owns timers.
    void this.config.BACKGROUND_JOBS;
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
  }

  runTenant() {
    return this.separations.completeDue();
  }

  async runAll(): Promise<void> {
    for (const tenant of await this.entitlements.all()) {
      if (tenant.access.accessState === 'suspended') continue;
      try {
        await runInTenantContext(tenant.id, () => this.separations.completeDue());
      } catch (error) {
        this.logger.error(`Completing separations failed for ${tenant.slug}`, error as Error);
      }
    }
  }
}
