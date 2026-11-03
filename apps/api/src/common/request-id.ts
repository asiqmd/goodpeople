import { randomBytes } from 'node:crypto';
import { requestIdSchema } from '@gp/shared';
import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest } from './auth-user.js';
import type { AppLogger, LogLevel } from './logger.js';
import { runInRequestContext, type IdentifiedRequest } from './request-context.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** A caller's own reference (a proxy's or an app's), when it is one we can safely echo. */
export function parseRequestId(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = requestIdSchema.safeParse(value);
  return parsed.success && parsed.data === value ? value : undefined;
}

export const newRequestId = () => randomBytes(16).toString('hex');

const HEALTH = /^\/(health|ready)(\/|$)/;
/**
 * Speak-up is anonymous (ADR 015): its lines carry no address, login or workspace, so a log
 * reader cannot tie a report to the person who sent it. Caddy skips these paths altogether.
 */
const ANONYMOUS = /^\/speak-up(\/|$)/;

export interface RequestLine {
  level: LogLevel;
  message: string;
  fields: {
    requestId?: string;
    method: string;
    /** The matched route's pattern: raw paths and query strings carry tokens and codes. */
    route: string | null;
    status: number;
    durationMs: number;
    userKind?: string;
    tenantId?: string;
    ip?: string;
    aborted?: true;
  };
}

/** The matched route's pattern, e.g. `/tenant/employees/:id`; null when no route matched. */
export const routeOf = (req: Request): string | null =>
  req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : null;

/** What is logged about a finished request: never its URL, headers or body. */
export function requestLine(req: Request, res: Response, durationMs: number): RequestLine {
  const authed = req as AuthedRequest;
  const route = routeOf(req);
  const status = res.statusCode;
  const userKind =
    authed.service?.kind ??
    authed.user?.kind ??
    (authed.kiosk ? 'kiosk' : authed.edgeAgent ? 'edge_agent' : undefined);
  const tenantId =
    authed.service?.tenantId ??
    (authed.user?.kind === 'tenant'
      ? authed.user.tenantId
      : (authed.kiosk?.tenantId ?? authed.edgeAgent?.tenantId));
  const health = route !== null && HEALTH.test(route);
  const anonymous = route !== null && ANONYMOUS.test(route);
  return {
    level: status >= 500 ? 'error' : health ? 'debug' : 'info',
    message: `${req.method} ${route ?? '(no route)'} ${status}`,
    fields: {
      requestId: (req as IdentifiedRequest).requestId,
      method: req.method,
      route,
      status,
      durationMs: Math.round(durationMs * 10) / 10,
      ...(!anonymous && {
        ...(userKind && { userKind }),
        ...(tenantId && { tenantId }),
        ...(req.ip && { ip: req.ip }),
      }),
      ...(!res.writableFinished && { aborted: true as const }),
    },
  };
}

/**
 * First on every request: gives it a reference (the caller's when valid), returns it as
 * x-request-id, keeps authenticated responses out of caches unless a route says otherwise,
 * and logs one line when the response is done.
 */
export function requestTracking(logger: AppLogger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint();
    const requestId = parseRequestId(req.headers[REQUEST_ID_HEADER]) ?? newRequestId();
    (req as IdentifiedRequest).requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    // Routes that set their own Cache-Control (after this) replace it.
    if (req.headers.authorization) res.setHeader('cache-control', 'no-store');
    res.once('close', () => {
      const line = requestLine(req, res, Number(process.hrtime.bigint() - started) / 1e6);
      logger.event(line.level, 'HTTP', line.message, line.fields);
    });
    runInRequestContext(requestId, next);
  };
}
