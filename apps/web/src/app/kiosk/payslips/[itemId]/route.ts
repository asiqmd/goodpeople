import { API_URL } from '@/lib/api';
import { kioskHeaders } from '../../kiosk-api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The signed-in worker's payslip PDF, passed through without the tablet holding a token. */
export async function GET(request: Request, { params }: RouteContext<'/kiosk/payslips/[itemId]'>) {
  const { itemId } = await params;
  const language = new URL(request.url).searchParams.get('language') === 'en' ? 'en' : 'bn';
  const headers = await kioskHeaders(true);
  if (!headers || !UUID.test(itemId)) return new Response('Not available', { status: 404 });
  const res = await fetch(`${API_URL}/kiosk/v1/payslips/${itemId}/pdf?language=${language}`, {
    headers,
    cache: 'no-store',
  });
  if (!res.ok) return new Response('Not available', { status: res.status });
  const passed = new Headers({
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
  for (const name of ['content-type', 'content-disposition', 'content-length']) {
    const value = res.headers.get(name);
    if (value) passed.set(name, value);
  }
  return new Response(res.body, { status: 200, headers: passed });
}
