import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Database } from '@gp/db';
import type { TaxYearView } from '@gp/shared';
import { map, type Observable } from 'rxjs';
import type { AuthedRequest } from '../../common/auth-user.js';
import { DB } from '../../db/db.module.js';
import { describeRequest } from './support-audit.middleware.js';
import { checkIdentityRoute, maskTaxYear, TAX_YEAR } from './support-identity.js';
import { checkSupportRequest, supportSessionOf } from './support-sessions.js';

/**
 * For a `support` login on every route: the access guard's rule (reads only, while the grant
 * runs) where that guard is absent, such as the login's own account; and no identity numbers.
 */
@Injectable()
export class SupportSessionInterceptor implements NestInterceptor {
  constructor(@Inject(DB) private readonly db: Database) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (user?.kind !== 'tenant' || user.role !== 'support') return next.handle();
    checkSupportRequest(await supportSessionOf(this.db, req), req.method);
    const { route, params } = describeRequest(req);
    await checkIdentityRoute(this.db, user.tenantId, route, params);
    return route === TAX_YEAR
      ? next.handle().pipe(map((year) => maskTaxYear(year as TaxYearView)))
      : next.handle();
  }
}
