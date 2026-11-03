import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  authSessions,
  platformUsers,
  runAsTenant,
  tenants,
  tenantUsers,
  type Database,
} from '@gp/db';
import type { Permission, PlatformRole, TenantRole } from '@gp/shared';
import { eq } from 'drizzle-orm';
import type { AuthedRequest, AuthUser } from '../../common/auth-user.js';
import { permissionForPath } from '../../common/authority.js';
import { tenantSessionPolicy } from './tenant-session-policy.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { forbidden } from '../../common/errors.js';
import { checkFieldRequest } from '../../common/field-access.js';
import { DB } from '../../db/db.module.js';

const PUBLIC = 'gp:public';
export const Public = () => SetMetadata(PUBLIC, true);
export type AccessTokenPayload =
  | { sub: string; kind: 'platform'; role: PlatformRole }
  | { sub: string; kind: 'tenant'; role: TenantRole; tid: string };
export function toAuthUser(payload: AccessTokenPayload): AuthUser {
  return payload.kind === 'platform'
    ? { kind: 'platform', id: payload.sub, role: payload.role }
    : { kind: 'tenant', id: payload.sub, role: payload.role, tenantId: payload.tid };
}

/** Tokens identify a session. Authority always comes from current database state. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()])
    )
      return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token, ...extra] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token || extra.length)
      throw new UnauthorizedException('Missing access token');
    try {
      const header = this.jwt.decode(token, { complete: true }) as {
        header?: { kid?: string };
      } | null;
      const kid = header?.header?.kid;
      const secret =
        kid === this.config.JWT_ACCESS_KEY_ID
          ? this.config.JWT_ACCESS_SECRET
          : kid === this.config.JWT_PREVIOUS_KEY_ID &&
              this.config.JWT_PREVIOUS_VALID_UNTIL &&
              Date.parse(this.config.JWT_PREVIOUS_VALID_UNTIL) > Date.now()
            ? this.config.JWT_PREVIOUS_ACCESS_SECRET
            : undefined;
      if (!secret) throw new Error('Unknown signing key');
      const p = await this.jwt.verifyAsync<AccessTokenPayload & { sid: string; typ: string }>(
        token,
        { secret, issuer: 'good-people', audience: 'gp-human', algorithms: ['HS256'] },
      );
      if (
        this.config.DEPLOYMENT_MODE !== 'managed' &&
        (p.kind === 'platform' ||
          (p.kind === 'tenant' && p.tid !== this.config.INSTALLATION_TENANT_ID))
      )
        throw new Error('Installation boundary');
      if (p.typ !== 'access' || !p.sid || !['platform', 'tenant'].includes(p.kind))
        throw new Error('Wrong token type');
      const [session] = await this.db.select().from(authSessions).where(eq(authSessions.id, p.sid));
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now() ||
        session.subjectId !== p.sub ||
        session.subjectKind !== p.kind
      )
        throw new Error('Ended session');
      const [family] = await this.db
        .select()
        .from(authSessions)
        .where(eq(authSessions.id, session.familyId));
      if (
        !family ||
        family.familyRevokedAt ||
        family.subjectId !== session.subjectId ||
        family.subjectKind !== session.subjectKind
      )
        throw new Error('Ended family');
      if (p.kind === 'platform') {
        const [u] = await this.db.select().from(platformUsers).where(eq(platformUsers.id, p.sub));
        if (!u || session.tenantId) throw new Error('Unknown login');
        req.user = { kind: 'platform', id: u.id, role: u.role };
      } else {
        if (session.tenantId !== p.tid) throw new Error('Wrong tenant');
        const [tenant] = await this.db
          .select({ status: tenants.status })
          .from(tenants)
          .where(eq(tenants.id, p.tid));
        if (!tenant || tenant.status === 'suspended' || tenant.status === 'archived')
          throw forbidden('tenant_suspended', 'This workspace is suspended');
        const resolved = await runAsTenant(this.db, p.tid, async (tx) => {
          const [u] = await tx.select().from(tenantUsers).where(eq(tenantUsers.id, p.sub));
          if (!u || u.disabledAt || u.provisionDisabled) throw new Error('Disabled login');
          return { u, policy: await tenantSessionPolicy(tx, u, session) };
        });
        const permits = this.reflector.getAllAndOverride<Permission[]>('gp:permits', [
          context.getHandler(),
          context.getClass(),
        ]);
        const primary = permissionForPath(req.path);
        req.user = {
          kind: 'tenant',
          id: resolved.u.id,
          role: resolved.u.role,
          tenantId: p.tid,
          restrictedCompanies: resolved.u.scopeMode !== 'all',
          language: resolved.u.language,
          revision: resolved.u.authRevision,
          policy: resolved.policy,
          scopePermissions: permits ?? (primary ? [primary] : []),
        };
      }
      req.user.selfService = req.path.startsWith('/tenant/me/');
      req.user.sessionId = session.id;
      req.user.mfaAt = session.mfaAt;
      req.user.authMethod = session.authMethod;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Invalid or expired session; sign in again');
    }
    checkFieldRequest(req);
    return true;
  }
}
