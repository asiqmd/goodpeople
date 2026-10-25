import { can, type ParallelRunsView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PayrollTabs } from '@/components/payroll/payroll-views';
import { Badge, Banner, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const TONE = { draft: 'slate', matched: 'green', differences: 'amber' } as const;

export default async function ParallelRunsPage() {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const t = await getTranslations('payroll');
  const tp = await getTranslations('payroll.parallel');
  const tr = await getTranslations('payroll.reconcile');
  const format = await getFormatter();
  const view = await load<ParallelRunsView>('tenant', '/tenant/payroll/parallel-runs');
  const monthName = (period: string) =>
    format.dateTime(new Date(`${period}-01T00:00:00Z`), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const ready = view.consecutive >= view.required;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="parallel" />
      <p className="text-sm text-slate-600">{tp('intro')}</p>
      <Banner tone={ready ? 'green' : 'slate'}>
        {ready
          ? tp('ready', { required: view.required })
          : tp('progress', { done: view.consecutive, required: view.required })}
      </Banner>
      <Card title={tp('title')}>
        {view.months.length === 0 ? (
          <p className="text-sm text-slate-500">{tp('none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{tp('month')}</th>
                  <th className="px-5 py-2 font-medium">{tp('payGroup')}</th>
                  <th className="px-5 py-2 font-medium">{tp('result')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view.months.map((m) => (
                  <tr key={m.runId}>
                    <td className="px-5 py-2.5">{monthName(m.period)}</td>
                    <td className="px-5 py-2.5 text-slate-700">{m.payGroup}</td>
                    <td className="px-5 py-2.5">
                      {m.reconciliationId && m.status ? (
                        <Link
                          href={`/workspace/payroll/reconciliations/${m.reconciliationId}`}
                          className="inline-flex items-center gap-2 hover:underline"
                        >
                          <Badge tone={TONE[m.status]}>{tr(`statuses.${m.status}`)}</Badge>
                        </Link>
                      ) : (
                        <Link
                          href={`/workspace/payroll/runs/${m.runId}#compare`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {tp('compare')}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
