import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { AccessStateGuard, WritableWhenReadOnly } from '../entitlements/guards.js';
import { OidcService } from './oidc.service.js';
const start = z
  .object({
    tenant: z.string().min(1).max(100),
    binding: z.string().length(43),
    client: z.enum(['web', 'mobile']).default('web'),
  })
  .strict();
const exchange = z
  .object({ flowId: z.string().length(32), verifier: z.string().min(32).max(128) })
  .strict();
const binding = z.object({ binding: z.string().length(43) }).strict();
@Public()
@Controller('auth/sso')
export class OidcController {
  constructor(private readonly oidc: OidcService) {}
  @Post('start')
  @HttpCode(200)
  start(@Body(zod(start)) body: z.infer<typeof start>, @Ip() ip: string) {
    return this.oidc.start(body, ip);
  }
  @Post('exchange')
  @HttpCode(200)
  async exchange(
    @Body(zod(exchange)) body: z.infer<typeof exchange>,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.oidc.exchange(body.flowId, body.verifier, ip);
    if (!result) {
      res.status(202);
      return { pending: true };
    }
    return result;
  }
  @Get('callback')
  async callback(@Query() query: Record<string, unknown>, @Res() res: Response) {
    try {
      const result = await this.oidc.complete(query);
      return res.redirect(
        303,
        `${this.webOrigin()}/auth/sso/complete?flow=${result.flowId}&client=${result.client}`,
      );
    } catch {
      return res.redirect(303, `${this.webOrigin()}/login?sso=failed`);
    }
  }
  private webOrigin() {
    return this.oidc.webOrigin();
  }
}
@UseGuards(AccessStateGuard)
@Controller('tenant/identity/connections')
export class OidcTestController {
  constructor(private readonly oidc: OidcService) {}
  @Post(':id/test')
  @WritableWhenReadOnly()
  test(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(binding)) body: z.infer<typeof binding>,
    @Ip() ip: string,
  ) {
    return this.oidc.startForUser(user, body.binding, ip, id, true);
  }
}
@Controller('account/sso')
export class OidcAccountController {
  constructor(private readonly oidc: OidcService) {}
  @Get() status(@CurrentUser() user: AuthUser) {
    return this.oidc.accountStatus(user);
  }
  @Post('link')
  link(
    @CurrentUser() user: AuthUser,
    @Body(zod(binding)) body: z.infer<typeof binding>,
    @Ip() ip: string,
  ) {
    return this.oidc.startForUser(user, body.binding, ip);
  }
}
