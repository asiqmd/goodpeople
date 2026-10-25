import { can, todayIn, type PayGroupView, type WppfYearView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { WppfRunForm, WppfYearForm } from '@/components/payroll/benefit-forms';
import { PayrollTabs, RunStatusBadge, taka } from '@/components/payroll/payroll-views';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

/** The last July-to-June year that has ended, the usual accounting year in Bangladesh. */
function lastYear(today: string) {
  const year = Number(today.slice(0, 4));
  const end = today >= `${year}-07-01` ? year : year - 1;
  return {
    start: `${end - 1}-07-01`,
    end: `${end}-06-30`,
    year: `${end - 1}-${String(end).slice(2)}`,
  };
}

const AMOUNTS = [
  'netProfit',
  'fund',
  'participation',
  'welfare',
  'foundation',
  'cash',
  'invested',
] as const;

export default async function WppfPage() {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const canManage = can(role, 'payroll.manage');
  const t = await getTranslations('payroll');
  const tw = await getTranslations('payroll.wppf');
  const format = await getFormatter();
  const [years, groups] = await Promise.all([
    load<WppfYearView[]>('tenant', '/tenant/payroll/wppf'),
    load<PayGroupView[]>('tenant', '/tenant/payroll/pay-groups'),
  ]);
  const today = todayIn();
  const active = groups.filter((g) => g.isActive);
  const suggested = lastYear(today);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="wppf" />
      <p className="text-sm text-slate-600">{tw('intro')}</p>
      {canManage && (
        <Card title={tw('createTitle')}>
          <WppfYearForm
            suggested={
              years.some((y) => y.accountingYear === suggested.year)
                ? { start: '', end: '', year: '' }
                : suggested
            }
          />
        </Card>
      )}
      {years.length === 0 && <p className="text-sm text-slate-500">{tw('none')}</p>}
      {years.toReversed().map((y) => {
        const open = active.filter((g) => !y.runs.some((r) => r.payGroupId === g.id));
        return (
          <Card
            key={y.id}
            title={tw('yearTitle', { year: y.accountingYear })}
            action={
              <span className="text-sm text-slate-500">
                {day(format, y.yearStart)} – {day(format, y.yearEnd)}
              </span>
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <table className="w-full max-w-md text-sm">
                <tbody className="divide-y divide-slate-200/70">
                  {AMOUNTS.map((key) => (
                    <tr key={key} className={key === 'cash' ? 'font-semibold' : undefined}>
                      <td className="py-1 text-slate-600">{tw(`amounts.${key}`)}</td>
                      <td className="py-1 text-right tabular-nums">
                        {taka(format, y.amounts[key])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-3 text-sm">
                <p>
                  {tw('beneficiaries', {
                    count: y.beneficiaries,
                    months: y.minServiceMonths,
                  })}
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {tw('share', { amount: taka(format, y.share) })}
                </p>
                <p className="text-xs text-slate-500">{tw('taxNote')}</p>
                {y.runs.length > 0 && (
                  <ul className="space-y-1">
                    {y.runs.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/workspace/payroll/runs/${r.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {r.payGroup}
                        </Link>
                        <RunStatusBadge status={r.status} />
                        <span className="text-slate-500">
                          {tw('headcount', { count: r.headcount })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && open.length > 0 && (
                  <WppfRunForm
                    yearId={y.id}
                    groups={open}
                    today={today > y.yearEnd ? today : y.yearEnd}
                  />
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </>
  );
}
