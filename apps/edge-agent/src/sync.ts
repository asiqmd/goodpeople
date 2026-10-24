import type { CloudClient, CloudFailure } from './cloud.js';
import type { DeviceRegistry } from './devices.js';
import { errorMessage, silentLogger, type Logger } from './log.js';
import type { PunchQueue, QueuedPunch } from './queue.js';

export type SyncResult =
  | { kind: 'ok'; sent: number; rejected: number }
  | { kind: 'failed'; failure: CloudFailure; sent: number; rejected: number };

export interface SyncStatus {
  /** When the cloud last acknowledged an upload. */
  lastSyncAt: string | null;
  /** Why the latest sync failed; cleared by the next success. */
  lastError: string | null;
  /** Failed syncs in a row. */
  failures: number;
  /** Delay before the next scheduled sync. */
  nextDelayMs: number | null;
}

export interface SyncEngineOptions {
  queue: PunchQueue;
  client: Pick<CloudClient, 'uploadPunches'>;
  intervalMs: number;
  log?: Logger;
  /** How long to gather newly arrived punches before syncing them. */
  debounceMs?: number;
  batchSize?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** Retry interval while the token is refused. */
  unauthorizedRetryMs?: number;
  random?: () => number;
  now?: () => number;
}

const MAX_BATCH = 500;

interface BatchOutcome {
  sent: number;
  rejected: number;
  failure?: CloudFailure;
}

/**
 * Moves punches from the queue to the cloud. Runs on an interval and shortly after new punches
 * arrive, never two runs at once. Failures back off exponentially with jitter; rows leave the
 * queue only when the cloud acknowledges them or rejects them individually as invalid.
 */
export class SyncEngine {
  private readonly log: Logger;
  private readonly debounceMs: number;
  private readonly batchSize: number;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly unauthorizedRetryMs: number;
  private readonly random: () => number;
  private readonly now: () => number;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerAt = Infinity;
  private running: Promise<SyncResult> | null = null;
  private pendingTrigger = false;
  private blockedUntil = 0;
  private stopped = false;
  private readonly state: SyncStatus = {
    lastSyncAt: null,
    lastError: null,
    failures: 0,
    nextDelayMs: null,
  };

  constructor(private readonly options: SyncEngineOptions) {
    this.log = options.log ?? silentLogger;
    this.debounceMs = options.debounceMs ?? 1000;
    this.batchSize = Math.min(options.batchSize ?? MAX_BATCH, MAX_BATCH);
    this.minBackoffMs = options.minBackoffMs ?? 2000;
    this.maxBackoffMs = options.maxBackoffMs ?? 300_000;
    this.unauthorizedRetryMs = options.unauthorizedRetryMs ?? 300_000;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now());
  }

  get status(): SyncStatus {
    return { ...this.state };
  }

  start(): void {
    this.stopped = false;
    this.schedule(0);
  }

  /** New punches are in the queue. Coalesces bursts and respects any backoff in force. */
  trigger(): void {
    if (this.stopped) return;
    if (this.running) {
      this.pendingTrigger = true;
      return;
    }
    this.schedule(Math.max(this.debounceMs, this.blockedUntil - this.now()));
  }

  /** Syncs now, or joins the run already in progress. */
  runNow(): Promise<SyncResult> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Stops scheduling and waits for the batch in flight; queued rows simply wait for next start. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.clearTimer();
    if (this.running) await this.running;
  }

  /** The delay after the n-th failure in a row: doubling from the minimum, capped, with jitter. */
  backoffMs(failures: number): number {
    const exponential = Math.min(this.maxBackoffMs, this.minBackoffMs * 2 ** (failures - 1));
    // "Equal jitter": at least half the delay, so sites that lost the link together spread out.
    return Math.round(exponential / 2 + (exponential / 2) * this.random());
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.timerAt = Infinity;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    const at = this.now() + delayMs;
    if (this.timer && this.timerAt <= at) return;
    this.clearTimer();
    this.timerAt = at;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timerAt = Infinity;
      void this.runNow();
    }, delayMs);
  }

  private async run(): Promise<SyncResult> {
    this.clearTimer();
    this.pendingTrigger = false;
    let result: SyncResult;
    try {
      result = await this.drain();
    } catch (error) {
      // A local fault (disk full, database locked); nothing was lost, so retry like a network error.
      result = {
        kind: 'failed',
        failure: { kind: 'retry', message: `local error: ${errorMessage(error)}` },
        sent: 0,
        rejected: 0,
      };
    }
    this.afterRun(result);
    return result;
  }

  private async drain(): Promise<SyncResult> {
    let sent = 0;
    let rejected = 0;
    for (;;) {
      const batch = this.options.queue.nextBatch(this.batchSize);
      if (batch.length === 0) return { kind: 'ok', sent, rejected };
      const outcome = await this.send(batch);
      sent += outcome.sent;
      rejected += outcome.rejected;
      if (outcome.failure) return { kind: 'failed', failure: outcome.failure, sent, rejected };
      if (this.stopped) return { kind: 'ok', sent, rejected };
    }
  }

  /** Uploads rows; on a 400, splits them in halves until the invalid rows are isolated. */
  private async send(rows: QueuedPunch[]): Promise<BatchOutcome> {
    const { queue, client } = this.options;
    const result = await client.uploadPunches(
      rows.map(({ deviceSerial, vendor, deviceUserId, punchedAt, direction }) => ({
        deviceSerial,
        vendor,
        deviceUserId,
        punchedAt,
        direction,
      })),
    );
    const ids = rows.map((r) => r.id);

    if (result.kind === 'ok') {
      queue.markSent(ids, new Date(this.now()));
      this.state.lastSyncAt = new Date(this.now()).toISOString();
      this.log.info(
        `Uploaded ${rows.length} punch(es): ${result.accepted} new, ${result.duplicates} already ` +
          `in the cloud, ${result.unmatched} not matched to an employee`,
      );
      return { sent: rows.length, rejected: 0 };
    }

    if (result.kind === 'invalid') {
      const [only] = rows;
      if (rows.length === 1 && only) {
        queue.markRejected(only.id, result.message);
        this.log.warn(
          `Cloud rejected punch #${only.id} (device ${only.deviceSerial}, user ${only.deviceUserId}, ` +
            `${only.punchedAt}); it will not be resent: ${result.message}`,
        );
        return { sent: 0, rejected: 1 };
      }
      const middle = Math.ceil(rows.length / 2);
      const first = await this.send(rows.slice(0, middle));
      if (first.failure) return first;
      const second = await this.send(rows.slice(middle));
      return {
        sent: first.sent + second.sent,
        rejected: first.rejected + second.rejected,
        ...(second.failure ? { failure: second.failure } : {}),
      };
    }

    queue.recordFailure(ids, result.message);
    return { sent: 0, rejected: 0, failure: result };
  }

  private afterRun(result: SyncResult): void {
    let delay: number;
    if (result.kind === 'ok') {
      this.state.failures = 0;
      this.state.lastError = null;
      this.blockedUntil = 0;
      delay = this.pendingTrigger ? this.debounceMs : this.options.intervalMs;
    } else {
      const { failure } = result;
      this.state.failures += 1;
      const queued = this.options.queue.counts().queued;
      if (failure.kind === 'unauthorized') {
        delay = this.unauthorizedRetryMs;
        this.state.lastError = `token refused (401): ${failure.message}`;
        this.log.error(
          `The cloud refused GP_AGENT_TOKEN (401: ${failure.message}). ${queued} punch(es) are ` +
            `kept and will be sent once a valid token is configured. Retrying in ` +
            `${Math.round(delay / 1000)}s.`,
        );
      } else {
        delay = this.backoffMs(this.state.failures);
        if (failure.kind === 'retry' && failure.retryAfterMs !== undefined) {
          delay = Math.min(this.maxBackoffMs, Math.max(delay, failure.retryAfterMs));
        }
        this.state.lastError =
          failure.kind === 'forbidden' ? `${failure.code}: ${failure.message}` : failure.message;
        this.log.warn(
          `Upload failed (${this.state.lastError}). ${queued} punch(es) kept; retrying in ` +
            `${Math.round(delay / 1000)}s.`,
        );
      }
      this.blockedUntil = this.now() + delay;
    }
    this.state.nextDelayMs = delay;
    this.schedule(delay);
  }
}

