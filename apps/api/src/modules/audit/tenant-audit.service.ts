import { Injectable } from '@nestjs/common';
import { tenantAuditLog, type Tx } from '@gp/db';
import { currentTenantId } from '../../common/request-context.js';

export interface TenantAuditRecord {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes to the append-only workspace audit log, inside the caller's tenant transaction.
 * Never pass decrypted identity or account numbers: record which fields changed instead.
 */
@Injectable()
export class TenantAuditService {
  async record(tx: Tx, entry: TenantAuditRecord): Promise<void> {
    await tx.insert(tenantAuditLog).values({
      tenantId: currentTenantId(),
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  }
}
