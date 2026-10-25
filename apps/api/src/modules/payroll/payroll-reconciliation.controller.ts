import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  reconciliationCompareSchema,
  type ParallelRunsView,
  type ReconciliationCompareInput,
  type ReconciliationListItem,
  type ReconciliationView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { ReconciliationService } from './reconciliation.service.js';

/** Parallel runs: the current payroll's sheet compared with ours, month by month. */
@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant/payroll')
export class PayrollReconciliationController {
  constructor(private readonly reconciliations: ReconciliationService) {}

  @Get('parallel-runs')
  @Permits('payroll.view')
  parallelRuns(): Promise<ParallelRunsView> {
    return this.reconciliations.parallelRuns();
  }

  @Get('runs/:id/reconciliations')
  @Permits('payroll.view')
  list(@Param('id', ParseUUIDPipe) id: string): Promise<ReconciliationListItem[]> {
    return this.reconciliations.list(id);
  }

  /** Uploads the current payroll's sheet for the run's month (.xlsx or .csv). */
  @Post('runs/:id/reconciliations')
  @Permits('payroll.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ReconciliationView> {
    return this.reconciliations.upload(user, id, file);
  }

  @Get('reconciliations/:id')
  @Permits('payroll.view')
  view(@Param('id', ParseUUIDPipe) id: string): Promise<ReconciliationView> {
    return this.reconciliations.view(id);
  }

  @Post('reconciliations/:id/compare')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(reconciliationCompareSchema))
  compare(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(reconciliationCompareSchema)) body: ReconciliationCompareInput,
  ): Promise<ReconciliationView> {
    return this.reconciliations.compare(user, id, body);
  }

  @Get('reconciliations/:id/file')
  @Permits('payroll.view')
  async file(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const file = await this.reconciliations.differencesCsv(id);
    return fileResponse(Buffer.from(file.text), {
      contentType: 'text/csv; charset=utf-8',
      fileName: file.fileName,
      download: true,
    });
  }
}
