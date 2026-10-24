import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HR_ROLES, type TenantRole } from '@gp/shared';
import type { AuthedRequest } from './auth-user.js';
import { forbidden } from './errors.js';

const ROLES = 'gp:tenant-roles';

/** Limits a tenant route to these workspace roles. Use with TenantRolesGuard. */
export const TenantRoles = (...roles: TenantRole[]) => SetMetadata(ROLES, roles);

/** Org structure and employee records: tenant admins and HR admins. */
export const HrOnly = () => TenantRoles(...HR_ROLES);

@Injectable()
export class TenantRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<TenantRole[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (user?.kind !== 'tenant' || !roles.includes(user.role)) {
      throw forbidden('role_not_allowed', 'Your role cannot do this');
    }
    return true;
  }
}
