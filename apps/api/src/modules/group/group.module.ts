import { Global, Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { GroupController } from './group.controller.js';
import { GroupDashboardService } from './group-dashboard.service.js';
import { GroupPoliciesService } from './group-policies.service.js';
import { PolicyService } from './policy.service.js';

// Phase 3 M4 (the group pack: dashboards across companies and company policy overrides).
/** Global: leave, attendance, payroll and compliance read each company's policy from here. */
@Global()
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [GroupController],
  providers: [PolicyService, GroupPoliciesService, GroupDashboardService, TenantRolesGuard],
  exports: [PolicyService],
})
export class GroupModule {}
