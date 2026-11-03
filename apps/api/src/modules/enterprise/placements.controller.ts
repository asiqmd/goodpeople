import { Controller, Get, Post, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { z } from 'zod';
import { placementInputSchema, type PlacementInput } from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { PlacementsService } from './placements.service.js';
const reason = z.object({ reason: z.string().trim().min(10).max(500) }).strict();
@Controller('platform/placements')
export class PlacementsController {
  constructor(private service: PlacementsService) {}
  @Post('step-up') stepUp(
    @CurrentUser() u: AuthUser,
    @Body(zod(z.object({ code: z.string().min(6).max(20) }).strict())) b: { code: string },
  ) {
    return this.service.stepUp(u, b.code);
  }
  @Get() list(@CurrentUser() u: AuthUser) {
    return this.service.list(u);
  }
  @Post() create(
    @CurrentUser() u: AuthUser,
    @Body(zod(placementInputSchema)) body: PlacementInput,
  ) {
    return this.service.create(u, body);
  }
  @Post(':id/challenge') challenge(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(reason)) body: { reason: string },
  ) {
    return this.service.challenge(u, id, body.reason);
  }
  @Post(':id/activate') activate(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(reason.extend({ receipt: z.string().min(50).max(16000) })))
    body: { reason: string; receipt: string },
  ) {
    return this.service.activate(u, id, body.receipt, body.reason);
  }
  @Post(':id/disable') disable(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(reason)) body: { reason: string },
  ) {
    return this.service.disable(u, id, body.reason);
  }
}
@Public()
@Controller('installation')
export class PlacementRouteController {
  constructor(private service: PlacementsService) {}
  @Get('route') route(@Query('workspace') slug: string) {
    return this.service.route(typeof slug === 'string' ? slug.slice(0, 64) : '');
  }
}
