import type { Request, Response } from 'express';
import { newRequestId, parseRequestId, requestLine } from './request-id.js';

describe('request ids', () => {
  it('accepts a caller’s reference only when it is safe to echo', () => {
    expect(parseRequestId('7f3c9a1e')).toBe('7f3c9a1e');
    expect(parseRequestId('edge_agent-2026-10-27')).toBe('edge_agent-2026-10-27');
    expect(parseRequestId('a'.repeat(64))).toBe('a'.repeat(64));
    for (const bad of [
      undefined,
      '',
      'short',
      'a'.repeat(65),
      ' 7f3c9a1e',
      '7f3c9a1e, 0a1b2c3d',
      '7f3c<script>',
      'line\nbreak1',
      '../../etc/passwd',
    ]) {
      expect(parseRequestId(bad)).toBeUndefined();
    }
    expect(parseRequestId(['7f3c9a1e', '0a1b2c3d'])).toBeUndefined();
  });

  it('makes new ones that pass its own check', () => {
    const id = newRequestId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(parseRequestId(id)).toBe(id);
    expect(newRequestId()).not.toBe(id);
  });
});

/** A request carrying secrets in its URL, headers and body, which the line must leave out. */
const request = (fields: Record<string, unknown>) =>
  ({
    method: 'GET',
    baseUrl: '',
    ip: '203.0.113.7',
    originalUrl: '/kiosk/ABCD-1234/session?token=secret',
    url: '/kiosk/ABCD-1234/session?token=secret',
    headers: { authorization: 'Bearer eyJabc.def.ghi', cookie: 'gp=1' },
    body: { pin: '9876' },
    requestId: 'req-123456',
    ...fields,
  }) as unknown as Request;
const response = (statusCode: number, writableFinished = true) =>
  ({ statusCode, writableFinished }) as unknown as Response;

describe('the line per request', () => {
  it('names the route pattern, never the URL, headers or body', () => {
    const line = requestLine(
      request({
        route: { path: '/kiosk/:code/session' },
        kiosk: { tenantId: 't-1', kioskId: 'k-1' },
      }),
      response(200),
      12.345,
    );
    expect(line).toEqual({
      level: 'info',
      message: 'GET /kiosk/:code/session 200',
      fields: {
        requestId: 'req-123456',
        method: 'GET',
        route: '/kiosk/:code/session',
        status: 200,
        durationMs: 12.3,
        userKind: 'kiosk',
        tenantId: 't-1',
        ip: '203.0.113.7',
      },
    });
    const text = JSON.stringify(line);
    for (const leak of ['ABCD-1234', 'token=', 'secret', 'Bearer', 'cookie', '9876']) {
      expect(text).not.toContain(leak);
    }
  });

  it('logs health checks at debug and server errors at error', () => {
    const health = requestLine(request({ route: { path: '/health' } }), response(200), 1);
    expect(health.level).toBe('debug');
    expect(requestLine(request({ route: { path: '/ready' } }), response(200), 1).level).toBe(
      'debug',
    );
    const failing = requestLine(request({ route: { path: '/health' } }), response(503), 1);
    expect(failing.level).toBe('error');
    const tenant = requestLine(
      request({
        route: { path: '/tenant/employees/:id' },
        user: { kind: 'tenant', id: 'u-1', role: 'hr_admin', tenantId: 't-2' },
      }),
      response(500),
      1,
    );
    expect(tenant).toMatchObject({
      level: 'error',
      fields: { userKind: 'tenant', tenantId: 't-2', route: '/tenant/employees/:id' },
    });
  });

  it('leaves the address and identity out of speak-up lines', () => {
    const line = requestLine(
      request({
        method: 'POST',
        route: { path: '/speak-up/:slug/grievances' },
        user: { kind: 'tenant', id: 'u-1', role: 'worker', tenantId: 't-3' },
      }),
      response(201),
      4,
    );
    expect(line.fields).toEqual({
      requestId: 'req-123456',
      method: 'POST',
      route: '/speak-up/:slug/grievances',
      status: 201,
      durationMs: 4,
    });
  });

  it('says when nothing matched and when the caller went away', () => {
    const line = requestLine(request({}), response(404, false), 1);
    expect(line.message).toBe('GET (no route) 404');
    expect(line.fields).toMatchObject({ route: null, aborted: true });
  });
});
