import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  learningCertificates,
  learningCourses,
  learningEnrolments,
  learningSessions,
} from '@gp/db';
import { addDays, todayIn } from '@gp/shared';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { localDate, NotificationsService } from '../notifications/notifications.service.js';
@Injectable()
export class LearningJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LearningJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly db: TenantDb,
    private readonly notices: NotificationsService,
  ) {}
  onApplicationBootstrap() {
    // M2: only the separate, leased worker scheduler owns timers.
    void this.config.BACKGROUND_JOBS;
  }
  async onApplicationShutdown() {
    this.timers.forEach(clearTimeout);
    await this.running?.catch(() => undefined);
  }
  private async everyTenant() {
    for (const tenant of await this.entitlements.all()) {
      if (tenant.access.accessState !== 'full' || !tenant.access.features.includes('lms')) continue;
      try {
        await runInTenantContext(tenant.id, () => this.remindTenant());
      } catch (e) {
        this.logger.error(`Learning reminders failed for ${tenant.slug}`, e as Error);
      }
    }
  }
  remindTenant(now = new Date()) {
    const today = todayIn('Asia/Dhaka', now);
    return this.db.run(async (tx) => {
      let sent = 0;
      const upcoming = await tx
        .select({ s: learningSessions, e: learningEnrolments, c: learningCourses })
        .from(learningSessions)
        .innerJoin(learningEnrolments, eq(learningEnrolments.sessionId, learningSessions.id))
        .innerJoin(learningCourses, eq(learningCourses.id, learningSessions.courseId))
        .where(
          and(
            eq(learningSessions.status, 'planned'),
            eq(learningEnrolments.status, 'enrolled'),
            gte(learningSessions.startsAt, now),
            lte(learningSessions.startsAt, new Date(now.getTime() + 24 * 60 * 60_000)),
          ),
        );
      for (const { s, e, c } of upcoming)
        sent += await this.notices.notify(tx, {
          event: 'learning.notice',
          recipients: [{ employeeId: e.employeeId }],
          values: {
            'learning.title': {
              en: `Upcoming training: ${c.name}`,
              bn: `আসন্ন প্রশিক্ষণ: ${c.nameBn}`,
            },
            'learning.detail': {
              en: `${localDate(todayIn('Asia/Dhaka', s.startsAt)).en} · ${s.venue}`,
              bn: `${localDate(todayIn('Asia/Dhaka', s.startsAt)).bn} · ${s.venue}`,
            },
          },
          link: '/workspace/learning',
          dedupeKey: `learning:session-reminder:${s.id}:${e.id}`,
        });
      const certificates = await tx
        .select()
        .from(learningCertificates)
        .where(
          and(
            isNull(learningCertificates.revokedAt),
            lte(learningCertificates.expiresOn, addDays(today, 30)),
          ),
        );
      for (const c of certificates) {
        const expired = c.expiresOn! < today;
        sent += await this.notices.notify(tx, {
          event: 'learning.notice',
          recipients: [{ employeeId: c.employeeId }],
          values: {
            'learning.title': {
              en: `Training ${expired ? 'expired' : 'expires soon'}: ${c.courseName}`,
              bn: `প্রশিক্ষণের মেয়াদ ${expired ? 'শেষ' : 'শেষ হচ্ছে'}: ${c.courseNameBn}`,
            },
            'learning.detail': localDate(c.expiresOn!),
          },
          link: '/workspace/learning',
          dedupeKey: `learning:expiry:${c.id}:${expired ? 'expired' : 'soon'}`,
        });
      }
      return sent;
    });
  }
}
