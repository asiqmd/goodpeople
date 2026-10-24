import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Permission } from '@gp/shared';
import type { AuthedRequest, AuthUser } from './auth-user.js';
import { forbidden } from './errors.js';

const PERMITS = 'gp:permits';

/** Limits a tenant route to logins whose role has every one of these permissions. */
export const Permits = (...permissions: Permission[]) => SetMetadata(PERMITS, permissions);

/** Whether a workspace login may do something. Platform users have no workspace permissions. */
export const userCan = (user: AuthUser | undefined, permission: Permission) =>
  user?.kind === 'tenant' && can(user.role, permission);

@Injectable()
export class TenantRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMITS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permissions) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!permissions.every((p) => userCan(user, p))) {
      throw forbidden('role_not_allowed', 'Your role cannot do this');
    }
    return true;
  }
}
