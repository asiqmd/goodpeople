import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { TenantAccessView, TenantWithAccess } from '@gp/shared';
import { CurrentTenant } from '../../common/auth-user.js';
import { AccessStateGuard, FeatureGuard } from '../entitlements/guards.js';

@ApiTags('tenant')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard)
@Controller('tenant')
export class TenancyController {
  /** What this workspace may do right now. The web and mobile apps render from this. */
  @Get('access')
  access(@CurrentTenant() tenant: TenantWithAccess): TenantAccessView {
    const { id, name, slug, billingMode, status, planCode, accessExpiresAt, industryTemplate } =
      tenant;
    return {
      tenant: { id, name, slug, billingMode, status, planCode, accessExpiresAt, industryTemplate },
      access: tenant.access,
    };
  }
}
