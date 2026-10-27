import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  maternityAverageSchema,
  maternityCancelSchema,
  maternityCandidateQuerySchema,
  maternityCaseInputSchema,
  maternityCloseSchema,
  maternityDatesSchema,
  maternityLeaveLinkSchema,
  maternityListQuerySchema,
  maternityPaymentSchema,
  payslipLanguageSchema,
  type MaternityAverageInput,
  type MaternityCancelInput,
  type MaternityCandidate,
  type MaternityCaseInput,
  type MaternityCaseSummary,
  type MaternityCaseView,
  type MaternityCloseInput,
  type MaternityDatesInput,
  type MaternityLeaveLinkInput,
  type MaternityListQuery,
  type MaternityPaymentInput,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { MaternityService } from './maternity.service.js';

/** Maternity benefit cases (Labour Act Chapter IV), for the people who handle leave. */
@ApiTags('maternity')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('leave')
@Permits('leave.manage')
@Controller('tenant/maternity')
export class MaternityController {
  constructor(private readonly maternity: MaternityService) {}

  @Get('cases')
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(maternityListQuerySchema)) query: MaternityListQuery,
  ): Promise<MaternityCaseSummary[]> {
    return this.maternity.list(user, query.status);
  }

  /** Women in active employment, to open a case for. */
  @Get('candidates')
  candidates(
    @CurrentUser() user: AuthUser,
    @Query(zod(maternityCandidateQuerySchema)) query: { search?: string },
  ): Promise<MaternityCandidate[]> {
    return this.maternity.candidates(user, query.search);
  }

  @Post('cases')
  @ApiBody(openApiBody(maternityCaseInputSchema))
  open(
    @CurrentUser() user: AuthUser,
    @Body(zod(maternityCaseInputSchema)) body: MaternityCaseInput,
  ): Promise<MaternityCaseView> {
    return this.maternity.open(user, body);
  }

  @Get('cases/:id')
  view(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MaternityCaseView> {
    return this.maternity.view(user, id);
  }

  @Patch('cases/:id/dates')
  @ApiBody(openApiBody(maternityDatesSchema))
  dates(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(maternityDatesSchema)) body: MaternityDatesInput,
  ): Promise<MaternityCaseView> {
    return this.maternity.updateDates(user, id, body);
  }

  /** Works the average daily wage out again, or takes HR's figure where no pay is locked. */
  @Post('cases/:id/average')
  @HttpCode(200)
  @ApiBody(openApiBody(maternityAverageSchema))
  average(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(maternityAverageSchema)) body: MaternityAverageInput,
  ): Promise<MaternityCaseView> {
    return this.maternity.setAverage(user, id, body);
  }

  @Put('cases/:id/leave')
  @ApiBody(openApiBody(maternityLeaveLinkSchema))
  leave(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(maternityLeaveLinkSchema)) body: MaternityLeaveLinkInput,
  ): Promise<MaternityCaseView> {
    return this.maternity.linkLeave(user, id, body.leaveRequestId);
  }

  @Post('cases/:id/parts/:part/payment')
  @HttpCode(200)
  @ApiBody(openApiBody(maternityPaymentSchema))
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('part', ParseIntPipe) part: number,
    @Body(zod(maternityPaymentSchema)) body: MaternityPaymentInput,
  ): Promise<MaternityCaseView> {
    return this.maternity.recordPayment(user, id, part, body);
  }

  @Post('cases/:id/close')
  @HttpCode(200)
  @ApiBody(openApiBody(maternityCloseSchema))
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(maternityCloseSchema)) body: MaternityCloseInput,
  ): Promise<MaternityCaseView> {
    return this.maternity.close(user, id, body.note ?? null);
  }

  @Post('cases/:id/cancel')
  @HttpCode(200)
  @ApiBody(openApiBody(maternityCancelSchema))
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(maternityCancelSchema)) body: MaternityCancelInput,
  ): Promise<MaternityCaseView> {
    return this.maternity.cancel(user, id, body.reason);
  }

  /** The case as a statement PDF, in English or Bangla. */
  @Get('cases/:id/statement')
  async statement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(payslipLanguageSchema)) query: z.infer<typeof payslipLanguageSchema>,
  ): Promise<StreamableFile> {
    const file = await this.maternity.statement(user, id, query.language);
    return fileResponse(file.bytes, {
      contentType: 'application/pdf',
      fileName: file.fileName,
      download: false,
    });
  }
}
