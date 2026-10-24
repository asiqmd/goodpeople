import {
  addDays,
  todayIn,
  type AttendanceSettingsView,
  type RuleView,
  type ShiftView,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { hm } from '@/components/attendance/attendance-views';
import { SetupTabs } from '@/components/attendance/setup-tabs';
import {
  AttendanceSettingsForm,
  ReprocessForm,
  ShiftForm,
} from '@/components/attendance/setup-forms';
import { day } from '@/components/leave/leave-views';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
import { isHrRole } from '@/lib/roles';

/** Rule values here are numbers or lists of rest intervals. */
const ruleValue = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((v: { overHours: number; minutes: number }) => `>${v.overHours}h: ${v.minutes}m`)
        .join(', ')
    : String(value);

export default async function AttendanceSettingsPage() {
  if (!isHrRole((await currentTenantUser())?.role)) redirect('/workspace/attendance');
  const t = await getTranslations('attendance');
  const format = await getFormatter();
  const locale = await getLocale();
  const today = todayIn();
  const [settings, shifts, rules] = await Promise.all([
    load<AttendanceSettingsView>('tenant', '/tenant/attendance/settings'),
    load<ShiftView[]>('tenant', '/tenant/attendance/shifts'),
    load<RuleView[]>('tenant', '/tenant/rules').catch(() => [] as RuleView[]),
  ]);
  const workRules = rules.filter((r) => r.key.startsWith('work.') && r.to === null);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('setup.title')}</h1>
      <SetupTabs active="settings" />
      <Card title={t('setup.settingsTitle')}>
        <AttendanceSettingsForm settings={settings} />
      </Card>

      <Card title={t('setup.shiftsTitle')}>
        <div className="space-y-3">
          {shifts.map((s) => (
            <details key={s.id} className="rounded-lg p-3 ring-1 ring-slate-200">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-slate-500">{s.code}</span>
                <span className="font-medium">
                  {locale === 'bn' && s.nameBn ? s.nameBn : s.name}
                </span>
                <span className="text-slate-600">
                  {s.startTime}–{s.endTime}
                  {s.spansMidnight && ` (${t('setup.overnight')})`}
                </span>
                <span className="text-xs text-slate-500">
                  {t('setup.workHours', { hours: hm(format, s.workMinutes) })}
                </span>
                {s.isDefault && <Badge tone="green">{t('setup.default')}</Badge>}
                {!s.isActive && <Badge tone="slate">{t('setup.inactive')}</Badge>}
              </summary>
              <div className="mt-4">
                <ShiftForm shift={s} />
              </div>
            </details>
          ))}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            {t('setup.newShift')}
          </summary>
          <div className="mt-4">
            <ShiftForm />
          </div>
        </details>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('setup.rulesTitle')}>
          <ul className="divide-y divide-slate-100 text-sm">
            {workRules.map((r) => (
              <li key={r.key} className="py-2">
                <div className="flex justify-between gap-3">
                  <span>{r.title}</span>
                  <span className="font-medium">{ruleValue(r.value)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {r.reference.act}, s.{r.reference.section}
                  {r.status === 'needs_review' && (
                    <>
                      {' '}
                      · <span className="text-amber-700">{t('setup.needsReview')}</span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t('setup.reprocessTitle')}>
          <p className="mb-3 text-sm text-slate-600">
            {t('setup.reprocessHint', { date: day(format, settings.trackingFrom) })}
          </p>
          <ReprocessForm from={addDays(today, -7)} to={today} />
        </Card>
      </div>
    </>
  );
}
