import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  announcementReceipts,
  announcements,
  assetIssues,
  companyAssets,
  employees,
  engagementSurveys,
  surveyParticipants,
} from '@gp/db';
import { addDays, todayIn } from '@gp/shared';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { runInTenantContext } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { EngagementService } from '../engagement/engagement.service.js';
import { EmployeeServicesService } from './employee-services.service.js';
import { serviceHandlers } from './access.js';
@Injectable()
export class EmployeeServicesJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;
  private logger = new Logger(EmployeeServicesJobs.name);
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
    private readonly db: TenantDb,
    private readonly engagement: EngagementService,
    private readonly services: EmployeeServicesService,
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
      if (tenant.access.accessState !== 'full' || !tenant.access.features.includes('core_hr'))
        continue;
      try {
        await runInTenantContext(tenant.id, () => this.remindTenant());
      } catch (error) {
        this.logger.error(`Employee service reminders failed for ${tenant.slug}`, error as Error);
      }
    }
  }
  remindTenant(now = new Date()) {
    return this.db.run(async (tx) => {
      const today = todayIn('Asia/Dhaka', now);
      const active = and(
        lte(employees.joinedOn, today),
        or(isNull(employees.separatedOn), gte(employees.separatedOn, today)),
      );
      let sent = 0;
      const surveys = await tx
        .select({ p: surveyParticipants, s: engagementSurveys })
        .from(surveyParticipants)
        .innerJoin(engagementSurveys, eq(engagementSurveys.id, surveyParticipants.surveyId))
        .innerJoin(employees, eq(employees.id, surveyParticipants.employeeId))
        .where(
          and(
            active,
            eq(engagementSurveys.status, 'open'),
            gte(engagementSurveys.closesAt, now),
            lte(engagementSurveys.closesAt, new Date(now.getTime() + 86400000)),
          ),
        );
      for (const { p, s } of surveys)
        sent += await this.engagement.notify(
          tx,
          [{ employeeId: p.employeeId }],
          { en: 'An anonymous survey closes soon', bn: 'বেনামি জরিপের সময় শিগগিরই শেষ হচ্ছে' },
          `survey:closing:${s.id}:${p.employeeId}`,
          `/workspace/engagement/surveys/${s.id}`,
        );
      const policies = await tx
        .select({ p: announcementReceipts, a: announcements })
        .from(announcementReceipts)
        .innerJoin(announcements, eq(announcements.id, announcementReceipts.announcementId))
        .innerJoin(employees, eq(employees.id, announcementReceipts.employeeId))
        .where(
          and(
            active,
            eq(announcements.status, 'published'),
            isNull(announcementReceipts.acknowledgedAt),
            lte(announcements.dueOn, addDays(today, 3)),
            or(isNull(announcements.expiresOn), gte(announcements.expiresOn, today)),
          ),
        );
      for (const { p, a } of policies)
        sent += await this.engagement.notify(
          tx,
          [{ employeeId: p.employeeId }],
          {
            en: 'A policy acknowledgement is outstanding',
            bn: 'নীতিমালার প্রাপ্তি স্বীকার বাকি আছে',
          },
          `policy:due:${a.id}:${p.employeeId}:${a.dueOn! < today ? 'overdue' : 'soon'}`,
          `/workspace/engagement/announcements/${a.id}`,
        );
      const overdue = await tx
        .select({ issue: assetIssues, asset: companyAssets })
        .from(assetIssues)
        .innerJoin(companyAssets, eq(companyAssets.id, assetIssues.assetId))
        .where(and(isNull(assetIssues.returnedOn), lte(assetIssues.dueOn, addDays(today, -1))));
      for (const { issue, asset } of overdue)
        sent += await this.services.notify(
          tx,
          [
            { employeeId: issue.employeeId },
            ...(await serviceHandlers(tx, asset.legalEntityId)).map((p) => ({ userId: p.id })),
          ],
          `asset:overdue:${issue.id}`,
          { en: 'An issued asset is overdue for return', bn: 'নেওয়া সম্পদ ফেরতের সময় পেরিয়েছে' },
          '/workspace/employee-services/assets',
        );
      return sent;
    });
  }
}
