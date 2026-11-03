import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import type { MfaChallenge, MfaSetupRequired, TenantSession } from '@gp/shared';
import { apiFetch } from '@/lib/api';
import { writeSessionCookies } from '@/lib/session';

export async function GET(request: NextRequest) {
  const flow = request.nextUrl.searchParams.get('flow') ?? '';
  if (!/^[A-Za-z0-9_-]{32}$/.test(flow))
    return NextResponse.redirect(new URL('/login?sso=failed', request.url));
  const jar = await cookies(),
    verifier = jar.get(`gp_sso_${flow}`)?.value;
  if (!verifier) return NextResponse.redirect(new URL('/login?sso=mobile', request.url));
  jar.set(`gp_sso_${flow}`, '', { path: '/auth/sso/complete', maxAge: 0 });
  const result = await apiFetch<{
    result?: TenantSession | MfaChallenge | MfaSetupRequired;
    linked?: boolean;
    test?: boolean;
    pending?: boolean;
  }>('/auth/sso/exchange', { method: 'POST', body: { flowId: flow, verifier } });
  if (!result.ok || result.data.pending)
    return NextResponse.redirect(new URL('/login?sso=failed', request.url));
  if (result.data.linked)
    return NextResponse.redirect(
      new URL(
        result.data.test ? '/workspace/identity?sso=linked' : '/workspace/account?sso=linked',
        request.url,
      ),
    );
  const session = result.data.result;
  if (!session) return NextResponse.redirect(new URL('/login?sso=failed', request.url));
  if ('mfaToken' in session) {
    jar.set('gp_sso_mfa', session.mfaToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 300,
    });
    jar.set('gp_sso_setup', 'mfaSetupRequired' in session ? '1' : '0', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 300,
    });
    return NextResponse.redirect(new URL('/login?sso=step', request.url));
  }
  writeSessionCookies(jar, 'tenant', session);
  return NextResponse.redirect(new URL('/workspace', request.url));
}
