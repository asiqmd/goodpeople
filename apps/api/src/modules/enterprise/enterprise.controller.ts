import {
  Controller,
  Get,
  Post,
  Body,
  Ip,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { AccessStateGuard, WritableWhenReadOnly } from '../entitlements/guards.js';
import { EnterpriseLicenseService } from './enterprise-license.service.js';
@Controller('tenant/enterprise')
@UseGuards(AccessStateGuard)
export class EnterpriseController {
  constructor(private service: EnterpriseLicenseService) {}
  @Get() overview(@CurrentUser() u: AuthUser) {
    return this.service.overview(u);
  }
  @Post('license') @WritableWhenReadOnly() import(
    @CurrentUser() u: AuthUser,
    @Body(zod(z.object({ envelope: z.string().min(50).max(24000) }).strict()))
    body: { envelope: string },
  ) {
    return this.service.import(u, body.envelope);
  }
  @Post('clock-acknowledgement') @WritableWhenReadOnly() clock(@CurrentUser() u: AuthUser) {
    return this.service.acknowledgeClock(u);
  }
  @Post('recovery-acknowledgement') @WritableWhenReadOnly() recovery(
    @CurrentUser() u: AuthUser,
    @Body(
      zod(
        z
          .object({ reason: z.string().trim().min(20).max(1000), reconciled: z.literal(true) })
          .strict(),
      ),
    )
    b: { reason: string; reconciled: true },
  ) {
    return this.service.acknowledgeRecovery(u, b.reason);
  }
  @Post('diagnostics') @WritableWhenReadOnly() diagnostics(@CurrentUser() u: AuthUser) {
    return this.service.diagnostics(u);
  }
}
@Public()
@Controller('installation')
export class InstallationController {
  constructor(private service: EnterpriseLicenseService) {}
  @Post('claim') claim(
    @Body(
      zod(
        z
          .object({ token: z.string().min(40).max(200), password: z.string().min(16).max(128) })
          .strict(),
      ),
    )
    body: { token: string; password: string },
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    if (process.env.NODE_ENV === 'production' && !req.secure)
      throw new BadRequestException('TLS required');
    return this.service.claim(body.token, body.password, ip);
  }
}
