import { proxyFile } from '@/lib/api';

const KINDS = { register: 'register', wage: 'wage-register', overtime: 'overtime-register' };

/**
 * A run's registers: the payroll register, the wage register (Form 38) or the overtime
 * register (Form 34), as CSV or a PDF in English or Bangla.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/register/[runId]'>,
) {
  const { runId } = await params;
  const query = new URL(request.url).searchParams;
  const kind = KINDS[(query.get('kind') ?? 'register') as keyof typeof KINDS] ?? KINDS.register;
  const format = query.get('format') === 'pdf' ? 'pdf' : 'csv';
  const language = query.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/tenant/payroll/runs/${runId}/${kind}?format=${format}&language=${language}`);
}
