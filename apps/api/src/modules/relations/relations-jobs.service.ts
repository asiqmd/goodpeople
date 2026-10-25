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
import { RelationsAlertsService } from './relations-alerts.service.js';

const DAY = 24 * 60 * 60_000;

/** Checks every workspace's committees once a day (and soon after start) and raises alerts. */
@Injectable()
export class RelationsJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RelationsJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly alerts: RelationsAlertsService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.BACKGROUND_JOBS) return;
    const run = () => {
      this.running ??= this.checkAll().finally(() => (this.running = undefined));
    };
    this.timers = [setInterval(run, DAY), setTimeout(run, 90_000)];
    for (const timer of this.timers) timer.unref();
  }

  async onApplicationShutdown() {
    for (const timer of this.timers) clearInterval(timer);
    await this.running;
  }

  /** Every workspace that is not suspended; one failing does not stop the others. */
  async checkAll(): Promise<void> {
    for (const tenant of await this.entitlements.all()) {
      if (tenant.access.accessState === 'suspended') continue;
      try {
        await runInTenantContext(tenant.id, () => this.alerts.check());
      } catch (error) {
        this.logger.error(`Committee checks failed for ${tenant.slug}`, error as Error);
      }
    }
  }
}
