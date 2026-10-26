import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { WorkCalendarModule } from '../calendar/work-calendar.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersModule } from '../letters/letters.module.js';
import { TimesheetJobs } from './timesheet-jobs.service.js';
import { TimesheetsController } from './timesheets.controller.js';
import { TimesheetsService } from './timesheets.service.js';

// Phase 3 M4 (the NGO pack: monthly project timesheets, their approval and offline entry).
// The approvals module decides them, so this one must not import it.
@Module({
  imports: [AuditModule, EntitlementsModule, WorkCalendarModule, LettersModule],
  controllers: [TimesheetsController],
  providers: [TimesheetsService, TimesheetJobs, TenantRolesGuard],
  exports: [TimesheetsService],
})
export class TimesheetsModule {}
