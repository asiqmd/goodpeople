import { proxyFile } from '@/lib/api';

/** The buyer-audit report as a PDF in English or Bangla, or the weekly hours as CSV. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  for (const key of ['from', 'to', 'legalEntityId', 'locationId', 'language']) {
    const value = query.get(key);
    if (value) params.set(key, value);
  }
  params.set('format', query.get('format') === 'csv' ? 'csv' : 'pdf');
  return proxyFile(`/tenant/compliance/audit-report?${params}`);
}
