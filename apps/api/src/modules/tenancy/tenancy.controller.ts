import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  createLegalEntitySchema,
  type CreateLegalEntityInput,
  type LegalEntity,
  type TenantAccessView,
  type TenantWithAccess,
} from '@gp/shared';
import { CurrentTenant } from '../../common/auth-user.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { TenancyService } from './tenancy.service.js';

@ApiTags('tenant')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard)
@Controller('tenant')
export class TenancyController {
  constructor(private readonly tenancy: TenancyService) {}

  /** What this workspace may do right now. The web and mobile apps render from this. */
  @Get('access')
  access(@CurrentTenant() tenant: TenantWithAccess): TenantAccessView {
    const { id, name, slug, billingMode, status, planCode, access } = tenant;
    return { tenant: { id, name, slug, billingMode, status, planCode }, access };
  }

  @Get('legal-entities')
  @RequireFeature('core_hr')
  legalEntities(): Promise<LegalEntity[]> {
    return this.tenancy.listLegalEntities();
  }

  @Get('legal-entities/:id')
  @RequireFeature('core_hr')
  legalEntity(@Param('id', ParseUUIDPipe) id: string): Promise<LegalEntity> {
    return this.tenancy.getLegalEntity(id);
  }

  @Post('legal-entities')
  @RequireFeature('core_hr')
  @ApiBody(openApiBody(createLegalEntitySchema))
  createLegalEntity(
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(createLegalEntitySchema)) body: CreateLegalEntityInput,
  ): Promise<LegalEntity> {
    return this.tenancy.createLegalEntity(tenant, body);
  }

  /** Placeholder until the Phase 2 payroll module; here it shows the payroll entitlement gate. */
  @Get('payroll/runs')
  @RequireFeature('payroll')
  payrollRuns(): unknown[] {
    return [];
  }
}
