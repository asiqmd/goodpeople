import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import type { Direction, Punch, Vendor } from './punch.js';

export type PunchStatus = 'queued' | 'sent' | 'rejected';

export interface QueuedPunch extends Punch {
  id: number;
  attempts: number;
}

export interface QueueCounts {
  queued: number;
  sent: number;
  rejected: number;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS punches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_serial TEXT NOT NULL,
    vendor TEXT NOT NULL CHECK (vendor IN ('zkteco', 'hikvision')),
    device_user_id TEXT NOT NULL,
    punched_at TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out', 'unknown')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'rejected')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT,
    UNIQUE (device_serial, device_user_id, punched_at)
  );
  CREATE INDEX IF NOT EXISTS punches_status_id ON punches (status, id);
  CREATE INDEX IF NOT EXISTS punches_sent_at ON punches (sent_at) WHERE status = 'sent';
`;

/**
 * The durable buffer between the devices and the cloud. A punch is committed to disk before the
 * device is told it was received, and leaves the queue only when the cloud acknowledges it.
 */
export class PunchQueue {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    // FULL, not NORMAL: sites lose power, and a punch the device was told we stored must survive.
    this.db.exec('PRAGMA synchronous = FULL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(SCHEMA);
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Stores punches, skipping any already held (devices re-send after a reconnect). */
  enqueue(punches: readonly Punch[], now = new Date()): { inserted: number; duplicates: number } {
    if (punches.length === 0) return { inserted: 0, duplicates: 0 };
    const insert = this.db.prepare(
      `INSERT INTO punches (device_serial, vendor, device_user_id, punched_at, direction, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (device_serial, device_user_id, punched_at) DO NOTHING`,
    );
    const createdAt = now.toISOString();
    const inserted = this.transaction(() => {
      let count = 0;
      for (const p of punches) {
        const { changes } = insert.run(
          p.deviceSerial,
          p.vendor,
          p.deviceUserId,
          p.punchedAt,
          p.direction,
          createdAt,
        );
        count += Number(changes);
      }
      return count;
    });
    return { inserted, duplicates: punches.length - inserted };
  }

  /** The oldest punches still waiting for the cloud. */
  nextBatch(limit: number): QueuedPunch[] {
    return this.db
      .prepare(
        `SELECT id, device_serial, vendor, device_user_id, punched_at, direction, attempts
         FROM punches WHERE status = 'queued' ORDER BY id LIMIT ?`,
      )
      .all(limit)
      .map((row: Record<string, SQLOutputValue>) => ({
        id: Number(row.id),
        deviceSerial: String(row.device_serial),
        vendor: String(row.vendor) as Vendor,
        deviceUserId: String(row.device_user_id),
        punchedAt: String(row.punched_at),
        direction: String(row.direction) as Direction,
        attempts: Number(row.attempts),
      }));
  }

  private updateEach(sql: string, ids: readonly number[], ...params: (string | null)[]): void {
    if (ids.length === 0) return;
    const statement = this.db.prepare(sql);
    this.transaction(() => {
      for (const id of ids) statement.run(...params, id);
    });
  }

  markSent(ids: readonly number[], now = new Date()): void {
    this.updateEach(
      `UPDATE punches SET status = 'sent', sent_at = ?, attempts = attempts + 1, last_error = NULL
       WHERE id = ? AND status = 'queued'`,
      ids,
      now.toISOString(),
    );
  }

  /** The cloud refused this row as invalid; it is kept for diagnosis but never sent again. */
  markRejected(id: number, error: string): void {
    this.updateEach(
      `UPDATE punches SET status = 'rejected', attempts = attempts + 1, last_error = ?
       WHERE id = ? AND status = 'queued'`,
      [id],
      error,
    );
  }

  /** A failed attempt that will be retried; the rows stay queued. */
  recordFailure(ids: readonly number[], error: string): void {
    this.updateEach(
      `UPDATE punches SET attempts = attempts + 1, last_error = ? WHERE id = ? AND status = 'queued'`,
      ids,
      error,
    );
  }

  counts(): QueueCounts {
    const counts: QueueCounts = { queued: 0, sent: 0, rejected: 0 };
    const rows = this.db.prepare('SELECT status, COUNT(*) AS n FROM punches GROUP BY status').all();
    for (const row of rows) counts[String(row.status) as PunchStatus] = Number(row.n);
    return counts;
  }

  /** Deletes acknowledged punches older than `before`; queued and rejected rows are never pruned. */
  pruneSent(before: Date): number {
    const { changes } = this.db
      .prepare(`DELETE FROM punches WHERE status = 'sent' AND sent_at < ?`)
      .run(before.toISOString());
    return Number(changes);
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}
