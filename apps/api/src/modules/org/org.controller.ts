import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  costCentreInputSchema,
  costCentreUpdateSchema,
  designationInputSchema,
  designationUpdateSchema,
  gradeInputSchema,
  gradeUpdateSchema,
  legalEntityInputSchema,
  legalEntityUpdateSchema,
  locationInputSchema,
  locationUpdateSchema,
  orgUnitInputSchema,
  orgUnitUpdateSchema,
  type CostCentreView,
  type DesignationView,
  type GradeView,
  type LegalEntityView,
  type LocationView,
  type OrgSnapshot,
  type OrgUnitView,
  type TenantWithAccess,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { OrgService } from './org.service.js';

type In<T extends z.ZodType> = z.infer<T>;

/** Org structure. Everyone in the workspace can read legal entities; HR changes everything. */
@ApiTags('org')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('core_hr')
@Controller('tenant')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  /** Every org list in one call, for the org screens and employee forms. */
  @Get('org')
  @Permits('employees.read')
  snapshot(): Promise<OrgSnapshot> {
    return this.org.snapshot();
  }

  @Get('legal-entities')
  legalEntities(): Promise<LegalEntityView[]> {
    return this.org.listLegalEntities();
  }

  @Get('legal-entities/:id')
  legalEntity(@Param('id', ParseUUIDPipe) id: string): Promise<LegalEntityView> {
    return this.org.getLegalEntity(id);
  }

  @Post('legal-entities')
  @Permits('org.manage')
  @ApiBody(openApiBody(legalEntityInputSchema))
  createLegalEntity(
    @CurrentUser() actor: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(legalEntityInputSchema)) body: In<typeof legalEntityInputSchema>,
  ): Promise<LegalEntityView> {
    return this.org.createLegalEntity(actor, tenant, body);
  }

  @Patch('legal-entities/:id')
  @Permits('org.manage')
  @ApiBody(openApiBody(legalEntityUpdateSchema))
  updateLegalEntity(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(legalEntityUpdateSchema)) body: In<typeof legalEntityUpdateSchema>,
  ): Promise<LegalEntityView> {
    return this.org.updateLegalEntity(actor, id, body);
  }

  @Post('locations')
  @Permits('org.manage')
  @ApiBody(openApiBody(locationInputSchema))
  createLocation(
    @CurrentUser() actor: AuthUser,
    @Body(zod(locationInputSchema)) body: In<typeof locationInputSchema>,
  ): Promise<LocationView> {
    return this.org.createLocation(actor, body);
  }

  @Patch('locations/:id')
  @Permits('org.manage')
  @ApiBody(openApiBody(locationUpdateSchema))
  updateLocation(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(locationUpdateSchema)) body: In<typeof locationUpdateSchema>,
  ): Promise<LocationView> {
    return this.org.updateLocation(actor, id, body);
  }

  @Post('org-units')
  @Permits('org.manage')
  @ApiBody(openApiBody(orgUnitInputSchema))
  createOrgUnit(
    @CurrentUser() actor: AuthUser,
    @Body(zod(orgUnitInputSchema)) body: In<typeof orgUnitInputSchema>,
  ): Promise<OrgUnitView> {
    return this.org.createOrgUnit(actor, body);
  }

  @Patch('org-units/:id')
  @Permits('org.manage')
  @ApiBody(openApiBody(orgUnitUpdateSchema))
  updateOrgUnit(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(orgUnitUpdateSchema)) body: In<typeof orgUnitUpdateSchema>,
  ): Promise<OrgUnitView> {
    return this.org.updateOrgUnit(actor, id, body);
  }

  @Post('designations')
  @Permits('org.manage')
  @ApiBody(openApiBody(designationInputSchema))
  createDesignation(
    @CurrentUser() actor: AuthUser,
    @Body(zod(designationInputSchema)) body: In<typeof designationInputSchema>,
  ): Promise<DesignationView> {
    return this.org.createDesignation(actor, body);
  }

  @Patch('designations/:id')
  @Permits('org.manage')
  @ApiBody(openApiBody(designationUpdateSchema))
  updateDesignation(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(designationUpdateSchema)) body: In<typeof designationUpdateSchema>,
  ): Promise<DesignationView> {
    return this.org.updateDesignation(actor, id, body);
  }

  @Post('grades')
  @Permits('org.manage')
  @ApiBody(openApiBody(gradeInputSchema))
  createGrade(
    @CurrentUser() actor: AuthUser,
    @Body(zod(gradeInputSchema)) body: In<typeof gradeInputSchema>,
  ): Promise<GradeView> {
    return this.org.createGrade(actor, body);
  }

  @Patch('grades/:id')
  @Permits('org.manage')
  @ApiBody(openApiBody(gradeUpdateSchema))
  updateGrade(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(gradeUpdateSchema)) body: In<typeof gradeUpdateSchema>,
  ): Promise<GradeView> {
    return this.org.updateGrade(actor, id, body);
  }

  @Post('cost-centres')
  @Permits('org.manage')
  @ApiBody(openApiBody(costCentreInputSchema))
  createCostCentre(
    @CurrentUser() actor: AuthUser,
    @Body(zod(costCentreInputSchema)) body: In<typeof costCentreInputSchema>,
  ): Promise<CostCentreView> {
    return this.org.createCostCentre(actor, body);
  }

  @Patch('cost-centres/:id')
  @Permits('org.manage')
  @ApiBody(openApiBody(costCentreUpdateSchema))
  updateCostCentre(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(costCentreUpdateSchema)) body: In<typeof costCentreUpdateSchema>,
  ): Promise<CostCentreView> {
    return this.org.updateCostCentre(actor, id, body);
  }
}
