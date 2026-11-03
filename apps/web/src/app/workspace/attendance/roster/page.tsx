import {
  can,
  addDays,
  todayIn,
  type EmployeeListItem,
  type OrgSnapshot,
  type Page,
  type RosterView,
  type ShiftView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { SetupTabs } from '@/components/attendance/setup-tabs';
import { AssignShiftForm, RosterForm } from '@/components/attendance/setup-forms';
import { buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function RosterPage({
  searchParams,
}: PageProps<'/workspace/attendance/roster'>) {
  if (!can((await currentTenantUser())?.role, 'attendance.manage'))
    redirect('/workspace/attendance');
  const t = await getTranslations('attendance');
  const format = await getFormatter();
  const sp = await searchParams;
  const today = todayIn();
  const from = typeof sp.from === 'string' && DATE.test(sp.from) ? sp.from : today;
  const to = addDays(from, 13);
  const location = typeof sp.location === 'string' ? sp.location : '';
  const [shifts, employees, org, roster] = await Promise.all([
    load<ShiftView[]>('tenant', '/tenant/attendance/shifts'),
    load<Page<EmployeeListItem>>('tenant', '/tenant/employees?status=active&pageSize=100'),
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<RosterView>(
      'tenant',
      `/tenant/attendance/roster?from=${from}&to=${to}${location ? `&locationId=${location}` : ''}`,
    ),
  ]);
  const active = shifts.filter((s) => s.isActive);
  const dates = roster.rows[0]?.days.map((d) => d.date) ?? [];

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('setup.title')}</h1>
      <SetupTabs active="roster" />
      <Card title={t('setup.rosterTitle')}>
        <form className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="font-medium text-slate-800">{t('setup.from')}</span>
            <input type="date" name="from" defaultValue={from} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-800">{t('devices.location')}</span>
            <select name="location" defaultValue={location} className={`${inputClass} mt-1`}>
              <option value="">{t('team.allUnits')}</option>
              {org.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button className={buttonClass.secondary}>{t('team.show')}</button>
        </form>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white py-1 pe-3 text-start font-medium text-slate-500">
                  {t('team.employee')}
                </th>
                {dates.map((d) => (
                  <th key={d} className="px-1 py-1 text-center font-medium text-slate-500">
                    {format.dateTime(new Date(`${d}T00:00:00Z`), {
                      weekday: 'narrow',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.rows.map(({ employee, days }) => (
                <tr key={employee.id} className="border-t border-slate-100">
                  <td className="sticky left-0 whitespace-nowrap bg-white py-1 pe-3">
                    <span className="font-mono text-slate-400">{employee.employeeCode}</span>{' '}
                    {employee.fullName}
                  </td>
                  {days.map((d) => (
                    <td key={d.date} className="px-1 py-1 text-center">
                      <span
                        title={t(`setup.source.${d.source}`)}
                        className={`inline-block min-w-12 whitespace-nowrap rounded px-1 py-0.5 ${
                          d.dayType !== 'working'
                            ? 'bg-slate-100 text-slate-400'
                            : d.source === 'roster'
                              ? 'bg-violet-50 text-violet-700'
                              : 'bg-brand-50 text-brand-700'
                        }`}
                      >
                        {d.shift?.code ?? t(`dayTypeShort.${d.dayType}`)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('setup.rosterLegend')}</p>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('setup.assignTitle')}>
          <AssignShiftForm shifts={active} employees={employees.items} today={today} />
        </Card>
        <Card title={t('setup.patternTitle')}>
          <RosterForm shifts={active} employees={employees.items} from={from} to={to} />
        </Card>
      </div>
    </>
  );
}
