import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  platformLoginSchema,
  refreshSchema,
  tenantLoginSchema,
  type PlatformLoginInput,
  type PlatformSession,
  type RefreshInput,
  type TenantLoginInput,
  type TenantSession,
  type TokenPair,
} from '@gp/shared';
import { openApiBody, zod } from '../../common/zod.js';
import { AuthService } from './auth.service.js';
import { Public } from './jwt-auth.guard.js';

@ApiTags('auth')
@Public()
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Workspace (tenant) users sign in with their workspace slug. */
  @Post('auth/login')
  @HttpCode(200)
  @ApiBody(openApiBody(tenantLoginSchema))
  login(@Body(zod(tenantLoginSchema)) body: TenantLoginInput): Promise<TenantSession> {
    return this.auth.loginTenant(body);
  }

  @Post('platform/auth/login')
  @HttpCode(200)
  @ApiBody(openApiBody(platformLoginSchema))
  platformLogin(
    @Body(zod(platformLoginSchema)) body: PlatformLoginInput,
  ): Promise<PlatformSession> {
    return this.auth.loginPlatform(body);
  }

  @Post('auth/refresh')
  @HttpCode(200)
  @ApiBody(openApiBody(refreshSchema))
  refresh(@Body(zod(refreshSchema)) body: RefreshInput): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('auth/logout')
  @HttpCode(204)
  @ApiBody(openApiBody(refreshSchema))
  logout(@Body(zod(refreshSchema)) body: RefreshInput): Promise<void> {
    return this.auth.logout(body.refreshToken);
  }
}
