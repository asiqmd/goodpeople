import type { AnalyticsCatalog, WorkforceView, WorkforceMetric } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Banner, Card } from '@/components/ui';
import { AnalyticsFilters } from '@/components/analytics/analytics-filters';
import { authedFetch } from '@/lib/api';

export default async function AnalyticsPage({ searchParams }: PageProps<'/workspace/analytics'>) {
  const t = await getTranslations('analytics');
  const format = await getFormatter();
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const v of value) query.append(key, v);
    else if (value) query.append(key, value);
  }
  const catalog = await authedFetch<AnalyticsCatalog>('tenant', '/tenant/analytics/catalog');
  const header = (
    <div>
      <p className="text-sm text-emerald-700">{t('eyebrow')}</p>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">{t('intro')}</p>
    </div>
  );
  if (!catalog.ok)
    return (
      <>
        {header}
        <Card>
          <p>{t(catalog.error.code === 'feature_not_in_plan' ? 'notEnabled' : 'notAllowed')}</p>
        </Card>
      </>
    );
  const result = await authedFetch<WorkforceView>(
    'tenant',
    '/tenant/analytics/workforce?' + query.toString(),
  );
  const view = result.ok ? result.data : null;
  const companyId = typeof params.companyIds === 'string' ? params.companyIds : '';
  const locationId = typeof params.locationId === 'string' ? params.locationId : '';
  const maxDate =
    view?.companies
      .map((c) => c.businessToday)
      .filter((d): d is string => !!d)
      .toSorted()[0] ?? catalog.data.maxAsOf;
  const value = (n: number | null) => (n === null ? '—' : format.number(n));
  return (
    <>
      {header}
      <Card>
        <AnalyticsFilters
          key={query.toString()}
          catalog={catalog.data}
          asOf={view?.asOf ?? catalog.data.defaultAsOf}
          maxAsOf={maxDate}
          companyId={companyId}
          locationId={locationId}
        />
        <p className="mt-3 text-sm text-slate-600">{t('scopeNote')}</p>
      </Card>
      {!result.ok && (
        <Banner tone="amber">
          {t('queryError')} {result.error.message}
        </Banner>
      )}
      {view && (
        <>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>
              {t('period')}:{' '}
              <bdi>
                {view.period.from} — {view.period.through}
              </bdi>
            </span>
            <span>{t(view.scope === 'relationship' ? 'relationshipScope' : 'companyScope')}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {view.metrics.map((m) => (
              <Card key={m.id}>
                <h2 className="font-medium">{t('metrics.' + m.id)}</h2>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{value(m.value)}</p>
                <p
                  className={
                    'mt-2 text-sm ' + (m.value === null ? 'text-amber-800' : 'text-slate-600')
                  }
                >
                  {t('states.' + m.state)}
                </p>
                <p className="mt-2 text-xs text-slate-500">{t('definitions.' + m.id)}</p>
              </Card>
            ))}
          </div>
          {view.metrics.some((m) => m.value === null) && (
            <Banner tone="amber">{t('incompleteNote')}</Banner>
          )}
          <Card title={t('byCompany')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr>
                    {['company', 'context', 'headcount', 'joiners', 'leavers'].map((k) => (
                      <th className="p-3 text-start" scope="col" key={k}>
                        {k === 'headcount' || k === 'joiners' || k === 'leavers'
                          ? t('metrics.' + k)
                          : t(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.companies.map((c) => (
                    <tr className="border-t" key={c.id}>
                      <th className="p-3 text-start font-medium" scope="row">
                        {c.name}
                      </th>
                      <td className="p-3">
                        <bdi>
                          {c.countryCode} · {c.timeZone ?? '—'}
                        </bdi>
                        <p className="mt-1 text-xs text-slate-500">
                          {t('contextSources.' + c.contextSource)} ·{' '}
                          {t('timeZoneSources.' + c.timeZoneSource)}
                        </p>
                      </td>
                      {c.metrics.map((m) => (
                        <td className="p-3" key={m.id}>
                          <p className="font-semibold tabular-nums">{value(m.value)}</p>
                          <p className="mt-1 text-xs text-slate-500">{t('states.' + m.state)}</p>
                          {m.issues.map((issue) => (
                            <p key={issue} className="mt-1 max-w-56 text-xs text-amber-800">
                              {t('issues.' + issue)}
                            </p>
                          ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={t('definitionsTitle')}>
            <dl className="space-y-4">
              {(['headcount', 'joiners', 'leavers'] as WorkforceMetric[]).map((id) => (
                <div key={id}>
                  <dt className="text-sm font-medium">{t('metrics.' + id)}</dt>
                  <dd className="mt-1 text-sm text-slate-600">{t('definitions.' + id)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-slate-600">{t('historyNote')}</p>
          </Card>
          <details className="rounded-xl border bg-white p-5">
            <summary className="cursor-pointer font-medium">{t('provenance')}</summary>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt>{t('version')}</dt>
                <dd>
                  <bdi>{view.version}</bdi>
                </dd>
              </div>
              <div>
                <dt>{t('sourceCutoff')}</dt>
                <dd>
                  <bdi>{view.dataAsOf}</bdi>
                </dd>
              </div>
              <div>
                <dt>{t('computedAt')}</dt>
                <dd>
                  <bdi>{view.computedAt}</bdi>
                </dd>
              </div>
              <div className="min-w-0">
                <dt>{t('revision')}</dt>
                <dd className="break-all text-xs">
                  <bdi>{view.sourceRevision}</bdi>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-slate-600">{t('provenanceNote')}</p>
          </details>
          <p className="text-sm text-slate-600">
            <Link href="/workspace/employees" className="underline">
              {t('employees')}
            </Link>
          </p>
        </>
      )}
    </>
  );
}
