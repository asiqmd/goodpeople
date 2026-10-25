import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformRole } from '@gp/shared';
import type { AuthedRequest } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';

const SUPER_ADMIN = 'gp:super-admin';
const ROLES = 'gp:platform-roles';

/** Marks a platform route that only a Super Admin may call (every write, for now). */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN, true);

/** Marks a platform route for these roles (and always the Super Admin), e.g. billing for finance. */
export const PlatformRolesOnly = (...roles: PlatformRole[]) => SetMetadata(ROLES, roles);

/** Platform routes: any platform role may read; @SuperAdminOnly routes need super_admin. */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (user?.kind !== 'platform') {
      throw forbidden('platform_only', 'This endpoint is for platform staff');
    }
    const needsSuperAdmin = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (needsSuperAdmin && user.role !== 'super_admin') {
      throw forbidden('super_admin_only', 'Only a Super Admin can do this');
    }
    const roles = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && user.role !== 'super_admin' && !roles.includes(user.role as PlatformRole)) {
      throw forbidden('platform_role', 'Your platform role cannot do this');
    }
    return true;
  }
}
