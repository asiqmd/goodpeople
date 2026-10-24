import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeartbeatBody, HeartbeatResult, PunchUploadResult } from './cloud.js';
import { DeviceRegistry } from './devices.js';
import type { Logger } from './log.js';
import type { Punch } from './punch.js';
import { PunchQueue } from './queue.js';
import { Heartbeat, SyncEngine, type SyncEngineOptions } from './sync.js';

const punch = (deviceUserId: string): Punch => ({
  deviceSerial: 'SN1',
  vendor: 'zkteco',
  deviceUserId,
  punchedAt: '2026-10-24T08:59:12+06:00',
  direction: 'in',
});
const ok = (n: number): PunchUploadResult => ({
  kind: 'ok',
  accepted: n,
  duplicates: 0,
  unmatched: 0,
});

const noop = () => {};

type Handler = (punches: Punch[]) => PunchUploadResult | Promise<PunchUploadResult>;

let queue: PunchQueue;
let current: SyncEngine | undefined;

beforeEach(() => {
  queue = new PunchQueue(':memory:');
});

afterEach(async () => {
  await current?.stop();
  current = undefined;
  queue.close();
  vi.useRealTimers();
});

function setup(handler: Handler, options: Partial<SyncEngineOptions> = {}) {
  const calls: Punch[][] = [];
  const engine = new SyncEngine({
    queue,
    intervalMs: 10_000,
    random: () => 1,
    client: {
      uploadPunches: async (punches) => {
        calls.push([...punches]);
        return handler([...punches]);
      },
    },
    ...options,
  });
  current = engine;
  return { engine, calls };
}

describe('uploading', () => {
  it('marks punches sent when the cloud acknowledges them', async () => {
    queue.enqueue([punch('1'), punch('2')]);
    const { engine, calls } = setup((p) => ok(p.length));
    expect(await engine.runNow()).toEqual({ kind: 'ok', sent: 2, rejected: 0 });
    expect(calls).toEqual([[punch('1'), punch('2')]]);
    expect(queue.counts()).toEqual({ queued: 0, sent: 2, rejected: 0 });
    expect(engine.status).toMatchObject({
      failures: 0,
      lastError: null,
      lastSyncAt: expect.any(String),
    });
  });

  it('drains the queue in batches of at most 500', async () => {
    queue.enqueue(Array.from({ length: 1201 }, (_, i) => punch(String(i))));
    const { engine, calls } = setup((p) => ok(p.length));
    expect(await engine.runNow()).toEqual({ kind: 'ok', sent: 1201, rejected: 0 });
    expect(calls.map((c) => c.length)).toEqual([500, 500, 201]);
  });

  it('bisects a 400 to reject only the invalid row and send the rest', async () => {
    queue.enqueue(Array.from({ length: 9 }, (_, i) => punch(i === 6 ? 'BAD' : `u${i}`)));
    const { engine, calls } = setup((p) =>
      p.some((x) => x.deviceUserId === 'BAD')
        ? { kind: 'invalid', message: 'punches.0.deviceUserId: Too long' }
        : ok(p.length),
    );
    expect(await engine.runNow()).toEqual({ kind: 'ok', sent: 8, rejected: 1 });
    expect(queue.counts()).toEqual({ queued: 0, sent: 8, rejected: 1 });
    // 9 → 5 + 4 → (2 → 1 + 1) + 2: seven requests, logarithmic in the batch size.
    expect(calls.map((c) => c.length)).toEqual([9, 5, 4, 2, 1, 1, 2]);

    // The rejected row is never resent.
    await engine.runNow();
    expect(calls).toHaveLength(7);
  });

  it('isolates several invalid rows', async () => {
    queue.enqueue(['BAD1', 'a', 'b', 'c', 'BAD2', 'd'].map(punch));
    const { engine } = setup((p) =>
      p.some((x) => x.deviceUserId.startsWith('BAD'))
        ? { kind: 'invalid', message: 'bad' }
        : ok(p.length),
    );
    expect(await engine.runNow()).toEqual({ kind: 'ok', sent: 4, rejected: 2 });
  });

  it('stops bisecting when the link fails half way, keeping the rest queued', async () => {
    queue.enqueue(['a', 'b', 'BAD', 'c'].map(punch));
    let requests = 0;
    const { engine } = setup((p) => {
      requests += 1;
      if (requests === 1) return { kind: 'invalid', message: 'bad' };
      if (requests === 2) return ok(p.length);
      return { kind: 'retry', message: 'network error' };
    });
    expect(await engine.runNow()).toMatchObject({ kind: 'failed', sent: 2, rejected: 0 });
    expect(queue.counts()).toEqual({ queued: 2, sent: 2, rejected: 0 });
  });

  it.each([
    [{ kind: 'unauthorized', message: 'Token revoked' }, /token refused \(401\)/],
    [{ kind: 'forbidden', code: 'tenant_read_only', message: 'Read only' }, /tenant_read_only/],
    [
      { kind: 'forbidden', code: 'feature_not_in_plan', message: 'No attendance' },
      /feature_not_in_plan/,
    ],
    [{ kind: 'retry', message: 'HTTP 503' }, /HTTP 503/],
    [{ kind: 'retry', message: 'no response within 15s' }, /no response/],
  ] as [PunchUploadResult, RegExp][])('keeps every row queued on %o', async (failure, error) => {
    queue.enqueue([punch('1'), punch('2'), punch('3')]);
    const { engine } = setup(() => failure);
    expect(await engine.runNow()).toMatchObject({ kind: 'failed', sent: 0, rejected: 0 });
    expect(queue.counts()).toEqual({ queued: 3, sent: 0, rejected: 0 });
    expect(queue.nextBatch(10).every((p) => p.attempts === 1)).toBe(true);
    expect(engine.status.lastError).toMatch(error);
  });
});

