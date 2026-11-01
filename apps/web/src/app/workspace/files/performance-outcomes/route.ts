import { proxyFile } from '@/lib/api';

/** A review cycle's outcomes (released reviews' ratings and recommendations), as CSV. */
export async function GET(request: Request) {
  const cycleId = new URL(request.url).searchParams.get('cycleId') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(cycleId)) return new Response('Not found', { status: 404 });
  return proxyFile(`/tenant/performance/outcomes?cycleId=${cycleId}&format=csv`);
}
