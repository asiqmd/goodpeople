import { Body, Controller, Get, HttpCode, Ip, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  signupStartSchema,
  signupVerifySchema,
  slugCheckSchema,
  type SignupStartInput,
  type SignupStarted,
  type SignupVerifyInput,
  type SignupView,
  type SlugCheck,
} from '@gp/shared';
import { openApiBody, zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import type { TenantLoginResult } from '../auth/auth.service.js';
import { PlatformGuard } from '../platform-admin/platform.guard.js';
import { SignupService } from './signup.service.js';

/** Self-serve sign-up for a trial workspace. Open to anyone, and rate-limited. */
@ApiTags('signup')
@Controller('signup')
export class SignupController {
  constructor(private readonly signups: SignupService) {}

  /** Sends a code to the email address. */
  @Public()
  @Post()
  @ApiBody(openApiBody(signupStartSchema))
  start(
    @Body(zod(signupStartSchema)) body: SignupStartInput,
    @Ip() ip: string,
  ): Promise<SignupStarted> {
    return this.signups.start(body, ip);
  }

  @Public()
  @Get('slug')
  slug(@Query(zod(slugCheckSchema)) query: { slug: string }): Promise<SlugCheck> {
    return this.signups.checkSlug(query.slug);
  }

  /** The code, the workspace address and a password: creates the trial and signs in. */
  @Public()
  @Post('verify')
  @HttpCode(200)
  @ApiBody(openApiBody(signupVerifySchema))
  verify(
    @Body(zod(signupVerifySchema)) body: SignupVerifyInput,
    @Ip() ip: string,
  ): Promise<{ tenant: { slug: string; name: string }; login: TenantLoginResult }> {
    return this.signups.verify(body, ip);
  }
}

/** The sign-up funnel, for the platform console. */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformGuard)
@Controller('platform/signups')
export class PlatformSignupsController {
  constructor(private readonly signups: SignupService) {}

  @Get()
  list(): Promise<SignupView[]> {
    return this.signups.list();
  }
}