const thirdBackoff = (random: number) =>
  setup(() => ok(0), { random: () => random }).engine.backoffMs(3);

describe('backoff', () => {
  it('doubles from 2s to a 5 minute cap and resets after a success', async () => {
    let response: PunchUploadResult = { kind: 'retry', message: 'HTTP 503' };
    const { engine } = setup(() => response);
    queue.enqueue([punch('a')]);
    const delays: (number | null)[] = [];
    for (let i = 0; i < 10; i++) {
      await engine.runNow();
      delays.push(engine.status.nextDelayMs);
    }
    expect(delays).toEqual([2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 300000, 300000]);
    expect(engine.status.failures).toBe(10);

    response = ok(1);
    await engine.runNow();
    expect(engine.status).toMatchObject({ failures: 0, nextDelayMs: 10_000, lastError: null });

    response = { kind: 'retry', message: 'HTTP 502' };
    queue.enqueue([punch('b')]);
    await engine.runNow();
    expect(engine.status).toMatchObject({ failures: 1, nextDelayMs: 2000 });
  });

  it('jitters each delay between half and all of it', () => {
    expect([0, 0.5, 1].map(thirdBackoff)).toEqual([4000, 6000, 8000]);
  });

  it('honours Retry-After within the cap, and retries a refused token every 5 minutes', async () => {
    let response: PunchUploadResult = { kind: 'retry', message: 'HTTP 429', retryAfterMs: 30_000 };
    const { engine } = setup(() => response);
    queue.enqueue([punch('a')]);
    await engine.runNow();
    expect(engine.status.nextDelayMs).toBe(30_000);
    response = { kind: 'retry', message: 'HTTP 429', retryAfterMs: 3_600_000 };
    await engine.runNow();
    expect(engine.status.nextDelayMs).toBe(300_000);
    response = { kind: 'unauthorized', message: 'Invalid token' };
    await engine.runNow();
    expect(engine.status.nextDelayMs).toBe(300_000);
  });
});

