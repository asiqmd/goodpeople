import { proxyFile } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A file on any support ticket, internal notes' included, for the platform console. */
export async function GET(_: Request, { params }: RouteContext<'/platform/files/support/[id]'>) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  return proxyFile(`/platform/support/attachments/${id}`, {}, 'platform');
}
