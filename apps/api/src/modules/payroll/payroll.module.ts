import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { WorkCalendarModule } from '../calendar/work-calendar.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LeaveModule } from '../leave/leave.module.js';
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
import { DisbursementService } from './disbursement.service.js';
import { GratuityService } from './gratuity.service.js';
import { SettlementsService } from './settlements.service.js';
import { WppfService } from './wppf.service.js';
import { PayrollFundsController } from './payroll-funds.controller.js';
import { PayrollReconciliationController } from './payroll-reconciliation.controller.js';
import { ReconciliationService } from './reconciliation.service.js';
import { PayrollReportsController } from './payroll-reports.controller.js';
import { PayrollReportsService } from './payroll-reports.service.js';
import { PayrollPaymentsController } from './payroll-payments.controller.js';
import { PayrollRunsController } from './payroll-runs.controller.js';
import { PayrollRunsService } from './payroll-runs.service.js';
import { PayrollSetupService } from './payroll-setup.service.js';
import { ProvidentFundService } from './provident-fund.service.js';
import { TaxService } from './tax.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, WorkCalendarModule, LettersModule, LeaveModule],
  controllers: [
    PayrollSetupController,
    EmployeePayController,
    PayrollRunsController,
    LoansController,
    ProvidentFundController,
    TaxController,
    IncrementsController,
    PayrollPaymentsController,
    PayrollFundsController,
    PayrollReconciliationController,
    PayrollReportsController,
  ],
  providers: [
    PayrollSetupService,
    EmployeePayService,
    PayrollRunsService,
    LoansService,
    ProvidentFundService,
    TaxService,
    PayBatchesService,
    DisbursementService,
    SettlementsService,
    GratuityService,
    WppfService,
    ReconciliationService,
    PayrollReportsService,
    TenantRolesGuard,
  ],
  exports: [
    EmployeePayService,
    PayrollRunsService,
    LoansService,
    PayBatchesService,
    ReconciliationService,
  ],
})
export class PayrollModule {}
