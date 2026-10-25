import { proxyFile } from '@/lib/api';

/** An employee's salary certificate for a fiscal year, for payroll staff. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/workspace/files/tax-certificate/[employeeId]'>,
) {
  const { employeeId } = await params;
  const query = new URL(request.url).searchParams;
  const language = query.get('language') === 'bn' ? 'bn' : 'en';
  const year = encodeURIComponent(query.get('fiscalYear') ?? '');
  return proxyFile(
    `/tenant/employees/${employeeId}/tax/certificate?fiscalYear=${year}&language=${language}`,
  );
}
