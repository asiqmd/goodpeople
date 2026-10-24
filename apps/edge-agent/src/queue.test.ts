import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Punch } from './punch.js';
import { PunchQueue } from './queue.js';

const punch = (deviceUserId: string, punchedAt = '2026-10-24T08:59:12+06:00'): Punch => ({
  deviceSerial: 'SN1',
  vendor: 'zkteco',
  deviceUserId,
  punchedAt,
  direction: 'in',
});

let dir: string;
let path: string;
let queue: PunchQueue;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gp-edge-queue-'));
  path = join(dir, 'queue.db');
  queue = new PunchQueue(path);
});

afterEach(() => {
  queue.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('punch queue', () => {
  it('ignores a punch it already holds, within a batch and across uploads', () => {
    expect(queue.enqueue([punch('1'), punch('2'), punch('1')])).toEqual({
      inserted: 2,
      duplicates: 1,
    });
    expect(queue.enqueue([punch('2'), punch('3')])).toEqual({ inserted: 1, duplicates: 1 });
    // Same user and time on another device is a different punch.
    expect(queue.enqueue([{ ...punch('1'), deviceSerial: 'SN2' }])).toEqual({
      inserted: 1,
      duplicates: 0,
    });
    expect(queue.counts()).toEqual({ queued: 4, sent: 0, rejected: 0 });
  });

  it('hands out the oldest queued punches first, up to the limit', () => {
    queue.enqueue([punch('a'), punch('b'), punch('c')]);
    expect(queue.nextBatch(2).map((p) => p.deviceUserId)).toEqual(['a', 'b']);
    expect(queue.nextBatch(10)[0]).toEqual({
      id: 1,
      deviceSerial: 'SN1',
      vendor: 'zkteco',
      deviceUserId: 'a',
      punchedAt: '2026-10-24T08:59:12+06:00',
      direction: 'in',
      attempts: 0,
    });
  });

  it('moves rows from queued to sent or rejected, and keeps failed ones queued', () => {
    queue.enqueue([punch('a'), punch('b'), punch('c')]);
    const [a, b, c] = queue.nextBatch(10);
    queue.recordFailure([a!.id, b!.id, c!.id], 'HTTP 503');
    queue.markSent([a!.id]);
    queue.markRejected(b!.id, 'deviceUserId too long');
    expect(queue.counts()).toEqual({ queued: 1, sent: 1, rejected: 1 });
    expect(queue.nextBatch(10)).toEqual([
      expect.objectContaining({ deviceUserId: 'c', attempts: 1 }),
    ]);

    // A sent or rejected row does not go back to queued if it arrives again.
    expect(queue.enqueue([punch('a'), punch('b')])).toEqual({ inserted: 0, duplicates: 2 });
    queue.markSent([b!.id]);
    expect(queue.counts()).toEqual({ queued: 1, sent: 1, rejected: 1 });

    const db = new DatabaseSync(path);
    const rows = db
      .prepare(
        'SELECT device_user_id, status, attempts, last_error, sent_at FROM punches ORDER BY id',
      )
      .all();
    db.close();
    expect(rows.map((r) => ({ ...r }))).toEqual([
      {
        device_user_id: 'a',
        status: 'sent',
        attempts: 2,
        last_error: null,
        sent_at: expect.any(String),
      },
      {
        device_user_id: 'b',
        status: 'rejected',
        attempts: 2,
        last_error: 'deviceUserId too long',
        sent_at: null,
      },
      { device_user_id: 'c', status: 'queued', attempts: 1, last_error: 'HTTP 503', sent_at: null },
    ]);
  });

  it('prunes only sent rows older than the cut-off', () => {
    queue.enqueue([punch('old'), punch('new'), punch('waiting'), punch('bad')]);
    const [old, recent, , bad] = queue.nextBatch(10);
    queue.markSent([old!.id], new Date('2026-08-01T00:00:00Z'));
    queue.markSent([recent!.id], new Date('2026-10-20T00:00:00Z'));
    queue.markRejected(bad!.id, 'invalid');
    expect(queue.pruneSent(new Date('2026-09-24T00:00:00Z'))).toBe(1);
    expect(queue.counts()).toEqual({ queued: 1, sent: 1, rejected: 1 });
  });

  it('keeps punches across a restart, in WAL mode', () => {
    queue.enqueue([punch('a')]);
    queue.close();
    queue = new PunchQueue(path);
    expect(queue.nextBatch(10).map((p) => p.deviceUserId)).toEqual(['a']);
    const db = new DatabaseSync(path);
    expect({ ...db.prepare('PRAGMA journal_mode').get() }).toEqual({ journal_mode: 'wal' });
    db.close();
  });
});
