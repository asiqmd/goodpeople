import { can, todayIn, type GroupDashboardView, type GroupFigures } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GroupTabs } from '@/components/group/group-tabs';
import { HeadcountTrend } from '@/components/group/headcount-trend';
import { buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';
import { MONTH, shiftMonth } from '@/lib/month';

const FIGURES = [
  'headcount',
  'joiners',
  'leavers',
  'attrition',
  'women',
  'service',
  'overtime',
  'absence',
  'alerts',
] as const;
type Figure = (typeof FIGURES)[number] | 'payrollCost';

const or = (v: number | null, show: (v: number) => string) => (v === null ? '—' : show(v));
const link = (month: string) => `/workspace/group?month=${month}`;

export default async function GroupDashboardPage({ searchParams }: PageProps<'/workspace/group'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'employees.read')) redirect('/workspace');
  const t = await getTranslations('group');
  const format = await getFormatter();
  const thisMonth = todayIn().slice(0, 7);
  const asked = (await searchParams).month;
  const month =
    typeof asked === 'string' && MONTH.test(asked) && asked <= thisMonth ? asked : thisMonth;
  const result = await authedFetch<GroupDashboardView>(
    'tenant',
    `/tenant/group/dashboard?month=${month}`,
  );
  const header = (
    <div>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">{t('intro')}</p>
    </div>
  );
  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <p className="text-sm text-slate-600">
            {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
          </p>
        </Card>
      </>
    );
  }
  const view = result.data;
  const n = (v: number) => format.number(v);
  const monthName = (m: string) =>
    format.dateTime(new Date(`${m}-01T00:00:00Z`), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const value = (f: GroupFigures, figure: Figure): string => {
    switch (figure) {
      case 'headcount':
      case 'joiners':
      case 'leavers':
        return n(f[figure]);
      case 'attrition':
        return or(f.attritionPercent, (v) => t('dashboard.percent', { value: v }));
      case 'women':
        return or(f.womenPercent, (v) => t('dashboard.percent', { value: v }));
      case 'service':
        return or(f.averageServiceYears, (v) => t('dashboard.years', { value: v }));
      case 'overtime':
        return t('dashboard.hours', { value: f.overtimeHours });
      case 'absence':
        return or(f.absencePercent, (v) => t('dashboard.percent', { value: v }));
      case 'alerts':
        return n(f.openAlerts);
      case 'payrollCost':
        return f.payrollCost
          ? `৳${format.number(Number(f.payrollCost.total), { maximumFractionDigits: 2 })}`
          : '—';
    }
  };
  const detail = (f: GroupFigures, figure: Figure) => {
    if (figure === 'absence') {
      return t('dashboard.absentOf', { absent: f.absentDays, working: f.workingDays });
    }
    if (figure === 'payrollCost' && f.payrollCost) {
      return t('dashboard.costParts', {
        gross: `৳${format.number(Number(f.payrollCost.gross), { maximumFractionDigits: 2 })}`,
        employer: `৳${format.number(Number(f.payrollCost.employerCost), { maximumFractionDigits: 2 })}`,
      });
    }
    return t(`dashboard.hints.${figure}`);
  };
  const figures: Figure[] = [
    ...FIGURES,
    ...(view.payrollVisible ? (['payrollCost'] as const) : []),
  ];

  return (
    <>
      {header}
      <GroupTabs active="dashboard" policies={can(role, 'org.manage')} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {t('dashboard.title', { month: monthName(month) })}
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={link(shiftMonth(month, -1))} className="text-slate-600 hover:text-slate-900">
            ← {monthName(shiftMonth(month, -1))}
          </Link>
          {month < thisMonth && (
            <Link href={link(shiftMonth(month, 1))} className="text-slate-600 hover:text-slate-900">
              {monthName(shiftMonth(month, 1))} →
            </Link>
          )}
          <form className="flex gap-2" action="/workspace/group">
            <input
              type="month"
              name="month"
              defaultValue={month}
              max={thisMonth}
              aria-label={t('dashboard.month')}
              className={`${inputClass} w-40`}
            />
            <button type="submit" className={buttonClass.secondary}>
              {t('dashboard.show')}
            </button>
          </form>
        </div>
      </div>

      {view.companies.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">{t('dashboard.noCompanies')}</p>
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {figures.map((figure) => (
              <li key={figure} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <span className="block text-xs text-slate-600">
                  {t(`dashboard.figures.${figure}`)}
                </span>
                <span className="mt-1 block text-2xl font-semibold tabular-nums">
                  {value(view.group, figure)}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {detail(view.group, figure)}
                </span>
              </li>
            ))}
          </ul>

          <Card title={t('dashboard.byCompany')}>
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-2 font-medium">
                      {t('dashboard.company')}
                    </th>
                    {figures.map((figure) => (
                      <th key={figure} scope="col" className="px-3 py-2 text-right font-medium">
                        {t(`dashboard.figures.${figure}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ...view.companies.map((c) => ({
                      key: c.legalEntity.id,
                      name: c.legalEntity.name,
                      f: c,
                    })),
                    { key: 'group', name: t('dashboard.groupRow'), f: view.group },
                  ].map(({ key, name, f }) => (
                    <tr key={key} className={key === 'group' ? 'bg-slate-50 font-semibold' : ''}>
                      <th scope="row" className="px-5 py-2 text-left font-medium">
                        {name}
                      </th>
                      {figures.map((figure) => (
                        <td key={figure} className="px-3 py-2 text-right tabular-nums">
                          {value(f, figure)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={t('dashboard.trend')}>
            <HeadcountTrend
              months={view.months}
              series={view.companies.map((c) => ({
                id: c.legalEntity.id,
                label: c.legalEntity.code ?? c.legalEntity.name,
                values: c.trend,
              }))}
            />
          </Card>
        </>
      )}
    </>
  );
}
