import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  anomalyDefinitionSchema,
  anomalyReviewSchema,
  type AnomalyDefinition,
  type AnomalyReview,
  type TenantWithAccess,
} from '@gp/shared';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { AnomaliesService } from './anomalies.service.js';
import { INSIGHT_FEATURES } from './insights.service.js';

@Controller('tenant/analytics/anomalies')
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature(...INSIGHT_FEATURES, 'anomaly_review')
@Permits('analytics.view', 'employees.read')
export class AnomaliesController {
  constructor(private readonly anomalies: AnomaliesService) {}

  @Get('catalog')
  @Header('Cache-Control', 'private, no-store')
  catalog(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: TenantWithAccess) {
    return this.anomalies.catalog(user, tenant);
  }

  @Get(['inbox', 'inbox/:before'])
  @Header('Cache-Control', 'private, no-store')
  inbox(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Query(zod(anomalyDefinitionSchema)) definition: AnomalyDefinition,
    @Param('before', new ParseUUIDPipe({ optional: true })) before?: string,
  ) {
    return this.anomalies.inbox(user, tenant, definition, before);
  }

  @Post('scan')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(200)
  scan(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(anomalyDefinitionSchema)) definition: AnomalyDefinition,
  ) {
    return this.anomalies.scan(user, tenant, definition);
  }

  @Post(':id/review')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(200)
  review(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(anomalyReviewSchema)) review: AnomalyReview,
  ) {
    return this.anomalies.review(user, tenant, id, review);
  }
}
