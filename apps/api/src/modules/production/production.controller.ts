import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  productionBatchSchema,
  productionDayQuerySchema,
  productionOperationSchema,
  productionOperationUpdateSchema,
  productionSummaryFileSchema,
  productionSummaryQuerySchema,
  type ProductionBatchInput,
  type ProductionBatchResult,
  type ProductionDayQuery,
  type ProductionDayView,
  type ProductionImportResult,
  type ProductionOperationInput,
  type ProductionOperationUpdateInput,
  type ProductionOperationView,
  type ProductionSummaryFileQuery,
  type ProductionSummaryQuery,
  type ProductionSummaryView,
  type TenantWithAccess,
} from '@gp/shared';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { OperationsService } from './operations.service.js';
import { ProductionEntriesService } from './production-entries.service.js';
import { ProductionSummaryService } from './production-summary.service.js';

const csvFile = (file: { text: string; fileName: string }) =>
  fileResponse(Buffer.from(file.text), {
    contentType: 'text/csv; charset=utf-8',
    fileName: file.fileName,
    download: true,
  });

/** Piece rates, daily production by line, imports and the month's summary. */
@ApiTags('production')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('production')
@Permits('production.manage')
@Controller('tenant/production')
export class ProductionController {
  constructor(
    private readonly operations: OperationsService,
    private readonly entries: ProductionEntriesService,
    private readonly summaries: ProductionSummaryService,
  ) {}

  @Get('operations')
  listOperations(): Promise<ProductionOperationView[]> {
    return this.operations.list();
  }

  @Post('operations')
  @ApiBody(openApiBody(productionOperationSchema))
  createOperation(
    @CurrentUser() user: AuthUser,
    @Body(zod(productionOperationSchema)) body: ProductionOperationInput,
  ): Promise<ProductionOperationView> {
    return this.operations.create(user, body);
  }

  @Patch('operations/:id')
  @ApiBody(openApiBody(productionOperationUpdateSchema))
  updateOperation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(productionOperationUpdateSchema)) body: ProductionOperationUpdateInput,
  ): Promise<ProductionOperationView> {
    return this.operations.update(user, id, body);
  }

  @Post('operations/:id/deactivate')
  @HttpCode(200)
  deactivate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductionOperationView> {
    return this.operations.setActive(user, id, false);
  }

  @Post('operations/:id/activate')
  @HttpCode(200)
  activate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductionOperationView> {
    return this.operations.setActive(user, id, true);
  }

  /** A line (and the units below it) on a day, with each worker's pieces. */
  @Get('day')
  day(@Query(zod(productionDayQuerySchema)) query: ProductionDayQuery): Promise<ProductionDayView> {
    return this.entries.day(query);
  }

  @Put('entries')
  @ApiBody(openApiBody(productionBatchSchema))
  saveEntries(
    @CurrentUser() user: AuthUser,
    @Body(zod(productionBatchSchema)) body: ProductionBatchInput,
  ): Promise<ProductionBatchResult> {
    return this.entries.saveBatch(user, body);
  }

  @Get('import/template')
  template(): StreamableFile {
    return csvFile(this.entries.template());
  }

  /** Saves the rows that can be saved and reports every other row with its reason. */
  @Post('import')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  import(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ProductionImportResult> {
    return this.entries.import(user, file);
  }

  @Get('summary')
  summary(
    @CurrentTenant() tenant: TenantWithAccess,
    @Query(zod(productionSummaryQuerySchema)) query: ProductionSummaryQuery,
  ): Promise<ProductionSummaryView> {
    return this.summaries.summary(query, tenant);
  }

  @Get('summary/file')
  async summaryFile(
    @CurrentTenant() tenant: TenantWithAccess,
    @Query(zod(productionSummaryFileSchema)) query: ProductionSummaryFileQuery,
  ): Promise<StreamableFile> {
    return csvFile(await this.summaries.file(query, tenant));
  }
}
