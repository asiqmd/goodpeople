import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  declarationVerifySchema,
  fiscalYearOf,
  fiscalYearQuerySchema,
  taxQuarterQuerySchema,
  type TaxQuarterQuery,
  loanCreateSchema,
  loanRepaySchema,
  payBatchSchema,
  payslipLanguageSchema,
  pfEntrySchema,
  pfInterestSchema,
  pfJoinSchema,
  pfLeaveSchema,
  taxDeclarationSchema,
  taxDepositSchema,
  taxOpeningSchema,
  taxProfileSchema,
  todayIn,
  type DeclarationVerifyInput,
  type LoanCreateInput,
  type LoanRepayInput,
  type LoanView,
  type PayBatchInput,
  type PayBatchPreview,
  type PayBatchView,
  type PfEntryInput,
  type PfInterestInput,
  type PfJoinInput,
  type PfStatement,
  type TaxDeclarationInput,
  type TaxDeclarationView,
  type TaxDepositInput,
  type TaxOpeningInput,
  type TaxProfileInput,
  type TaxProfileView,
  type TaxYearView,
} from '@gp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { LoansService } from './loans.service.js';
import { PayBatchesService } from './pay-batches.service.js';
import { ProvidentFundService } from './provident-fund.service.js';
import { TaxService } from './tax.service.js';

type FiscalYearQuery = z.infer<typeof fiscalYearQuerySchema>;
const certificateQuery = fiscalYearQuerySchema.extend(payslipLanguageSchema.shape);
type CertificateQuery = z.infer<typeof certificateQuery>;
const loanListQuery = z.object({
  employeeId: z.uuid().optional(),
  open: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
const pageQuery = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get('payroll/loans')
  @Permits('payroll.view')
  list(@Query(zod(loanListQuery)) query: z.infer<typeof loanListQuery>): Promise<LoanView[]> {
    return this.loans.list(query);
  }

  @Post('payroll/loans')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(loanCreateSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(loanCreateSchema)) body: LoanCreateInput,
  ): Promise<LoanView> {
    return this.loans.create(user, body);
  }

  @Get('payroll/loans/:id')
  @Permits('payroll.view')
  view(@Param('id', ParseUUIDPipe) id: string): Promise<LoanView> {
    return this.loans.view(id);
  }

  @Post('payroll/loans/:id/cancel')
  @HttpCode(204)
  @Permits('payroll.manage')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.loans.cancel(user, id);
  }

  /** Money paid back outside a run. */
  @Post('payroll/loans/:id/repay')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(loanRepaySchema))
  repay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(loanRepaySchema)) body: LoanRepayInput,
  ): Promise<LoanView> {
    return this.loans.repay(user, id, body);
  }

  @Get('me/loans')
  mine(@CurrentUser() user: AuthUser): Promise<LoanView[]> {
    return this.loans.mine(user);
  }
}

@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant')
export class ProvidentFundController {
  constructor(private readonly fund: ProvidentFundService) {}

  @Get('payroll/pf/members')
  @Permits('payroll.view')
  members(@Query(zod(pageQuery)) query: z.infer<typeof pageQuery>) {
    return this.fund.members(query);
  }

  @Post('payroll/pf/members')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(pfJoinSchema))
  join(@CurrentUser() user: AuthUser, @Body(zod(pfJoinSchema)) body: PfJoinInput) {
    return this.fund.join(user, body);
  }

  @Get('payroll/pf/members/:employeeId')
  @Permits('payroll.view')
  statement(@Param('employeeId', ParseUUIDPipe) employeeId: string): Promise<PfStatement> {
    return this.fund.statement(employeeId);
  }

  @Post('payroll/pf/members/:employeeId/leave')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(pfLeaveSchema))
  leave(
    @CurrentUser() user: AuthUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body(zod(pfLeaveSchema)) body: z.infer<typeof pfLeaveSchema>,
  ): Promise<PfStatement> {
    return this.fund.leave(user, employeeId, body.leftOn);
  }

  /** An opening balance from the old fund, or money paid out. */
  @Post('payroll/pf/members/:employeeId/entries')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(pfEntrySchema))
  addEntry(
    @CurrentUser() user: AuthUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body(zod(pfEntrySchema)) body: PfEntryInput,
  ): Promise<PfStatement> {
    return this.fund.addEntry(user, employeeId, body);
  }

  @Post('payroll/pf/interest')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(pfInterestSchema))
  interest(@CurrentUser() user: AuthUser, @Body(zod(pfInterestSchema)) body: PfInterestInput) {
    return this.fund.postInterest(user, body);
  }

  @Get('me/pf')
  mine(@CurrentUser() user: AuthUser): Promise<PfStatement | null> {
    return this.fund.mine(user);
  }
}

