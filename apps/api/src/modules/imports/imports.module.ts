import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EmployeesModule } from '../employees/employees.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, EmployeesModule],
  controllers: [ImportsController],
  providers: [ImportsService, TenantRolesGuard],
})
export class ImportsModule {}
