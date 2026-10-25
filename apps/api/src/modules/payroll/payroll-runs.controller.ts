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
  adjustmentCreateSchema,
  payslipLanguageSchema,
  runCreateSchema,
  runInputRemoveSchema,
  runInputSchema,
  runItemsQuerySchema,
  type AdjustmentCreateInput,
  type PayrollRunItemPage,
  type PayrollRunView,
  type PayslipSummary,
  type RunCreateInput,
  type RunInputInput,
  type RunItemsQuery,
  type TenantWithAccess,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { PayrollRunsService } from './payroll-runs.service.js';

type Language = z.infer<typeof payslipLanguageSchema>;

@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant')
export class PayrollRunsController {
  constructor(private readonly runs: PayrollRunsService) {}

  @Get('payroll/runs')
  @Permits('payroll.view')
  list(): Promise<PayrollRunView[]> {
    return this.runs.list();
  }

  @Post('payroll/runs')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(runCreateSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(runCreateSchema)) body: RunCreateInput,
  ): Promise<PayrollRunView> {
    return this.runs.create(user, body);
  }

  @Get('payroll/runs/:id')
  @Permits('payroll.view')
  view(@Param('id', ParseUUIDPipe) id: string): Promise<PayrollRunView> {
    return this.runs.view(id);
  }

  @Get('payroll/runs/:id/items')
  @Permits('payroll.view')
  items(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(runItemsQuerySchema)) query: RunItemsQuery,
  ): Promise<PayrollRunItemPage> {
    return this.runs.items(id, query);
  }

  /** Works everyone's pay out again from today's data. */
  @Post('payroll/runs/:id/compute')
  @HttpCode(200)
  @Permits('payroll.manage')
  compute(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayrollRunView> {
    return this.runs.compute(user, id, tenant);
  }

  @Put('payroll/runs/:id/inputs')
  @HttpCode(204)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(runInputSchema))
  setInput(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(runInputSchema)) body: RunInputInput,
  ): Promise<void> {
    return this.runs.setInput(user, id, body);
  }

  @Post('payroll/runs/:id/inputs/remove')
  @HttpCode(204)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(runInputRemoveSchema))
  removeInput(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(runInputRemoveSchema)) body: z.infer<typeof runInputRemoveSchema>,
  ): Promise<void> {
    return this.runs.removeInput(user, id, body);
  }

  /** Sends the run for approval; with maker-checker off it is locked at once. */
  @Post('payroll/runs/:id/submit')
  @HttpCode(200)
  @Permits('payroll.manage')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayrollRunView> {
    return this.runs.submit(user, id);
  }

  @Post('payroll/runs/:id/cancel')
  @HttpCode(204)
  @Permits('payroll.manage')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.runs.cancel(user, id);
  }

  @Post('payroll/runs/:id/publish')
  @HttpCode(200)
  @Permits('payroll.manage')
  publish(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayrollRunView> {
    return this.runs.publish(user, id);
  }

  @Post('payroll/runs/:id/adjustments')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(adjustmentCreateSchema))
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(adjustmentCreateSchema)) body: AdjustmentCreateInput,
  ): Promise<PayrollRunView> {
    return this.runs.createAdjustment(user, id, body);
  }

  @Get('payroll/runs/:id/items/:itemId/payslip')
  @Permits('payroll.view')
  async payslip(
    @CurrentUser() user: AuthUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query(zod(payslipLanguageSchema)) query: Language,
  ): Promise<StreamableFile> {
    const { bytes, fileName } = await this.runs.payslip(itemId, query.language, user, false);
    return fileResponse(bytes, { contentType: 'application/pdf', fileName, download: false });
  }

  @Get('me/payslips')
  myPayslips(@CurrentUser() user: AuthUser): Promise<PayslipSummary[]> {
    return this.runs.myPayslips(user);
  }

  @Get('me/payslips/:itemId')
  async myPayslip(
    @CurrentUser() user: AuthUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query(zod(payslipLanguageSchema)) query: Language,
  ): Promise<StreamableFile> {
    const { bytes, fileName } = await this.runs.payslip(itemId, query.language, user, true);
    return fileResponse(bytes, { contentType: 'application/pdf', fileName, download: false });
  }
}
