import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { employeeAllocations, timesheets } from '@gp/db';
import { addMonths, monthBounds, todayIn } from '@gp/shared';
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { monthName } from './timesheet-month.js';

/** Reminders go out on the first days of a month, for the month before. */
const REMINDER_DAYS = 5;

/**
 * Once an hour in the first days of a month, tells everyone charged to a project last month
 * whose timesheet for it is not yet submitted. Each person is told once per month, however
 * often this runs.
 */
@Injectable()
export class TimesheetJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TimesheetJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly tenantDb: TenantDb,
    private readonly notifications: NotificationsService,
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
    if (Number(todayIn().slice(8)) > REMINDER_DAYS) return;
    for (const tenant of await this.entitlements.all()) {
      if (tenant.access.accessState === 'suspended') continue;
      if (!tenant.access.features.includes('projects')) continue;
      try {
        await runInTenantContext(tenant.id, () => this.remindTenant());
      } catch (error) {
        this.logger.error(`Timesheet reminders failed for ${tenant.slug}`, error as Error);
      }
    }
  }

  /** Last month's reminders for the current workspace. Returns how many people were told. */
  remindTenant(now = new Date()): Promise<number> {
    const today = todayIn('Asia/Dhaka', now);
    if (Number(today.slice(8)) > REMINDER_DAYS) return Promise.resolve(0);
    const month = addMonths(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
    const { start, end } = monthBounds(month);
    return this.tenantDb.run(async (tx) => {
      const charged = await tx
        .selectDistinct({ employeeId: employeeAllocations.employeeId })
        .from(employeeAllocations)
        .where(
          and(
            lte(employeeAllocations.fromOn, end),
            or(isNull(employeeAllocations.toOn), gte(employeeAllocations.toOn, start)),
          ),
        );
      if (charged.length === 0) return 0;
      const done = new Set(
        (
          await tx
            .select({ employeeId: timesheets.employeeId })
            .from(timesheets)
            .where(
              and(
                eq(timesheets.month, start),
                inArray(timesheets.status, ['submitted', 'approved']),
              ),
            )
        ).map((t) => t.employeeId),
      );
      let told = 0;
      for (const { employeeId } of charged) {
        if (done.has(employeeId)) continue;
        told += await this.notifications.notify(tx, {
          event: 'timesheet.due',
          recipients: [{ employeeId }],
          values: { 'timesheet.month': monthName(month) },
          link: `/workspace/timesheets?month=${month}`,
          dedupeKey: `timesheet.due:${employeeId}:${month}`,
          data: { month },
        });
      }
      return told;
    });
  }
}
