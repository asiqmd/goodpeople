import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  addressAllowed,
  allowEveryDevice,
  serialAllowed,
  type DeviceAllowList,
} from './device-allow.js';
import { SERIAL, type DeviceRegistry } from './devices.js';
import { extractEventJson, interpretHikvisionEvent } from './hikvision.js';
import { errorMessage, silentLogger, type Logger } from './log.js';
import type { Punch } from './punch.js';
import type { PunchQueue } from './queue.js';
import { admsOptions, parseAttlog } from './zkteco.js';

export interface AgentServerOptions {
  queue: PunchQueue;
  devices: DeviceRegistry;
  timeZone: string;
  hikvisionEventTypes: readonly number[];
  /** Which devices may push; every device when not given. */
  allow?: DeviceAllowList;
  log?: Logger;
  /** Called after new punches are stored, to start a sync. */
  onPunches?: () => void;
  /** Sync state for GET /health. */
  health?: () => Record<string, unknown>;
  maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY = 5 * 1024 * 1024;
/** A refused device retries every few seconds: log it at most this often. */
const REFUSAL_LOG_MS = 10 * 60_000;

function reply(
  res: ServerResponse,
  status: number,
  body: string,
  type = 'text/plain; charset=utf-8',
): void {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

/**
 * Reads up to `limit` bytes and discards the rest, so an oversized upload (a large picture) is
 * still answered instead of leaving the device to retry it forever.
 */
function readBody(
  req: IncomingMessage,
  limit: number,
): Promise<{ body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let kept = 0;
    let truncated = false;
    req.on('data', (chunk: Buffer) => {
      if (kept + chunk.length <= limit) {
        chunks.push(chunk);
        kept += chunk.length;
      } else {
        if (kept < limit) chunks.push(chunk.subarray(0, limit - kept));
        kept = limit;
        truncated = true;
      }
    });
    req.on('end', () => resolve({ body: Buffer.concat(chunks), truncated }));
    req.on('error', reject);
    req.on('close', () => {
      if (!req.complete) reject(new Error('the device closed the connection mid-request'));
    });
  });
}

function clientIp(req: IncomingMessage): string | undefined {
  return req.socket.remoteAddress?.replace(/^::ffff:/, '');
}

function param(url: URL, name: string): string {
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === name) return value.trim();
  }
  return '';
}

/**
 * The HTTP server the devices push to: ZKTeco ADMS under /iclock, Hikvision HTTP listening at
 * /hikvision/events, and GET /health for the site technician. Bad input is answered, never thrown.
 */
