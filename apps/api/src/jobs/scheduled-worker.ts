import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { EntitlementsService } from '../modules/entitlements/entitlements.service.js';
import { runInTenantContext } from '../common/request-context.js';
import { DurableJobs } from './durable-jobs.js';
import { AttendanceJobs } from '../modules/attendance/attendance-jobs.service.js';
import { NotificationDispatcher } from '../modules/notifications/notification-dispatcher.service.js';
import { NotificationJobs } from '../modules/notifications/notification-jobs.service.js';
import { TimesheetJobs } from '../modules/timesheets/timesheet-jobs.service.js';
import { OfferJobs } from '../modules/offers/offer-jobs.service.js';
import { RelationsJobs } from '../modules/relations/relations-jobs.service.js';
import { GoalJobs } from '../modules/goals/goal-jobs.service.js';
import { EmployeeServicesJobs } from '../modules/employee-services/employee-services-jobs.service.js';
import { ProbationReviewJobs } from '../modules/development/probation-jobs.service.js';
import { LearningJobs } from '../modules/learning/learning-jobs.service.js';
import { OpeningJobs } from '../modules/recruitment/opening-jobs.service.js';
import { LifecycleJobs } from '../modules/lifecycle/lifecycle-jobs.service.js';
import { ComplianceJobs } from '../modules/compliance/compliance-jobs.service.js';
import { CandidateRetentionJobs } from '../modules/applications/retention-jobs.service.js';
import { MaternityJobs } from '../modules/maternity/maternity-jobs.service.js';
import { ReviewJobs } from '../modules/reviews/review-jobs.service.js';
import { WebhookWorker } from '../modules/integrations/webhook-worker.js';
import { BillingJobs } from '../modules/billing/billing-jobs.service.js';
import { SupportJobs } from '../modules/support/support-jobs.service.js';
import { StatusChecks } from '../modules/status/status-checks.service.js';

import { InsightJobsService } from '../modules/analytics/insight-jobs.service.js';

export const SCHEDULED_TASKS = [
  {
    name: 'insight-jobs',
    provider: InsightJobsService,
    method: 'runTenant',
    feature: undefined,
    interval: 30000,
    system: false,
  },
  {
    name: 'attendance',
    provider: AttendanceJobs,
    method: 'runTenant',
    feature: 'attendance',
    interval: 900000,
    system: false,
  },
  {
    name: 'notifications',
    provider: NotificationDispatcher,
    method: 'runTenant',
    feature: undefined,
    interval: 30000,
    system: false,
  },
  {
    name: 'reminders',
    provider: NotificationJobs,
    method: 'remindTenant',
    feature: undefined,
    interval: 3600000,
    system: false,
  },
  {
    name: 'timesheets',
    provider: TimesheetJobs,
    method: 'remindTenant',
    feature: 'projects',
    interval: 3600000,
    system: false,
  },
  {
    name: 'offers',
    provider: OfferJobs,
    method: 'expireTenant',
    feature: 'recruitment',
    interval: 86400000,
    system: false,
  },
  {
    name: 'relations',
    provider: RelationsJobs,
    method: 'runTenant',
    feature: undefined,
    interval: 86400000,
    system: false,
  },
  {
    name: 'goals',
    provider: GoalJobs,
    method: 'refreshTenant',
    feature: 'performance',
    interval: 86400000,
    system: false,
  },
  {
    name: 'employee-services',
    provider: EmployeeServicesJobs,
    method: 'remindTenant',
    feature: 'core_hr',
    interval: 86400000,
    system: false,
  },
  {
    name: 'probation',
    provider: ProbationReviewJobs,
    method: 'askTenant',
    feature: 'performance',
    interval: 86400000,
    system: false,
  },
  {
    name: 'learning',
    provider: LearningJobs,
    method: 'remindTenant',
    feature: 'lms',
    interval: 86400000,
    system: false,
  },
  {
    name: 'openings',
    provider: OpeningJobs,
    method: 'closeTenant',
    feature: 'recruitment',
    interval: 60000,
    system: false,
  },
  {
    name: 'lifecycle',
    provider: LifecycleJobs,
    method: 'runTenant',
    feature: undefined,
    interval: 60000,
    system: false,
  },
  {
    name: 'compliance',
    provider: ComplianceJobs,
    method: 'runTenant',
    feature: 'attendance',
    interval: 3600000,
    system: false,
  },
  {
    name: 'retention',
    provider: CandidateRetentionJobs,
    method: 'eraseExpired',
    feature: undefined,
    interval: 86400000,
    system: false,
  },
  {
    name: 'maternity',
    provider: MaternityJobs,
    method: 'remindTenant',
    feature: 'leave',
    interval: 3600000,
    system: false,
  },
  {
    name: 'reviews',
    provider: ReviewJobs,
    method: 'remindTenant',
    feature: 'performance',
    interval: 3600000,
    system: false,
  },
  {
    name: 'webhooks',
    provider: WebhookWorker,
    method: 'runTenant',
    feature: undefined,
    interval: 5000,
    system: false,
  },
  {
    name: 'billing',
    provider: BillingJobs,
    method: 'runDaily',
    feature: undefined,
    interval: 10800000,
    system: true,
  },
  {
    name: 'support',
    provider: SupportJobs,
    method: 'closeResolved',
    feature: undefined,
    interval: 3600000,
    system: true,
  },
  {
    name: 'status',
    provider: StatusChecks,
    method: 'runChecks',
    feature: undefined,
    interval: 60000,
    system: true,
  },
] as const;

