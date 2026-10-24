import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { EmployeesController, MeController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [EmployeesController, MeController],
  providers: [EmployeesService, TenantRolesGuard],
})
export class EmployeesModule {}
