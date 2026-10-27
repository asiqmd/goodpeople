import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  grantSupportAccessSchema,
  openSupportSessionSchema,
  type GrantSupportAccessInput,
  type OpenSupportSessionInput,
  type PlatformSupportGrantView,
  type SupportAccessGrantView,
  type SupportActivityEntry,
  type SupportSessionOpened,
  type SupportSessionView,
  type TenantWithAccess,
} from '@gp/shared';
import {
  CurrentTenant,
  CurrentUser,
  type AuthUser,
  type PlatformUser,
} from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, WritableWhenReadOnly } from '../entitlements/guards.js';
import { PlatformGuard, PlatformRolesOnly } from '../platform-admin/platform.guard.js';
import { SupportAccessService } from './support-access.service.js';

type TenantUser = Extract<AuthUser, { kind: 'tenant' }>;

/**
 * The workspace lets Good People support look inside, read-only, and takes it back. Granting
 * and revoking stay open while the workspace is read-only: that is when it may need help most.
 */
@ApiTags('support')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, TenantRolesGuard)
@Controller('tenant/support/access')
export class SupportAccessController {
  constructor(private readonly access: SupportAccessService) {}

  @Get()
  @Permits('support.manage')
  list(@CurrentUser() user: TenantUser): Promise<SupportAccessGrantView[]> {
    return this.access.list(user);
  }

  @Post()
  @Permits('support.manage')
  @WritableWhenReadOnly()
  @ApiBody(openApiBody(grantSupportAccessSchema))
  grant(
    @CurrentUser() user: TenantUser,
    @Body(zod(grantSupportAccessSchema)) body: GrantSupportAccessInput,
  ): Promise<SupportAccessGrantView> {
    return this.access.grant(user, body);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @Permits('support.manage')
  @WritableWhenReadOnly()
  revoke(
    @CurrentUser() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupportAccessGrantView> {
    return this.access.revoke(user, id);
  }

  /** The pages support opened here, from the workspace's audit log. */
  @Get('activity')
  @Permits('support.manage')
  activity(): Promise<SupportActivityEntry[]> {
    return this.access.activity();
  }

  /** For a support login: the session it is in, shown on every page. */
  @Get('session')
  session(
    @CurrentUser() user: TenantUser,
    @CurrentTenant() tenant: TenantWithAccess,
  ): Promise<SupportSessionView> {
    return this.access.current(user, tenant.name);
  }
}

/** Support staff open a workspace that let them in; operations can see which have. */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformGuard)
@Controller('platform/support/access')
export class PlatformSupportAccessController {
  constructor(private readonly access: SupportAccessService) {}

  @Get()
  @PlatformRolesOnly('support', 'platform_ops')
  active(): Promise<PlatformSupportGrantView[]> {
    return this.access.active();
  }

  /** A read-only session in the workspace: tokens for its `support` login, as a sign-in gives. */
  @Post('sessions')
  @PlatformRolesOnly('support')
  @ApiBody(openApiBody(openSupportSessionSchema))
  open(
    @CurrentUser() actor: PlatformUser,
    @Body(zod(openSupportSessionSchema)) body: OpenSupportSessionInput,
  ): Promise<SupportSessionOpened> {
    return this.access.open(actor, body);
  }

  @Post('sessions/:id/end')
  @HttpCode(204)
  @PlatformRolesOnly('support')
  end(@CurrentUser() actor: PlatformUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.access.end(actor, id);
  }
}
