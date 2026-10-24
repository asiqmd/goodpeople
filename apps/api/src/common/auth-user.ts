import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PlatformRole, TenantRole, TenantWithAccess } from '@gp/shared';
import type { Request } from 'express';

export type AuthUser =
  | { kind: 'platform'; id: string; role: PlatformRole }
  | { kind: 'tenant'; id: string; role: TenantRole; tenantId: string };

export type PlatformUser = Extract<AuthUser, { kind: 'platform' }>;

export interface AuthedRequest extends Request {
  user?: AuthUser;
  /** Set by AccessStateGuard on tenant routes. */
  tenant?: TenantWithAccess;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);

export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().tenant,
);
