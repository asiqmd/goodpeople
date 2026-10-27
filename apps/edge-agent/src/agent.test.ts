import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAgent, type AgentHandle } from './agent.js';
import type { AgentConfig } from './config.js';
import { silentLogger } from './log.js';

const TOKEN =
  'gpe.11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222.s3cret-value';

interface CloudRequest {
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

/** A stand-in for the cloud API that records what it receives. */
async function fakeCloud(): Promise<{ server: Server; url: string; requests: CloudRequest[] }> {
  const requests: CloudRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
      requests.push({ path: req.url ?? '', headers: req.headers, body });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/edge/v1/punches') {
        const count = (body as { punches: unknown[] }).punches.length;
        res.end(JSON.stringify({ accepted: count, duplicates: 0, unmatched: 0 }));
      } else {
        res.end(JSON.stringify({ serverTime: new Date().toISOString(), agentId: 'agent-1' }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function multipart(
  boundary: string,
  parts: { headers: string[]; body: Buffer | string }[],
): Buffer {
  const chunks = parts.flatMap((p) => [
    Buffer.from(`--${boundary}\r\n${p.headers.join('\r\n')}\r\n\r\n`),
    Buffer.isBuffer(p.body) ? p.body : Buffer.from(p.body),
    Buffer.from('\r\n'),
  ]);
  return Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`)]);
}

/** An ATTLOG upload from a ZKTeco device. */
const pushAttlog = (base: string, serial: string) =>
  fetch(`${base}/iclock/cdata?SN=${serial}&table=ATTLOG`, {
    method: 'POST',
    body: '1001\t2026-10-24 08:59:12\t0\n',
  });
/** A face-match punch from a Hikvision device. */
const pushHikvision = (base: string, mac: string) =>
  fetch(`${base}/hikvision/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      macAddress: mac,
      dateTime: '2026-10-24T09:00:05+06:00',
      eventType: 'AccessControllerEvent',
      AccessControllerEvent: { majorEventType: 5, subEventType: 75, employeeNoString: '2001' },
    }),
  });

let dataDir: string;
let cloud: Awaited<ReturnType<typeof fakeCloud>>;
let agent: AgentHandle | undefined;

const config = (apiUrl: string): AgentConfig => ({
  apiUrl,
  token: TOKEN,
  tenantId: '11111111-1111-4111-8111-111111111111',
  agentId: '22222222-2222-4222-8222-222222222222',
  timeZone: 'Asia/Dhaka',
  port: 0,
  dataDir,
  syncIntervalMs: 60_000,
  heartbeatIntervalMs: 60_000,
  hikvisionEventTypes: [1, 38, 75],
  logLevel: 'error',
  deviceAllow: [],
  deviceSerials: [],
});

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'gp-edge-e2e-'));
  cloud = await fakeCloud();
});

