import { can, type NightWorkView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ConsentForm } from '@/components/compliance/compliance-forms';
import { clockOf, ComplianceTabs, Section } from '@/components/compliance/compliance-views';
import { day } from '@/components/leave/leave-views';
import { Badge, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function ComplianceNightWorkPage({
  searchParams,
}: PageProps<'/workspace/compliance/night-work'>) {
  if (!can((await currentTenantUser())?.role, 'compliance.manage')) redirect('/workspace');
  const t = await getTranslations('compliance');
  const format = await getFormatter();
  const sp = await searchParams;
  const search = typeof sp.search === 'string' ? sp.search.trim().slice(0, 100) : '';
  const view = await load<NightWorkView>(
    'tenant',
    `/tenant/compliance/night-work${search ? `?search=${encodeURIComponent(search)}` : ''}`,
  );
  const { womenNight } = view.law;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ComplianceTabs active="nightWork" />
      <Card title={t('nightWork.ruleTitle')}>
        <p className="text-sm text-slate-700">
          {t('nightWork.rule', {
            from: clockOf(format, womenNight.from),
            to: clockOf(format, womenNight.to),
          })}{' '}
          <Section reference={womenNight.reference} />
        </p>
        <p className="mt-2 text-xs text-slate-500">{t('nightWork.ruleHint')}</p>
      </Card>

      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('nightWork.search')}</span>
          <input
            name="search"
            defaultValue={search}
            placeholder={t('nightWork.searchPlaceholder')}
            className={`${inputClass} mt-1 w-72`}
          />
        </label>
        <button className={buttonClass.secondary}>{t('nightWork.find')}</button>
        {search && (
          <Link href="?" className="text-sm text-slate-600 hover:text-slate-900">
            {t('nightWork.showAll')}
          </Link>
        )}
      </form>

      <Card
        title={
          search ? t('nightWork.found') : t('nightWork.title', { date: day(format, view.since) })
        }
      >
        {view.rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            {search ? t('nightWork.noneFound') : t('nightWork.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('nightWork.employee')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('nightWork.nights')}</th>
                  <th className="py-2 pr-3 font-medium">{t('nightWork.lastNight')}</th>
                  <th className="py-2 pr-3 font-medium">{t('nightWork.alerts')}</th>
                  <th className="py-2 font-medium">{t('nightWork.consent')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {view.rows.map((r) => (
                  <tr key={r.employee.id}>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/workspace/employees/${r.employee.id}?tab=attendance`}
                        className="font-medium hover:underline"
                      >
                        {r.employee.fullName}
                      </Link>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {r.employee.employeeCode}
                      </span>
                      <span className="block text-xs text-slate-500">{r.location ?? '—'}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {format.number(r.nightDays)}
                    </td>
                    <td className="py-2 pr-3">{r.lastNight ? day(format, r.lastNight) : '—'}</td>
                    <td className="py-2 pr-3">
                      {r.openAlerts > 0 ? (
                        <Link
                          href={`/workspace/compliance/alerts?employee=${r.employee.id}&kind=women_night&status=open`}
                        >
                          <Badge tone="red">
                            {t('nightWork.openAlerts', { count: r.openAlerts })}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      {r.consentFrom ? (
                        <span className="mb-1 block text-xs text-slate-600">
                          {t('nightWork.consentSince', { date: day(format, r.consentFrom) })}
                        </span>
                      ) : (
                        <span className="mb-1 block text-xs text-slate-500">
                          {t('nightWork.noConsent')}
                        </span>
                      )}
                      <ConsentForm employeeId={r.employee.id} consentFrom={r.consentFrom} />
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
