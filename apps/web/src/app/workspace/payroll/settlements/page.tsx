import { can, type SettlementCase } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { OpenSettlementButton } from '@/components/payroll/benefit-forms';
import { PayrollTabs, RunStatusBadge, taka } from '@/components/payroll/payroll-views';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function SettlementsPage() {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const canManage = can(role, 'payroll.manage');
  const t = await getTranslations('payroll');
  const ts = await getTranslations('payroll.settlements');
  const tl = await getTranslations('lifecycle');
  const format = await getFormatter();
  const cases = await load<SettlementCase[]>('tenant', '/tenant/payroll/settlements');

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="settlements" />
      <p className="text-sm text-slate-600">{ts('intro')}</p>
      <Card title={ts('title')}>
        {cases.length === 0 ? (
          <p className="text-sm text-slate-500">{ts('none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{ts('person')}</th>
                  <th className="px-5 py-2 font-medium">{ts('type')}</th>
                  <th className="px-5 py-2 font-medium">{ts('lastDay')}</th>
                  <th className="px-5 py-2 font-medium">{ts('settlement')}</th>
                  <th className="px-5 py-2 text-right font-medium">{ts('net')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.separationId}>
                    <td className="px-5 py-2.5">
                      <span className="font-medium">{c.employee.fullName}</span>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {c.employee.employeeCode}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">
                      {tl.has(`separation.types.${c.type}`)
                        ? tl(`separation.types.${c.type}`)
                        : c.type}
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">{day(format, c.lastWorkingDay)}</td>
                    <td className="px-5 py-2.5">
                      {c.run ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/workspace/payroll/runs/${c.run.id}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {ts('view')}
                          </Link>
                          <RunStatusBadge status={c.run.status} />
                          {c.run.paidOn && (
                            <Badge tone="green">
                              {ts('paid', { date: day(format, c.run.paidOn) })}
                            </Badge>
                          )}
                        </span>
                      ) : canManage ? (
                        <OpenSettlementButton separationId={c.separationId} />
                      ) : (
                        <span className="text-slate-500">{ts('notOpened')}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {c.run?.net ? taka(format, c.run.net) : '—'}
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
