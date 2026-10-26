import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  acknowledgeAlertSchema,
  complianceAlertQuerySchema,
  complianceCheckSchema,
  complianceSettingsSchema,
  hoursBoardQuerySchema,
  nightConsentSchema,
  nightWorkQuerySchema,
  type AcknowledgeAlertInput,
  type AdolescentsView,
  type ComplianceAlertPage,
  type ComplianceAlertQuery,
  type ComplianceAlertView,
  type ComplianceCheckInput,
  type ComplianceCheckResult,
  type ComplianceOverview,
  type ComplianceSettingsInput,
  type ComplianceSettingsView,
  type HoursBoardQuery,
  type HoursBoardView,
  type NightConsentInput,
  type NightWorkQuery,
  type NightWorkRow,
  type NightWorkView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { ComplianceBoardsService } from './compliance-boards.service.js';
import { ComplianceCheckService } from './compliance-check.service.js';
import { ComplianceService } from './compliance.service.js';

/** Working-time alerts, the hours board, adolescents and women at night. */
@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@Permits('compliance.manage')
@Controller('tenant/compliance')
export class ComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly check: ComplianceCheckService,
    private readonly boards: ComplianceBoardsService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser): Promise<ComplianceOverview> {
    return this.compliance.overview(user);
  }

  @Get('settings')
  settings(): Promise<ComplianceSettingsView> {
    return this.compliance.settings();
  }

  @Put('settings')
  @ApiBody(openApiBody(complianceSettingsSchema))
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body(zod(complianceSettingsSchema)) body: ComplianceSettingsInput,
  ): Promise<ComplianceSettingsView> {
    return this.compliance.updateSettings(user, body);
  }

  /** Checks a range now, as the hourly job does for the recent weeks. */
  @Post('check')
  @RequireFeature('attendance')
  @ApiBody(openApiBody(complianceCheckSchema))
  run(
    @Body(zod(complianceCheckSchema)) body: ComplianceCheckInput,
  ): Promise<ComplianceCheckResult> {
    return this.check.run(body);
  }

  @Get('alerts')
  alerts(
    @CurrentUser() user: AuthUser,
    @Query(zod(complianceAlertQuerySchema)) query: ComplianceAlertQuery,
  ): Promise<ComplianceAlertPage> {
    return this.compliance.alerts(user, query);
  }

  @Post('alerts/:id/acknowledge')
  @ApiBody(openApiBody(acknowledgeAlertSchema))
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(acknowledgeAlertSchema)) body: AcknowledgeAlertInput,
  ): Promise<ComplianceAlertView> {
    return this.compliance.acknowledge(user, id, body);
  }

  @Get('hours')
  @RequireFeature('attendance')
  hours(
    @CurrentUser() user: AuthUser,
    @Query(zod(hoursBoardQuerySchema)) query: HoursBoardQuery,
  ): Promise<HoursBoardView> {
    return this.boards.hours(user, query);
  }

  @Get('adolescents')
  adolescents(@CurrentUser() user: AuthUser): Promise<AdolescentsView> {
    return this.boards.adolescents(user);
  }

  @Get('night-work')
  @RequireFeature('attendance')
  nightWork(
    @CurrentUser() user: AuthUser,
    @Query(zod(nightWorkQuerySchema)) query: NightWorkQuery,
  ): Promise<NightWorkView> {
    return this.boards.nightWork(user, query);
  }

  @Put('night-work/:employeeId')
  @ApiBody(openApiBody(nightConsentSchema))
  setNightConsent(
    @CurrentUser() user: AuthUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body(zod(nightConsentSchema)) body: NightConsentInput,
  ): Promise<NightWorkRow> {
    return this.boards.setNightConsent(user, employeeId, body);
  }
}