afterEach(async () => {
  await agent?.stop();
  agent = undefined;
  await new Promise((resolve) => cloud.server.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
});

describe('edge agent end to end', () => {
  it('relays ZKTeco and Hikvision punches to the cloud with the agent token', async () => {
    agent = await startAgent(config(cloud.url), { log: silentLogger, debounceMs: 20 });
    const base = `http://127.0.0.1:${agent.port}`;

    const options = await fetch(`${base}/iclock/cdata?SN=CQZ7224460246&options=all&pushver=2.4.1`);
    expect(options.status).toBe(200);
    const optionsText = await options.text();
    expect(optionsText).toMatch(/^GET OPTION FROM: CQZ7224460246\n/);
    expect(optionsText).toContain('\nTimeZone=6\n');

    const attlog = await fetch(`${base}/iclock/cdata?SN=CQZ7224460246&table=ATTLOG&Stamp=9999`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '1001\t2026-10-24 08:59:12\t0\t1\t0\t0\t0\r\nnot a record\r\n1002\t2026-10-24 18:05:00\t1\t1\t0\r\n',
    });
    expect(attlog.status).toBe(200);
    expect(await attlog.text()).toBe('OK: 2');

    const operlog = await fetch(`${base}/iclock/cdata?SN=CQZ7224460246&table=OPERLOG&Stamp=1`, {
      method: 'POST',
      body: 'OPLOG 4\t0\t2026-10-24 08:00:00\t0\t0\t0\t0',
    });
    expect(await operlog.text()).toBe('OK');
    expect(await (await fetch(`${base}/iclock/getrequest?SN=CQZ7224460246`)).text()).toBe('OK');

    const event = {
      ipAddress: '192.168.1.64',
      macAddress: '44:19:b6:aa:bb:cc',
      dateTime: '2026-10-24T09:00:05+06:00',
      eventType: 'AccessControllerEvent',
      AccessControllerEvent: {
        majorEventType: 5,
        subEventType: 75,
        employeeNoString: '2001',
        attendanceStatus: 'checkIn',
      },
    };
    const hik = await fetch(`${base}/hikvision/events`, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=MIME_boundary' },
      body: new Uint8Array(
        multipart('MIME_boundary', [
          {
            headers: [
              'Content-Disposition: form-data; name="event_log"',
              'Content-Type: application/json',
            ],
            body: JSON.stringify(event),
          },
          {
            headers: [
              'Content-Disposition: form-data; name="Picture"; filename="1.jpg"',
              'Content-Type: image/jpeg',
            ],
            body: Buffer.from([0xff, 0xd8, 0x7b, 0x2d, 0x2d, 0xff, 0xd9]),
          },
        ]),
      ),
    });
    expect(hik.status).toBe(200);
    const heartbeatEvent = await fetch(`${base}/hikvision/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ipAddress: '192.168.1.64', eventType: 'heartBeat' }),
    });
    expect(heartbeatEvent.status).toBe(200);

    const uploads = () => cloud.requests.filter((r) => r.path === '/edge/v1/punches');
    const uploaded = () =>
      uploads().flatMap((r) => (r.body as { punches: { deviceUserId: string }[] }).punches);
    await until(() => uploaded().length === 3);

    for (const upload of uploads()) {
      expect(upload.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(upload.headers['content-type']).toBe('application/json');
    }
    expect(uploaded().toSorted((a, b) => a.deviceUserId.localeCompare(b.deviceUserId))).toEqual([
      {
        deviceSerial: 'CQZ7224460246',
        vendor: 'zkteco',
        deviceUserId: '1001',
        punchedAt: '2026-10-24T08:59:12+06:00',
        direction: 'in',
      },
      {
        deviceSerial: 'CQZ7224460246',
        vendor: 'zkteco',
        deviceUserId: '1002',
        punchedAt: '2026-10-24T18:05:00+06:00',
        direction: 'out',
      },
      {
        deviceSerial: '44:19:b6:aa:bb:cc',
        vendor: 'hikvision',
        deviceUserId: '2001',
        punchedAt: '2026-10-24T09:00:05+06:00',
        direction: 'in',
      },
    ]);

    const heartbeat = cloud.requests.find((r) => r.path === '/edge/v1/heartbeat');
    expect(heartbeat?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(heartbeat?.body).toMatchObject({ agentVersion: expect.any(String), queued: 0 });

    const health = (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
    expect(health).toMatchObject({ status: 'ok', queued: 0, rejected: 0, lastError: null });
    expect(health.lastSyncAt).toEqual(expect.any(String));
    expect(health.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serialNumber: 'CQZ7224460246',
          vendor: 'zkteco',
          ip: '127.0.0.1',
        }),
        expect.objectContaining({
          serialNumber: '44:19:b6:aa:bb:cc',
          vendor: 'hikvision',
          ip: '192.168.1.64',
        }),
      ]),
    );
  });

  it('keeps punches through a restart while the cloud is unreachable', async () => {
    // Nothing listens on the closed port, so every upload fails with ECONNREFUSED.
    const closed = await fakeCloud();
    await new Promise((resolve) => closed.server.close(resolve));
    agent = await startAgent(config(closed.url), { log: silentLogger, debounceMs: 20 });
    const res = await fetch(`http://127.0.0.1:${agent.port}/iclock/cdata?SN=SN9&table=ATTLOG`, {
      method: 'POST',
      body: '77\t2026-10-24 08:00:00\t0\n',
    });
    expect(await res.text()).toBe('OK: 1');
    await until(() => agent!.engine.status.failures > 0);
    expect(agent.queue.counts().queued).toBe(1);
    await agent.stop();

    agent = await startAgent(config(cloud.url), { log: silentLogger, debounceMs: 20 });
    await until(() => cloud.requests.some((r) => r.path === '/edge/v1/punches'));
    expect(cloud.requests.find((r) => r.path === '/edge/v1/punches')?.body).toEqual({
      punches: [
        {
          deviceSerial: 'SN9',
          vendor: 'zkteco',
          deviceUserId: '77',
          punchedAt: '2026-10-24T08:00:00+06:00',
          direction: 'in',
        },
      ],
    });
    await until(() => agent!.queue.counts().sent === 1);
  });

  it('takes punches only from allowed addresses and serial numbers, and warns when open', async () => {
    const warnings: string[] = [];
    const log = { ...silentLogger, warn: (message: string) => warnings.push(message) };
    // Another subnet only: this test's 127.0.0.1 is refused, and nothing is queued.
    agent = await startAgent({ ...config(cloud.url), deviceAllow: ['10.9.9.0/24'] }, { log });
    let base = `http://127.0.0.1:${agent.port}`;
    expect((await pushAttlog(base, 'CQZ1')).status).toBe(403);
    expect((await pushHikvision(base, '44:19:b6:aa:bb:cc')).status).toBe(403);
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect(agent.queue.counts().queued).toBe(0);
    expect(warnings).toEqual([expect.stringMatching(/Refused a push from address 127\.0\.0\.1/)]);
    await agent.stop();

    agent = await startAgent(
      {
        ...config(cloud.url),
        deviceAllow: ['127.0.0.0/8'],
        deviceSerials: ['CQZ1', '44:19:B6:AA:BB:CC'],
      },
      { log },
    );
    base = `http://127.0.0.1:${agent.port}`;
    expect(await (await pushAttlog(base, 'CQZ1')).text()).toBe('OK: 1');
    expect((await pushAttlog(base, 'ROGUE9')).status).toBe(403);
    expect((await pushHikvision(base, '44:19:b6:aa:bb:cc')).status).toBe(200);
    expect((await pushHikvision(base, '00:00:00:00:00:01')).status).toBe(403);
    expect(agent.queue.counts().queued + agent.queue.counts().sent).toBe(2);
    await agent.stop();

    warnings.length = 0;
    agent = await startAgent(config(cloud.url), { log });
    expect(warnings).toEqual([expect.stringMatching(/Any device on this network can push/)]);
  });

  it('answers bad input without falling over', async () => {
    agent = await startAgent(config(cloud.url), { log: silentLogger, debounceMs: 20 });
    const base = `http://127.0.0.1:${agent.port}`;
    expect(
      (await fetch(`${base}/hikvision/events`, { method: 'POST', body: '\u0000garbage' })).status,
    ).toBe(200);
    expect(
      (await fetch(`${base}/iclock/cdata?table=ATTLOG`, { method: 'POST', body: 'x' })).status,
    ).toBe(400);
    expect((await fetch(`${base}/iclock/cdata?SN=bad%0Aserial`)).status).toBe(400);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});