@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get('employees/:id/tax')
  @Permits('payroll.view')
  year(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(fiscalYearQuerySchema)) query: FiscalYearQuery,
  ): Promise<TaxYearView> {
    return this.tax.year(id, query.fiscalYear);
  }

  @Put('employees/:id/tax/profile')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(taxProfileSchema))
  setProfile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(taxProfileSchema)) body: TaxProfileInput,
  ): Promise<TaxProfileView> {
    return this.tax.setProfile(user, id, body);
  }

  @Put('employees/:id/tax/declaration')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(taxDeclarationSchema))
  saveDeclaration(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(fiscalYearQuerySchema)) query: FiscalYearQuery,
    @Body(zod(taxDeclarationSchema)) body: TaxDeclarationInput,
  ): Promise<TaxDeclarationView> {
    return this.tax.saveDeclaration(user, id, query.fiscalYear ?? thisYear(), body);
  }

  @Post('employees/:id/tax/declaration/verify')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(declarationVerifySchema))
  verify(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(fiscalYearQuerySchema)) query: FiscalYearQuery,
    @Body(zod(declarationVerifySchema)) body: DeclarationVerifyInput,
  ): Promise<TaxDeclarationView> {
    return this.tax.verify(user, id, query.fiscalYear ?? thisYear(), body);
  }

  @Put('employees/:id/tax/opening')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(taxOpeningSchema))
  setOpening(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(taxOpeningSchema)) body: TaxOpeningInput,
  ): Promise<TaxYearView> {
    return this.tax.setOpening(user, id, body);
  }

  @Get('employees/:id/tax/certificate')
  @Permits('payroll.view')
  async certificate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(certificateQuery)) query: CertificateQuery,
  ): Promise<StreamableFile> {
    const file = await this.tax.certificate(
      id,
      query.fiscalYear ?? thisYear(),
      query.language,
      user,
    );
    return fileResponse(file.bytes, {
      contentType: 'application/pdf',
      fileName: file.fileName,
      download: true,
    });
  }

  @Get('payroll/tax/declarations')
  @Permits('payroll.view')
  declarations(
    @Query(zod(fiscalYearQuerySchema)) query: FiscalYearQuery,
  ): Promise<TaxDeclarationView[]> {
    return this.tax.declarations(query.fiscalYear ?? thisYear());
  }

  /** Everyone's salary and tax for the year, for the employer's withholding return. */
  @Get('payroll/tax/register')
  @Permits('payroll.view')
  async register(
    @Query(zod(fiscalYearQuerySchema)) query: FiscalYearQuery,
  ): Promise<StreamableFile> {
    const year = query.fiscalYear ?? thisYear();
    return fileResponse(Buffer.from(await this.tax.register(year)), {
      contentType: 'text/csv; charset=utf-8',
      fileName: `salary-tax-${year}.csv`,
      download: true,
    });
  }

  /** A quarter's salary and tax for the withholding return (s.177). */
  @Get('payroll/tax/quarter')
  @Permits('payroll.view')
  async quarter(
    @Query(zod(taxQuarterQuerySchema)) query: TaxQuarterQuery,
  ): Promise<StreamableFile> {
    const text = await this.tax.quarterStatement(query.fiscalYear, query.quarter);
    return fileResponse(Buffer.from(text), {
      contentType: 'text/csv; charset=utf-8',
      fileName: `withholding-${query.fiscalYear}-q${query.quarter}.csv`,
      download: true,
    });
  }

  @Get('payroll/runs/:id/tax')
  @Permits('payroll.view')
  runTax(@Param('id', ParseUUIDPipe) id: string) {
    return this.tax.runTax(id);
  }

  @Put('payroll/runs/:id/tax-deposit')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(taxDepositSchema))
  setDeposit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(taxDepositSchema)) body: TaxDepositInput,
  ) {
    return this.tax.setDeposit(user, id, body);
  }

  @Get('me/tax')
  myYear(
    @CurrentUser() user: AuthUser,
    @Query(zod(fiscalYearQuerySchema)) query: FiscalYearQuery,
  ): Promise<TaxYearView> {
    return this.tax.myYear(user, query.fiscalYear);
  }

  @Put('me/tax/declaration')
  @ApiBody(openApiBody(taxDeclarationSchema))
  saveMine(
    @CurrentUser() user: AuthUser,
    @Query(zod(fiscalYearQuerySchema)) query: FiscalYearQuery,
    @Body(zod(taxDeclarationSchema)) body: TaxDeclarationInput,
  ): Promise<TaxDeclarationView> {
    return this.tax.saveMyDeclaration(user, query.fiscalYear ?? thisYear(), body);
  }

  @Get('me/tax/certificate')
  async myCertificate(
    @CurrentUser() user: AuthUser,
    @Query(zod(certificateQuery)) query: CertificateQuery,
  ): Promise<StreamableFile> {
    const file = await this.tax.certificate(
      null,
      query.fiscalYear ?? thisYear(),
      query.language,
      user,
    );
    return fileResponse(file.bytes, {
      contentType: 'application/pdf',
      fileName: file.fileName,
      download: true,
    });
  }
}

@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant/payroll/increments')
export class IncrementsController {
  constructor(private readonly batches: PayBatchesService) {}

  @Get()
  @Permits('payroll.view')
  list(): Promise<PayBatchView[]> {
    return this.batches.list();
  }

  /** Who the increment would reach, before and after; nothing is saved. */
  @Post('preview')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(payBatchSchema))
  preview(@Body(zod(payBatchSchema)) body: PayBatchInput): Promise<PayBatchPreview> {
    return this.batches.preview(body);
  }

  @Post()
  @Permits('payroll.manage')
  @ApiBody(openApiBody(payBatchSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(payBatchSchema)) body: PayBatchInput,
  ): Promise<PayBatchView> {
    return this.batches.create(user, body);
  }

  @Get(':id')
  @Permits('payroll.view')
  view(@Param('id', ParseUUIDPipe) id: string): Promise<PayBatchView> {
    return this.batches.view(id);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  @Permits('payroll.manage')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.batches.cancel(user, id);
  }
}

const thisYear = () => fiscalYearOf(todayIn());
