import { proxyFile } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A file on one of the workspace's support tickets, always saved rather than shown. */
export async function GET(_: Request, { params }: RouteContext<'/workspace/files/support/[id]'>) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  return proxyFile(`/tenant/support/attachments/${id}`);
}
