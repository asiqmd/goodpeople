import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { EngagementController } from '../engagement/engagement.controller.js';
import { EngagementService } from '../engagement/engagement.service.js';
import { EmployeeServicesController } from './employee-services.controller.js';
import { EmployeeServicesService } from './employee-services.service.js';
import { EmployeeServicesJobs } from './employee-services-jobs.service.js';
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [EngagementController, EmployeeServicesController],
  providers: [EngagementService, EmployeeServicesService, EmployeeServicesJobs, TenantRolesGuard],
  exports: [EngagementService, EmployeeServicesService],
})
export class EmployeeServicesModule {}
