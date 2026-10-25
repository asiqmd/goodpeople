import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  gratuityQuerySchema,
  wppfRunSchema,
  wppfYearSchema,
  type GratuityProvision,
  type GratuityQuery,
  type PayrollRunView,
  type WppfRunInput,
  type WppfYearInput,
  type WppfYearView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { GratuityService } from './gratuity.service.js';
import { PayrollRunsService } from './payroll-runs.service.js';
import { WppfService } from './wppf.service.js';

/** The gratuity provision and the workers' participation fund. */
@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant/payroll')
export class PayrollFundsController {
  constructor(
    private readonly gratuity: GratuityService,
    private readonly wppf: WppfService,
    private readonly runs: PayrollRunsService,
  ) {}

  @Get('gratuity')
  @Permits('payroll.view')
  provision(@Query(zod(gratuityQuerySchema)) query: GratuityQuery): Promise<GratuityProvision> {
    return this.gratuity.provision(query.asOf, query.page);
  }

  @Get('gratuity/file')
  @Permits('payroll.view')
  async provisionFile(
    @Query(zod(gratuityQuerySchema)) query: GratuityQuery,
  ): Promise<StreamableFile> {
    const file = await this.gratuity.provisionCsv(query.asOf);
    return fileResponse(Buffer.from(file.text), {
      contentType: 'text/csv; charset=utf-8',
      fileName: file.fileName,
      download: true,
    });
  }

  @Get('wppf')
  @Permits('payroll.view')
  years(): Promise<WppfYearView[]> {
    return this.wppf.list();
  }

  @Post('wppf')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(wppfYearSchema))
  createYear(
    @CurrentUser() user: AuthUser,
    @Body(zod(wppfYearSchema)) body: WppfYearInput,
  ): Promise<WppfYearView> {
    return this.wppf.create(user, body);
  }

  /** Opens the run paying a pay group's beneficiaries their share. */
  @Post('wppf/:id/runs')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(wppfRunSchema))
  async openRun(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(wppfRunSchema)) body: WppfRunInput,
  ): Promise<PayrollRunView> {
    return this.runs.view(await this.wppf.openRun(user, id, body));
  }
}
