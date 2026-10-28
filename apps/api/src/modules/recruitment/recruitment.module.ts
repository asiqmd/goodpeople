import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { CareersController } from './careers.controller.js';
import { CareersService } from './careers.service.js';
import { OpeningJobs } from './opening-jobs.service.js';
import { OpeningsController, RecruitmentSettingsController } from './openings.controller.js';
import { OpeningsService } from './openings.service.js';
import { RecruitmentSettingsService } from './recruitment-settings.service.js';

// Phase 4 M1: openings, their approval and job posts, and the careers page.
// The approvals module decides openings, so this one must not import it.
@Module({
  imports: [AuditModule, AuthModule, EntitlementsModule],
  controllers: [OpeningsController, RecruitmentSettingsController, CareersController],
  providers: [
    OpeningsService,
    RecruitmentSettingsService,
    CareersService,
    OpeningJobs,
    TenantRolesGuard,
  ],
  exports: [OpeningsService],
})
export class RecruitmentModule {}
