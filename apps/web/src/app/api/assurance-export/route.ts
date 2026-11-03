import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { cookieNames } from '@/lib/session';
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!/^[a-f0-9-]{36}$/i.test(id)) return new NextResponse('Invalid program', { status: 400 });
  const token = (await cookies()).get(cookieNames('platform').access)?.value;
  if (!token) return new NextResponse('Unauthorized', { status: 401 });
  const r = await fetch(
    (process.env.API_URL ?? 'http://localhost:4000') +
      '/platform/assurance/programs/' +
      id +
      '/export',
    {
      headers: { authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok) return new NextResponse('Restricted evidence unavailable', { status: r.status });
  return new NextResponse(await r.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="restricted-assurance-readiness.json"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
