import { proxyFile } from '@/lib/api';

/** A maternity case's statement as a PDF, in English or Bangla. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/maternity/[id]'>,
) {
  const { id } = await params;
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/tenant/maternity/cases/${id}/statement?language=${language}`);
}
