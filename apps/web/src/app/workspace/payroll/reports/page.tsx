import {
  addDays,
  can,
  COST_DIMENSIONS,
  fiscalYearOf,
  todayIn,
  type CostDimension,
  type CostSummary,
  type CostSummaryRow,
  type CostTrendPoint,
  type TenantAccessView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CostTrendChart } from '@/components/payroll/report-forms';
import { PayrollTabs, taka } from '@/components/payroll/payroll-views';
import { Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const isMonth = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export default async function ReportsPage({
  searchParams,
}: PageProps<'/workspace/payroll/reports'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const t = await getTranslations('payroll');
  const tr = await getTranslations('payroll.reports');
  const format = await getFormatter();
  const query = await searchParams;
  // By default the last month that has ended.
  const month = isMonth(query.month)
    ? query.month
    : addDays(`${todayIn().slice(0, 7)}-01`, -1).slice(0, 7);
  // Salaries split by project only where the plan has projects.
  const { access } = await load<TenantAccessView>('tenant', '/tenant/access');
  const dimensions = COST_DIMENSIONS.filter(
    (d) => d !== 'project' || access.features.includes('projects'),
  );
  const by: CostDimension = (dimensions as readonly string[]).includes(query.by as string)
    ? (query.by as CostDimension)
    : 'unit';
  const [summary, trend] = await Promise.all([
    load<CostSummary>('tenant', `/tenant/payroll/reports/summary?month=${month}&by=${by}`),
    load<CostTrendPoint[]>('tenant', `/tenant/payroll/reports/trend?to=${month}&months=12`),
  ]);
  const fiscalYear = fiscalYearOf(`${month}-01`);
  const change = (row: CostSummaryRow) => {
    if (!row.previousCost || Number(row.previousCost) === 0) return '—';
    const pct = ((Number(row.cost) - Number(row.previousCost)) / Number(row.previousCost)) * 100;
    return `${pct > 0 ? '+' : ''}${format.number(pct, { maximumFractionDigits: 1 })}%`;
  };
  const cells = (row: CostSummaryRow, strong = false) => (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{format.number(row.headcount)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{taka(format, row.gross)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {taka(format, row.overtime)}
        {row.otHours > 0 && (
          <span className="block text-xs text-slate-500">
            {tr('hours', { hours: format.number(row.otHours) })}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{taka(format, row.earnings)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{taka(format, row.deductions)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{taka(format, row.net)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{taka(format, row.employerCost)}</td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${strong ? 'font-semibold' : 'font-medium'}`}
      >
        {taka(format, row.cost)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{change(row)}</td>
    </>
  );

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="reports" />
      <Card
        title={tr('summaryTitle', {
          month: format.dateTime(new Date(`${month}-01T00:00:00Z`), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
        })}
        action={
          <form className="flex gap-2" action="/workspace/payroll/reports">
            <input type="hidden" name="by" value={by} />
            <input
              type="month"
              name="month"
              defaultValue={month}
              aria-label={tr('month')}
              className={`${inputClass} w-40`}
            />
            <button type="submit" className={buttonClass.secondary}>
              {tr('show')}
            </button>
          </form>
        }
      >
        <nav className="mb-4 flex flex-wrap gap-2 text-sm">
          {dimensions.map((d) => (
            <Link
              key={d}
              href={`/workspace/payroll/reports?month=${month}&by=${d}`}
              aria-current={d === by ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                d === by
                  ? 'bg-slate-100 ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tr(`by.${d}`)}
            </Link>
          ))}
        </nav>
        {summary.unlocked > 0 && (
          <div className="mb-4">
            <Banner tone="amber">{tr('unlocked', { count: summary.unlocked })}</Banner>
          </div>
        )}
        {summary.rows.length === 0 ? (
          <p className="text-sm text-slate-500">{tr('none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{tr(`by.${by}`)}</th>
                  {(
                    [
                      'people',
                      'gross',
                      'overtime',
                      'earnings',
                      'deductions',
                      'net',
                      'employerCost',
                      'cost',
                      'change',
                    ] as const
                  ).map((k) => (
                    <th key={k} className="px-3 py-2 text-right font-medium">
                      {tr(`columns.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.rows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-5 py-2">
                      {by === 'project' && row.key === 'none' ? tr('noProject') : row.label}
                    </td>
                    {cells(row)}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 font-semibold">
                <tr>
                  <td className="px-5 py-2">{tr('total')}</td>
                  {cells(summary.total, true)}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card title={tr('trendTitle')}>
        <CostTrendChart points={trend} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-brand-700">
            {tr('trendTable')}
          </summary>
          <table className="mt-2 w-full max-w-xl">
            <tbody className="divide-y divide-slate-100">
              {trend.map((p) => (
                <tr key={p.month}>
                  <td className="py-1 text-slate-600">
                    {format.dateTime(new Date(`${p.month}-01T00:00:00Z`), {
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td className="py-1 text-right tabular-nums">{format.number(p.headcount)}</td>
                  <td className="py-1 text-right tabular-nums">{taka(format, p.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card title={tr('downloadsTitle', { year: fiscalYear })}>
        <ul className="space-y-2 text-sm">
          <li>
            <a
              href={`/workspace/files/tax-register?fiscalYear=${fiscalYear}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {tr('downloads.tax')}
            </a>
          </li>
          <li className="flex flex-wrap gap-3">
            <span>{tr('downloads.quarters')}</span>
            {[1, 2, 3, 4].map((q) => (
              <a
                key={q}
                href={`/workspace/files/tax-quarter?fiscalYear=${fiscalYear}&quarter=${q}`}
                className="font-medium text-brand-700 hover:underline"
              >
                {tr('downloads.quarter', { quarter: q })}
              </a>
            ))}
          </li>
          <li>
            <a
              href={`/workspace/files/advances-register?fiscalYear=${fiscalYear}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {tr('downloads.advances')}
            </a>
          </li>
          <li>
            <a
              href={`/workspace/files/pf-register?fiscalYear=${fiscalYear}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {tr('downloads.pf')}
            </a>
          </li>
          <li>
            <Link
              href="/workspace/payroll/gratuity"
              className="font-medium text-brand-700 hover:underline"
            >
              {tr('downloads.gratuity')}
            </Link>
          </li>
          <li className="text-slate-600">{tr('downloads.perRun')}</li>
          <li className="text-slate-600">{tr('downloads.retention')}</li>
        </ul>
      </Card>
    </>
  );
}
