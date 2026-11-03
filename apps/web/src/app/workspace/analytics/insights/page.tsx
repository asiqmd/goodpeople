import { randomUUID } from 'node:crypto';
import {
  INSIGHT_METRICS,
  insightDefinitionSchema,
  type InsightCatalog,
  type InsightDefinition,
  type InsightJob,
  type InsightView,
  type SavedInsight,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { InsightFilters } from '@/components/analytics/insight-filters';
import { Banner, buttonClass, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { queueInsight, removeInsight, saveInsight } from './actions';
import { insightLink, insightQuery, insightsPath } from './links';

function ReportFields({
  definition,
  reportId,
}: {
  definition: InsightDefinition;
  reportId?: string;
}) {
  return (
    <>
      {Object.entries(definition).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {reportId && <input type="hidden" name="reportId" value={reportId} />}
    </>
  );
}

export default async function InsightsPage({
  searchParams,
}: PageProps<'/workspace/analytics/insights'>) {
  const t = await getTranslations('insights');
  const format = await getFormatter();
  const { notice, ...params } = await searchParams;
  const catalog = await authedFetch<InsightCatalog>('tenant', '/tenant/analytics/insight-catalog');
  const header = (
    <div>
      <Link className="text-sm text-emerald-800 underline" href="/workspace/analytics">
        {t('workforce')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">{t('intro')}</p>
    </div>
  );
  if (!catalog.ok)
    return (
      <>
        {header}
        <Banner tone="amber">{t('unavailable')}</Banner>
      </>
    );
  const { companies, payroll, latestMonth } = catalog.data;
  const first = companies[0];
  const fallback: InsightDefinition | null = first?.kinds[0]
    ? { kind: first.kinds[0], month: latestMonth, companyId: first.id }
    : payroll
      ? { kind: 'payroll', month: latestMonth }
      : null;
  if (!fallback)
    return (
      <>
        {header}
        <Banner tone="amber">{t('unavailable')}</Banner>
      </>
    );
  const parsed = insightDefinitionSchema.safeParse(params);
  const valid = parsed.success || !Object.keys(params).length;
  const definition = parsed.success ? parsed.data : fallback;
  const [view, saved] = await Promise.all([
    valid
      ? authedFetch<InsightView>('tenant', '/tenant/analytics/insight?' + insightQuery(definition))
      : null,
    authedFetch<SavedInsight[]>('tenant', '/tenant/analytics/saved-insights'),
  ]);
  const reports = saved.ok ? saved.data : [];
  const current = reports.find((r) => insightQuery(r.definition) === insightQuery(definition));
  const canExport = definition.kind !== 'payroll' || catalog.data.payrollExport;
  const jobs =
    current && canExport
      ? await authedFetch<InsightJob[]>(
          'tenant',
          '/tenant/analytics/saved-insights/' + current.id + '/jobs',
        )
      : null;
  const metrics = INSIGHT_METRICS[definition.kind];
  const companyName = (report: InsightDefinition) =>
    report.kind === 'payroll'
      ? t('wholeWorkspace')
      : companies.find((c) => c.id === report.companyId)?.name;
  return (
    <>
      {header}
      <Card>
        <InsightFilters
          key={insightQuery(definition)}
          catalog={catalog.data}
          definition={definition}
        />
        <p className="mt-3 text-sm text-slate-600">{t('scope')}</p>
      </Card>
      {typeof notice === 'string' && ['saved', 'removed', 'queued', 'failed'].includes(notice) && (
        <Banner tone={notice === 'failed' ? 'amber' : 'green'}>{t('notices.' + notice)}</Banner>
      )}
      {!view?.ok && <Banner tone="amber">{t('queryError')}</Banner>}
      {view?.ok && (
        <Card title={t('kinds.' + definition.kind)}>
          <p className="mb-3 text-sm text-slate-600">{t('definitions.' + definition.kind)}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr>
                  <th scope="col" className="p-2 text-start">
                    {t('month')}
                  </th>
                  <th scope="col" className="p-2 text-start">
                    {t('context')}
                  </th>
                  {metrics.map((metric) => (
                    <th key={metric} scope="col" className="p-2 text-start">
                      {t('metrics.' + metric)}
                    </th>
                  ))}
                  <th scope="col" className="p-2 text-start">
                    {t('state')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.data.points.map((point) => (
                  <tr className="border-t border-slate-200" key={point.month}>
                    <th scope="row" className="p-2 text-start font-medium">
                      <bdi>{point.month}</bdi>
                    </th>
                    <td className="p-2">
                      <bdi>
                        {[point.country, point.currency].filter(Boolean).join(' · ') || '—'}
                      </bdi>
                    </td>
                    {metrics.map((metric) => (
                      <td key={metric} className="p-2 tabular-nums">
                        <bdi>{point.values[metric] ?? '—'}</bdi>
                      </td>
                    ))}
                    <td className="p-2">
                      {t('states.' + point.state)}
                      {point.issue && (
                        <p className="text-xs text-slate-600">{t('issues.' + point.issue)}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">{t('source')}</summary>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <dt>{t('version')}</dt>
                <dd>
                  <bdi>{view.data.version}</bdi>
                </dd>
              </div>
              <div>
                <dt>{t('timeZone')}</dt>
                <dd>
                  <bdi>{view.data.timeZone ?? '—'}</bdi>
                </dd>
              </div>
              <div>
                <dt>{t('snapshot')}</dt>
                <dd>
                  <bdi>{view.data.dataAsOf}</bdi>
                </dd>
              </div>
              <div className="min-w-0">
                <dt>{t('revision')}</dt>
                <dd className="break-all font-mono">
                  <bdi>{view.data.sourceRevision}</bdi>
                </dd>
              </div>
            </dl>
          </details>
          {!current && catalog.data.canSave && (
            <form className="mt-4" action={saveInsight}>
              <ReportFields definition={definition} />
              <button className={buttonClass.secondary}>{t('save')}</button>
            </form>
          )}
        </Card>
      )}
      <Card title={t('saved')}>
        {reports.length ? (
          <ul className="space-y-2 text-sm">
            {reports.map((report) => (
              <li key={report.id}>
                <Link className="text-emerald-800 underline" href={insightLink(report.definition)}>
                  {t('kinds.' + report.definition.kind)} · {companyName(report.definition)} ·{' '}
                  <bdi>{report.definition.month}</bdi>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">{t('none')}</p>
        )}
        {current && catalog.data.canSave && (
          <form className="mt-3" action={removeInsight}>
            <ReportFields definition={definition} reportId={current.id} />
            <button className={buttonClass.secondary}>{t('remove')}</button>
          </form>
        )}
      </Card>
      {current && canExport && (
        <Card title={t('exports')}>
          <p className="mb-3 text-sm text-slate-600">{t('retention')}</p>
          <div className="flex flex-wrap gap-2">
            <form action={queueInsight}>
              <ReportFields definition={definition} reportId={current.id} />
              <input type="hidden" name="requestId" value={randomUUID()} />
              <button className={buttonClass.primary}>{t('queue')}</button>
            </form>
            <a className={buttonClass.secondary} href={insightLink(definition)}>
              {t('refresh')}
            </a>
          </div>
          {jobs?.ok && jobs.data.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {jobs.data.map((job) => (
                <li className="flex flex-wrap items-center gap-3" key={job.id}>
                  <time dateTime={job.createdAt}>
                    {format.dateTime(new Date(job.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                  <span>{t('jobStates.' + job.status)}</span>
                  {job.status === 'ready' && (
                    <a
                      href={insightsPath + '/files/' + job.id}
                      className="text-emerald-800 underline"
                    >
                      {t('download')}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
