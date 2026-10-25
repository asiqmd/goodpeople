import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { ComplianceBoardsService } from './compliance-boards.service.js';
import { ComplianceCheckService } from './compliance-check.service.js';
import { ComplianceJobs } from './compliance-jobs.service.js';
import { ComplianceController } from './compliance.controller.js';
import { ComplianceService } from './compliance.service.js';

/** Working-time alerts from attendance, adolescents' certificates and night work (Phase 3 M3). */
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    ComplianceCheckService,
    ComplianceBoardsService,
    ComplianceJobs,
    TenantRolesGuard,
  ],
  exports: [ComplianceCheckService],
})
export class ComplianceModule {}
