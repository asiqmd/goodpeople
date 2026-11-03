import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  insightDefinitionSchema,
  insightJobSchema,
  type InsightDefinition,
  type TenantWithAccess,
} from '@gp/shared';
import type { Response } from 'express';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { zod } from '../../common/zod.js';
import {
  AccessStateGuard,
  FeatureGuard,
  RequireFeature,
  WritableWhenReadOnly,
} from '../entitlements/guards.js';
import { InsightJobsService } from './insight-jobs.service.js';
import { INSIGHT_FEATURES, InsightsService } from './insights.service.js';

@Controller('tenant/analytics')
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature(...INSIGHT_FEATURES)
@Permits('analytics.view', 'employees.read')
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly jobs: InsightJobsService,
  ) {}

  @Get('insight-catalog')
  @Header('Cache-Control', 'private, no-store')
  catalog(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantWithAccess) {
    return this.insights.catalog(user, tenant);
  }

  @Get('insight')
  @Header('Cache-Control', 'private, no-store')
  view(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Query(zod(insightDefinitionSchema)) definition: InsightDefinition,
  ) {
    return this.insights.view(user, tenant, definition);
  }

  @Get('saved-insights')
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantWithAccess) {
    return this.jobs.list(user, tenant);
  }

  @Post('saved-insights')
  save(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(insightDefinitionSchema)) definition: InsightDefinition,
  ) {
    return this.jobs.save(user, tenant, definition);
  }

  @Delete('saved-insights/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.remove(user, id);
  }

  @Get('saved-insights/:id/jobs')
  @Header('Cache-Control', 'private, no-store')
  listJobs(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobs.jobs(user, tenant, id);
  }

  @Post('saved-insights/:id/jobs')
  @WritableWhenReadOnly()
  @HttpCode(202)
  enqueue(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(insightJobSchema)) body: { requestId: string },
  ) {
    return this.jobs.enqueue(user, tenant, id, body.requestId);
  }

  @Get('insight-files/:id')
  async file(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    // This fixed aggregate CSV has an explicit pay export check and contains no other restricted fields.
    const bytes = await this.jobs.file(user, tenant, id);
    response
      .set({
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'attachment; filename="good-people-insight.csv"',
        'Content-Type': 'text/csv; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  }
}
