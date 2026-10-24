import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthedRequest } from './auth-user.js';

interface RequestContext {
  tenantId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The tenant of the current request. Throws outside a tenant-authenticated request. */
export function currentTenantId(): string {
  const tenantId = storage.getStore()?.tenantId;
  if (!tenantId) throw new Error('No tenant in the request context');
  return tenantId;
}

/** Runs work outside a request (background jobs) as one tenant. */
export function runInTenantContext<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/**
 * Runs each tenant request inside an async context that carries its tenant id: a workspace
 * user's, or an Edge Agent's (whose token names the workspace).
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const tenantId = req.user?.kind === 'tenant' ? req.user.tenantId : req.edgeAgent?.tenantId;
    if (!tenantId) return next.handle();
    return new Observable((subscriber) =>
      storage.run({ tenantId }, () => next.handle().subscribe(subscriber)),
    );
  }
}
