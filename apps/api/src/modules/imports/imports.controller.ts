import {
  Body,
  Controller,
  Get,
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
import { importCommitSchema, type ImportBatchView, type TenantWithAccess } from '@gp/shared';
import type { z } from 'zod';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { ImportsService } from './imports.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Bulk hiring from a spreadsheet: download the template, upload, check, commit. */
@ApiTags('imports')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('core_hr')
@Permits('imports.run')
@Controller('tenant/imports/employees')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get('template')
  async template(): Promise<StreamableFile> {
    return fileResponse(await this.imports.template(), {
      contentType: XLSX,
      fileName: 'employees-import.xlsx',
      download: true,
    });
  }

  @Get()
  list(): Promise<ImportBatchView[]> {
    return this.imports.list();
  }

  /** Checks the file and reports every problem; creates nothing. */
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ImportBatchView> {
    return this.imports.upload(user, file);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ImportBatchView> {
    return this.imports.get(id);
  }

  @Post(':id/commit')
  @ApiBody(openApiBody(importCommitSchema))
  commit(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(importCommitSchema)) body: z.infer<typeof importCommitSchema>,
  ): Promise<ImportBatchView> {
    return this.imports.commit(user, tenant, id, body);
  }
}
