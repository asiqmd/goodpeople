import { proxyFile } from '@/lib/api';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A project's personnel cost schedule for a period, as CSV or a PDF in English or Bangla. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/projects/[id]/donor-report'>,
) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const from = query.get('from') ?? '';
  const to = query.get('to') ?? '';
  if (!UUID.test(id) || !MONTH.test(from) || !MONTH.test(to))
    return new Response('Not found', { status: 404 });
  const format = query.get('format') === 'pdf' ? 'pdf' : 'csv';
  const language = query.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(
    `/tenant/projects/${id}/donor-report?${new URLSearchParams({ from, to, format, language })}`,
  );
}
