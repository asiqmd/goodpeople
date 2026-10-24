import {
  HR_ROLES,
  todayIn,
  type HolidayCalendarView,
  type HolidayYearView,
  type LeaveTypeView,
  type OrgSnapshot,
  type RuleView,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { makeDefaultCalendar, provisionLeaveDefaults } from '@/app/actions/leave';
import { day } from '@/components/leave/leave-views';
import {
  AddHolidayForm,
  HolidayActions,
  ImportHolidaysButton,
  LeaveTypeForm,
  LocationCalendarForm,
  NewCalendarForm,
  NewLeaveTypeForm,
} from '@/components/leave/settings-forms';
import { Badge, Banner, buttonClass, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const ruleValue = (value: unknown, yesNo: (v: boolean) => string) =>
  typeof value === 'boolean'
    ? yesNo(value)
    : typeof value === 'object' && value !== null
      ? Object.entries(value)
          .map(([k, v]) => `${k.replace('_', ' ')}: ${v}`)
          .join(', ')
      : String(value);

export default async function LeaveSettingsPage({
  searchParams,
}: PageProps<'/workspace/leave/settings'>) {
  const user = await currentTenantUser();
  if (!user || !(HR_ROLES as readonly string[]).includes(user.role)) redirect('/workspace');
  const sp = await searchParams;
  const thisYear = Number(todayIn().slice(0, 4));
  const year = Number(sp.year) >= 2020 && Number(sp.year) <= 2100 ? Number(sp.year) : thisYear;

  const [types, calendars, org, rules] = await Promise.all([
    load<LeaveTypeView[]>('tenant', '/tenant/leave/types'),
    load<HolidayCalendarView[]>('tenant', '/tenant/holiday-calendars'),
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<RuleView[]>('tenant', '/tenant/rules'),
  ]);
  const calendar =
    calendars.find((c) => c.id === sp.calendar) ??
    calendars.find((c) => c.isDefault) ??
    calendars[0];
  const holidayYear = calendar
    ? await load<HolidayYearView>(
        'tenant',
        `/tenant/holiday-calendars/${calendar.id}/holidays?year=${year}`,
      )
    : null;

  const t = await getTranslations('leave.settings');
  const tc = await getTranslations('common');
  const format = await getFormatter();
  const locale = await getLocale();
  const link = (params: Record<string, string | number>) =>
    `/workspace/leave/settings?${new URLSearchParams({ calendar: calendar?.id ?? '', year: String(year), ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })}`;
  const today = todayIn();
  const current = rules.filter((r) => r.from <= today && (r.to === null || r.to >= today));

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <Card
        title={t('types')}
        action={
          <form action={provisionLeaveDefaults}>
            <button className={buttonClass.secondary}>{t('provision')}</button>
          </form>
        }
      >
        <div className="divide-y divide-slate-100">
          {types.map((type) => (
            <details key={type.id} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <span className="text-sm font-medium">
                  <span className="mr-2 font-mono text-xs text-slate-400">{type.code}</span>
                  {locale === 'bn' && type.nameBn ? type.nameBn : type.name}
                </span>
                <span className="flex gap-2">
                  <Badge tone={type.statutoryKey ? 'violet' : 'slate'}>
                    {type.statutoryKey ? t('statutory') : t('custom')}
                  </Badge>
                  <Badge tone="slate">{t(`accruals.${type.accrual}`)}</Badge>
                  {!type.isActive && <Badge tone="amber">✕</Badge>}
                </span>
              </summary>
              <div className="mt-4">
                <LeaveTypeForm type={type} />
              </div>
            </details>
          ))}
        </div>
        <details className="mt-4 border-t border-slate-100 pt-4">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            {t('addType')}
          </summary>
          <div className="mt-4">
            <NewLeaveTypeForm />
          </div>
        </details>
      </Card>

      <Card title={t('calendars')}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {calendars.map((c) => (
            <Link
              key={c.id}
              href={link({ calendar: c.id })}
              className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${
                c.id === calendar?.id
                  ? 'bg-brand-50 font-medium text-brand-700 ring-brand-600/30'
                  : 'ring-slate-200'
              }`}
            >
              {c.name}
              {c.isDefault && <span className="ml-2 text-xs text-slate-500">({t('default')})</span>}
            </Link>
          ))}
        </div>
        {calendar && !calendar.isDefault && (
          <form action={makeDefaultCalendar.bind(null, calendar.id)} className="mb-4">
            <button className={buttonClass.ghost}>{t('makeDefault')}</button>
          </form>
        )}
        <NewCalendarForm />
      </Card>

      {calendar && holidayYear && (
        <Card
          title={t('holidays', { year })}
          action={
            <div className="flex gap-2 text-sm">
              {[thisYear, thisYear + 1].map((y) => (
                <Link
                  key={y}
                  href={link({ year: y })}
                  className={y === year ? 'font-semibold' : 'text-slate-500'}
                >
                  {y}
                </Link>
              ))}
            </div>
          }
        >
          <div className="mb-4">
            {holidayYear.festivalDays >= holidayYear.festivalDaysRequired ? (
              <Banner tone="green">
                {t('festivalOk', {
                  count: holidayYear.festivalDays,
                  required: holidayYear.festivalDaysRequired,
                })}
              </Banner>
            ) : (
              <Banner tone="amber">
                {t('festivalShort', {
                  count: holidayYear.festivalDays,
                  required: holidayYear.festivalDaysRequired,
                  act: holidayYear.festivalRule.reference.act,
                  section: holidayYear.festivalRule.reference.section,
                })}
              </Banner>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {holidayYear.holidays.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="flex items-center gap-3">
                  <span className="w-28 text-slate-600">{day(format, h.date)}</span>
                  <span>{locale === 'bn' && h.nameBn ? h.nameBn : h.name}</span>
                  <Badge tone={h.kind === 'festival' ? 'violet' : 'slate'}>
                    {t(`kinds.${h.kind}`)}
                  </Badge>
                  {h.isTentative && <Badge tone="amber">{t('tentative')}</Badge>}
                </span>
                <HolidayActions holiday={h} />
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
            <AddHolidayForm calendarId={calendar.id} />
            <ImportHolidaysButton calendarId={calendar.id} year={year} />
          </div>
        </Card>
      )}

      <Card title={t('locations')}>
        <div className="space-y-6">
          {org.locations
            .filter((l) => l.isActive)
            .map((l) => (
              <div key={l.id}>
                <p className="mb-2 text-sm font-medium">{l.name}</p>
                <LocationCalendarForm location={l} calendars={calendars} />
              </div>
            ))}
        </div>
      </Card>

      <Card title={t('rules')}>
        <ul className="divide-y divide-slate-100 text-sm">
          {current.map((r) => (
            <li key={r.key} className="flex flex-wrap items-start justify-between gap-3 py-2">
              <span>
                {r.title}
                <span className="block text-xs text-slate-500">
                  {r.reference.act}, s.{r.reference.section} ·{' '}
                  {t('since', { date: day(format, r.from) })}
                  {r.note && ` · ${r.note}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium">
                  {ruleValue(r.value, (v) => tc(v ? 'yes' : 'no'))}
                </span>
                <Badge tone={r.status === 'verified' ? 'green' : 'amber'}>
                  {r.status === 'verified' ? t('verified') : t('reviewNeeded')}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
