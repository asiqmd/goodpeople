import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AnomaliesController } from './anomalies.controller.js';
import { AnomaliesService } from './anomalies.service.js';
import { AnomalyDetector } from './anomaly-detector.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';
import { InsightJobsService } from './insight-jobs.service.js';
@Module({
  imports: [EntitlementsModule, PayrollModule, AuditModule, AuthModule],
  controllers: [AnalyticsController, InsightsController, AnomaliesController],
  providers: [
    AnalyticsService,
    InsightsService,
    InsightJobsService,
    TenantRolesGuard,
    AnomaliesService,
    AnomalyDetector,
  ],
})
export class AnalyticsModule {}
