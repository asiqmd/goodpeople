import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { peerFeedback, reviewCycles, reviews, type Tx } from '@gp/db';
import { addDays, todayIn } from '@gp/shared';
import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import {
  localDate,
  NotificationsService,
  type Localized,
} from '../notifications/notifications.service.js';
import type { CycleRow } from './access.js';
import {
  peerReminderTask,
  selfReviewTask,
  teamReviewsDetail,
  teamReviewsTitle,
} from './notices.js';

/** People are reminded this many days before a step's date, and on the day. */
const REMIND_DAYS_BEFORE = 3;
/** Reminders wait for the working day to start in Dhaka. */
const REMIND_FROM_HOUR = 9;

/** Which reminder a step's date calls for today: the early one, on the day, or none. */
export function reminderFor(dueOn: string | null, today: string): 'soon' | 'due' | null {
  if (!dueOn) return null;
  if (today === dueOn) return 'due';
  return today >= addDays(dueOn, -REMIND_DAYS_BEFORE) && today < dueOn ? 'soon' : null;
}

/**
 * Once an hour, reminds whoever a review step waits on, three days before its date and on the
 * day: people with their self review open, peers still to answer, managers with peers to
 * approve or reviews to write. Each reminder carries a key, so it is sent once.
 */
@Injectable()
export class ReviewJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReviewJobs.name);
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
    for (const tenant of await this.entitlements.all()) {
      if (tenant.access.accessState === 'suspended') continue;
      if (!tenant.access.features.includes('performance')) continue;
      try {
        await runInTenantContext(tenant.id, () => this.remindTenant());
      } catch (error) {
        this.logger.error(`Review reminders failed for ${tenant.slug}`, error as Error);
      }
    }
  }

  /** Every review reminder due for the current workspace. Returns how many people were told. */
  async remindTenant(now = new Date()): Promise<number> {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: 'Asia/Dhaka',
      }).format(now),
    );
    if (hour < REMIND_FROM_HOUR) return 0;
    const today = todayIn('Asia/Dhaka', now);
    return this.tenantDb.run(async (tx) => {
      const cycles = await tx
        .select()
        .from(reviewCycles)
        .where(inArray(reviewCycles.status, ['active', 'calibration']));
      let told = 0;
      for (const cycle of cycles) {
        told += await this.selfReviews(tx, cycle, today);
        told += await this.peers(tx, cycle, today);
        told += await this.managerReviews(tx, cycle, today);
      }
      return told;
    });
  }

  private async selfReviews(tx: Tx, cycle: CycleRow, today: string) {
    const which = cycle.status === 'active' ? reminderFor(cycle.selfDueOn, today) : null;
    if (!which) return 0;
    const open = await tx
      .select({ employeeId: reviews.employeeId })
      .from(reviews)
      .where(and(eq(reviews.cycleId, cycle.id), eq(reviews.status, 'self')));
    return this.notifications.notify(tx, {
      event: 'performance.task',
      recipients: open.map((r) => ({ employeeId: r.employeeId })),
      values: selfReviewTask(cycle.name, cycle.selfDueOn!),
      link: '/workspace/performance',
      dedupeKey: `review.remind.self:${cycle.id}:${cycle.selfDueOn}:${which}`,
      data: { cycleId: cycle.id },
    });
  }

  /** Peers still to answer, and managers with named peers to approve. */
  private async peers(tx: Tx, cycle: CycleRow, today: string) {
    const which = reminderFor(cycle.peerDueOn, today);
    if (!which || !cycle.peerReview) return 0;
    const due = cycle.peerDueOn!;
    const waiting = await tx
      .select({
        status: peerFeedback.status,
        peerEmployeeId: peerFeedback.peerEmployeeId,
        managerEmployeeId: reviews.managerEmployeeId,
      })
      .from(peerFeedback)
      .innerJoin(reviews, eq(reviews.id, peerFeedback.reviewId))
      .where(
        and(
          eq(reviews.cycleId, cycle.id),
          inArray(reviews.status, ['self', 'manager', 'calibration']),
          inArray(peerFeedback.status, ['proposed', 'approved']),
        ),
      );
    const toAnswer = [
      ...new Set(waiting.filter((w) => w.status === 'approved').map((w) => w.peerEmployeeId)),
    ];
    const toApprove = [
      ...new Set(
        waiting.flatMap((w) =>
          w.status === 'proposed' && w.managerEmployeeId ? [w.managerEmployeeId] : [],
        ),
      ),
    ];
    let told = await this.notifications.notify(tx, {
      event: 'performance.task',
      recipients: toAnswer.map((employeeId) => ({ employeeId })),
      values: peerReminderTask(cycle.name, due),
      link: '/workspace/performance/peers',
      dedupeKey: `review.remind.peer:${cycle.id}:${due}:${which}`,
      data: { cycleId: cycle.id },
    });
    if (cycle.status === 'active') {
      told += await this.notifications.notify(tx, {
        event: 'performance.task',
        recipients: toApprove.map((employeeId) => ({ employeeId })),
        values: {
          'task.title': { en: 'Peers to approve', bn: 'সহকর্মী অনুমোদন' },
          'task.detail': {
            en: `Peers named for your team's reviews in ${cycle.name} wait for your approval.`,
            bn: `${cycle.name}-এ আপনার দলের মূল্যায়নের জন্য নাম দেওয়া সহকর্মীরা আপনার অনুমোদনের অপেক্ষায়।`,
          },
          'task.due': localDate(due),
        },
        link: '/workspace/performance/peers',
        dedupeKey: `review.remind.approve:${cycle.id}:${due}:${which}`,
        data: { cycleId: cycle.id },
      });
    }
    return told;
  }

  /** Each manager once, with how many of their reviews wait for them. */
  private async managerReviews(tx: Tx, cycle: CycleRow, today: string) {
    const which = reminderFor(cycle.managerDueOn, today);
    if (!which) return 0;
    const due = cycle.managerDueOn!;
    const waiting = await tx
      .select({ managerEmployeeId: reviews.managerEmployeeId, n: count() })
      .from(reviews)
      .where(
        and(
          eq(reviews.cycleId, cycle.id),
          eq(reviews.status, 'manager'),
          isNotNull(reviews.managerEmployeeId),
        ),
      )
      .groupBy(reviews.managerEmployeeId);
    if (waiting.length === 0) return 0;
    return this.notifications.notify(tx, {
      event: 'performance.task',
      recipients: waiting.map((w) => ({ employeeId: w.managerEmployeeId })),
      values: {
        'task.title': teamReviewsTitle,
        'task.detail': teamReviewsDetail(cycle.name, 1),
        'task.due': localDate(due),
      },
      perRecipient: new Map(
        waiting.map((w): [string, Record<string, Localized>] => [
          w.managerEmployeeId!,
          { 'task.detail': teamReviewsDetail(cycle.name, w.n) },
        ]),
      ),
      link: '/workspace/performance/team',
      dedupeKey: `review.remind.manager:${cycle.id}:${due}:${which}`,
      data: { cycleId: cycle.id },
    });
  }
}