export interface HeartbeatOptions {
  client: Pick<CloudClient, 'heartbeat'>;
  queue: PunchQueue;
  devices: DeviceRegistry;
  agentVersion: string;
  intervalMs: number;
  log?: Logger;
  now?: () => number;
}

const MAX_CLOCK_SKEW_MS = 2 * 60_000;
/** The cloud accepts at most this many devices per heartbeat. */
const MAX_HEARTBEAT_DEVICES = 200;

/** Tells the cloud the agent is alive, how much it holds and which devices it hears from. */
export class Heartbeat {
  private readonly log: Logger;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private announced = false;
  lastHeartbeatAt: string | null = null;

  constructor(private readonly options: HeartbeatOptions) {
    this.log = options.log ?? silentLogger;
    this.now = options.now ?? (() => Date.now());
  }

  start(): void {
    void this.beat();
    this.timer = setInterval(() => void this.beat(), this.options.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.inFlight) await this.inFlight;
  }

  beat(): Promise<void> {
    this.inFlight ??= this.send().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async send(): Promise<void> {
    const { client, queue, devices, agentVersion } = this.options;
    try {
      const sentAt = this.now();
      const result = await client.heartbeat({
        agentVersion,
        queued: queue.counts().queued,
        // One device with an absurd identifier must not get the whole heartbeat refused.
        devices: devices
          .list()
          .filter((d) => d.serialNumber.length <= 64)
          .slice(0, MAX_HEARTBEAT_DEVICES),
      });
      if (result.kind === 'ok') {
        const receivedAt = this.now();
        this.lastHeartbeatAt = new Date(receivedAt).toISOString();
        if (!this.announced) {
          this.announced = true;
          this.log.info(`Connected to the cloud as agent ${result.agentId || '(unknown id)'}`);
        }
        const serverTime = Date.parse(result.serverTime);
        const skew = serverTime - (sentAt + receivedAt) / 2;
        if (Number.isFinite(skew) && Math.abs(skew) > MAX_CLOCK_SKEW_MS) {
          this.log.warn(
            `This computer's clock is ${Math.round(Math.abs(skew) / 1000)}s ` +
              `${skew > 0 ? 'behind' : 'ahead of'} the cloud; enable automatic time sync. ` +
              `Punch times come from the devices, so check their clocks too.`,
          );
        }
      } else if (result.kind === 'unauthorized') {
        this.log.error(`Heartbeat refused: the cloud does not accept GP_AGENT_TOKEN (401).`);
      } else {
        this.log.warn(`Heartbeat failed: ${result.message}`);
      }
    } catch (error) {
      this.log.warn(`Heartbeat failed: ${errorMessage(error)}`);
    }
  }
}
