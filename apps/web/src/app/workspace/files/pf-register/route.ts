import { proxyFile } from '@/lib/api';

/** The provident fund's year for the trustees, as CSV. */
export async function GET(request: Request) {
  const year = new URL(request.url).searchParams.get('fiscalYear') ?? '';
  if (!/^\d{4}-\d{2}$/.test(year)) return new Response('Not found', { status: 404 });
  return proxyFile(`/tenant/payroll/reports/pf-register?fiscalYear=${year}`);
}
