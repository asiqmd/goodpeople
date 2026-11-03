import {
  can,
  ATTENDANCE_STATUSES,
  addDays,
  todayIn,
  type OrgSnapshot,
  type TeamDayView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { clock, hm, StatusBadge } from '@/components/attendance/attendance-views';
import { day } from '@/components/leave/leave-views';
import { buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';
import { treeOrder } from '@/lib/org';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TeamAttendancePage({
  searchParams,
}: PageProps<'/workspace/attendance/team'>) {
  const t = await getTranslations('attendance');
  const format = await getFormatter();
  const sp = await searchParams;
  const today = todayIn();
  const date = typeof sp.date === 'string' && DATE.test(sp.date) ? sp.date : today;
  const unit = typeof sp.unit === 'string' ? sp.unit : '';
  const status = typeof sp.status === 'string' ? sp.status : '';
  const isHr = can((await currentTenantUser())?.role, 'employees.read');
  const query = new URLSearchParams({ date, ...(unit ? { orgUnitId: unit } : {}) });
  const result = await authedFetch<TeamDayView>('tenant', `/tenant/attendance/daily?${query}`);
  if (!result.ok) {
    return (
      <Card title={t('team.title')}>
        <p className="text-sm text-slate-600">
          {result.status === 404 ? t('my.noEmployee') : result.error.message}
        </p>
      </Card>
    );
  }
  const view = result.data;
  const org = isHr ? await load<OrgSnapshot>('tenant', '/tenant/org') : null;
  const rows = status ? view.rows.filter((r) => r.day.status === status) : view.rows;
  /** This page's link with some filters changed; an empty value drops the filter. */
  const link = (changes: Record<string, string>) => {
    const params = Object.entries({ date, unit, status, ...changes }).filter(([, v]) => v);
    return `/workspace/attendance/team?${new URLSearchParams(params)}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('team.title')}</h1>
        {isHr && (
          <Link
            href="/workspace/attendance/summary"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t('setup.tabs.summary')} →
          </Link>
        )}
      </div>
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('table.date')}</span>
          <input
            type="date"
            name="date"
            defaultValue={date}
            max={today}
            className={`${inputClass} mt-1`}
          />
        </label>
        {org && (
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
        )}
        <button className={buttonClass.secondary}>{t('team.show')}</button>
        <span className="flex gap-3 text-sm">
          <Link
            href={link({ date: addDays(date, -1) })}
            className="text-slate-600 hover:text-slate-900"
          >
            ← {day(format, addDays(date, -1))}
          </Link>
          {date < today && (
            <Link
              href={link({ date: addDays(date, 1) })}
              className="text-slate-600 hover:text-slate-900"
            >
              {day(format, addDays(date, 1))} →
            </Link>
          )}
        </span>
      </form>
      <div className="flex flex-wrap gap-2">
        <Link
          href={link({ status: '' })}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${status ? 'ring-slate-200 text-slate-600' : 'bg-slate-900 text-white ring-slate-900'}`}
        >
          {t('team.all', { count: format.number(view.rows.length) })}
        </Link>
        {ATTENDANCE_STATUSES.filter((s) => view.counts[s]).map((s) => (
          <Link
            key={s}
            href={link({ status: s })}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${status === s ? 'bg-slate-900 text-white ring-slate-900' : 'ring-slate-200 text-slate-600'}`}
          >
            {t(`status.${s}`)} · {format.number(view.counts[s]!)}
          </Link>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t('team.nobody')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-start text-xs text-slate-500">
                <tr>
                  <th className="py-2 pe-3 font-medium">{t('team.employee')}</th>
                  <th className="py-2 pe-3 font-medium">{t('table.status')}</th>
                  <th className="py-2 pe-3 font-medium">{t('table.shift')}</th>
                  <th className="py-2 pe-3 font-medium">{t('table.in')}</th>
                  <th className="py-2 pe-3 font-medium">{t('table.out')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('table.worked')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('table.overtime')}</th>
                  <th className="py-2 font-medium">{t('table.notes')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ employee, timeZone, day: d }) => (
                  <tr key={employee.id}>
                    <td className="py-2 pe-3">
                      {isHr ? (
                        <Link
                          href={`/workspace/employees/${employee.id}?tab=attendance`}
                          className="font-medium hover:underline"
                        >
                          {employee.fullName}
                        </Link>
                      ) : (
                        <span className="font-medium">{employee.fullName}</span>
                      )}{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {employee.employeeCode}
                      </span>
                    </td>
                    <td className="py-2 pe-3">
                      <StatusBadge day={d} />
                    </td>
                    <td className="py-2 pe-3 text-slate-600">
                      {d.dayType === 'working' ? d.shift?.code : ''}
                    </td>
                    <td className="py-2 pe-3">{clock(format, d.firstIn, timeZone)}</td>
                    <td className="py-2 pe-3">{clock(format, d.lastOut, timeZone)}</td>
                    <td className="py-2 pe-3 text-end tabular-nums">
                      {d.workedMinutes ? hm(format, d.workedMinutes) : ''}
                    </td>
                    <td className="py-2 pe-3 text-end tabular-nums">
                      {d.overtimeMinutes ? hm(format, d.overtimeMinutes) : ''}
                    </td>
                    <td className="py-2 text-xs text-slate-500">
                      {[
                        d.lateMinutes > 0 && t('late', { minutes: format.number(d.lateMinutes) }),
                        ...d.flags
                          .filter((f) => f !== 'late' && f !== 'early_out')
                          .map((f) => t(`flag.${f}`)),
                        d.leave?.code,
                        d.regularization && t(`correction.${d.regularization.status}`),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
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
