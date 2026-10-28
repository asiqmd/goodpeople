import { proxyFile } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A candidate's latest CV, for those who manage recruitment. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/workspace/files/recruitment/candidates/[id]/cv'>,
) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  return proxyFile(`/tenant/recruitment/candidates/${id}/cv`);
}
