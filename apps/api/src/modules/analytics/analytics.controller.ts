import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { workforceQuerySchema, type WorkforceQuery } from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('tenant/analytics')
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('analytics', 'core_hr')
@Permits('analytics.view', 'employees.read')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get('catalog')
  @Header('Cache-Control', 'private, no-store')
  catalog(@CurrentUser() user: AuthUser, @Query(zod(workforceQuerySchema)) query: WorkforceQuery) {
    return this.analytics.catalog(user, query);
  }
  @Get('workforce')
  @Header('Cache-Control', 'private, no-store')
  workforce(
    @CurrentUser() user: AuthUser,
    @Query(zod(workforceQuerySchema)) query: WorkforceQuery,
  ) {
    return this.analytics.workforce(user, query);
  }
}
