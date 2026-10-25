import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { AttendanceController, EdgeController } from './attendance.controller.js';
import { AttendanceJobs } from './attendance-jobs.service.js';
import { AttendanceService } from './attendance.service.js';
import { DevicesService } from './devices.service.js';
import { EdgeAgentGuard } from './edge-agent.guard.js';
import { AttendanceProcessor } from './processor.service.js';
import { PunchesService } from './punches.service.js';
import { RegularizationsService } from './regularizations.service.js';
import { ScheduleService } from './schedule.service.js';
import { ShiftsService } from './shifts.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, DocumentsModule],
  controllers: [AttendanceController, EdgeController],
  providers: [
    ScheduleService,
    AttendanceProcessor,
    AttendanceService,
    ShiftsService,
    PunchesService,
    DevicesService,
    RegularizationsService,
    AttendanceJobs,
    EdgeAgentGuard,
    TenantRolesGuard,
  ],
  exports: [AttendanceProcessor, AttendanceService, RegularizationsService],
})
export class AttendanceModule {}
