import 'server-only';
import type { ApiError, TenantRole } from '@gp/shared';
import { cookies } from 'next/headers';
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
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (res.status === 204) return { ok: true, data: undefined as T };
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: json as T };
  return {
    ok: false,
    status: res.status,
    error: { statusCode: res.status, error: res.statusText, message: 'Request failed', ...json },
  };
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

/** For pages: the data, or throw so the error boundary shows. */
export async function load<T>(kind: SessionKind, path: string): Promise<T> {
  const result = await authedFetch<T>(kind, path);
  if (!result.ok) throw new Error(`${path}: ${result.error.message}`);
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
