import {
  createParamDecorator,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { KIOSK_SESSION_HEADER, type ApiError } from '@gp/shared';
import type { AuthedRequest } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { KioskAuthService, type KioskWorker } from './kiosk-auth.service.js';
import { KiosksService } from './kiosks.service.js';

export interface KioskRequest extends AuthedRequest {
  kioskWorker?: KioskWorker;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const READS_ONLY = 'gp:kiosk-reads-only';

/** A POST that changes nothing (signing in or out), so a read-only workspace allows it. */
export const ReadsOnly = () => SetMetadata(READS_ONLY, true);

const unknownKiosk = () => {
  const body: ApiError = {
    statusCode: 401,
    error: 'Unauthorized',
    message: 'This kiosk is not set up, or it was revoked',
    code: 'kiosk_unknown',
  };
  return new UnauthorizedException(body);
};

/**
 * Kiosk routes: a valid, unrevoked device token, for a workspace that is not suspended (and
 * only reads while read-only) and whose plan has kiosks. Notes when the kiosk was last seen.
 */
@Injectable()
export class KioskGuard implements CanActivate {
  constructor(
    private readonly kiosks: KiosksService,
    private readonly entitlements: EntitlementsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<KioskRequest>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    const kiosk = scheme === 'Bearer' && token ? await this.kiosks.authenticate(token) : null;
    if (!kiosk) throw unknownKiosk();
    const tenant = await this.entitlements.forTenant(kiosk.tenantId);
    if (!tenant) throw unknownKiosk();
    await this.kiosks.seen(kiosk);

    const { accessState, features, reason } = tenant.access;
    if (accessState === 'suspended') {
      throw forbidden('tenant_suspended', 'This workspace is suspended');
    }
    const reads =
      SAFE_METHODS.has(req.method) ||
      this.reflector.getAllAndOverride<boolean>(READS_ONLY, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (accessState === 'read_only' && !reads) {
      throw forbidden('tenant_read_only', `This workspace is read-only (${reason})`);
    }
    if (!features.includes('kiosk')) {
      throw forbidden('feature_not_in_plan', 'Your plan does not include kiosks');
    }
    req.kiosk = kiosk;
    req.tenant = tenant;
    return true;
  }
}

/** Routes for a signed-in worker: the session token from this kiosk, still valid. Use after KioskGuard. */
@Injectable()
export class KioskSessionGuard implements CanActivate {
  constructor(private readonly auth: KioskAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<KioskRequest>();
    const token = req.headers[KIOSK_SESSION_HEADER];
    req.kioskWorker = await this.auth.session(req.kiosk!, typeof token === 'string' ? token : '');
    return true;
  }
}

export const CurrentKiosk = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<KioskRequest>().kiosk,
);

export const CurrentWorker = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<KioskRequest>().kioskWorker,
);
