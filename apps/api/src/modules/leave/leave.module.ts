import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { ApprovalsService } from './approvals.service.js';
import { BalancesService } from './balances.service.js';
import { EmployeeLeaveService } from './employee-leave.service.js';
import { HolidaysService } from './holidays.service.js';
import { HolidaysController, LeaveController } from './leave.controller.js';
import { LeaveRequestsService } from './leave-requests.service.js';
import { LeaveTypesService } from './leave-types.service.js';
import { WorkCalendarService } from './work-calendar.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [LeaveController, HolidaysController],
  providers: [
    WorkCalendarService,
    BalancesService,
    LeaveRequestsService,
    ApprovalsService,
    LeaveTypesService,
    HolidaysService,
    EmployeeLeaveService,
    TenantRolesGuard,
  ],
})
export class LeaveModule {}
