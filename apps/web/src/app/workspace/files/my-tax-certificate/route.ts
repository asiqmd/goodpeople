import { proxyFile } from '@/lib/api';

/** The signed-in employee's own salary certificate. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const language = query.get('language') === 'bn' ? 'bn' : 'en';
  const year = encodeURIComponent(query.get('fiscalYear') ?? '');
  return proxyFile(`/tenant/me/tax/certificate?fiscalYear=${year}&language=${language}`);
}
