import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { auditReportQuerySchema, type AuditReportQuery, type AuditReportView } from '@gp/shared';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard } from '../entitlements/guards.js';
import { AuditReportService } from './audit-report.service.js';

/** The buyer-audit report: JSON for the page, a PDF in English or Bangla, or the hours CSV. */
@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, TenantRolesGuard)
@Permits('compliance.manage')
@Controller('tenant/compliance/audit-report')
export class AuditReportController {
  constructor(private readonly reports: AuditReportService) {}

  @Get()
  async report(@Query(zod(auditReportQuerySchema)) query: AuditReportQuery) {
    if (query.format === 'json') return this.reports.build(query) as Promise<AuditReportView>;
    const file = await this.reports.file(query);
    return fileResponse(file.bytes, {
      contentType: file.contentType,
      fileName: file.fileName,
      download: query.format === 'csv',
    });
  }
}
