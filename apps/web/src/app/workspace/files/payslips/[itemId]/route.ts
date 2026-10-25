import { proxyFile } from '@/lib/api';

/** One of the signed-in employee's published payslips. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/payslips/[itemId]'>,
) {
  const { itemId } = await params;
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/tenant/me/payslips/${itemId}?language=${language}`);
}
