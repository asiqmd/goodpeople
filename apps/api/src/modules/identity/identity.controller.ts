import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  accessAssignmentSchema,
  accessRoleSchema,
  identityConnectionSchema,
  type AccessAssignmentInput,
  type AccessRoleInput,
  type IdentityConnectionInput,
  type TenantWithAccess,
} from '@gp/shared';
import { z } from 'zod';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { zod } from '../../common/zod.js';
import { AccessStateGuard, WritableWhenReadOnly } from '../entitlements/guards.js';
import { IdentityService } from './identity.service.js';
const code = z.object({ code: z.string().trim().min(6).max(32) }).strict();
const enabled = z.object({ enabled: z.boolean() }).strict();
const credential = z
  .object({
    connectionId: z.uuid(),
    name: z.string().trim().min(2).max(100),
    days: z.number().int().min(1).max(365).default(90),
  })
  .strict();
@UseGuards(AccessStateGuard)
@Controller('tenant/identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}
  @Get() overview(@CurrentUser() user: AuthUser) {
    return this.identity.overview(user);
  }
  @Post('step-up')
  @WritableWhenReadOnly()
  stepUp(@CurrentUser() user: AuthUser, @Body(zod(code)) body: z.infer<typeof code>) {
    return this.identity.stepUp(user, body.code);
  }
  @Post('roles')
  createRole(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(accessRoleSchema)) body: AccessRoleInput,
  ) {
    return this.identity.saveRole(user, tenant, body);
  }
  @Put('roles/:id')
  @WritableWhenReadOnly()
  role(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(accessRoleSchema)) body: AccessRoleInput,
  ) {
    return this.identity.saveRole(user, tenant, body, id);
  }
  @Post('users/:id/assignments')
  assign(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(accessAssignmentSchema)) body: AccessAssignmentInput,
  ) {
    return this.identity.assign(user, tenant, id, body);
  }
  @Delete('assignments/:id')
  @WritableWhenReadOnly()
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.identity.removeAssignment(user, id);
  }
  @Put('users/:id/template')
  template(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.identity.template(user, id);
  }
  @Put('users/:id/emergency')
  emergency(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(enabled)) body: z.infer<typeof enabled>,
  ) {
    return this.identity.emergency(user, id, body.enabled);
  }
  @Post('connections')
  connection(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(identityConnectionSchema)) body: IdentityConnectionInput,
  ) {
    return this.identity.saveConnection(user, tenant, body);
  }
  @Put('connections/:id')
  updateConnection(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(identityConnectionSchema)) body: IdentityConnectionInput,
  ) {
    return this.identity.saveConnection(user, tenant, body, id);
  }
  @Put('connections/:id/enforcement')
  @WritableWhenReadOnly()
  enforce(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(enabled)) body: z.infer<typeof enabled>,
    @CurrentTenant() tenant: TenantWithAccess,
  ) {
    // Read-only workspaces can reduce access but cannot enable a new enforcement policy.
    if (
      body.enabled &&
      (tenant.access.accessState !== 'full' || !tenant.access.features.includes('sso'))
    )
      throw forbidden('tenant_read_only', 'New SSO enforcement requires full SSO access');
    return this.identity.enforce(user, id, body.enabled);
  }
  @Post('credentials')
  credential(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(credential)) body: z.infer<typeof credential>,
  ) {
    return this.identity.credential(user, tenant, body.connectionId, body.name, body.days);
  }
  @Delete('credentials/:id')
  @WritableWhenReadOnly()
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.identity.revokeCredential(user, id);
  }
  @Put('provisioned/:id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.identity.restoreManaged(user, id);
  }
  @Put('users/:id/employee')
  employee(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(z.object({ employeeId: z.uuid() }).strict())) body: { employeeId: string },
  ) {
    return this.identity.linkEmployee(user, id, body.employeeId);
  }
  @Put('groups/:id/mappings')
  mapping(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(accessAssignmentSchema)) body: AccessAssignmentInput,
  ) {
    return this.identity.mapGroup(user, tenant, id, body);
  }
  @Delete('mappings/:id')
  @WritableWhenReadOnly()
  unmap(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.identity.unmapGroup(user, id);
  }
}
