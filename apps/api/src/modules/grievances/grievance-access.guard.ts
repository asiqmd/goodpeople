import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { runAsTenant, type Database } from '@gp/db';
import { can } from '@gp/shared';
import type { AuthedRequest } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { DB } from '../../db/db.module.js';
import { complaintCommitteeLogins } from './grievance-records.js';

/**
 * Grievance handlers, and members of the complaint committee whatever their role: workers
 * sit on it (s.332A) and hear harassment cases. Which cases each may open is the service's.
 */
@Injectable()
export class GrievanceAccessGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (user?.kind !== 'tenant')
      throw forbidden('tenant_only', 'This endpoint is for workspace users');
    if (can(user.role, 'grievances.manage')) return true;
    const members = await runAsTenant(this.db, user.tenantId, (tx) => complaintCommitteeLogins(tx));
    if (!members.includes(user.id)) throw forbidden('role_not_allowed', 'Your role cannot do this');
    return true;
  }
}
