import { proxyFile } from '@/lib/api';

/** A document from the vault, shown in the browser, or saved with `?download=1`. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/documents/[id]'>,
) {
  const { id } = await params;
  const download = new URL(request.url).searchParams.get('download') === '1';
  return proxyFile(`/tenant/documents/${id}/file${download ? '?download=1' : ''}`);
}
