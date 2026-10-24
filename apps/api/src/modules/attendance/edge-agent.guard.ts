import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthedRequest } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { DevicesService } from './devices.service.js';

/**
 * Edge Agent routes: a valid, unrevoked agent token, for a workspace that may write and has
 * attendance. Refusals are 401/403 so the agent keeps its buffer and retries later.
 */
@Injectable()
export class EdgeAgentGuard implements CanActivate {
  constructor(
    private readonly devices: DevicesService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    const agent = scheme === 'Bearer' && token ? await this.devices.authenticate(token) : null;
    if (!agent) throw new UnauthorizedException('Invalid or revoked agent token');
    const tenant = await this.entitlements.forTenant(agent.tenantId);
    if (!tenant) throw new UnauthorizedException('Invalid or revoked agent token');
    const { accessState, features, reason } = tenant.access;
    if (accessState === 'suspended') {
      throw forbidden('tenant_suspended', 'This workspace is suspended');
    }
    if (accessState === 'read_only') {
      throw forbidden('tenant_read_only', `This workspace is read-only (${reason})`);
    }
    if (!features.includes('attendance')) {
      throw forbidden('feature_not_in_plan', 'Your plan does not include attendance');
    }
    req.edgeAgent = agent;
    return true;
  }
}
