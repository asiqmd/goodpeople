import { proxyFile } from '@/lib/api';

/** An invoice (Mushak-6.3) or credit note (Mushak-6.7) as a PDF, in English or Bangla. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/invoice/[id]'>,
) {
  const { id } = await params;
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/tenant/billing/invoices/${id}/pdf?language=${language}`);
}
