import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { EmployeesController, MeController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, AttendanceModule],
  controllers: [EmployeesController, MeController],
  providers: [EmployeesService, TenantRolesGuard],
  exports: [EmployeesService],
})
export class EmployeesModule {}
