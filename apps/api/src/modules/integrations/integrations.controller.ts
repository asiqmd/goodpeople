import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Req,
  Res,
  Query,
  UseGuards,
  UseFilters,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  apiClientSchema,
  webhookSchema,
  type ApiClientInput,
  type WebhookInput,
  type TenantWithAccess,
} from '@gp/shared';
import { CurrentUser, CurrentTenant, type AuthUser } from '../../common/auth-user.js';
import { zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { AccessStateGuard, WritableWhenReadOnly } from '../entitlements/guards.js';
import {
  PublicAuth,
  PublicErrorFilter,
  ServiceGuard,
  integrationError,
  type ServiceRequest,
} from './public-auth.js';
import { PublicDirectory } from './public.service.js';
import { IntegrationsAdmin } from './admin.service.js';
import { PUBLIC_OPENAPI } from './openapi.js';
@Public()
@UseFilters(PublicErrorFilter)
@Controller('oauth')
export class ClientTokenController {
  constructor(private auth: PublicAuth) {}
  @Post('token') @HttpCode(200) token(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.token(req, res);
  }
}
@Public()
@UseFilters(PublicErrorFilter)
@UseGuards(ServiceGuard)
@Controller('public/v1')
export class PublicDirectoryController {
  constructor(private directory: PublicDirectory) {}
  @Get('employees/:id') employee(@Req() req: ServiceRequest, @Param('id') id: string) {
    if (Object.keys(req.query).length)
      integrationError(400, 'invalid_query', 'Employee detail has no query parameters');
    return this.directory.employee(req.service!, id);
  }
  @Get(':resource') list(
    @Req() req: ServiceRequest,
    @Param('resource') resource: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.directory.list(req.service!, resource, query);
  }
}
@Public()
@Controller('public/v1')
export class PublicContractController {
  @Get('openapi.json') contract() {
    return PUBLIC_OPENAPI;
  }
}
@UseGuards(AccessStateGuard)
@Controller('tenant/integrations')
export class IntegrationsController {
  constructor(private service: IntegrationsAdmin) {}
  @Get() overview(@CurrentUser() u: AuthUser) {
    return this.service.overview(u);
  }
  @Post('clients') create(
    @CurrentUser() u: AuthUser,
    @CurrentTenant() t: TenantWithAccess,
    @Body(zod(apiClientSchema)) b: ApiClientInput,
  ) {
    return this.service.saveClient(u, t, b);
  }
  @Patch('clients/:id') edit(
    @CurrentUser() u: AuthUser,
    @CurrentTenant() t: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(apiClientSchema)) b: ApiClientInput,
  ) {
    return this.service.saveClient(u, t, b, id);
  }
  @Delete('clients/:id') @WritableWhenReadOnly() revoke(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeClient(u, id);
  }
  @Post('clients/:id/rotate') rotate(
    @CurrentUser() u: AuthUser,
    @CurrentTenant() t: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      zod(z.object({ overlapSeconds: z.number().int().min(0).max(3600).default(300) }).strict()),
    )
    b: { overlapSeconds: number },
  ) {
    return this.service.rotateClient(u, t, id, b.overlapSeconds);
  }
  @Delete('credentials/:id') @WritableWhenReadOnly() credential(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeCredential(u, id);
  }
  @Post('webhooks') webhook(
    @CurrentUser() u: AuthUser,
    @CurrentTenant() t: TenantWithAccess,
    @Body(zod(webhookSchema)) b: WebhookInput,
  ) {
    return this.service.createWebhook(u, t, b);
  }
  @Put('webhooks/:id/enabled') @WritableWhenReadOnly() state(
    @CurrentUser() u: AuthUser,
    @CurrentTenant() t: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(z.object({ enabled: z.boolean() }).strict())) b: { enabled: boolean },
  ) {
    return this.service.webhookState(u, t, id, b.enabled);
  }
  @Post('webhooks/:id/rotate') rotateWebhook(
    @CurrentUser() u: AuthUser,
    @CurrentTenant() t: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.rotateWebhook(u, t, id);
  }
  @Post('webhooks/:id/activate-key') activate(
    @CurrentUser() u: AuthUser,
    @CurrentTenant() t: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.activateWebhookKey(u, t, id);
  }
  @Post('deliveries/:id/replay') replay(
    @CurrentUser() u: AuthUser,
    @CurrentTenant() t: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(z.object({ reason: z.string().trim().min(10).max(500) }).strict()))
    b: { reason: string },
  ) {
    return this.service.replay(u, t, id, b.reason);
  }
}
