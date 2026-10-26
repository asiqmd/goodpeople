import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  userEntityScopeSchema,
  type UserEntityScopeInput,
  type UserEntityScopeView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { AccessScopesService } from './access-scopes.service.js';

/** The companies of the group a login may see people of: shared-service HR. */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('multi_entity')
@Permits('users.manage')
@Controller('tenant/users/:id/scopes')
export class AccessScopesController {
  constructor(private readonly scopes: AccessScopesService) {}

  @Get()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UserEntityScopeView> {
    return this.scopes.get(id);
  }

  /** An empty list lets the login see every company again. */
  @Put()
  @ApiBody(openApiBody(userEntityScopeSchema))
  set(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(userEntityScopeSchema)) body: UserEntityScopeInput,
  ): Promise<UserEntityScopeView> {
    return this.scopes.set(user, id, body);
  }
}
