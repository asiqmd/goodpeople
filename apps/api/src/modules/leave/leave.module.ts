import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { WorkCalendarModule } from '../calendar/work-calendar.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { BalancesService } from './balances.service.js';
import { EmployeeLeaveService } from './employee-leave.service.js';
import { HolidaysService } from './holidays.service.js';
import { HolidaysController, LeaveController } from './leave.controller.js';
import { LeaveRequestsService } from './leave-requests.service.js';
import { LeaveTypesService } from './leave-types.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, WorkCalendarModule, AttendanceModule],
  controllers: [LeaveController, HolidaysController],
  providers: [
    BalancesService,
    LeaveRequestsService,
    LeaveTypesService,
    HolidaysService,
    EmployeeLeaveService,
    TenantRolesGuard,
  ],
  exports: [LeaveRequestsService],
})
export class LeaveModule {}
