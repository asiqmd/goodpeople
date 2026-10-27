import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { runAsTenant, type Database } from '@gp/db';
import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest } from '../../common/auth-user.js';
import { runInTenantContext } from '../../common/request-context.js';
import { DB } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { supportSessionOf } from './support-sessions.js';

/** What the audit log keeps of a request: the route as declared, never the URL or its query. */
export function describeRequest(req: Pick<Request, 'method' | 'route' | 'params'>) {
  const pattern = typeof req.route?.path === 'string' ? req.route.path : '';
  return {
    method: req.method,
    route: `${req.method} ${pattern}`.trim(),
    params: { ...req.params } as Record<string, string>,
  };
}

/**
 * Every request a `support` login makes goes into the workspace's audit log as
 * `support.viewed` once the response is sent, refused ones too (with their status). Whether
 * the login is support is known only after the guards ran, so every request is watched.
 */
@Injectable()
export class SupportAuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SupportAuditMiddleware.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: TenantAuditService,
  ) {}

  use(req: AuthedRequest, res: Response, next: NextFunction) {
    res.once('close', () => void this.record(req, res));
    next();
  }

  private async record(req: AuthedRequest, res: Response) {
    const user = req.user;
    if (user?.kind !== 'tenant' || user.role !== 'support') return;
    try {
      const found = await supportSessionOf(this.db, req);
      await runInTenantContext(user.tenantId, () =>
        runAsTenant(this.db, user.tenantId, (tx) =>
          this.audit.record(tx, {
            actorUserId: user.id,
            action: 'support.viewed',
            entityType: 'support_access_session',
            entityId: found?.session.id ?? null,
            after: { ...describeRequest(req), status: res.statusCode },
          }),
        ),
      );
    } catch (error) {
      this.logger.error(`Recording a support request failed: ${(error as Error).message}`);
    }
  }
}
