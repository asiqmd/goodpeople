import {
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Database } from '@gp/db';
import type { FeatureKey } from '@gp/shared';
import type { AuthedRequest } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { DB } from '../../db/db.module.js';
import { checkSupportRequest, supportSessionOf } from '../support-access/support-sessions.js';
import { EntitlementsService } from './entitlements.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Tenant routes: loads the tenant's resolved access onto the request, blocks suspended
 * tenants entirely and read-only tenants from writing. Never looks at billing directly.
 */
const WRITABLE_WHEN_READ_ONLY = 'gp:writable-when-read-only';

/**
 * Lets a route write while the workspace is read-only: paying an invoice is how a workspace
 * that stopped paying gets its access back.
 */
export const WritableWhenReadOnly = () => SetMetadata(WRITABLE_WHEN_READ_ONLY, true);

@Injectable()
export class AccessStateGuard implements CanActivate {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (req.user?.kind !== 'tenant') {
      throw forbidden('tenant_only', 'This endpoint is for workspace users');
    }
    const tenant = await this.entitlements.forTenant(req.user.tenantId);
    if (!tenant) throw new UnauthorizedException();
    req.tenant = tenant;

    const { accessState, reason } = tenant.access;
    if (
      accessState === 'suspended' &&
      !(
        reason === 'license_recovery_pending' &&
        (req.path.startsWith('/tenant/enterprise') ||
          req.path === '/tenant/access' ||
          req.path === '/tenant/identity/step-up') &&
        req.user.role === 'tenant_admin' &&
        !req.user.policy?.custom
      )
    ) {
      throw forbidden('tenant_suspended', 'This workspace is suspended');
    }
    // Good People support: only while the workspace's grant runs, and never a write, even
    // on the routes below that stay writable for a read-only workspace.
    if (req.user.role === 'support') {
      checkSupportRequest(await supportSessionOf(this.db, req), req.method);
    }
    const writable = this.reflector.getAllAndOverride<boolean>(WRITABLE_WHEN_READ_ONLY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (accessState === 'read_only' && !SAFE_METHODS.has(req.method) && !writable) {
      throw forbidden('tenant_read_only', `This workspace is read-only (${reason})`);
    }
    return true;
  }
}

const FEATURE = 'gp:feature';

/** Requires a module to be in the tenant's effective entitlements. Use after AccessStateGuard. */
export const RequireFeature = (...features: FeatureKey[]) => SetMetadata(FEATURE, features);

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const features = this.reflector.getAllAndOverride<FeatureKey[] | undefined>(FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!features) return true;
    const tenant = context.switchToHttp().getRequest<AuthedRequest>().tenant;
    const missing = features.find((feature) => !tenant?.access.features.includes(feature));
    if (missing) {
      throw forbidden('feature_not_in_plan', `Your plan does not include ${missing}`);
    }
    return true;
  }
}
