import { proxyFile } from '@/lib/api';

/** A quarter's salary and tax for the withholding return (s.177), as CSV. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const year = query.get('fiscalYear') ?? '';
  const quarter = query.get('quarter') ?? '';
  if (!/^\d{4}-\d{2}$/.test(year) || !/^[1-4]$/.test(quarter)) {
    return new Response('Not found', { status: 404 });
  }
  return proxyFile(`/tenant/payroll/tax/quarter?fiscalYear=${year}&quarter=${quarter}`);
}
