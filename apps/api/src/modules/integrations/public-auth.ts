import {
  Inject,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  Catch,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { apiClients, apiClientCredentials, runAsTenant, type Database } from '@gp/db';
import { API_SCOPES, type ApiScope } from '@gp/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { DB } from '../../db/db.module.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { SecurityState } from '../../common/security-state.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { resolveService, digest, type ServicePrincipal } from './authority.js';
export interface ServiceRequest extends Request {
  service?: ServicePrincipal;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validIdentifier = (value: string) => {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts[0] === 'gpcli' &&
    parts[1] === 'v1' &&
    UUID.test(parts[2]!) &&
    UUID.test(parts[3]!)
  );
};
const signing = (secret: string) =>
  createHash('sha256').update(`${secret}:public:v1`).digest('hex');
export const clientIdentifier = (tenantId: string, id: string) => `gpcli.v1.${tenantId}.${id}`;
export function integrationError(status: number, code: string, message: string): never {
  throw new HttpException({ code, message }, status);
}
@Injectable()
export class PublicAuth {
  private jwt = new JwtService();
  constructor(
    @Inject(DB) private db: Database,
    @Inject(APP_CONFIG) private config: AppConfig,
    private state: SecurityState,
    private entitlements: EntitlementsService,
  ) {}
  async access(tenantId: string, feature: 'core_hr' | 'attendance' = 'core_hr') {
    const tenant = await this.entitlements.forTenant(tenantId);
    if (
      !tenant ||
      tenant.access.accessState === 'suspended' ||
      !tenant.access.features.includes('api_access') ||
      !tenant.access.features.includes(feature)
    )
      integrationError(403, 'access_denied', 'Integration access is unavailable');
    return tenant;
  }
  async token(req: Request, res: Response) {
    res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache');
    if (process.env.NODE_ENV === 'production' && !req.secure)
      integrationError(400, 'invalid_request', 'TLS is required');
    await this.rate(`token-ip:${req.ip}`, 30, 60_000, res);
    const header = req.headers.authorization ?? '';
    const encoded = /^Basic ([A-Za-z0-9+/]+=*)$/i.exec(header)?.[1];
    const pair = encoded ? Buffer.from(encoded, 'base64').toString('utf8').split(':') : [];
    if (pair.length !== 2 || !validIdentifier(pair[0]!))
      integrationError(401, 'invalid_client', 'Client authentication failed');
    const id = pair[0]!.split('.'),
      tenantId = id[2]!,
      clientId = id[3]!;
    if (
      this.config.DEPLOYMENT_MODE !== 'managed' &&
      tenantId !== this.config.INSTALLATION_TENANT_ID
    )
      integrationError(401, 'invalid_client', 'Client authentication failed');
    if (
      !req.body ||
      Object.keys(req.body).some((k) => !['grant_type', 'scope'].includes(k)) ||
      req.body.grant_type !== 'client_credentials'
    )
      integrationError(400, 'unsupported_grant_type', 'Use client_credentials');
    await this.rate(`token-client:${clientId}`, 20, 60_000, res);
    const result = await runAsTenant(this.db, tenantId, async (tx) => {
      const [client] = await tx.select().from(apiClients).where(eq(apiClients.id, clientId));
      const credentials = await tx
        .select()
        .from(apiClientCredentials)
        .where(
          and(eq(apiClientCredentials.clientId, clientId), isNull(apiClientCredentials.revokedAt)),
        );
      const hash = Buffer.from(digest(pair[1]!), 'hex');
      let found: (typeof credentials)[number] | undefined;
      for (const credential of credentials)
        if (
          timingSafeEqual(hash, Buffer.from(credential.secretHash, 'hex')) &&
          credential.expiresAt.getTime() > Date.now()
        )
          found = credential;
      if (!client || !found)
        integrationError(401, 'invalid_client', 'Client authentication failed');
      const requested =
        req.body.scope === undefined
          ? client.scopes
          : String(req.body.scope).split(' ').filter(Boolean);
      if (
        !requested.length ||
        requested.some(
          (s: string) =>
            !API_SCOPES.includes(s as ApiScope) || !client.scopes.includes(s as ApiScope),
        )
      )
        integrationError(400, 'invalid_scope', 'Scope is not granted');
      return resolveService(tx, {
        id: client.id,
        tenantId,
        credentialId: found.id,
        version: client.version,
        scopes: [...new Set(requested)] as ApiScope[],
      });
    });
    await this.access(tenantId);
    const expires = Math.max(
      1,
      Math.min(
        this.config.PUBLIC_TOKEN_TTL_SECONDS,
        Math.floor((result.expiresAt - Date.now()) / 1000),
      ),
    );
    const access = await this.jwt.signAsync(
      {
        typ: 'service',
        kind: 'service',
        sub: result.id,
        tid: tenantId,
        cid: result.credentialId,
        ver: result.version,
        scope: result.scopes,
        jti: randomUUID(),
      },
      {
        secret: signing(this.config.JWT_ACCESS_SECRET),
        keyid: this.config.JWT_ACCESS_KEY_ID,
        algorithm: 'HS256',
        issuer: 'good-people',
        audience: 'gp-public-v1',
        expiresIn: expires,
      },
    );
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: expires,
      scope: result.scopes.join(' '),
    };
  }
  async authenticate(req: ServiceRequest, res: Response) {
    res.set('Cache-Control', 'no-store').set('Vary', 'Authorization');
    if (process.env.NODE_ENV === 'production' && !req.secure)
      integrationError(400, 'invalid_request', 'TLS is required');
    if ('access_token' in req.query)
      integrationError(400, 'invalid_request', 'Tokens belong in the Authorization header');
    const token = /^Bearer ([^ ]+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Missing service token');
    let p: {
      sub: string;
      tid: string;
      cid: string;
      ver: number;
      iat: number;
      exp: number;
      jti: string;
      scope: ApiScope[];
      typ: string;
      kind: string;
    };
    try {
      const decoded = this.jwt.decode(token, { complete: true }) as {
        header?: { kid?: string };
      } | null;
      const kid = decoded?.header?.kid;
      const secret =
        kid === this.config.JWT_ACCESS_KEY_ID
          ? this.config.JWT_ACCESS_SECRET
          : kid === this.config.JWT_PREVIOUS_KEY_ID &&
              this.config.JWT_PREVIOUS_VALID_UNTIL &&
              Date.parse(this.config.JWT_PREVIOUS_VALID_UNTIL) > Date.now()
            ? this.config.JWT_PREVIOUS_ACCESS_SECRET
            : undefined;
      if (!secret) throw new Error('key');
      p = await this.jwt.verifyAsync(token, {
        secret: signing(secret),
        algorithms: ['HS256'],
        issuer: 'good-people',
        audience: 'gp-public-v1',
      });
      if (
        p.typ !== 'service' ||
        p.kind !== 'service' ||
        !Number.isInteger(p.ver) ||
        p.ver < 1 ||
        !Number.isInteger(p.iat) ||
        !Number.isInteger(p.exp) ||
        p.exp <= p.iat ||
        p.exp - p.iat > 900 ||
        p.iat > Math.floor(Date.now() / 1000) + 30 ||
        typeof p.jti !== 'string' ||
        !UUID.test(p.jti) ||
        !Array.isArray(p.scope) ||
        p.scope.length === 0 ||
        p.scope.length > 3 ||
        p.scope.some((s) => !API_SCOPES.includes(s)) ||
        ![p.sub, p.tid, p.cid].every((s) => typeof s === 'string' && UUID.test(s))
      )
        throw new Error('type');
    } catch {
      throw new UnauthorizedException('Invalid service token');
    }
    if (this.config.DEPLOYMENT_MODE !== 'managed' && p.tid !== this.config.INSTALLATION_TENANT_ID)
      throw new UnauthorizedException('Invalid service token');
    await this.access(p.tid);
    const service = await runAsTenant(this.db, p.tid, (tx) =>
      resolveService(tx, {
        id: p.sub,
        tenantId: p.tid,
        credentialId: p.cid,
        version: p.ver,
        scopes: p.scope,
      }),
    );
    await this.rate(`public:${service.id}`, this.config.PUBLIC_RATE_LIMIT, 60_000, res);
    await this.rate(
      `public-day:${service.id}`,
      this.config.PUBLIC_DAILY_QUOTA,
      86400_000,
      res,
      false,
    );
    req.service = service;
  }
  private async rate(key: string, limit: number, window: number, res: Response, headers = true) {
    const state = await this.state.count(`public-limit:${key}`, window);
    if (headers)
      res
        .set('X-RateLimit-Limit', String(limit))
        .set('X-RateLimit-Remaining', String(Math.max(0, limit - state.count)))
        .set('X-RateLimit-Reset', String(Math.ceil((Date.now() + state.ttl) / 1000)));
    if (state.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil(state.ttl / 1000))));
      integrationError(429, 'rate_limited', 'Retry after the indicated interval');
    }
  }
}
@Injectable()
export class ServiceGuard implements CanActivate {
  constructor(private auth: PublicAuth) {}
  async canActivate(context: ExecutionContext) {
    await this.auth.authenticate(
      context.switchToHttp().getRequest(),
      context.switchToHttp().getResponse(),
    );
    return true;
  }
}
@Catch()
export class PublicErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request & { requestId?: string }>(),
      res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const own = error instanceof HttpException ? error.getResponse() : null;
    const body = typeof own === 'object' && own ? (own as { code?: string; message?: string }) : {};
    const code =
      body.code ??
      (status === 401
        ? 'invalid_token'
        : status === 403
          ? 'access_denied'
          : status === 404
            ? 'not_found'
            : status < 500
              ? 'invalid_request'
              : 'temporarily_unavailable');
    if (status === 401)
      res.set(
        'WWW-Authenticate',
        req.path === '/oauth/token'
          ? 'Basic realm="Good People clients"'
          : 'Bearer realm="public-v1", error="invalid_token"',
      );
    if (req.path === '/oauth/token')
      res.status(status).json({
        error: code === 'invalid_token' ? 'invalid_client' : code,
        error_description:
          status >= 500 ? 'Temporarily unavailable' : (body.message ?? 'Request refused'),
        request_id: req.requestId,
      });
    else
      res.status(status).json({
        error: {
          code,
          message: status >= 500 ? 'Temporarily unavailable' : (body.message ?? 'Request refused'),
          request_id: req.requestId,
        },
      });
  }
}
