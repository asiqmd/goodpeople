import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  MAX_DOCUMENT_BYTES,
  documentUpdateSchema,
  documentUploadSchema,
  expiringQuerySchema,
  type DocumentUpdateInput,
  type DocumentUploadInput,
  type DocumentView,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { DocumentsService } from './documents.service.js';

/** A file response that browsers will not sniff or cache. */
export function fileResponse(
  bytes: Buffer,
  options: { contentType: string; fileName: string; download: boolean },
): StreamableFile {
  const disposition = options.download ? 'attachment' : 'inline';
  const ascii = options.fileName.replace(/[^\x20-\x7e]/g, '_');
  return new StreamableFile(bytes, {
    type: options.contentType,
    length: bytes.length,
    disposition: `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(options.fileName)}`,
  });
}

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('core_hr')
@Controller('tenant')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('employees/:id/documents')
  @Permits('documents.manage')
  forEmployee(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentView[]> {
    return this.documents.forEmployee(user, id);
  }

  @Post('employees/:id/documents')
  @Permits('documents.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(zod(documentUploadSchema)) body: DocumentUploadInput,
  ): Promise<DocumentView> {
    return this.documents.upload(user, id, file, body);
  }

  @Get('me/documents')
  mine(@CurrentUser() user: AuthUser): Promise<DocumentView[]> {
    return this.documents.mine(user);
  }

  @Get('documents/expiring')
  @Permits('documents.manage')
  expiring(
    @CurrentUser() user: AuthUser,
    @Query(zod(expiringQuerySchema)) query: z.infer<typeof expiringQuerySchema>,
  ): Promise<DocumentView[]> {
    return this.documents.expiring(user, query.days);
  }

  /** The file itself; `?download=1` saves it instead of showing it. */
  @Get('documents/:id/file')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download?: string,
  ): Promise<StreamableFile> {
    const { document, bytes } = await this.documents.read(user, id);
    return fileResponse(bytes, {
      contentType: document.contentType,
      fileName: document.fileName,
      download: download === '1',
    });
  }

  @Patch('documents/:id')
  @Permits('documents.manage')
  @ApiBody(openApiBody(documentUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(documentUpdateSchema)) body: DocumentUpdateInput,
  ): Promise<DocumentView> {
    return this.documents.update(user, id, body);
  }

  @Delete('documents/:id')
  @Permits('documents.manage')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.documents.remove(user, id);
  }
}