@Injectable()
export class ScheduledWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private logger = new Logger('ScheduledWorker');
  private timer?: NodeJS.Timeout;
  private pending = new Map<string, Promise<unknown>>();
  private stopped = false;
  private cursor = 0;
  private sweeping?: Promise<void>;
  constructor(
    @Inject(APP_CONFIG) private config: AppConfig,
    private ref: ModuleRef,
    private leases: DurableJobs,
    private entitlements: EntitlementsService,
  ) {}
  onApplicationBootstrap() {
    if (this.config.PROCESS_ROLE !== 'worker' || !this.config.BACKGROUND_JOBS) return;
    this.timer = setInterval(() => {
      void this.sweep().catch((error) => this.logger.error('Scheduling failed', error));
    }, 1000);
    this.timer.unref();
    void this.sweep().catch((error) => this.logger.error('Scheduling failed', error));
  }
  sweep(): Promise<void> {
    if (this.sweeping) return this.sweeping;
    this.sweeping = this.scan().finally(() => {
      this.sweeping = undefined;
    });
    return this.sweeping;
  }
  private async scan() {
    if (this.stopped || this.pending.size >= this.config.WORKER_CONCURRENCY) return;
    const tenants = await this.entitlements.all();
    const contexts = new Map(
      await Promise.all(
        tenants.map(
          async (tenant) =>
            [tenant.id, await this.entitlements.businessContext(tenant.id)] as const,
        ),
      ),
    );
    const candidates: {
      key: string;
      interval: number;
      run: () => Promise<unknown>;
      name: string;
    }[] = [];
    for (const task of SCHEDULED_TASKS) {
      const provider = this.ref.get(task.provider, { strict: false }) as unknown as Record<
        string,
        () => Promise<unknown>
      >;
      const interval =
        task.name === 'attendance'
          ? this.config.ATTENDANCE_JOB_INTERVAL_MINUTES * 60000
          : task.interval;
      if (task.system)
        candidates.push({
          key: task.name,
          interval,
          run: () => provider[task.method]!(),
          name: task.name,
        });
      else
        for (const tenant of tenants) {
          if (
            task.name !== 'insight-jobs' &&
            (((contexts.get(tenant.id)?.blocked ||
              contexts.get(tenant.id)?.zone === 'explicit_required') &&
              !['retention', 'webhooks', 'notifications'].includes(task.name)) ||
              (tenant.access.accessState === 'suspended' &&
                !['retention', 'webhooks'].includes(task.name)) ||
              (tenant.access.reason === 'license_recovery_pending' && task.name !== 'retention') ||
              (tenant.access.accessState === 'read_only' &&
                tenant.access.reason.startsWith('license') &&
                !['retention', 'webhooks', 'notifications'].includes(task.name)) ||
              (task.feature && !tenant.access.features.includes(task.feature)))
          )
            continue;
          candidates.push({
            key: `${task.name}:${tenant.id}`,
            interval,
            name: task.name,
            run: () =>
              runInTenantContext(
                tenant.id,
                () => provider[task.method]!(),
                contexts.get(tenant.id)?.zone,
              ),
          });
        }
    }
    // Resume after the last candidate so frequently due early jobs cannot starve later jobs.
    for (
      let scanned = 0;
      scanned < candidates.length &&
      !this.stopped &&
      this.pending.size < this.config.WORKER_CONCURRENCY;
      scanned++
    ) {
      const candidate = candidates[this.cursor % candidates.length]!;
      this.cursor = (this.cursor + 1) % candidates.length;
      if (this.pending.has(candidate.key)) continue;
      const started = await this.leases.start(candidate.key, candidate.interval, candidate.run);
      if (!started.ran) continue;
      const completion = started.completion
        .catch((error) => this.logger.error(`Scheduled ${candidate.name} failed`, error))
        .finally(() => this.pending.delete(candidate.key));
      this.pending.set(candidate.key, completion);
    }
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.sweeping;
    await Promise.allSettled(this.pending.values());
  }
  async onApplicationShutdown() {
    await this.stop();
  }
}
