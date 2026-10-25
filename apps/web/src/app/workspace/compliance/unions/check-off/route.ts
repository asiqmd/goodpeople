import { proxyFile } from '@/lib/api';

/** A month's check-off as CSV: members with consent, what was deducted, when it is due. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const month = query.get('month') ?? '';
  const unionId = query.get('unionId');
  const params = new URLSearchParams({ month, ...(unionId ? { unionId } : {}) });
  return proxyFile(`/tenant/relations/check-off/csv?${params.toString()}`);
}
