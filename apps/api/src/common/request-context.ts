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

/** Runs each tenant user's request inside an async context that carries their tenant id. */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (user?.kind !== 'tenant') return next.handle();
    return new Observable((subscriber) =>
      storage.run({ tenantId: user.tenantId }, () => next.handle().subscribe(subscriber)),
    );
  }
}
