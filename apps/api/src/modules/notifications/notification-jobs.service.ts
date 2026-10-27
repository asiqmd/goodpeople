import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { attendanceDays, documents, employees, jobAssignments } from '@gp/db';
import { addDays, todayIn, type UserLanguage } from '@gp/shared';
import { and, count, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { JobHeartbeats } from '../status/job-heartbeats.js';
import { inForceOn } from '../employees/employee.queries.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';
import {
  localDate,
  NotificationsService,
  usersWith,
  type Recipient,
} from './notifications.service.js';

/** Documents are flagged a month, a week and a day before they expire, and once expired. */
const EXPIRY_STAGES = [30, 7, 1, 0] as const;
const PROBATION_NOTICE_DAYS = 14;
/** Missing-punch reminders wait until yesterday has surely been processed. */
const MISSING_PUNCH_AFTER_HOUR = 9;
/** More than this share of a day with one punch looks like a device fault, not forgetfulness. */
const MISSING_PUNCH_MAX_SHARE = 0.2;
const MISSING_PUNCH_MIN_SKIP = 20;

function expiryWhen(daysLeft: number): Record<UserLanguage, string> {
  if (daysLeft < 0) return { en: 'has expired', bn: 'মেয়াদ শেষ হয়েছে' };
  if (daysLeft === 0) return { en: 'expires today', bn: 'আজ মেয়াদ শেষ' };
  const bn = new Intl.NumberFormat('bn-BD').format(daysLeft);
  return {
    en: `expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    bn: `${bn} দিনে মেয়াদ শেষ হবে`,
  };
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Sends queued messages every 30 seconds, and once an hour looks for things people should be
 * reminded of. Reminders carry a key, so each is sent once however often the job runs.
 */
@Injectable()
export class NotificationJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private sweeping: Promise<void> | undefined;
  private reminding: Promise<unknown> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly tenantDb: TenantDb,
    private readonly dispatcher: NotificationDispatcher,
    private readonly notifications: NotificationsService,
    private readonly heartbeats: JobHeartbeats,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.BACKGROUND_JOBS) return;
    // Each sweep's outcome feeds the status page's notifications check.
    const sweep = () => {
      this.sweeping ??= this.forEachTenant('Sending notifications', (id) =>
        this.dispatcher.runFor(id).then(() => undefined),
      )
        .then(
          (failed) => this.heartbeats.beat('notifications', failed === 0),
          (error: Error) => {
            this.heartbeats.beat('notifications', false);
            this.logger.error('Sending notifications failed', error);
          },
        )
        .finally(() => (this.sweeping = undefined));
    };
    const remind = () => {
      this.reminding ??= this.forEachTenant('Reminders', async () => {
        await this.remindTenant();
      }).finally(() => (this.reminding = undefined));
    };
    this.timers = [
      setInterval(sweep, 30_000),
      setInterval(remind, 60 * 60_000),
      setTimeout(remind, 20_000),
    ];
    for (const timer of this.timers) timer.unref();
  }

  async onApplicationShutdown() {
    for (const timer of this.timers) clearInterval(timer);
    await Promise.allSettled([this.sweeping, this.reminding]);
  }

  /** Returns how many workspaces failed. */
  private async forEachTenant(what: string, fn: (tenantId: string) => Promise<void>) {
    let failed = 0;
    for (const tenant of await this.entitlements.all()) {
      if (tenant.access.accessState === 'suspended') continue;
      try {
        await runInTenantContext(tenant.id, () => fn(tenant.id));
      } catch (error) {
        failed++;
        this.logger.error(`${what} failed for ${tenant.slug}`, error as Error);
      }
    }
    return failed;
  }

  /** Every reminder for the current workspace. Returns how many people were told. */
  async remindTenant(now = new Date()): Promise<number> {
    const today = todayIn('Asia/Dhaka', now);
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: 'Asia/Dhaka',
      }).format(now),
    );
    return (
      (await this.expiringDocuments(today)) +
      (await this.probationsEnding(today)) +
      (hour >= MISSING_PUNCH_AFTER_HOUR ? await this.missingPunches(addDays(today, -1)) : 0)
    );
  }

  /** HR, and the employee for documents they can see, at each stage before expiry. */
  private expiringDocuments(today: string): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({
          id: documents.id,
          title: documents.title,
          expiresOn: documents.expiresOn,
          visibleToEmployee: documents.visibleToEmployee,
          employeeId: employees.id,
          name: employees.fullName,
          status: employees.status,
        })
        .from(documents)
        .innerJoin(employees, eq(employees.id, documents.employeeId))
        .where(
          and(
            isNull(documents.deletedAt),
            isNotNull(documents.expiresOn),
            lte(documents.expiresOn, addDays(today, EXPIRY_STAGES[0])),
            // Long-expired documents were reported when they expired.
            gte(documents.expiresOn, addDays(today, -7)),
          ),
        );
      const hr = await usersWith(tx, 'documents.manage');
      let told = 0;
      for (const doc of rows) {
        if (doc.status !== 'active') continue;
        const daysLeft = daysBetween(today, doc.expiresOn!);
        // The nearest stage not yet passed; each stage is sent once.
        const stage =
          daysLeft < 0
            ? 'expired'
            : String(Math.min(...EXPIRY_STAGES.filter((s) => s >= daysLeft)));
        const recipients: Recipient[] = [...hr];
        if (doc.visibleToEmployee) recipients.push({ employeeId: doc.employeeId });
        told += await this.notifications.notify(tx, {
          event: 'document.expiring',
          recipients,
          values: {
            'person.name': doc.name,
            'document.title': doc.title,
            'document.when': expiryWhen(daysLeft),
            'document.expiresOn': localDate(doc.expiresOn!),
          },
          link: `/workspace/employees/${doc.employeeId}?tab=documents`,
          dedupeKey: `document.expiring:${doc.id}:${doc.expiresOn}:${stage}`,
          data: { documentId: doc.id, employeeId: doc.employeeId },
        });
      }
      return told;
    });
  }

  /** HR and the line manager, two weeks before probation ends. */
  private probationsEnding(today: string): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({
          id: employees.id,
          name: employees.fullName,
          endsOn: employees.probationEndsOn,
          managerId: jobAssignments.managerId,
        })
        .from(employees)
        .leftJoin(
          jobAssignments,
          and(eq(jobAssignments.employeeId, employees.id), inForceOn(today)),
        )
        .where(
          and(
            eq(employees.status, 'active'),
            isNull(employees.confirmedOn),
            gte(employees.probationEndsOn, today),
            lte(employees.probationEndsOn, addDays(today, PROBATION_NOTICE_DAYS)),
          ),
        );
      const hr = await usersWith(tx, 'lifecycle.manage');
      let told = 0;
      for (const e of rows) {
        const recipients: Recipient[] = [...hr];
        if (e.managerId) recipients.push({ employeeId: e.managerId });
        told += await this.notifications.notify(tx, {
          event: 'probation.ending',
          recipients,
          values: { 'person.name': e.name, 'probation.endsOn': localDate(e.endsOn!) },
          link: `/workspace/employees/${e.id}?tab=job`,
          dedupeKey: `probation.ending:${e.id}:${e.endsOn}`,
          data: { employeeId: e.id },
        });
      }
      return told;
    });
  }

  /** The employee, the morning after a day with one punch. */
  private missingPunches(date: string): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({ employeeId: attendanceDays.employeeId })
        .from(attendanceDays)
        .where(and(eq(attendanceDays.date, date), eq(attendanceDays.status, 'missing_punch')));
      // When a large share of the day is missing a punch, a device or the Edge Agent was down:
      // that is for HR to fix, not for each person to ask a correction for.
      const [tracked] = await tx
        .select({ n: count() })
        .from(attendanceDays)
        .where(eq(attendanceDays.date, date));
      if (
        rows.length > Math.max(MISSING_PUNCH_MIN_SKIP, (tracked?.n ?? 0) * MISSING_PUNCH_MAX_SHARE)
      ) {
        this.logger.warn(
          `${rows.length} of ${tracked?.n} people have one punch on ${date}; check the devices. No reminders sent.`,
        );
        return 0;
      }
      let told = 0;
      for (const row of rows) {
        told += await this.notifications.notify(tx, {
          event: 'attendance.missing_punch',
          recipients: [{ employeeId: row.employeeId }],
          values: { 'day.date': localDate(date) },
          link: '/workspace/attendance',
          dedupeKey: `attendance.missing_punch:${row.employeeId}:${date}`,
          data: { date },
        });
      }
      return told;
    });
  }
}
