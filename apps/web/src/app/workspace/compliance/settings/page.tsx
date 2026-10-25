import { can, type ComplianceSettingsView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { hm } from '@/components/attendance/attendance-views';
import { SettingsForm } from '@/components/compliance/compliance-forms';
import { clockOf, ComplianceTabs, Section } from '@/components/compliance/compliance-views';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function ComplianceSettingsPage() {
  if (!can((await currentTenantUser())?.role, 'compliance.manage')) redirect('/workspace');
  const t = await getTranslations('compliance');
  const format = await getFormatter();
  const settings = await load<ComplianceSettingsView>('tenant', '/tenant/compliance/settings');
  const { law } = settings;
  const h = (minutes: number) => hm(format, minutes);

  const limits = [
    {
      label: t('settings.law.adultDaily'),
      value: h(law.adultDaily.minutes),
      reference: law.adultDaily.reference,
    },
    {
      label: t('settings.law.adultWeekly'),
      value: h(law.adultWeekly.minutes),
      reference: law.adultWeekly.reference,
    },
    {
      label: t('settings.law.weeklyHoliday'),
      value: t('settings.law.days', { days: law.weeklyHoliday.days }),
      reference: law.weeklyHoliday.reference,
    },
    {
      label: t('settings.law.adolescentDaily'),
      value: t('adolescents.byPlace', {
        factory: h(law.adolescentDaily.factory),
        other: h(law.adolescentDaily.other),
      }),
      reference: law.adolescentDaily.reference,
    },
    {
      label: t('settings.law.adolescentWeekly'),
      value: t('adolescents.byPlace', {
        factory: h(law.adolescentWeekly.factory),
        other: h(law.adolescentWeekly.other),
      }),
      reference: law.adolescentWeekly.reference,
    },
    {
      label: t('settings.law.adolescentNight'),
      value: t('adolescents.between', {
        from: clockOf(format, law.adolescentNight.from),
        to: clockOf(format, law.adolescentNight.to),
      }),
      reference: law.adolescentNight.reference,
    },
    {
      label: t('settings.law.womenNight'),
      value: t('adolescents.between', {
        from: clockOf(format, law.womenNight.from),
        to: clockOf(format, law.womenNight.to),
      }),
      reference: law.womenNight.reference,
    },
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ComplianceTabs active="settings" />
      <Card title={t('settings.title')}>
        <p className="mb-4 max-w-3xl text-sm text-slate-600">{t('settings.intro')}</p>
        <SettingsForm settings={settings} />
      </Card>
      <Card title={t('settings.law.title')}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {limits.map((l) => (
            <div key={l.label}>
              <dt className="text-slate-500">{l.label}</dt>
              <dd>
                {l.value} <Section reference={l.reference} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">{t('settings.law.paid')}</p>
      </Card>
    </>
  );
}
