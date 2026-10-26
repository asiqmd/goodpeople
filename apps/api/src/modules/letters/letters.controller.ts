import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  idCardsSchema,
  letterGenerateSchema,
  letterTemplateUpdateSchema,
  type DocumentView,
  type IdCardsInput,
  type LetterGenerateInput,
  type LetterLanguage,
  type LetterPreview,
  type LetterTemplateUpdate,
  type LetterTemplateView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { TenantDb } from '../../db/db.module.js';
import { fileResponse } from '../documents/documents.controller.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { LettersService } from './letters.service.js';
import { EmployeeScopeGuard } from '../access-scopes/employee-scope.guard.js';

const languageOf = (value: string | undefined): LetterLanguage => (value === 'bn' ? 'bn' : 'en');

/** Letter templates and generated letters, ID cards and service books. */
@ApiTags('letters')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('core_hr')
@Controller('tenant')
export class LettersController {
  constructor(
    private readonly letters: LettersService,
    private readonly tenantDb: TenantDb,
  ) {}

  @Get('letter-templates')
  @Permits('documents.manage')
  templates(): Promise<LetterTemplateView[]> {
    return this.letters.templates();
  }

  @Patch('letter-templates/:id')
  @Permits('documents.manage')
  @ApiBody(openApiBody(letterTemplateUpdateSchema))
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(letterTemplateUpdateSchema)) body: LetterTemplateUpdate,
  ): Promise<LetterTemplateView> {
    return this.letters.updateTemplate(user, id, body);
  }

  @Post('letter-templates/:id/reset')
  @Permits('documents.manage')
  resetTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LetterTemplateView> {
    return this.letters.resetTemplate(user, id);
  }

  @Post('employees/:id/letters/preview')
  @Permits('documents.manage')
  @UseGuards(EmployeeScopeGuard)
  @HttpCode(200)
  @ApiBody(openApiBody(letterGenerateSchema))
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(letterGenerateSchema)) body: LetterGenerateInput,
  ): Promise<LetterPreview> {
    return this.letters.preview(id, body);
  }

  /** Issues a numbered letter as a PDF in the employee's documents. */
  @Post('employees/:id/letters')
  @Permits('documents.manage')
  @UseGuards(EmployeeScopeGuard)
  @ApiBody(openApiBody(letterGenerateSchema))
  generate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(letterGenerateSchema)) body: LetterGenerateInput,
  ): Promise<DocumentView> {
    return this.letters.generate(user, id, body);
  }

  /** A printable PDF of photo ID cards, four people to a page. */
  @Post('id-cards')
  @Permits('documents.manage')
  @HttpCode(200)
  @ApiBody(openApiBody(idCardsSchema))
  async idCards(
    @CurrentUser() user: AuthUser,
    @Body(zod(idCardsSchema)) body: IdCardsInput,
  ): Promise<StreamableFile> {
    const bytes = await this.letters.idCards(user, body);
    return fileResponse(bytes, {
      contentType: 'application/pdf',
      fileName: 'id-cards.pdf',
      download: false,
    });
  }

  @Get('employees/:id/service-book')
  @Permits('documents.manage')
  @UseGuards(EmployeeScopeGuard)
  async serviceBook(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('language') language?: string,
  ): Promise<StreamableFile> {
    const { fileName, bytes } = await this.letters.serviceBook(id, languageOf(language));
    return fileResponse(bytes, { contentType: 'application/pdf', fileName, download: false });
  }

  /** A worker is entitled to their own service book (s.6). */
  @Get('me/service-book')
  async myServiceBook(
    @CurrentUser() user: AuthUser,
    @Query('language') language?: string,
  ): Promise<StreamableFile> {
    const me = await this.tenantDb.run((tx) => employeeOfUser(tx, user.id));
    if (!me) throw new NotFoundException('No employee record is linked to your login');
    const { fileName, bytes } = await this.letters.serviceBook(me.id, languageOf(language));
    return fileResponse(bytes, { contentType: 'application/pdf', fileName, download: false });
  }
}
