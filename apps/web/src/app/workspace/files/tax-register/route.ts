import { proxyFile } from '@/lib/api';

/** Everyone's salary and tax for a fiscal year, as CSV, for the withholding return. */
export async function GET(request: Request) {
  const year = new URL(request.url).searchParams.get('fiscalYear') ?? '';
  return proxyFile(`/tenant/payroll/tax/register?fiscalYear=${encodeURIComponent(year)}`);
}
