import { proxyFile } from '@/lib/api';

/** An employee's service book as a PDF, for HR. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/service-book/[id]'>,
) {
  const { id } = await params;
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/tenant/employees/${id}/service-book?language=${language}`);
}
