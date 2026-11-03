import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { cookieNames } from '@/lib/session';
export async function GET(request: NextRequest) {
  const language = request.nextUrl.searchParams.get('language') ?? 'en';
  const token = (await cookies()).get(cookieNames('tenant').access)?.value;
  if (!token) return new NextResponse('Unauthorized', { status: 401 });
  const response = await fetch(
    (process.env.API_URL ?? 'http://localhost:4000') +
      '/tenant/international/profile.pdf?language=' +
      encodeURIComponent(language),
    {
      headers: { authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) return new NextResponse('Profile unavailable', { status: response.status });
  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="company-context.pdf"',
    },
  });
}
