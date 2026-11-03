import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { cookieNames } from '@/lib/session';
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '',
    kind = request.nextUrl.searchParams.get('kind'),
    language = request.nextUrl.searchParams.get('language') ?? 'en';
  if (
    !/^[a-f0-9-]{36}$/i.test(id) ||
    !['pdf', 'wps'].includes(kind ?? '') ||
    !['en', 'bn', 'ar'].includes(language)
  )
    return new NextResponse('Invalid preview request', { status: 400 });
  const token = (await cookies()).get(cookieNames('tenant').access)?.value;
  if (!token) return new NextResponse('Unauthorized', { status: 401 });
  const path = kind === 'wps' ? `wps/${id}/file` : `pilots/${id}/preview.pdf?language=${language}`;
  const response = await fetch(
    (process.env.API_URL ?? 'http://localhost:4000') + '/tenant/uae/' + path,
    {
      headers: { authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) return new NextResponse('Preview unavailable', { status: response.status });
  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      'Content-Type': kind === 'wps' ? 'text/plain; charset=utf-8' : 'application/pdf',
      'Content-Disposition': response.headers.get('content-disposition') ?? 'attachment',
      'Cache-Control': 'private, no-store',
    },
  });
}
