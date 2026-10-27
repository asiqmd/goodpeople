import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { AuthedRequest } from './auth-user.js';

interface RequestContext {
  /** The request's reference; absent in background jobs. */
  requestId?: string;
  tenantId?: string;
}

/** A request the request-ID middleware has seen. */
export interface IdentifiedRequest extends Request {
  requestId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The tenant of the current request. Throws outside a tenant-authenticated request. */
export function currentTenantId(): string {
  const tenantId = storage.getStore()?.tenantId;
  if (!tenantId) throw new Error('No tenant in the request context');
  return tenantId;
}

/** The reference of the request being handled, for log lines; undefined outside a request. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** The request's reference, as the request-ID middleware set it. */
export function requestIdOf(req: Request): string | undefined {
  return (req as IdentifiedRequest).requestId;
}

/** Runs work outside a request (background jobs) as one tenant. */
export function runInTenantContext<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/** Runs the rest of a request's middleware with its reference in the context. */
export function runInRequestContext<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/**
 * Runs each tenant request inside an async context that carries its tenant id: a workspace
 * user's, or an Edge Agent's or a kiosk's (whose tokens name the workspace). The request's
 * reference stays in it.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const tenantId =
      req.user?.kind === 'tenant'
        ? req.user.tenantId
        : (req.edgeAgent?.tenantId ?? req.kiosk?.tenantId);
    if (!tenantId) return next.handle();
    return new Observable((subscriber) =>
      storage.run({ requestId: requestIdOf(req), tenantId }, () =>
        next.handle().subscribe(subscriber),
      ),
    );
  }
}
