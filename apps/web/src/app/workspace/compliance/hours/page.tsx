import { addDays, can, todayIn, type HoursBoardView, type OrgSnapshot } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hm } from '@/components/attendance/attendance-views';
import {
  ComplianceTabs,
  LEVEL_TONE,
  period,
  Section,
} from '@/components/compliance/compliance-views';
import { Badge, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
import { treeOrder } from '@/lib/org';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ComplianceHoursPage({
  searchParams,
}: PageProps<'/workspace/compliance/hours'>) {
  if (!can((await currentTenantUser())?.role, 'compliance.manage')) redirect('/workspace');
  const t = await getTranslations('compliance');
  const format = await getFormatter();
  const sp = await searchParams;
  const today = todayIn();
  const week = typeof sp.week === 'string' && DATE.test(sp.week) ? sp.week : today;
  const unit = typeof sp.unit === 'string' ? sp.unit : '';
  const [board, org] = await Promise.all([
    load<HoursBoardView>(
      'tenant',
      `/tenant/compliance/hours?week=${week}${unit ? `&orgUnitId=${unit}` : ''}`,
    ),
    load<OrgSnapshot>('tenant', '/tenant/org'),
  ]);
  const { law, caps } = board;
  const h = (minutes: number) => hm(format, minutes);
  const weekLink = (date: string) => `?week=${date}${unit ? `&unit=${unit}` : ''}`;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ComplianceTabs active="hours" />
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('hours.week')}</span>
          <input
            type="date"
            name="week"
            defaultValue={board.weekStart}
            max={today}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('hours.unit')}</span>
          <select name="unit" defaultValue={unit} className={`${inputClass} mt-1`}>
            <option value="">{t('hours.allUnits')}</option>
            {treeOrder(org.orgUnits).map(({ unit: u, depth }) => (
              <option key={u.id} value={u.id}>
                {' '.repeat(depth * 3)}
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass.secondary}>{t('hours.show')}</button>
        <span className="flex gap-3 text-sm">
          <Link
            href={weekLink(addDays(board.weekStart, -7))}
            className="text-slate-600 hover:text-slate-900"
          >
            ← {t('hours.previous')}
          </Link>
          {board.weekEnd < today && (
            <Link
              href={weekLink(addDays(board.weekStart, 7))}
              className="text-slate-600 hover:text-slate-900"
            >
              {t('hours.next')} →
            </Link>
          )}
        </span>
      </form>

      <Card title={t('hours.title', { period: period(format, board.weekStart, board.weekEnd) })}>
        <dl className="mb-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-slate-500">{t('hours.lawAdult')}</dt>
            <dd>
              {t('hours.perDayWeek', {
                day: h(law.adultDaily.minutes),
                week: h(law.adultWeekly.minutes),
              })}{' '}
              <Section reference={law.adultDaily.reference} />{' '}
              <Section reference={law.adultWeekly.reference} />
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-slate-500">{t('hours.lawAdolescent')}</dt>
            <dd>
              {t('hours.perDayWeek', {
                day: h(law.adolescentDaily.factory),
                week: h(law.adolescentWeekly.factory),
              })}{' '}
              <Section reference={law.adolescentWeekly.reference} />
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-slate-500">{t('hours.caps')}</dt>
            <dd>
              {t('hours.perDayWeek', { day: h(caps.daily), week: h(caps.weekly) })}
              {caps.monthly !== null && <> · {t('hours.perMonth', { month: h(caps.monthly) })}</>}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-slate-500">{t('hours.warnAt')}</dt>
            <dd>{t('hours.percent', { percent: board.warnAtPercent })}</dd>
          </div>
        </dl>
        <p className="mb-4 text-xs text-slate-500">{t('hours.oneSource')}</p>
        {board.rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t('hours.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-start text-xs text-slate-500">
                <tr>
                  <th className="py-2 pe-3 font-medium">{t('hours.employee')}</th>
                  <th className="py-2 pe-3 font-medium">{t('hours.unitColumn')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('hours.days')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('hours.worked')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('hours.limit')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('hours.longest')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('hours.overtime')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('hours.monthOvertime')}</th>
                  <th className="py-2 font-medium">{t('hours.level')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {board.rows.map((r) => (
                  <tr key={r.employee.id}>
                    <td className="py-2 pe-3">
                      <Link
                        href={`/workspace/employees/${r.employee.id}?tab=attendance`}
                        className="font-medium hover:underline"
                      >
                        {r.employee.fullName}
                      </Link>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {r.employee.employeeCode}
                      </span>
                      {r.adolescent && (
                        <span className="ms-2">
                          <Badge tone="violet">{t('hours.adolescent')}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2 pe-3">{r.orgUnit ?? '—'}</td>
                    <td className="py-2 pe-3 text-end">{format.number(r.daysWorked)}</td>
                    <td className="py-2 pe-3 text-end">{h(r.workedMinutes)}</td>
                    <td className="py-2 pe-3 text-end text-slate-500">{h(r.weeklyLimitMinutes)}</td>
                    <td className="py-2 pe-3 text-end">{h(r.longestDayMinutes)}</td>
                    <td className="py-2 pe-3 text-end">{h(r.overtimeMinutes)}</td>
                    <td className="py-2 pe-3 text-end">{h(r.monthOvertimeMinutes)}</td>
                    <td className="py-2">
                      <Badge tone={LEVEL_TONE[r.level]}>
                        {t(`hours.levels.${r.level}`, { percent: r.percent })}
                      </Badge>
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
