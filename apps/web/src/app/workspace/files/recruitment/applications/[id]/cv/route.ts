import { proxyFile } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An application's CV, for HR, the opening's hiring manager and the candidate's interviewers. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/workspace/files/recruitment/applications/[id]/cv'>,
) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  return proxyFile(`/tenant/recruitment/applications/${id}/cv`);
}
