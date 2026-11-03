import { proxyFile } from '@/lib/api';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/tenant/learning/certificates/${id}/file?language=${language}`);
}
