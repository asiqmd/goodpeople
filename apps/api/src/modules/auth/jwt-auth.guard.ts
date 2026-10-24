import {
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PlatformRole, TenantRole } from '@gp/shared';
import type { AuthedRequest, AuthUser } from '../../common/auth-user.js';

const PUBLIC = 'gp:public';

/** Opts a route out of the global JwtAuthGuard. */
export const Public = () => SetMetadata(PUBLIC, true);

export type AccessTokenPayload =
  | { sub: string; kind: 'platform'; role: PlatformRole }
  | { sub: string; kind: 'tenant'; role: TenantRole; tid: string };

export function toAuthUser(payload: AccessTokenPayload): AuthUser {
  return payload.kind === 'platform'
    ? { kind: 'platform', id: payload.sub, role: payload.role }
    : { kind: 'tenant', id: payload.sub, role: payload.role, tenantId: payload.tid };
}

/** Every route needs a valid Bearer access token unless it is marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing access token');
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload & { typ?: string }>(token);
      // Only access tokens carry no type; anything else (a second-step token) is refused.
      if (payload.typ) throw new Error('Not an access token');
      req.user = toAuthUser(payload);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return true;
  }
}
