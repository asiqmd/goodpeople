import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { EmployeePayService } from './employee-pay.service.js';
import { EmployeePayController, PayrollSetupController } from './payroll.controller.js';
import { PayrollSetupService } from './payroll-setup.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [PayrollSetupController, EmployeePayController],
  providers: [PayrollSetupService, EmployeePayService, TenantRolesGuard],
  exports: [EmployeePayService],
})
export class PayrollModule {}
