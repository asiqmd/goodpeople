import { proxyFile } from '@/lib/api';

/** Payments a bank or wallet provider returned, as CSV. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/workspace/files/payment-check/[runId]/[checkId]'>,
) {
  const { runId, checkId } = await params;
  return proxyFile(`/tenant/payroll/runs/${runId}/payment-checks/${checkId}/file`);
}
