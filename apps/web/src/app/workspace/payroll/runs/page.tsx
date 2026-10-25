import { can, todayIn, type PayGroupView, type PayrollRunView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { PayrollTabs, RunStatusBadge, runPeriod, taka } from '@/components/payroll/payroll-views';
import { NewRunForm } from '@/components/payroll/run-forms';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function PayrollRunsPage() {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const t = await getTranslations('payroll');
  const tr = await getTranslations('payroll.runs');
  const format = await getFormatter();
  const [runs, groups] = await Promise.all([
    load<PayrollRunView[]>('tenant', '/tenant/payroll/runs'),
    load<PayGroupView[]>('tenant', '/tenant/payroll/pay-groups'),
  ]);
  const today = todayIn();
  // Usually the month that just ended, or this one in its last days.
  const [y, m] = today.split('-').map(Number) as [number, number];
  const month =
    Number(today.slice(8)) >= 20
      ? today.slice(0, 7)
      : m === 1
        ? `${y - 1}-12`
        : `${y}-${String(m - 1).padStart(2, '0')}`;
  const shown = runs.filter((r) => r.status !== 'cancelled');
  const cancelled = runs.length - shown.length;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="runs" />
      {can(role, 'payroll.manage') && (
        <Card title={tr('new')}>
          <NewRunForm groups={groups} month={month} />
        </Card>
      )}
      <Card title={tr('title')}>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-500">{tr('none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{tr('period')}</th>
                  <th className="px-5 py-2 font-medium">{tr('group')}</th>
                  <th className="px-5 py-2 font-medium">{tr('status')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tr('headcount')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tr('totals.net')}</th>
                  <th className="px-5 py-2 font-medium">{tr('paymentDate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/workspace/payroll/runs/${r.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {runPeriod(format, r.periodStart, r.periodEnd)}
                      </Link>
                      {r.kind === 'adjustment' && (
                        <span className="ml-2">
                          <Badge tone="violet">{tr('kinds.adjustment')}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">{r.payGroup.name}</td>
                    <td className="px-5 py-2.5">
                      <span className="flex flex-wrap gap-1.5">
                        <RunStatusBadge status={r.status} />
                        {r.publishedAt && <Badge tone="green">{tr('published')}</Badge>}
                        {r.errors > 0 && (
                          <Badge tone="red">{tr('errors', { count: r.errors })}</Badge>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {format.number(r.headcount)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {r.totals ? taka(format, r.totals.net) : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">
                      {day(format, r.paymentDate)}
                      {r.paymentDate > r.paymentDue && (
                        <span className="ml-1 text-xs text-red-600">{tr('afterDeadline')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cancelled > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {tr('cancelledCount', { count: cancelled })}
          </p>
        )}
      </Card>
    </>
  );
}
