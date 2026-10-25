import 'server-only';
import { KIOSK_SESSION_HEADER, type ApiError } from '@gp/shared';
import { cookies } from 'next/headers';
import { API_URL, type ApiResult } from '@/lib/api';

// A kiosk keeps its device token, and a signed-in worker's short session, in httpOnly cookies
// scoped to /kiosk: the tablet's browser JavaScript never holds either.

export const KIOSK_COOKIES = {
  device: 'gp_kiosk_device',
  session: 'gp_kiosk_session',
  locale: 'gp_kiosk_locale',
} as const;

export const kioskCookie = (maxAge: number) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/kiosk',
  maxAge,
});

/** The tablet's language: Bangla unless someone switched it to English. */
export async function kioskLocale(): Promise<'en' | 'bn'> {
  return (await cookies()).get(KIOSK_COOKIES.locale)?.value === 'en' ? 'en' : 'bn';
}

/** Headers for the API: the device token, and the worker's session when there is one. */
export async function kioskHeaders(
  withSession: boolean,
  tokens: { device?: string; session?: string } = {},
): Promise<Record<string, string> | null> {
  const jar = await cookies();
  const device = tokens.device ?? jar.get(KIOSK_COOKIES.device)?.value;
  if (!device) return null;
  const session = tokens.session ?? jar.get(KIOSK_COOKIES.session)?.value;
  return {
    authorization: `Bearer ${device}`,
    ...(withSession && session ? { [KIOSK_SESSION_HEADER]: session } : {}),
  };
}

/**
 * Calls the kiosk API as this tablet; `session` adds the signed-in worker. Tokens given here
 * are used instead of the cookies (one just pasted, or a session just started).
 */
export async function kioskFetch<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    session?: boolean;
    tokens?: { device?: string; session?: string };
  } = {},
): Promise<ApiResult<T>> {
  const headers = await kioskHeaders(init.session ?? false, init.tokens);
  if (!headers) {
    const error: ApiError = {
      statusCode: 401,
      error: 'Unauthorized',
      message: 'This kiosk is not set up',
      code: 'kiosk_unknown',
    };
    return { ok: false, status: 401, error };
  }
  const res = await fetch(`${API_URL}/kiosk/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...headers },
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
