import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import {
  PerformanceRecordController,
  PlansController,
  ProbationReviewsController,
} from './development.controller.js';
import { PlansService } from './plans.service.js';
import { ProbationReviewJobs } from './probation-jobs.service.js';
import { ProbationReviewsService } from './probation-reviews.service.js';
import { PerformanceRecordService } from './record.service.js';

// Phase 4 M2: improvement plans, probation reviews, a person's performance record and the
// outcomes M3's increment round reads.
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [PlansController, ProbationReviewsController, PerformanceRecordController],
  providers: [
    PlansService,
    ProbationReviewsService,
    PerformanceRecordService,
    ProbationReviewJobs,
    TenantRolesGuard,
  ],
  exports: [ProbationReviewsService],
})
export class DevelopmentModule {}
