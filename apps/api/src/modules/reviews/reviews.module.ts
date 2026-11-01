import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { CalibrationService } from './calibration.service.js';
import { CyclesController } from './cycles.controller.js';
import { CyclesService } from './cycles.service.js';
import { PeersService } from './peers.service.js';
import { ReviewJobs } from './review-jobs.service.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { PerformanceSettingsService } from './settings.service.js';

// Phase 4 M2: review cycles, self, peer and manager reviews, calibration and release.
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [CyclesController, ReviewsController],
  providers: [
    CyclesService,
    CalibrationService,
    ReviewsService,
    PeersService,
    PerformanceSettingsService,
    ReviewJobs,
    TenantRolesGuard,
  ],
})
export class ReviewsModule {}
