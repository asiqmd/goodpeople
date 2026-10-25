import { can, todayIn, type PfStatement } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FundEntryForm, LeaveFundForm } from '@/components/payroll/benefit-forms';
import { FundStatement } from '@/components/payroll/payroll-views';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function MemberPage({
  params,
}: PageProps<'/workspace/payroll/pf/[employeeId]'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const canManage = can(role, 'payroll.manage');
  const { employeeId } = await params;
  const tp = await getTranslations('payroll.pf');
  await getFormatter();
  const statement = await load<PfStatement>('tenant', `/tenant/payroll/pf/members/${employeeId}`);
  const today = todayIn();
  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/payroll/pf" className="text-sm text-slate-500 hover:underline">
          ← {tp('title')}
        </Link>
        <h1 className="text-2xl font-semibold">
          {statement.employee.fullName}{' '}
          <span className="font-mono text-base text-slate-400">
            {statement.employee.employeeCode}
          </span>
        </h1>
      </div>
      <FundStatement statement={statement} />
      {canManage && !statement.leftOn && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={tp('entryTitle')}>
            <p className="mb-3 text-sm text-slate-600">{tp('entryHint')}</p>
            <FundEntryForm employeeId={employeeId} today={today} />
          </Card>
          <Card title={tp('leaveTitle')}>
            <p className="mb-3 text-sm text-slate-600">{tp('leaveHint')}</p>
            <LeaveFundForm employeeId={employeeId} today={today} />
          </Card>
        </div>
      )}
    </>
  );
}
