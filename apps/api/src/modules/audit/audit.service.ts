import { Inject, Injectable } from '@nestjs/common';
import { platformAuditLog, platformUsers, tenants, type Database, type Tx } from '@gp/db';
import type { AuditEntry } from '@gp/shared';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../../db/db.module.js';

export interface AuditRecord {
  actorId: string;
  action: string;
  tenantId: string | null;
  reason: string;
  before?: unknown;
  after?: unknown;
}

/** Writes to and reads the append-only platform audit log. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Pass the caller's transaction so the audit row commits or rolls back with the change. */
  async record(tx: Tx, entry: AuditRecord): Promise<void> {
    await tx.insert(platformAuditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      tenantId: entry.tenantId,
      reason: entry.reason,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  }

  async list(tenantId?: string, limit = 200): Promise<AuditEntry[]> {
    const rows = await this.db
      .select({
        log: platformAuditLog,
        actorEmail: platformUsers.email,
        tenantSlug: tenants.slug,
      })
      .from(platformAuditLog)
      .leftJoin(platformUsers, eq(platformUsers.id, platformAuditLog.actorId))
      .leftJoin(tenants, eq(tenants.id, platformAuditLog.tenantId))
      .where(tenantId ? eq(platformAuditLog.tenantId, tenantId) : undefined)
      .orderBy(desc(platformAuditLog.createdAt))
      .limit(limit);
    return rows.map(({ log, actorEmail, tenantSlug }) => ({
      id: log.id,
      actorId: log.actorId,
      actorEmail,
      action: log.action,
      tenantId: log.tenantId,
      tenantSlug,
      reason: log.reason,
      before: log.before,
      after: log.after,
      createdAt: log.createdAt.toISOString(),
    }));
  }
}