describe('scheduling', () => {
  it('gathers a burst of punches into one upload about a second later, then runs on the interval', async () => {
    vi.useFakeTimers();
    const { engine, calls } = setup((p) => ok(p.length));
    queue.enqueue([punch('a')]);
    engine.trigger();
    await vi.advanceTimersByTimeAsync(500);
    queue.enqueue([punch('b')]);
    engine.trigger();
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.map((c) => c.map((p) => p.deviceUserId))).toEqual([['a', 'b']]);

    queue.enqueue([punch('c')]);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
  });

  it('never runs two syncs at once, and follows up on punches that arrived meanwhile', async () => {
    vi.useFakeTimers();
    let release: (result: PunchUploadResult) => void = noop;
    const { engine, calls } = setup((p) =>
      calls.length === 1 ? new Promise((resolve) => (release = resolve)) : ok(p.length),
    );
    queue.enqueue([punch('a')]);
    const first = engine.runNow();
    expect(engine.runNow()).toBe(first);
    queue.enqueue([punch('b')]);
    engine.trigger();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);

    release(ok(1));
    // The drain loop picks up "b" in the same run.
    expect(await first).toEqual({ kind: 'ok', sent: 2, rejected: 0 });
    expect(calls).toHaveLength(2);
    expect(engine.status.nextDelayMs).toBe(1000);
  });

  it('does not let new punches cut a backoff short', async () => {
    vi.useFakeTimers();
    let response: PunchUploadResult = { kind: 'retry', message: 'HTTP 503' };
    const { engine, calls } = setup(() => response);
    queue.enqueue([punch('a')]);
    await engine.runNow();
    expect(engine.status.nextDelayMs).toBe(2000);
    response = ok(1);
    queue.enqueue([punch('b')]);
    engine.trigger();
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(queue.counts().sent).toBe(2);
  });

  it('stop waits for the upload in flight and schedules nothing more', async () => {
    vi.useFakeTimers();
    let release: (result: PunchUploadResult) => void = noop;
    const { engine } = setup(() => new Promise((resolve) => (release = resolve)));
    queue.enqueue([punch('a')]);
    engine.start();
    await vi.advanceTimersByTimeAsync(0);
    let stopped = false;
    const stopping = engine.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(100);
    expect(stopped).toBe(false);
    release(ok(1));
    await stopping;
    expect(queue.counts().sent).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

function logger() {
  const lines: string[] = [];
  const log: Logger = {
    debug: () => {},
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
  return { log, lines };
}

describe('heartbeat', () => {
  it('reports the queue and the devices, and warns about clock skew', async () => {
    const bodies: HeartbeatBody[] = [];
    let serverTime = new Date().toISOString();
    const devices = new DeviceRegistry();
    devices.seen('SN1', 'zkteco', '192.168.1.10', new Date('2026-10-24T03:00:00Z'));
    queue.enqueue([punch('a')]);
    const { log, lines } = logger();
    const heartbeat = new Heartbeat({
      client: {
        heartbeat: async (body): Promise<HeartbeatResult> => {
          bodies.push(body);
          return { kind: 'ok', serverTime, agentId: 'agent-1' };
        },
      },
      queue,
      devices,
      log,
      agentVersion: '0.1.0',
      intervalMs: 60_000,
    });
    await heartbeat.beat();
    expect(bodies).toEqual([
      {
        agentVersion: '0.1.0',
        queued: 1,
        devices: [
          {
            serialNumber: 'SN1',
            vendor: 'zkteco',
            lastSeenAt: '2026-10-24T03:00:00.000Z',
            ip: '192.168.1.10',
          },
        ],
      },
    ]);
    expect(lines.filter((l) => l.startsWith('warn'))).toEqual([]);
    expect(heartbeat.lastHeartbeatAt).not.toBeNull();

    serverTime = new Date(Date.now() + 5 * 60_000).toISOString();
    await heartbeat.beat();
    expect(lines.filter((l) => l.startsWith('warn'))).toEqual([
      expect.stringMatching(/clock is 30\ds behind the cloud/),
    ]);
  });
});
