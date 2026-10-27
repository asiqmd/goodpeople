import 'server-only';
import type { ApiError, TenantRole } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cookieNames, type SessionKind } from './session';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

/** Server-side call to the API. Never cached: every page here is per user. */
export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(await visitorAddress()),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  return toResult<T>(res);
}

/**
 * The visitor's address as the proxy in front of this server saw it (the last entry it
 * added), passed on so the API's sign-in limits count each visitor, not this server.
 */
async function visitorAddress(): Promise<Record<string, string>> {
  const forwarded = (await headers()).get('x-forwarded-for');
  const visitor = forwarded?.split(',').at(-1)?.trim();
  return visitor ? { 'x-forwarded-for': visitor } : {};
}

async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  if (res.status === 204) return { ok: true, data: undefined as T };
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: json as T };
  // The header too, for errors whose body is not the API's (a proxy's 502, say).
  const requestId = res.headers.get('x-request-id') ?? undefined;
  const error: ApiError = {
    statusCode: res.status,
    error: res.statusText,
    message: 'Request failed',
    requestId,
    ...json,
  };
  if (error.issues?.some((i) => i.code)) error.issues = await translateIssues(error.issues);
  return { ok: false, status: res.status, error };
}

/** Field issues the API coded (a statutory floor, say), in the page's language. */
async function translateIssues(issues: NonNullable<ApiError['issues']>) {
  const [t, locale] = await Promise.all([getTranslations('errors.issues'), getLocale()]);
  // Text values such as a section number keep Latin digits unless changed here.
  const digits = (v: string | number) =>
    typeof v === 'string' && locale === 'bn'
      ? v.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]!)
      : v;
  return issues.map((i) =>
    i.code && t.has(i.code)
      ? {
          ...i,
          message: t(
            i.code,
            Object.fromEntries(Object.entries(i.params ?? {}).map(([k, v]) => [k, digits(v)])),
          ),
        }
      : i,
  );
}

const LOGIN = { platform: '/platform/login', tenant: '/login' } as const;

/** Calls the API as the signed-in user; sends them to sign in when the session is gone. */
export async function authedFetch<T>(
  kind: SessionKind,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const token = (await cookies()).get(cookieNames(kind).access)?.value;
  if (!token) redirect(`${LOGIN[kind]}?expired=1`);
  const result = await apiFetch<T>(path, { ...init, token });
  if (!result.ok && result.status === 401) redirect(`${LOGIN[kind]}?expired=1`);
  return result;
}

/**
 * For pages: the data, or throw so the error boundary shows. The API's reference goes into
 * the message, so this server's log ties the boundary's digest to the API's log.
 */
export async function load<T>(kind: SessionKind, path: string): Promise<T> {
  const result = await authedFetch<T>(kind, path);
  if (!result.ok) {
    const { message, requestId } = result.error;
    throw new Error(`${path}: ${message}${requestId ? ` (request ${requestId})` : ''}`);
  }
  return result.data;
}

/**
 * The signed-in workspace user, read from their access token. For choosing what to show only:
 * the API checks the token's signature and the role on every request.
 */
export async function currentTenantUser(): Promise<{ id: string; role: TenantRole } | null> {
  const token = (await cookies()).get(cookieNames('tenant').access)?.value;
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return { id: claims.sub, role: claims.role };
  } catch {
    return null;
  }
}

/** Sends a form with files (multipart) as the signed-in user. */
export async function authedUpload<T>(
  path: string,
  form: FormData,
  kind: SessionKind = 'tenant',
): Promise<ApiResult<T>> {
  const token = (await cookies()).get(cookieNames(kind).access)?.value;
  if (!token) redirect(`${LOGIN[kind]}?expired=1`);
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
    cache: 'no-store',
  });
  if (res.status === 401) redirect(`${LOGIN[kind]}?expired=1`);
  return toResult<T>(res);
}

/**
 * Passes a file from the API (a document, a PDF, a spreadsheet) through to the browser, for
 * route handlers: the browser never holds the API token.
 */
export async function proxyFile(
  path: string,
  init: { method?: string; body?: unknown } = {},
  kind: SessionKind = 'tenant',
): Promise<Response> {
  const token = (await cookies()).get(cookieNames(kind).access)?.value;
  if (!token) return new Response('Sign in again', { status: 401 });
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    return new Response(error.message ?? 'Not available', {
      status: res.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const passed = new Headers({
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
  for (const name of ['content-type', 'content-disposition', 'content-length']) {
    const value = res.headers.get(name);
    if (value) passed.set(name, value);
  }
  return new Response(res.body, { status: 200, headers: passed });
}
