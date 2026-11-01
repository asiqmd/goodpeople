import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { GoalJobs } from './goal-jobs.service.js';
import { GoalsController } from './goals.controller.js';
import { GoalsService } from './goals.service.js';

// Phase 4 M2: goals and KPIs, their agreement and check-ins, and the daily job storing KPIs
// read from the records. Reviews read a person's agreed goals through `agreedGoalsForReview`
// (review-goals.ts), a plain function in their own transaction, which never writes; a write
// path that wants the values stored calls `refreshRecordKpis`.
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalJobs, TenantRolesGuard],
  exports: [GoalsService],
})
export class GoalsModule {}
