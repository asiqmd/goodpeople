import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  costSummaryQuerySchema,
  costTrendQuerySchema,
  fiscalYearRequiredSchema,
  registerQuerySchema,
  type CostSummary,
  type CostSummaryQuery,
  type CostTrendPoint,
  type CostTrendQuery,
  type RegisterQuery,
} from '@gp/shared';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { PayrollReportsService } from './payroll-reports.service.js';

const download = (file: { bytes: Buffer; contentType: string; fileName: string }) =>
  fileResponse(file.bytes, {
    contentType: file.contentType,
    fileName: file.fileName,
    download: true,
  });

/** Registers and management reports, from locked results. */
@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Permits('payroll.view')
@Controller('tenant/payroll')
export class PayrollReportsController {
  constructor(private readonly reports: PayrollReportsService) {}

  @Get('reports/summary')
  summary(@Query(zod(costSummaryQuerySchema)) query: CostSummaryQuery): Promise<CostSummary> {
    return this.reports.summary(query.month, query.by);
  }

  @Get('reports/trend')
  trend(@Query(zod(costTrendQuerySchema)) query: CostTrendQuery): Promise<CostTrendPoint[]> {
    return this.reports.trend(query.to, query.months);
  }

  @Get('reports/pf-register')
  async pfRegister(
    @Query(zod(fiscalYearRequiredSchema)) query: { fiscalYear: string },
  ): Promise<StreamableFile> {
    const file = await this.reports.pfRegister(query.fiscalYear);
    return fileResponse(Buffer.from(file.text), {
      contentType: 'text/csv; charset=utf-8',
      fileName: file.fileName,
      download: true,
    });
  }

  @Get('reports/advances-register')
  async advances(
    @Query(zod(fiscalYearRequiredSchema)) query: { fiscalYear: string },
  ): Promise<StreamableFile> {
    const file = await this.reports.advancesRegister(query.fiscalYear);
    return fileResponse(Buffer.from(file.text), {
      contentType: 'text/csv; charset=utf-8',
      fileName: file.fileName,
      download: true,
    });
  }

  /** Form 38, the wage register, for the run's workers. */
  @Get('runs/:id/wage-register')
  async wageRegister(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(registerQuerySchema)) query: RegisterQuery,
  ): Promise<StreamableFile> {
    return download(await this.reports.wageRegister(id, query.format, query.language));
  }

  /** Form 34, the attendance and overtime register, for the run's month. */
  @Get('runs/:id/overtime-register')
  async overtimeRegister(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(registerQuerySchema)) query: RegisterQuery,
  ): Promise<StreamableFile> {
    return download(await this.reports.overtimeRegister(id, query.format, query.language));
  }

  @Get('runs/:id/register')
  async register(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(registerQuerySchema)) query: RegisterQuery,
  ): Promise<StreamableFile> {
    return download(await this.reports.register(id, query.format, query.language));
  }
}
