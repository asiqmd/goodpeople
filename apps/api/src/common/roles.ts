import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fieldAllowed } from './field-access.js';
import { can, policyCan, type Permission } from '@gp/shared';
import type { AuthedRequest, AuthUser } from './auth-user.js';
import { forbidden } from './errors.js';

const PERMITS = 'gp:permits';

/** Limits a tenant route to logins whose role has every one of these permissions. */
export const Permits = (...permissions: Permission[]) => SetMetadata(PERMITS, permissions);

/** Whether a workspace login may do something. Platform users have no workspace permissions. */
export const userCan = (user: AuthUser | undefined, permission: Permission): boolean => {
  if (user?.kind !== 'tenant') return false;
  if (!user.policy?.custom) return can(user.role, permission);
  if (!policyCan(user.policy, permission)) return false;
  // These delegate surfaces contain private free text without a safe field projection.
  if (
    ['recruitment.manage', 'performance.manage', 'employee_services.manage'].includes(permission) &&
    (['identity', 'bank', 'contacts', 'pay'] as const).some((f) => !fieldAllowed(user, f, 'read'))
  )
    return false;
  if (permission.startsWith('payroll.') && (!fieldAllowed(user, 'pay', 'read') || !user.mfaAt))
    return false;
  if (permission === 'payroll.manage' && !fieldAllowed(user, 'pay', 'write')) return false;
  if (permission === 'employees.identity' && !fieldAllowed(user, 'identity', 'read')) return false;
  const context = user.scopePermissions ?? [];
  if (!context.length || context.includes(permission)) return true;
  const resources = (user.policy.companies ?? []).filter((c) =>
    context.every((p) => policyCan(user.policy!, p, c)),
  );
  // A secondary right may not widen a mixed controller's primary company envelope.
  return resources.length > 0 && resources.every((c) => policyCan(user.policy!, permission, c));
};

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
