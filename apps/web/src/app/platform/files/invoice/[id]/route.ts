import { proxyFile } from '@/lib/api';

/** Any workspace's or partner's invoice or credit note, for the platform console. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/platform/files/invoice/[id]'>,
) {
  const { id } = await params;
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/platform/billing/invoices/${id}/pdf?language=${language}`, {}, 'platform');
}
