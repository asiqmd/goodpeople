import { proxyFile } from '@/lib/api';

const FILES = new Set(['bank', 'cash-sheet', 'bank-advice', 'journal', 'wallet']);

/** A locked run's payment files: the bank and wallet files, the cash sheet, advice and journal. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/run-files/[runId]/[...file]'>,
) {
  const { runId, file } = await params;
  if (!FILES.has(file[0] ?? '') || file.length > 2) {
    return new Response('Not found', { status: 404 });
  }
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  const path = file.map(encodeURIComponent).join('/');
  return proxyFile(`/tenant/payroll/runs/${runId}/files/${path}?language=${language}`);
}
