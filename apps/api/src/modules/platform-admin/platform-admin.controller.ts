import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  assignCompanySchema,
  createGrantSchema,
  updateBillingSchema,
  type AssignCompanyInput,
  type AssignCompanyResult,
  type AuditEntry,
  type CreateGrantInput,
  type PlanDefinition,
  type TenantWithAccess,
  type UpdateBillingInput,
} from '@gp/shared';
import { CurrentUser, type PlatformUser } from '../../common/auth-user.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AuditService } from '../audit/audit.service.js';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlatformGuard, SuperAdminOnly } from './platform.guard.js';

@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformGuard)
@Controller('platform')
export class PlatformAdminController {
  constructor(
    private readonly admin: PlatformAdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('plans')
  plans(): readonly PlanDefinition[] {
    return this.admin.listPlans();
  }

  @Get('tenants')
  tenants(): Promise<TenantWithAccess[]> {
    return this.admin.listTenants();
  }

  @Get('tenants/:id')
  tenant(@Param('id', ParseUUIDPipe) id: string): Promise<TenantWithAccess> {
    return this.admin.getTenant(id);
  }

  /** "Assign company": create a tenant, its first admin, and how it is billed (or not). */
  @Post('tenants')
  @SuperAdminOnly()
  @ApiBody(openApiBody(assignCompanySchema))
  assign(
    @CurrentUser() actor: PlatformUser,
    @Body(zod(assignCompanySchema)) body: AssignCompanyInput,
  ): Promise<AssignCompanyResult> {
    return this.admin.assignCompany(actor, body);
  }

  @Patch('tenants/:id/billing')
  @SuperAdminOnly()
  @ApiBody(openApiBody(updateBillingSchema))
  updateBilling(
    @CurrentUser() actor: PlatformUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(updateBillingSchema)) body: UpdateBillingInput,
  ): Promise<TenantWithAccess> {
    return this.admin.updateBilling(actor, id, body);
  }

  @Post('tenants/:id/grants')
  @SuperAdminOnly()
  @ApiBody(openApiBody(createGrantSchema))
  addGrant(
    @CurrentUser() actor: PlatformUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(createGrantSchema)) body: CreateGrantInput,
  ): Promise<TenantWithAccess> {
    return this.admin.addGrant(actor, id, body);
  }

  @Get('audit')
  @ApiQuery({ name: 'tenantId', required: false })
  auditLog(
    @Query('tenantId', new ParseUUIDPipe({ optional: true })) tenantId?: string,
  ): Promise<AuditEntry[]> {
    return this.audit.list(tenantId);
  }
}
