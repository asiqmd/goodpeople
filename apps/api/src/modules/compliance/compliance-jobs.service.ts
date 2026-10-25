import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { todayIn, type ComplianceCheckResult } from '@gp/shared';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { ComplianceCheckService, recentWindow } from './compliance-check.service.js';

/**
 * Checks every workspace's recent working time once an hour (this week and last, and the
 * month to date), after attendance has been processed. Safe to run any number of times.
 */
@Injectable()
export class ComplianceJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ComplianceJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly check: ComplianceCheckService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.BACKGROUND_JOBS) return;
    const tick = () => {
      this.running ??= this.runAll().finally(() => (this.running = undefined));
    };
    this.timers = [setTimeout(tick, 90_000), setInterval(tick, 60 * 60_000)];
    for (const timer of this.timers) timer.unref();
  }

  async onApplicationShutdown() {
    for (const timer of this.timers) clearInterval(timer);
    await this.running;
  }

  async runAll(): Promise<void> {
    for (const tenant of await this.entitlements.all()) {
      const { accessState, features } = tenant.access;
      if (accessState === 'suspended' || !features.includes('attendance')) continue;
      try {
        await runInTenantContext(tenant.id, () => this.runTenant());
      } catch (error) {
        this.logger.error(`Compliance check failed for ${tenant.slug}`, error as Error);
      }
    }
  }

  /** The current workspace's recent window. */
  runTenant(now = new Date()): Promise<ComplianceCheckResult> {
    return this.check.run(recentWindow(todayIn('Asia/Dhaka', now)));
  }
}
