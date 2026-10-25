import { proxyFile } from '@/lib/api';

/** Everyone's gratuity on a date, as CSV. */
export async function GET(request: Request) {
  const asOf = new URL(request.url).searchParams.get('asOf') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return new Response('Not found', { status: 404 });
  return proxyFile(`/tenant/payroll/gratuity/file?asOf=${asOf}`);
}
