import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LifecycleController } from './lifecycle.controller.js';
import { LifecycleJobs } from './lifecycle-jobs.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { SeparationsService } from './separations.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, AttendanceModule, DocumentsModule],
  controllers: [LifecycleController],
  providers: [SeparationsService, LifecycleService, LifecycleJobs, TenantRolesGuard],
  exports: [SeparationsService],
})
export class LifecycleModule {}
