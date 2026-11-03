import { Body, Controller, Get, Header, HttpCode, Module, Post, UseGuards } from '@nestjs/common';
import {
  ASSISTANT_ACTOR_LIMIT,
  ASSISTANT_TENANT_LIMIT,
  ASSISTANT_WINDOW_MS,
  type AssistantAdmission,
} from '@gp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { zod } from '../../common/zod.js';
import { AuthModule } from '../auth/auth.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import {
  AccessStateGuard,
  FeatureGuard,
  RequireFeature,
  WritableWhenReadOnly,
} from '../entitlements/guards.js';

@Controller('tenant/assistant')
@UseGuards(AccessStateGuard, FeatureGuard)
@RequireFeature('workspace_assistant')
export class AssistantController {
  constructor(private readonly limiter: RateLimiter) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  access(@CurrentUser() user: AuthUser): AssistantAdmission {
    if (user.kind !== 'tenant' || user.role === 'support' || !user.sessionId)
      throw forbidden('assistant_scope', 'Assistant access requires a workspace user');
    return { tenantId: user.tenantId, actorId: user.id };
  }

  // Admission reserves a read budget. The payload never carries the user's question.
  @Post('read')
  @WritableWhenReadOnly()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async admit(@CurrentUser() user: AuthUser, @Body(zod(z.object({}).strict())) _body: object) {
    const actor = this.access(user);
    await this.limiter.hit(
      'assistant:actor:' + actor.tenantId + ':' + actor.actorId,
      ASSISTANT_ACTOR_LIMIT,
      ASSISTANT_WINDOW_MS,
    );
    await this.limiter.hit(
      'assistant:tenant:' + actor.tenantId,
      ASSISTANT_TENANT_LIMIT,
      ASSISTANT_WINDOW_MS,
    );
    return actor;
  }
}

@Module({
  imports: [AuthModule, EntitlementsModule],
  controllers: [AssistantController],
})
export class AssistantModule {}
