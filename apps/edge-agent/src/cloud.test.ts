import { describe, expect, it } from 'vitest';
import { CloudClient, type FetchLike } from './cloud.js';
import type { Punch } from './punch.js';

const TOKEN =
  'gpe.11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222.s3cret';
const punches: Punch[] = [
  {
    deviceSerial: 'SN1',
    vendor: 'zkteco',
    deviceUserId: '1001',
    punchedAt: '2026-10-24T08:59:12+06:00',
    direction: 'in',
  },
];

function client(respond: (init: RequestInit) => Response | Promise<Response>, timeoutMs = 15_000) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return respond(init);
  };
  const cloud = new CloudClient({
    apiUrl: 'http://cloud.test/api',
    token: TOKEN,
    agentVersion: '0.1.0',
    fetch,
    timeoutMs,
    now: () => Date.parse('2026-10-24T03:00:00Z'),
  });
  return { cloud, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const result = (response: Response) => client(() => response).cloud.uploadPunches(punches);

describe('cloud client', () => {
  it('posts punches with the bearer token and reads the counts', async () => {
    const { cloud, calls } = client(() => json(200, { accepted: 1, duplicates: 0, unmatched: 0 }));
    expect(await cloud.uploadPunches(punches)).toEqual({
      kind: 'ok',
      accepted: 1,
      duplicates: 0,
      unmatched: 0,
    });
    const [call] = calls;
    expect(call?.url).toBe('http://cloud.test/api/edge/v1/punches');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(call?.init.body))).toEqual({ punches });
  });

  it('classifies refusals', async () => {
    expect(
      await result(json(400, { code: 'validation', message: 'punches.0.punchedAt: Invalid' })),
    ).toEqual({
      kind: 'invalid',
      message: 'punches.0.punchedAt: Invalid',
    });
    expect(await result(json(400, { statusCode: 400, message: ['a is bad', 'b is bad'] }))).toEqual(
      {
        kind: 'invalid',
        message: 'a is bad; b is bad',
      },
    );
    expect(await result(json(401, { message: 'Token revoked' }))).toEqual({
      kind: 'unauthorized',
      message: 'Token revoked',
    });
    expect(await result(json(403, { code: 'tenant_read_only', message: 'Read only' }))).toEqual({
      kind: 'forbidden',
      code: 'tenant_read_only',
      message: 'Read only',
    });
    expect(await result(json(429, { message: 'Slow down' }, { 'retry-after': '7' }))).toEqual({
      kind: 'retry',
      message: 'Slow down',
      retryAfterMs: 7000,
    });
    expect(await result(new Response('<html>Bad gateway</html>', { status: 502 }))).toEqual({
      kind: 'retry',
      message: 'HTTP 502: <html>Bad gateway</html>',
    });
    expect(
      await result(
        new Response(null, { status: 301, headers: { location: 'https://cloud.test/' } }),
      ),
    ).toMatchObject({
      kind: 'retry',
      message: expect.stringMatching(/redirect to https:\/\/cloud.test\//),
    });
  });

  it('only takes a JSON reply as the verdict, so a captive portal cannot drop or reject punches', async () => {
    expect(await result(new Response('<html>Sign in to Wi-Fi</html>', { status: 200 }))).toEqual({
      kind: 'retry',
      message: 'HTTP 200: <html>Sign in to Wi-Fi</html> (not a JSON reply; is GP_API_URL right?)',
    });
    expect(await result(new Response('Bad Request', { status: 400 }))).toMatchObject({
      kind: 'retry',
    });
    expect(await result(json(200, { ok: true }))).toEqual({
      kind: 'retry',
      message: 'the cloud replied without an accepted count',
    });
  });

  it('treats network errors and timeouts as retryable', async () => {
    const refused = client(() => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      });
    });
    expect(await refused.cloud.uploadPunches(punches)).toEqual({
      kind: 'retry',
      message: 'network error: fetch failed (ECONNREFUSED)',
    });

    const hung = client(
      (init) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
      20,
    );
    expect(await hung.cloud.uploadPunches(punches)).toEqual({
      kind: 'retry',
      message: 'no response within 0.02s',
    });
  });

  it('sends the heartbeat and reads the server time', async () => {
    const { cloud, calls } = client(() =>
      json(200, { serverTime: '2026-10-24T03:00:00.000Z', agentId: 'agent-1' }),
    );
    const body = { agentVersion: '0.1.0', queued: 3, devices: [] };
    expect(await cloud.heartbeat(body)).toEqual({
      kind: 'ok',
      serverTime: '2026-10-24T03:00:00.000Z',
      agentId: 'agent-1',
    });
    expect(calls[0]?.url).toBe('http://cloud.test/api/edge/v1/heartbeat');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(body);
  });
});
