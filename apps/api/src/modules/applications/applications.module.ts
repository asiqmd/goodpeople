import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { ApplicationsController } from './applications.controller.js';
import { CandidatesService } from './candidates.service.js';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';
import { PipelineService } from './pipeline.service.js';
import { RecruitmentMailer } from './recruitment-mailer.service.js';
import { CandidateRetentionJobs } from './retention-jobs.service.js';

// Phase 4 M1: candidates, applications through the pipeline, interviews and scorecards.
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [ApplicationsController, InterviewsController],
  providers: [
    PipelineService,
    CandidatesService,
    InterviewsService,
    RecruitmentMailer,
    CandidateRetentionJobs,
    TenantRolesGuard,
  ],
})
export class ApplicationsModule {}
