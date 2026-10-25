import { proxyFile } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A month's production by worker, line or day, as CSV. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const month = params.get('month') ?? '';
  const unit = params.get('orgUnitId') ?? '';
  const by = params.get('by') ?? 'worker';
  if (!/^\d{4}-\d{2}$/.test(month) || (unit && !UUID.test(unit)) || !/^(worker|line|day)$/.test(by))
    return new Response('Not found', { status: 404 });
  const query = new URLSearchParams({ month, by, ...(unit ? { orgUnitId: unit } : {}) });
  return proxyFile(`/tenant/production/summary/file?${query}`);
}
