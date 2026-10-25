import { can, type AdolescentsView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hm } from '@/components/attendance/attendance-views';
import {
  CERTIFICATE_TONE,
  clockOf,
  ComplianceTabs,
  period,
  Section,
} from '@/components/compliance/compliance-views';
import { day } from '@/components/leave/leave-views';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function ComplianceAdolescentsPage() {
  if (!can((await currentTenantUser())?.role, 'compliance.manage')) redirect('/workspace');
  const t = await getTranslations('compliance');
  const format = await getFormatter();
  const view = await load<AdolescentsView>('tenant', '/tenant/compliance/adolescents');
  const { law } = view;
  const h = (minutes: number) => hm(format, minutes);

  const rules = [
    {
      label: t('adolescents.daily'),
      value: t('adolescents.byPlace', {
        factory: h(law.adolescentDaily.factory),
        other: h(law.adolescentDaily.other),
      }),
      reference: law.adolescentDaily.reference,
    },
    {
      label: t('adolescents.weekly'),
      value: t('adolescents.byPlace', {
        factory: h(law.adolescentWeekly.factory),
        other: h(law.adolescentWeekly.other),
      }),
      reference: law.adolescentWeekly.reference,
    },
    {
      label: t('adolescents.night'),
      value: t('adolescents.between', {
        from: clockOf(format, law.adolescentNight.from),
        to: clockOf(format, law.adolescentNight.to),
      }),
      reference: law.adolescentNight.reference,
    },
    {
      label: t('adolescents.certificate'),
      value: t('adolescents.months', { months: law.adolescentCertificate.months }),
      reference: law.adolescentCertificate.reference,
    },
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ComplianceTabs active="adolescents" />
      <Card title={t('adolescents.rulesTitle')}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rules.map((r) => (
            <div key={r.label}>
              <dt className="text-slate-500">{r.label}</dt>
              <dd>
                {r.value} <Section reference={r.reference} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">{t('adolescents.certificateHint')}</p>
      </Card>

      <Card
        title={t('adolescents.title', { period: period(format, view.weekStart, view.weekEnd) })}
      >
        {view.rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t('adolescents.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('adolescents.employee')}</th>
                  <th className="py-2 pr-3 font-medium">{t('adolescents.age')}</th>
                  <th className="py-2 pr-3 font-medium">{t('adolescents.workplace')}</th>
                  <th className="py-2 pr-3 font-medium">{t('adolescents.certificateColumn')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('adolescents.weekHours')}</th>
                  <th className="py-2 font-medium">{t('adolescents.alerts')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {view.rows.map((r) => (
                  <tr key={r.employee.id}>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/workspace/employees/${r.employee.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.employee.fullName}
                      </Link>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {r.employee.employeeCode}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {t('adolescents.ageValue', { age: r.age })}
                      <span className="block text-xs text-slate-500">
                        {t('adolescents.adultOn', { date: day(format, r.adultOn) })}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {r.location ?? '—'}
                      <span className="block text-xs text-slate-500">
                        {t(`adolescents.places.${r.workplace}`)}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={CERTIFICATE_TONE[r.certificate.state]}>
                        {t(`adolescents.states.${r.certificate.state}`)}
                      </Badge>
                      {r.certificate.validUntil && (
                        <span className="block text-xs text-slate-500">
                          {t('adolescents.validUntil', {
                            date: day(format, r.certificate.validUntil),
                          })}
                        </span>
                      )}
                      <Link
                        href={`/workspace/employees/${r.employee.id}?tab=documents`}
                        className="block text-xs font-medium text-brand-700 hover:underline"
                      >
                        {r.certificate.documentId
                          ? t('adolescents.openDocuments')
                          : t('adolescents.upload')}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <span
                        className={
                          r.weekWorkedMinutes > r.weekLimitMinutes
                            ? 'font-semibold text-red-700'
                            : ''
                        }
                      >
                        {h(r.weekWorkedMinutes)}
                      </span>{' '}
                      <span className="text-slate-500">/ {h(r.weekLimitMinutes)}</span>
                    </td>
                    <td className="py-2">
                      {r.openAlerts > 0 ? (
                        <Link
                          href={`/workspace/compliance/alerts?employee=${r.employee.id}&status=open`}
                          className="font-medium text-red-700 hover:underline"
                        >
                          {t('adolescents.openAlerts', { count: r.openAlerts })}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
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
