import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { WorkCalendarModule } from '../calendar/work-calendar.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersModule } from '../letters/letters.module.js';
import { EmployeePayService } from './employee-pay.service.js';
import { EmployeePayController, PayrollSetupController } from './payroll.controller.js';
import { PayrollRunsController } from './payroll-runs.controller.js';
import { PayrollRunsService } from './payroll-runs.service.js';
import { PayrollSetupService } from './payroll-setup.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, WorkCalendarModule, LettersModule],
  controllers: [PayrollSetupController, EmployeePayController, PayrollRunsController],
  providers: [PayrollSetupService, EmployeePayService, PayrollRunsService, TenantRolesGuard],
  exports: [EmployeePayService, PayrollRunsService],
})
export class PayrollModule {}
