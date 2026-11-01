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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  calibrationQuerySchema,
  cycleCalibrateSchema,
  cycleDatesSchema,
  cyclePersonSchema,
  cycleReviewsQuerySchema,
  cycleSchema,
  performanceSettingsSchema,
  type CalibrationQuery,
  type CalibrationView,
  type CycleCalibrateInput,
  type CycleDatesInput,
  type CycleDetail,
  type CycleInput,
  type CycleLaunchResult,
  type CycleListItem,
  type CyclePersonInput,
  type CycleReviewItem,
  type CycleReviewsQuery,
  type Page,
  type PerformanceSettingsInput,
  type PerformanceSettingsView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { CalibrationService } from './calibration.service.js';
import { CyclesService } from './cycles.service.js';
import { PerformanceSettingsService } from './settings.service.js';

/**
 * Review cycles and the settings they start from, for those who manage performance, within
 * the companies they look after.
 */
@ApiTags('performance')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('performance')
@Permits('performance.manage')
@Controller('tenant/performance')
export class CyclesController {
  constructor(
    private readonly cycles: CyclesService,
    private readonly calibration: CalibrationService,
    private readonly settings: PerformanceSettingsService,
  ) {}

  @Get('settings')
  getSettings(): Promise<PerformanceSettingsView> {
    return this.settings.get();
  }

  @Put('settings')
  @ApiBody(openApiBody(performanceSettingsSchema))
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(zod(performanceSettingsSchema)) body: PerformanceSettingsInput,
  ): Promise<PerformanceSettingsView> {
    return this.settings.save(user, body);
  }

  @Get('cycles')
  list(@CurrentUser() user: AuthUser): Promise<CycleListItem[]> {
    return this.cycles.list(user);
  }

  @Post('cycles')
  @ApiBody(openApiBody(cycleSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(cycleSchema)) body: CycleInput,
  ): Promise<CycleDetail> {
    return this.cycles.create(user, body);
  }

  @Get('cycles/:id')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CycleDetail> {
    return this.cycles.detail(user, id);
  }

  /** The whole set-up of a draft. */
  @Patch('cycles/:id')
  @ApiBody(openApiBody(cycleSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(cycleSchema)) body: CycleInput,
  ): Promise<CycleDetail> {
    return this.cycles.update(user, id, body);
  }

  /** The name and step dates, also once launched. */
  @Put('cycles/:id/dates')
  @ApiBody(openApiBody(cycleDatesSchema))
  dates(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(cycleDatesSchema)) body: CycleDatesInput,
  ): Promise<CycleDetail> {
    return this.cycles.dates(user, id, body);
  }

  /** Launches a draft; on an active cycle, adds the people who have come into it since. */
  @Post('cycles/:id/launch')
  @HttpCode(200)
  launch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CycleLaunchResult> {
    return this.cycles.launch(user, id);
  }

  @Post('cycles/:id/people')
  @ApiBody(openApiBody(cyclePersonSchema))
  addPerson(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(cyclePersonSchema)) body: CyclePersonInput,
  ): Promise<CycleLaunchResult> {
    return this.cycles.addPerson(user, id, body.employeeId);
  }

  @Get('cycles/:id/reviews')
  reviews(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(cycleReviewsQuerySchema)) query: CycleReviewsQuery,
  ): Promise<Page<CycleReviewItem>> {
    return this.cycles.reviews(user, id, query);
  }

  @Get('cycles/:id/calibration')
  calibrationView(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(calibrationQuerySchema)) query: CalibrationQuery,
  ): Promise<CalibrationView> {
    return this.calibration.view(user, id, query);
  }

  /** Moves the cycle to calibration; while manager reviews are missing, with a note. */
  @Post('cycles/:id/calibration')
  @HttpCode(200)
  @ApiBody(openApiBody(cycleCalibrateSchema))
  calibrate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(cycleCalibrateSchema)) body: CycleCalibrateInput,
  ): Promise<CycleDetail> {
    return this.cycles.calibrate(user, id, body.note);
  }

  @Post('cycles/:id/release')
  @HttpCode(200)
  release(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CycleDetail> {
    return this.cycles.release(user, id);
  }

  @Post('cycles/:id/close')
  @HttpCode(200)
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CycleDetail> {
    return this.cycles.close(user, id);
  }
}
