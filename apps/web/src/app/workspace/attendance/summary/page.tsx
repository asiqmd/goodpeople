import { can, todayIn, type MonthSummaryView, type OrgSnapshot } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hm } from '@/components/attendance/attendance-views';
import { SetupTabs } from '@/components/attendance/setup-tabs';
import { Badge, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
import { MONTH, shiftMonth } from '@/lib/month';
import { treeOrder } from '@/lib/org';

export default async function AttendanceSummaryPage({
  searchParams,
}: PageProps<'/workspace/attendance/summary'>) {
  if (!can(await currentTenantUser(), 'attendance.manage')) redirect('/workspace/attendance');
  const t = await getTranslations('attendance');
  const format = await getFormatter();
  const sp = await searchParams;
  const thisMonth = todayIn().slice(0, 7);
  const month = typeof sp.month === 'string' && MONTH.test(sp.month) ? sp.month : thisMonth;
  const unit = typeof sp.unit === 'string' ? sp.unit : '';
  const [summary, org] = await Promise.all([
    load<MonthSummaryView>(
      'tenant',
      `/tenant/attendance/summary?month=${month}${unit ? `&orgUnitId=${unit}` : ''}`,
    ),
    load<OrgSnapshot>('tenant', '/tenant/org'),
  ]);
  const n = (v: number) => format.number(v);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('setup.title')}</h1>
      <SetupTabs active="summary" />
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('summary.month')}</span>
          <input
            type="month"
            name="month"
            defaultValue={month}
            max={thisMonth}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('team.unit')}</span>
          <select name="unit" defaultValue={unit} className={`${inputClass} mt-1`}>
            <option value="">{t('team.allUnits')}</option>
            {treeOrder(org.orgUnits).map(({ unit: u, depth }) => (
              <option key={u.id} value={u.id}>
                {' '.repeat(depth * 3)}
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass.secondary}>{t('team.show')}</button>
        <span className="flex gap-3 text-sm">
          <Link
            href={`?month=${shiftMonth(month, -1)}${unit ? `&unit=${unit}` : ''}`}
            className="text-slate-600 hover:text-slate-900"
          >
            ← {t('my.previous')}
          </Link>
          {month < thisMonth && (
            <Link
              href={`?month=${shiftMonth(month, 1)}${unit ? `&unit=${unit}` : ''}`}
              className="text-slate-600 hover:text-slate-900"
            >
              {t('my.next')} →
            </Link>
          )}
        </span>
      </form>
      <p className="text-xs text-slate-500">{t('summary.hint')}</p>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-xs text-slate-500">
              <tr>
                <th className="py-2 pe-3 font-medium">{t('team.employee')}</th>
                <th className="py-2 pe-3 text-end font-medium">{t('totals.present')}</th>
                <th className="py-2 pe-3 text-end font-medium">{t('totals.halfDay')}</th>
                <th className="py-2 pe-3 text-end font-medium">{t('totals.absent')}</th>
                <th className="py-2 pe-3 text-end font-medium">{t('totals.onLeave')}</th>
                <th className="py-2 pe-3 text-end font-medium">{t('totals.missingPunch')}</th>
                <th className="py-2 pe-3 text-end font-medium">{t('totals.late')}</th>
                <th className="py-2 pe-3 text-end font-medium">{t('totals.worked')}</th>
                <th className="py-2 pe-3 text-end font-medium">{t('totals.overtime')}</th>
                <th className="py-2 font-medium">{t('summary.limit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {summary.rows.map(({ employee, totals, weeksOverLimit }) => (
                <tr key={employee.id}>
                  <td className="py-2 pe-3">
                    <Link
                      href={`/workspace/employees/${employee.id}?tab=attendance`}
                      className="font-medium hover:underline"
                    >
                      {employee.fullName}
                    </Link>{' '}
                    <span className="font-mono text-xs text-slate-400">
                      {employee.employeeCode}
                    </span>
                  </td>
                  <td className="py-2 pe-3 text-end">{n(totals.present)}</td>
                  <td className="py-2 pe-3 text-end">{n(totals.halfDay)}</td>
                  <td className="py-2 pe-3 text-end">{n(totals.absent)}</td>
                  <td className="py-2 pe-3 text-end">{n(totals.onLeave)}</td>
                  <td className="py-2 pe-3 text-end">{n(totals.missingPunch)}</td>
                  <td className="py-2 pe-3 text-end">{n(totals.late)}</td>
                  <td className="py-2 pe-3 text-end">{hm(format, totals.workedMinutes)}</td>
                  <td className="py-2 pe-3 text-end">{hm(format, totals.overtimeMinutes)}</td>
                  <td className="py-2">
                    {weeksOverLimit > 0 && (
                      <Badge tone="red">{t('summary.weeksOver', { count: weeksOverLimit })}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
