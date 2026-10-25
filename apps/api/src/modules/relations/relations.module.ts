import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { CommitteesService } from './committees.service.js';
import { RelationsAlertsService } from './relations-alerts.service.js';
import { RelationsJobs } from './relations-jobs.service.js';
import { RelationsController } from './relations.controller.js';
import { UnionsService } from './unions.service.js';

// Phase 3 M3 (the RMG pack): committees, trade unions and check-off.
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [RelationsController],
  providers: [
    CommitteesService,
    UnionsService,
    RelationsAlertsService,
    RelationsJobs,
    TenantRolesGuard,
  ],
  exports: [RelationsAlertsService],
})
export class RelationsModule {}
