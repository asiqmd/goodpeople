import type { ServicePrincipal } from '../modules/integrations/authority.js';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  AccessPolicy,
  Permission,
  PlatformRole,
  TenantRole,
  TenantWithAccess,
} from '@gp/shared';
import type { Request } from 'express';

export type AuthUser = (
  | { kind: 'platform'; id: string; role: PlatformRole }
  | {
      kind: 'tenant';
      id: string;
      role: TenantRole;
      tenantId: string;
      restrictedCompanies?: boolean;
      policy?: AccessPolicy;
      revision?: number;
      scopePermissions?: Permission[];
    }
) & {
  selfService?: boolean;
  sessionId?: string;
  mfaAt?: Date | null;
  authMethod?: string;
  language?: 'en' | 'bn' | 'ar';
};

export type PlatformUser = Extract<AuthUser, { kind: 'platform' }>;

export interface AuthedRequest extends Request {
  user?: AuthUser;
  /** Independent machine principal: never a human role or account. */
  service?: ServicePrincipal;
  /** Set by AccessStateGuard on tenant routes. */
  tenant?: TenantWithAccess;
  /** Set by EdgeAgentGuard on the Edge Agent's routes. */
  edgeAgent?: { tenantId: string; agentId: string };
  /** Set by KioskGuard on a kiosk's routes. */
  kiosk?: { tenantId: string; kioskId: string };
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);

export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().tenant,
);
