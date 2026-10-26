import {
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { runAsTenant, type Database } from '@gp/db';
import type { AuthedRequest } from '../../common/auth-user.js';
import { DB } from '../../db/db.module.js';
import { inScope } from './employee-scope.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For HR routes about one person (`employees/:id/…`): someone outside the companies the login
 * looks after is not found, as on their record itself. Lists apply `entityScope` instead.
 */
@Injectable()
export class EmployeeScopeGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    const id = req.params.id;
    // A malformed id is the route's own pipe's to refuse.
    if (user?.kind !== 'tenant' || typeof id !== 'string' || !UUID.test(id)) return true;
    const visible = await runAsTenant(this.db, user.tenantId, (tx) => inScope(tx, user, id));
    if (!visible) throw new NotFoundException('Employee not found');
    return true;
  }
}
