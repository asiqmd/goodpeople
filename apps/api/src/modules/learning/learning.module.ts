import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersModule } from '../letters/letters.module.js';
import { LearningController } from './learning.controller.js';
import { LearningService } from './learning.service.js';
import { LearningJobs } from './learning-jobs.service.js';
@Module({
  imports: [AuditModule, EntitlementsModule, LettersModule],
  controllers: [LearningController],
  providers: [LearningService, LearningJobs, TenantRolesGuard],
  exports: [LearningService],
})
export class LearningModule {}
