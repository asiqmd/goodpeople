import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { CloudClient, type FetchLike } from './cloud.js';
import type { AgentConfig } from './config.js';
import { DeviceRegistry } from './devices.js';
import { createLogger, errorMessage, type Logger } from './log.js';
import { PunchQueue } from './queue.js';
import { createAgentServer } from './server.js';
import { Heartbeat, SyncEngine } from './sync.js';
import { AGENT_VERSION } from './version.js';

const DAY = 86_400_000;
const KEEP_SENT_DAYS = 30;
const SHUTDOWN_GRACE_MS = 5000;

export interface AgentHandle {
  server: Server;
  port: number;
  queue: PunchQueue;
  engine: SyncEngine;
  heartbeat: Heartbeat;
  /** Stops accepting requests, lets in-flight ones and the current upload finish, closes the queue. */
  stop(): Promise<void>;
}

export interface StartOptions {
  log?: Logger;
  fetch?: FetchLike;
  debounceMs?: number;
  host?: string;
}

/** Wires the queue, the device server, the sync engine and the heartbeat together. */
export async function startAgent(
  config: AgentConfig,
  options: StartOptions = {},
): Promise<AgentHandle> {
  const log = options.log ?? createLogger(config.logLevel);
  mkdirSync(config.dataDir, { recursive: true });
  const queue = new PunchQueue(join(config.dataDir, 'queue.db'));

  const prune = () => {
    try {
      const pruned = queue.pruneSent(new Date(Date.now() - KEEP_SENT_DAYS * DAY));
      if (pruned > 0) {
        log.info(`Pruned ${pruned} uploaded punch(es) older than ${KEEP_SENT_DAYS} days`);
      }
    } catch (error) {
      log.warn(`Pruning the queue failed: ${errorMessage(error)}`);
    }
  };
  prune();
  const pruneTimer = setInterval(prune, DAY);

  const devices = new DeviceRegistry();
  const client = new CloudClient({
    apiUrl: config.apiUrl,
    token: config.token,
    agentVersion: AGENT_VERSION,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const engine = new SyncEngine({
    queue,
    client,
    log,
    intervalMs: config.syncIntervalMs,
    ...(options.debounceMs !== undefined ? { debounceMs: options.debounceMs } : {}),
  });
  const heartbeat = new Heartbeat({
    client,
    queue,
    devices,
    log,
    agentVersion: AGENT_VERSION,
    intervalMs: config.heartbeatIntervalMs,
  });
  const server = createAgentServer({
    queue,
    devices,
    log,
    timeZone: config.timeZone,
    hikvisionEventTypes: config.hikvisionEventTypes,
    onPunches: () => engine.trigger(),
    health: () => {
      const { lastSyncAt, lastError } = engine.status;
      return { lastSyncAt, lastError, lastHeartbeatAt: heartbeat.lastHeartbeatAt };
    },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen({ port: config.port, ...(options.host ? { host: options.host } : {}) }, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    clearInterval(pruneTimer);
    queue.close();
    throw error;
  }
  server.on('error', (error) => log.error(`Device server error: ${errorMessage(error)}`));
  const { port } = server.address() as AddressInfo;
  const counts = queue.counts();
  log.info(
    `Listening for devices on port ${port}; ${counts.queued} punch(es) waiting to upload, ` +
      `${counts.rejected} rejected`,
  );

  engine.start();
  heartbeat.start();

  let stopping: Promise<void> | null = null;
  const stop = () =>
    (stopping ??= (async () => {
      clearInterval(pruneTimer);
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      // Devices hold keep-alive connections; give requests in flight a moment, then cut them.
      const force = setTimeout(() => server.closeAllConnections(), SHUTDOWN_GRACE_MS);
      await Promise.all([closed, engine.stop(), heartbeat.stop()]);
      clearTimeout(force);
      queue.close();
    })());

  return { server, port, queue, engine, heartbeat, stop };
}
