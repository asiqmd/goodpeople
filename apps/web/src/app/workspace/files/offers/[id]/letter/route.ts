import { proxyFile } from '@/lib/api';

/** An offer letter for HR: as it reads now, or the copy the candidate accepted. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/workspace/files/offers/[id]/letter'>,
) {
  const { id } = await params;
  return proxyFile(`/tenant/recruitment/offers/${encodeURIComponent(id)}/letter`);
}
