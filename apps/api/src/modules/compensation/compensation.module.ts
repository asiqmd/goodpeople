import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { CompensationController } from './compensation.controller.js';
import { CompensationService } from './compensation.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, PayrollModule],
  controllers: [CompensationController],
  providers: [CompensationService, TenantRolesGuard],
})
export class CompensationModule {}
