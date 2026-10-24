import { proxyFile } from '@/lib/api';

/** The signed-in employee's own service book. */
export async function GET(request: Request) {
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/tenant/me/service-book?language=${language}`);
}
