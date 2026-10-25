import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  MFS_PROVIDERS,
  payslipLanguageSchema,
  runPaidSchema,
  type DisbursementView,
  type RunPaidInput,
} from '@gp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { DisbursementService } from './disbursement.service.js';

type Language = z.infer<typeof payslipLanguageSchema>;
const csvFile = (file: { text: string; fileName: string }) =>
  fileResponse(Buffer.from(file.text), {
    contentType: 'text/csv; charset=utf-8',
    fileName: file.fileName,
    download: true,
  });
const pdfFile = (file: { bytes: Buffer; fileName: string }) =>
  fileResponse(file.bytes, {
    contentType: 'application/pdf',
    fileName: file.fileName,
    download: true,
  });

/** Paying locked runs: the split by channel, the files, the cash sheet and the journal. */
@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant/payroll/runs/:id')
export class PayrollPaymentsController {
  constructor(private readonly payments: DisbursementService) {}

  @Get('disbursement')
  @Permits('payroll.view')
  summary(@Param('id', ParseUUIDPipe) id: string): Promise<DisbursementView> {
    return this.payments.summary(id);
  }

  @Post('paid')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(runPaidSchema))
  paid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(runPaidSchema)) body: RunPaidInput,
  ): Promise<DisbursementView> {
    return this.payments.markPaid(user, id, body.paidOn);
  }

  @Get('files/bank')
  @Permits('payroll.manage')
  async bank(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return csvFile(await this.payments.bankFile(user, id));
  }

  @Get('files/wallet/:provider')
  @Permits('payroll.manage')
  async wallet(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('provider') provider: string,
  ): Promise<StreamableFile> {
    const known = (MFS_PROVIDERS as readonly string[]).includes(provider) ? provider : 'bkash';
    return csvFile(await this.payments.walletFile(user, id, known));
  }

  @Get('files/cash-sheet')
  @Permits('payroll.view')
  async cashSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(payslipLanguageSchema)) query: Language,
  ): Promise<StreamableFile> {
    return pdfFile(await this.payments.cashSheet(id, query.language));
  }

  @Get('files/bank-advice')
  @Permits('payroll.view')
  async bankAdvice(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(payslipLanguageSchema)) query: Language,
  ): Promise<StreamableFile> {
    return pdfFile(await this.payments.bankAdvice(id, query.language));
  }

  @Get('files/journal')
  @Permits('payroll.view')
  async journal(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return csvFile(await this.payments.journal(id));
  }
}
