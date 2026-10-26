import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  groupDashboardQuerySchema,
  POLICY_AREAS,
  policyOverrideSchema,
  policySubjectQuerySchema,
  type CompanyPolicyView,
  type GroupDashboardQuery,
  type GroupDashboardView,
  type GroupPoliciesView,
  type PolicyArea,
  type PolicyOverrideInput,
  type PolicySubjectQuery,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { GroupDashboardService } from './group-dashboard.service.js';
import { GroupPoliciesService } from './group-policies.service.js';

const areaPipe = new ParseEnumPipe(Object.fromEntries(POLICY_AREAS.map((a) => [a, a])));

/** Figures across the group's companies, and the group's policy with company overrides. */
@ApiTags('group')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('multi_entity')
@Controller('tenant/group')
export class GroupController {
  constructor(
    private readonly dashboards: GroupDashboardService,
    private readonly policies: GroupPoliciesService,
  ) {}

  /** A month per company and for the group; pay only for those who may see payroll. */
  @Get('dashboard')
  @Permits('employees.read')
  dashboard(
    @CurrentUser() user: AuthUser,
    @Query(zod(groupDashboardQuerySchema)) query: GroupDashboardQuery,
  ): Promise<GroupDashboardView> {
    return this.dashboards.dashboard(user, query);
  }

  /** Each area: the group's values, each company's override and what it changes. */
  @Get('policies')
  @Permits('org.manage')
  listPolicies(@CurrentUser() user: AuthUser): Promise<GroupPoliciesView> {
    return this.policies.list(user);
  }

  /** Sets what a company does differently; a leave type's override names it in `subjectId`. */
  @Put('policies/:legalEntityId/:area')
  @Permits('org.manage')
  @ApiBody(openApiBody(policyOverrideSchema))
  savePolicy(
    @CurrentUser() user: AuthUser,
    @Param('legalEntityId', ParseUUIDPipe) legalEntityId: string,
    @Param('area', areaPipe) area: PolicyArea,
    @Body(zod(policyOverrideSchema)) body: PolicyOverrideInput,
  ): Promise<CompanyPolicyView<PolicyArea>> {
    return this.policies.save(user, legalEntityId, area, body);
  }

  /** The company follows the group's policy again. */
  @Delete('policies/:legalEntityId/:area')
  @Permits('org.manage')
  @HttpCode(204)
  removePolicy(
    @CurrentUser() user: AuthUser,
    @Param('legalEntityId', ParseUUIDPipe) legalEntityId: string,
    @Param('area', areaPipe) area: PolicyArea,
    @Query(zod(policySubjectQuerySchema)) query: PolicySubjectQuery,
  ): Promise<void> {
    return this.policies.remove(user, legalEntityId, area, query.subjectId);
  }
}
