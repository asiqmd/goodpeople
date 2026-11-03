import { insightJobSchema } from '@gp/shared';
import { proxyFile } from '@/lib/api';

export async function GET(
  _: Request,
  { params }: RouteContext<'/workspace/analytics/insights/files/[id]'>,
) {
  const { id } = await params;
  const job = insightJobSchema.safeParse({ requestId: id });
  if (!job.success) return new Response('Export unavailable', { status: 404 });
  return proxyFile('/tenant/analytics/insight-files/' + job.data.requestId);
}