export function createAgentServer(options: AgentServerOptions): Server {
  const { queue, devices, timeZone } = options;
  const log = options.log ?? silentLogger;
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const eventTypes = new Set(options.hikvisionEventTypes);
  const allow = options.allow ?? allowEveryDevice;
  const refusedAt = new Map<string, number>();

  /** Answers a device that is not on the allow lists; its punches are not kept. */
  function refuse(res: ServerResponse, who: string) {
    const now = Date.now();
    if (now - (refusedAt.get(who) ?? -Infinity) >= REFUSAL_LOG_MS) {
      if (refusedAt.size >= 1000) refusedAt.clear();
      refusedAt.set(who, now);
      log.warn(`Refused a push from ${who}: not in GP_DEVICE_ALLOW or GP_DEVICE_SERIALS`);
    } else {
      log.debug(`Refused a push from ${who}`);
    }
    reply(res, 403, 'ERROR: device not allowed');
  }

  /** Stores before the device hears back; throws if the disk write fails so the device retries. */
  function store(punches: Punch[]): { inserted: number; duplicates: number } {
    const result = queue.enqueue(punches);
    if (result.inserted > 0) options.onPunches?.();
    return result;
  }

  async function iclock(req: IncomingMessage, res: ServerResponse, url: URL, endpoint: string) {
    const serial = param(url, 'sn');
    if (serial && !SERIAL.test(serial)) {
      await readBody(req, 0);
      return reply(res, 400, 'ERROR: invalid SN');
    }
    if (!serialAllowed(allow, serial || undefined)) {
      await readBody(req, 0);
      return refuse(res, `ZKTeco ${serial || '(no serial)'} at ${clientIp(req)}`);
    }
    if (serial) devices.seen(serial, 'zkteco', clientIp(req));

    if (endpoint === 'cdata' && req.method === 'GET') {
      return reply(res, 200, serial ? admsOptions(serial, timeZone) : 'OK');
    }
    const table = param(url, 'table').toUpperCase();
    if (endpoint !== 'cdata' || req.method !== 'POST' || table !== 'ATTLOG') {
      await readBody(req, 0);
      return reply(res, 200, 'OK');
    }

    const { body, truncated } = await readBody(req, maxBody);
    if (!serial) return reply(res, 400, 'ERROR: missing SN');
    if (truncated) {
      log.error(`ZKTeco ${serial}: ATTLOG upload over ${maxBody} bytes refused`);
      return reply(res, 413, 'ERROR: too large');
    }
    const { punches, skipped } = parseAttlog(body.toString('utf8'), serial, timeZone);
    for (const s of skipped) {
      log.warn(
        `ZKTeco ${serial}: skipped ATTLOG line ${s.line} (${s.reason}): ${JSON.stringify(s.text)}`,
      );
    }
    const { inserted } = store(punches);
    log.info(`ZKTeco ${serial}: received ${punches.length} punch(es), ${inserted} new`);
    return reply(res, 200, `OK: ${punches.length}`);
  }

  async function hikvision(req: IncomingMessage, res: ServerResponse) {
    const { body, truncated } = await readBody(req, maxBody);
    if (req.method !== 'POST') return reply(res, 405, 'Method not allowed');
    const event = extractEventJson(req.headers['content-type'], body);
    if (!event) {
      log.debug(
        `Hikvision upload from ${clientIp(req)} held no JSON event${truncated ? ' (truncated)' : ''}`,
      );
      return reply(res, 200, 'OK');
    }
    const result = interpretHikvisionEvent(event, {
      timeZone,
      eventTypes,
      remoteIp: clientIp(req),
    });
    if (!serialAllowed(allow, result.device?.serialNumber)) {
      return refuse(
        res,
        `Hikvision ${result.device?.serialNumber ?? '(no serial)'} at ${clientIp(req)}`,
      );
    }
    if (result.device) devices.seen(result.device.serialNumber, 'hikvision', result.device.ip);
    if (result.kind === 'ignored') {
      (result.pass ? log.warn : log.debug)(
        `Hikvision ${result.device?.serialNumber ?? clientIp(req)}: ignored, ${result.reason}`,
      );
      return reply(res, 200, 'OK');
    }
    const { inserted } = store([result.punch]);
    log.info(
      `Hikvision ${result.punch.deviceSerial}: punch for ${result.punch.deviceUserId} at ` +
        `${result.punch.punchedAt}${inserted ? '' : ' (already held)'}`,
    );
    return reply(res, 200, 'OK');
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://agent.local');
    // Older ZKTeco firmware appends .aspx to the ADMS paths.
    const path = url.pathname.replace(/\.aspx$/i, '').replace(/\/+$/, '') || '/';
    log.debug(`${req.method} ${req.url} from ${clientIp(req)}`);

    const fromDevice = path.toLowerCase().startsWith('/iclock/') || path === '/hikvision/events';
    if (fromDevice && !addressAllowed(allow, clientIp(req))) {
      await readBody(req, 0);
      return refuse(res, `address ${clientIp(req)}`);
    }
    if (path.toLowerCase().startsWith('/iclock/')) {
      return iclock(req, res, url, path.slice('/iclock/'.length).toLowerCase());
    }
    if (path === '/hikvision/events') return hikvision(req, res);
    await readBody(req, 0);
    if (path === '/health' && req.method === 'GET') {
      const counts = queue.counts();
      const body = {
        status: 'ok',
        queued: counts.queued,
        rejected: counts.rejected,
        lastSyncAt: null,
        lastError: null,
        ...options.health?.(),
        devices: devices.list(),
      };
      return reply(res, 200, JSON.stringify(body), 'application/json');
    }
    return reply(res, 404, 'Not found');
  }

  const server = createServer(
    {
      // Device firmware is not always strict about HTTP framing. The agent only listens on the
      // site LAN with no proxy in front, so the request-smuggling risk this guards against is moot.
      insecureHTTPParser: true,
      requestTimeout: 60_000,
      headersTimeout: 20_000,
    },
    (req, res) => {
      handle(req, res).catch((error: unknown) => {
        log.error(`${req.method} ${req.url} failed: ${errorMessage(error)}`);
        if (!res.headersSent) reply(res, 503, 'ERROR: try again');
        else res.destroy();
      });
    },
  );
  server.on('clientError', (error: NodeJS.ErrnoException, socket) => {
    log.debug(`Malformed request: ${errorMessage(error)}`);
    if (error.code === 'ECONNRESET' || !socket.writable) socket.destroy();
    else socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  return server;
}
