import { proxyFile } from '@/lib/api';

/** A monthly timesheet as the PDF donors ask for, in English or Bangla. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/timesheets/[id]'>,
) {
  const { id } = await params;
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/tenant/timesheets/${id}/pdf?language=${language}`);
}
