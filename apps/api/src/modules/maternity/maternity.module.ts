import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { WorkCalendarModule } from '../calendar/work-calendar.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersModule } from '../letters/letters.module.js';
import { MaternityJobs } from './maternity-jobs.service.js';
import { MaternityController } from './maternity.controller.js';
import { MaternityService } from './maternity.service.js';

/** Maternity benefit under the Labour Act, Chapter IV (the RMG pack). */
@Module({
  imports: [AuditModule, EntitlementsModule, WorkCalendarModule, LettersModule],
  controllers: [MaternityController],
  providers: [MaternityService, MaternityJobs, TenantRolesGuard],
})
export class MaternityModule {}
