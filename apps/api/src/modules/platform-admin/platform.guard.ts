import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';

const SUPER_ADMIN = 'gp:super-admin';

/** Marks a platform route that only a Super Admin may call (every write, for now). */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN, true);

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
    return true;
  }
}
