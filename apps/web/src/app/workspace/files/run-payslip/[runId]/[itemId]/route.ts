import { proxyFile } from '@/lib/api';

/** A payslip in a run, for payroll staff, before or after it is published. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/run-payslip/[runId]/[itemId]'>,
) {
  const { runId, itemId } = await params;
  const language = new URL(request.url).searchParams.get('language') === 'bn' ? 'bn' : 'en';
  return proxyFile(`/tenant/payroll/runs/${runId}/items/${itemId}/payslip?language=${language}`);
}
