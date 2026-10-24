import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LeaveModule } from '../leave/leave.module.js';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';

@Module({
  imports: [
    AuditModule,
    EntitlementsModule,
    LeaveModule,
    AttendanceModule,
    LifecycleModule,
    PayrollModule,
  ],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, TenantRolesGuard],
})
export class ApprovalsModule {}
