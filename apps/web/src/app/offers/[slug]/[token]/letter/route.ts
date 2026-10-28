import { API_URL } from '@/lib/api';

/** The candidate's offer letter, through their link; nothing about them is sent but the link. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/offers/[slug]/[token]/letter'>,
) {
  const { slug, token } = await params;
  const visitor = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  const res = await fetch(
    `${API_URL}/offers/${encodeURIComponent(slug)}/${encodeURIComponent(token)}/letter`,
    { cache: 'no-store', headers: visitor ? { 'x-forwarded-for': visitor } : {} },
  );
  if (!res.ok) {
    return new Response(res.status === 404 ? 'Not found' : 'Not available', {
      status: res.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  for (const name of ['content-type', 'content-disposition', 'content-length']) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(res.body, { status: 200, headers });
}
