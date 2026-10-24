import type { SeenDevice } from './devices.js';
import { errorMessage } from './log.js';
import type { Punch } from './punch.js';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Why a request did not succeed, in the terms the agent acts on. */
export type CloudFailure =
  /** 400: the payload is invalid. */
  | { kind: 'invalid'; message: string }
  /** 401: the token is wrong or revoked. */
  | { kind: 'unauthorized'; message: string }
  /** 403: the workspace is read-only or suspended, or attendance is not in its plan. */
  | { kind: 'forbidden'; code: string; message: string }
  /** 429, 5xx, network errors, timeouts and anything unexpected. */
  | { kind: 'retry'; message: string; retryAfterMs?: number };

export type PunchUploadResult =
  { kind: 'ok'; accepted: number; duplicates: number; unmatched: number } | CloudFailure;

export interface HeartbeatBody {
  agentVersion: string;
  queued: number;
  devices: SeenDevice[];
}

export type HeartbeatResult = { kind: 'ok'; serverTime: string; agentId: string } | CloudFailure;

export interface CloudClientOptions {
  apiUrl: string;
  token: string;
  agentVersion: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  now?: () => number;
}

type Response2xx = { kind: 'ok'; body: Record<string, unknown> };

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const { message } = body as { message?: unknown };
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && message.length > 0) return message.map(String).join('; ');
  }
  return fallback;
}

function retryAfterMs(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header.trim())) return Number(header.trim()) * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The two Edge API calls. Never throws: every outcome comes back as a value. */
export class CloudClient {
  private readonly fetch: FetchLike;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(private readonly options: CloudClientOptions) {
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.now = options.now ?? (() => Date.now());
  }

  private async post(path: string, payload: unknown): Promise<Response2xx | CloudFailure> {
    let status: number;
    let text: string;
    let headers: Headers;
    try {
      const response = await this.fetch(`${this.options.apiUrl}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.token}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': `gp-edge-agent/${this.options.agentVersion}`,
        },
        body: JSON.stringify(payload),
        // A redirect would turn the POST into a GET; better to say the URL is wrong.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      status = response.status;
      headers = response.headers;
      text = await response.text();
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const message =
        name === 'TimeoutError' || name === 'AbortError'
          ? `no response within ${this.timeoutMs / 1000}s`
          : `network error: ${errorMessage(error)}`;
      return { kind: 'retry', message };
    }

    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const fallback = `HTTP ${status}${text ? `: ${text.slice(0, 200)}` : ''}`;

    const isObject = body !== null && typeof body === 'object' && !Array.isArray(body);
    // A captive portal or a proxy can answer too. Only a JSON reply counts as the API's verdict,
    // so a stray 200 never marks punches sent and a stray 400 never gets them rejected.
    if (status >= 200 && status < 300) {
      if (isObject) return { kind: 'ok', body: body as Record<string, unknown> };
      return { kind: 'retry', message: `${fallback} (not a JSON reply; is GP_API_URL right?)` };
    }
    if (status === 400) {
      if (isObject) return { kind: 'invalid', message: messageOf(body, fallback) };
      return { kind: 'retry', message: `${fallback} (not a JSON reply; is GP_API_URL right?)` };
    }
    if (status === 401) return { kind: 'unauthorized', message: messageOf(body, fallback) };
    if (status === 403) {
      const code = (body as { code?: unknown } | null)?.code;
      return {
        kind: 'forbidden',
        code: typeof code === 'string' ? code : 'forbidden',
        message: messageOf(body, fallback),
      };
    }
    if (status >= 300 && status < 400) {
      const location = headers.get('location');
      return {
        kind: 'retry',
        message: `HTTP ${status} redirect${location ? ` to ${location}` : ''}; set GP_API_URL to the final address`,
      };
    }
    return {
      kind: 'retry',
      message: messageOf(body, fallback),
      retryAfterMs: retryAfterMs(headers.get('retry-after'), this.now()),
    };
  }

  async uploadPunches(punches: readonly Punch[]): Promise<PunchUploadResult> {
    const result = await this.post('/edge/v1/punches', { punches });
    if (result.kind !== 'ok') return result;
    const { accepted, duplicates, unmatched } = result.body;
    if (typeof accepted !== 'number') {
      return { kind: 'retry', message: 'the cloud replied without an accepted count' };
    }
    return {
      kind: 'ok',
      accepted: num(accepted),
      duplicates: num(duplicates),
      unmatched: num(unmatched),
    };
  }

  async heartbeat(body: HeartbeatBody): Promise<HeartbeatResult> {
    const result = await this.post('/edge/v1/heartbeat', body);
    if (result.kind !== 'ok') return result;
    const { serverTime, agentId } = result.body;
    return {
      kind: 'ok',
      serverTime: typeof serverTime === 'string' ? serverTime : '',
      agentId: typeof agentId === 'string' ? agentId : '',
    };
  }
}
