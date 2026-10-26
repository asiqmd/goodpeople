import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  userCreateSchema,
  userUpdateSchema,
  type UserCreateInput,
  type UserUpdateInput,
  type WorkspaceUserCreated,
  type WorkspaceUserListItem,
  type WorkspaceUserView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard } from '../entitlements/guards.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, TenantRolesGuard)
@Permits('users.manage')
@Controller('tenant/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<WorkspaceUserListItem[]> {
    return this.users.list();
  }

  @Post()
  @ApiBody(openApiBody(userCreateSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(userCreateSchema)) body: UserCreateInput,
  ): Promise<WorkspaceUserCreated> {
    return this.users.create(user, body);
  }

  @Patch(':id')
  @ApiBody(openApiBody(userUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(userUpdateSchema)) body: UserUpdateInput,
  ): Promise<WorkspaceUserView> {
    return this.users.update(user, id, body);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ temporaryPassword: string }> {
    return this.users.resetPassword(user, id);
  }

  @Post(':id/reset-mfa')
  @HttpCode(200)
  resetMfa(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceUserView> {
    return this.users.resetMfa(user, id);
  }
}
