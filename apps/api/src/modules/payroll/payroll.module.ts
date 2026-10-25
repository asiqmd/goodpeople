import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { WorkCalendarModule } from '../calendar/work-calendar.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersModule } from '../letters/letters.module.js';
import { EmployeePayService } from './employee-pay.service.js';
import { LoansService } from './loans.service.js';
import { PayBatchesService } from './pay-batches.service.js';
import {
  IncrementsController,
  LoansController,
  ProvidentFundController,
  TaxController,
} from './payroll-benefits.controller.js';
import { EmployeePayController, PayrollSetupController } from './payroll.controller.js';
import { PayrollRunsController } from './payroll-runs.controller.js';
import { PayrollRunsService } from './payroll-runs.service.js';
import { PayrollSetupService } from './payroll-setup.service.js';
import { ProvidentFundService } from './provident-fund.service.js';
import { TaxService } from './tax.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, WorkCalendarModule, LettersModule],
  controllers: [
    PayrollSetupController,
    EmployeePayController,
    PayrollRunsController,
    LoansController,
    ProvidentFundController,
    TaxController,
    IncrementsController,
  ],
  providers: [
    PayrollSetupService,
    EmployeePayService,
    PayrollRunsService,
    LoansService,
    ProvidentFundService,
    TaxService,
    PayBatchesService,
    TenantRolesGuard,
  ],
  exports: [EmployeePayService, PayrollRunsService, LoansService, PayBatchesService],
})
export class PayrollModule {}
