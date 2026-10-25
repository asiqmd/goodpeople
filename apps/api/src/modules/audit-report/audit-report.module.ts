import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersModule } from '../letters/letters.module.js';
import { AuditReportController } from './audit-report.controller.js';
import { AuditReportService } from './audit-report.service.js';

@Module({
  imports: [EntitlementsModule, LettersModule],
  controllers: [AuditReportController],
  providers: [AuditReportService, TenantRolesGuard],
})
export class AuditReportModule {}
