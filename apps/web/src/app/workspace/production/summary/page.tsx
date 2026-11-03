import { can, todayIn, type OrgSnapshot, type ProductionSummaryView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { localName, personName, taka } from '@/components/production/labels';
import { ProductionTabs } from '@/components/production/production-tabs';
import { buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
import { MONTH, shiftMonth } from '@/lib/month';
import { treeOrder } from '@/lib/org';

export default async function ProductionSummaryPage({
  searchParams,
}: PageProps<'/workspace/production/summary'>) {
  if (!can((await currentTenantUser())?.role, 'production.manage')) redirect('/workspace');
  const t = await getTranslations('production.summary');
  const format = await getFormatter();
  const locale = await getLocale();
  const sp = await searchParams;
  const thisMonth = todayIn().slice(0, 7);
  const month = typeof sp.month === 'string' && MONTH.test(sp.month) ? sp.month : thisMonth;
  const unit = typeof sp.unit === 'string' ? sp.unit : '';
  const scope = `month=${month}${unit ? `&orgUnitId=${unit}` : ''}`;
  const [summary, org] = await Promise.all([
    load<ProductionSummaryView>('tenant', `/tenant/production/summary?${scope}`),
    load<OrgSnapshot>('tenant', '/tenant/org'),
  ]);
  const n = (v: number) => format.number(v);
  const unitQuery = unit ? `&unit=${unit}` : '';
  const csvLink = (by: string) => (
    <a
      href={`/workspace/files/production/summary?${scope}&by=${by}`}
      className="text-sm font-medium text-brand-700 hover:underline"
    >
      {t('csv')}
    </a>
  );
  const amounts = (row: { pieces: number; pieceEarnings: string; incentive: string }) => (
    <>
      <td className="py-2 pe-3 text-end tabular-nums">{n(row.pieces)}</td>
      <td className="py-2 pe-3 text-end tabular-nums">{taka(format, row.pieceEarnings)}</td>
      <td className="py-2 pe-3 text-end tabular-nums">{taka(format, row.incentive)}</td>
    </>
  );
  const amountHeads = (
    <>
      <th className="py-2 pe-3 text-end font-medium">{t('pieces')}</th>
      <th className="py-2 pe-3 text-end font-medium">{t('pieceEarnings')}</th>
      <th className="py-2 pe-3 text-end font-medium">{t('incentive')}</th>
    </>
  );

  return (
    <>
      <ProductionTabs active="summary" />
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('month')}</span>
          <input
            type="month"
            name="month"
            defaultValue={month}
            max={thisMonth}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('unit')}</span>
          <select name="unit" defaultValue={unit} className={`${inputClass} mt-1`}>
            <option value="">{t('allUnits')}</option>
            {treeOrder(org.orgUnits).map(({ unit: u, depth }) => (
              <option key={u.id} value={u.id}>
                {' '.repeat(depth * 3)}
                {localName(u, locale)}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass.secondary}>{t('show')}</button>
        <span className="flex gap-3 text-sm">
          <Link
            href={`?month=${shiftMonth(month, -1)}${unitQuery}`}
            className="text-slate-600 hover:text-slate-900"
          >
            ← {t('previous')}
          </Link>
          {month < thisMonth && (
            <Link
              href={`?month=${shiftMonth(month, 1)}${unitQuery}`}
              className="text-slate-600 hover:text-slate-900"
            >
              {t('next')} →
            </Link>
          )}
        </span>
      </form>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-slate-500">{t('pieces')}</p>
          <p className="text-2xl font-semibold tabular-nums">{n(summary.totals.pieces)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('pieceEarnings')}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {taka(format, summary.totals.pieceEarnings)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('incentive')}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {taka(format, summary.totals.incentive)}
          </p>
        </Card>
      </div>
      {summary.workers.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">{t('none')}</p>
        </Card>
      ) : (
        <>
          <Card title={t('byLine')} action={csvLink('line')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-slate-500">
                  <tr>
                    <th className="py-2 pe-3 font-medium">{t('line')}</th>
                    <th className="py-2 pe-3 text-end font-medium">{t('workers')}</th>
                    {amountHeads}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.lines.map((l) => (
                    <tr key={l.orgUnit?.id ?? 'none'}>
                      <td className="py-2 pe-3">
                        {l.orgUnit ? localName(l.orgUnit, locale) : t('noLine')}
                      </td>
                      <td className="py-2 pe-3 text-end tabular-nums">{n(l.workers)}</td>
                      {amounts(l)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={t('byWorker')} action={csvLink('worker')}>
            <p className="mb-3 text-xs text-slate-500">{t('workerNote')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-slate-500">
                  <tr>
                    <th className="py-2 pe-3 font-medium">{t('worker')}</th>
                    <th className="py-2 pe-3 font-medium">{t('line')}</th>
                    <th className="py-2 pe-3 text-end font-medium">{t('days')}</th>
                    {amountHeads}
                    <th className="py-2 pe-3 text-end font-medium">{t('averageDaily')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.workers.map((w) => (
                    <tr key={w.employee.id}>
                      <td className="py-2 pe-3">
                        <Link
                          href={`/workspace/employees/${w.employee.id}`}
                          className="font-medium hover:underline"
                        >
                          {personName(w.employee, locale)}
                        </Link>{' '}
                        <span className="font-mono text-xs text-slate-400">
                          {w.employee.employeeCode}
                        </span>
                      </td>
                      <td className="py-2 pe-3 text-slate-600">
                        {w.orgUnit ? localName(w.orgUnit, locale) : ''}
                      </td>
                      <td className="py-2 pe-3 text-end tabular-nums">{n(w.days)}</td>
                      {amounts(w)}
                      <td className="py-2 pe-3 text-end tabular-nums">
                        {taka(format, w.averageDaily)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">{t('averageNote')}</p>
          </Card>
          <Card title={t('byDay')} action={csvLink('day')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-slate-500">
                  <tr>
                    <th className="py-2 pe-3 font-medium">{t('date')}</th>
                    <th className="py-2 pe-3 text-end font-medium">{t('workers')}</th>
                    {amountHeads}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.days.map((d) => (
                    <tr key={d.date}>
                      <td className="py-2 pe-3">{day(format, d.date)}</td>
                      <td className="py-2 pe-3 text-end tabular-nums">{n(d.workers)}</td>
                      {amounts(d)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
