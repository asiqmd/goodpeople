import { proxyFile } from '@/lib/api';

/** Every difference a comparison with the current payroll found, as CSV. */
export async function GET(
  _: Request,
  { params }: RouteContext<'/workspace/files/reconciliation/[id]'>,
) {
  const { id } = await params;
  return proxyFile(`/tenant/payroll/reconciliations/${id}/file`);
}
