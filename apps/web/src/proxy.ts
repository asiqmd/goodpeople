import type { TokenPair } from '@gp/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { cookieNames, writeSessionCookies, type SessionKind } from './lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Keeps sessions alive: when the short-lived access cookie has expired but a refresh token
 * remains, rotate them before the page renders. Pages then only ever read a valid token.
 */
export async function proxy(request: NextRequest) {
  const kind: SessionKind = request.nextUrl.pathname.startsWith('/platform')
    ? 'platform'
    : 'tenant';
  const names = cookieNames(kind);
  const refreshToken = request.cookies.get(names.refresh)?.value;
  if (request.cookies.has(names.access) || !refreshToken) return NextResponse.next();

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);
  if (!res?.ok) {
    const response = NextResponse.next();
    response.cookies.delete(names.refresh);
    return response;
  }
  const tokens = (await res.json()) as TokenPair;
  // The page rendering this request must see the new token too, not only the browser.
  request.cookies.set(names.access, tokens.accessToken);
  request.cookies.set(names.refresh, tokens.refreshToken);
  const response = NextResponse.next({ request: { headers: request.headers } });
  writeSessionCookies(response.cookies, kind, tokens);
  return response;
}

export const config = {
  matcher: ['/workspace/:path*', '/platform/:path*'],
};
