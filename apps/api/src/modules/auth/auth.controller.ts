import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  mfaEnrollSchema,
  mfaEnrollStartSchema,
  mfaVerifySchema,
  otpRequestSchema,
  otpVerifySchema,
  platformLoginSchema,
  refreshSchema,
  tenantLoginSchema,
  type MfaEnrollInput,
  type MfaSetup,
  type MfaVerifyInput,
  type OtpRequestInput,
  type OtpRequestResult,
  type OtpVerifyInput,
  type PlatformLoginInput,
  type PlatformSession,
  type RefreshInput,
  type TenantLoginInput,
  type TenantSession,
  type TokenPair,
} from '@gp/shared';
import type { z } from 'zod';
import { openApiBody, zod } from '../../common/zod.js';
import { AuthService, type PlatformLoginResult, type TenantLoginResult } from './auth.service.js';
import { Public } from './jwt-auth.guard.js';

@ApiTags('auth')
@Public()
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Workspace (tenant) users sign in with their workspace slug. A login with two-step sign-in
   * gets `{ mfaRequired, mfaToken }` instead of a session and finishes at /auth/mfa/verify.
   */
  @Post('auth/login')
  @HttpCode(200)
  @ApiBody(openApiBody(tenantLoginSchema))
  login(
    @Body(zod(tenantLoginSchema)) body: TenantLoginInput,
    @Ip() ip: string,
  ): Promise<TenantLoginResult> {
    return this.auth.loginTenant(body, ip);
  }

  @Post('platform/auth/login')
  @HttpCode(200)
  @ApiBody(openApiBody(platformLoginSchema))
  platformLogin(
    @Body(zod(platformLoginSchema)) body: PlatformLoginInput,
    @Ip() ip: string,
  ): Promise<PlatformLoginResult> {
    return this.auth.loginPlatform(body, ip);
  }

  /** The second step: a code from the authenticator app, or a recovery code. */
  @Post('auth/mfa/verify')
  @HttpCode(200)
  @ApiBody(openApiBody(mfaVerifySchema))
  verifyMfa(
    @Body(zod(mfaVerifySchema)) body: MfaVerifyInput,
  ): Promise<TenantSession | PlatformSession> {
    return this.auth.verifyMfa(body);
  }

  /** For `{ mfaSetupRequired }`: the secret to add to an authenticator app. */
  @Post('auth/mfa/enroll/start')
  @HttpCode(200)
  @ApiBody(openApiBody(mfaEnrollStartSchema))
  enrollStart(
    @Body(zod(mfaEnrollStartSchema)) body: z.infer<typeof mfaEnrollStartSchema>,
  ): Promise<MfaSetup> {
    return this.auth.enrollStart(body.mfaToken);
  }

  /** The first code from the app turns two-step sign-in on and signs in. */
  @Post('auth/mfa/enroll')
  @HttpCode(200)
  @ApiBody(openApiBody(mfaEnrollSchema))
  enroll(@Body(zod(mfaEnrollSchema)) body: MfaEnrollInput) {
    return this.auth.enroll(body);
  }

  /** Sends a sign-in code by SMS to an employee login's number. Always answers the same. */
  @Post('auth/otp/request')
  @HttpCode(202)
  @ApiBody(openApiBody(otpRequestSchema))
  requestOtp(
    @Body(zod(otpRequestSchema)) body: OtpRequestInput,
    @Ip() ip: string,
  ): Promise<OtpRequestResult> {
    return this.auth.requestOtp(body, ip);
  }

  @Post('auth/otp/verify')
  @HttpCode(200)
  @ApiBody(openApiBody(otpVerifySchema))
  verifyOtp(@Body(zod(otpVerifySchema)) body: OtpVerifyInput): Promise<TenantSession> {
    return this.auth.verifyOtp(body);
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
