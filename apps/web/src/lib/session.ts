import type { TokenPair } from '@gp/shared';

/** The platform console and a workspace keep separate sessions, so staff can test both at once. */
export type SessionKind = 'platform' | 'tenant';

export const cookieNames = (kind: SessionKind) => ({
  access: `gp_${kind}_access`,
  refresh: `gp_${kind}_refresh`,
});

const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

interface CookieJar {
  set(name: string, value: string, options: Record<string, unknown>): unknown;
}

/** httpOnly cookies: tokens never reach browser JavaScript. */
export function writeSessionCookies(jar: CookieJar, kind: SessionKind, tokens: TokenPair) {
  const names = cookieNames(kind);
  const base = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
  jar.set(names.access, tokens.accessToken, { ...base, maxAge: tokens.expiresIn - 30 });
  jar.set(names.refresh, tokens.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
}
