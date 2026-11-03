import {
  anomalyDefinitionSchema,
  anomalyFindingIdSchema,
  type AnomalyCatalog,
  type AnomalyDefinition,
  type AnomalyInbox,
} from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  AnomalyFilters,
  AnomalyReviewForm,
  FindingEvidence,
  ScanAnomalyForm,
} from '@/components/analytics/anomaly-review';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { anomalyApi, anomalyPath, anomalyQuery, anomalySources } from './links';

const sourceLink = 'text-sm font-medium text-brand-700 underline';

export default async function AnomaliesPage({
  searchParams,
}: PageProps<'/workspace/analytics/anomalies'>) {
  const t = await getTranslations('anomalies');
  const catalog = await authedFetch<AnomalyCatalog>('tenant', anomalyApi + '/catalog');
  const header = (
    <div>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">{t('intro')}</p>
    </div>
  );
  if (!catalog.ok)
    return (
      <>
        {header}
        <Banner tone="amber">{t('errors.unavailable')}</Banner>
      </>
    );
  const { assignmentCoverage, payrollMovement, companies, latestMonth } = catalog.data;
  const fallback: AnomalyDefinition | null = assignmentCoverage
    ? { rule: 'assignment_coverage', month: latestMonth }
    : companies[0]
      ? { rule: 'attendance_processing', month: latestMonth, companyId: companies[0].id }
      : payrollMovement
        ? { rule: 'payroll_movement', month: latestMonth }
        : null;
  if (!fallback)
    return (
      <>
        {header}
        <Banner tone="amber">{t('errors.unavailable')}</Banner>
      </>
    );

  const { before, ...params } = await searchParams;
  const selected = anomalyDefinitionSchema.safeParse(params);
  const cursor = anomalyFindingIdSchema.optional().safeParse(before);
  const definition = selected.data ?? fallback;
  const query = anomalyQuery(definition);
  const href = anomalyPath + '?' + query;
  const valid = (selected.success || !Object.keys(params).length) && cursor.success;
  const inbox = valid
    ? await authedFetch<AnomalyInbox>(
        'tenant',
        anomalyApi + '/inbox' + (cursor.data ? '/' + cursor.data : '') + '?' + query,
      )
    : null;
  const scope =
    'companyId' in definition
      ? companies.find((company) => company.id === definition.companyId)?.name
      : t('workspace');
  const links = anomalySources(definition);

  return (
    <>
      {header}
      <Card>
        <AnomalyFilters key={query} catalog={catalog.data} definition={definition} />
      </Card>
      {!inbox?.ok ? (
        <Banner tone="amber">{t('errors.' + (valid ? 'unavailable' : 'invalid'))}</Banner>
      ) : (
        <>
          <Card title={t('rules.' + definition.rule)}>
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {scope} <bdi>{definition.month}</bdi>
              </p>
              <p className="text-sm text-slate-600">{t('methods.' + definition.rule)}</p>
              <div className="flex flex-wrap gap-4">
                <Link href={links.source} className={sourceLink}>
                  {t('source')}
                </Link>
                <Link href={links.correction} className={sourceLink}>
                  {t('correction')}
                </Link>
              </div>
              {inbox.data.canReview && !cursor.data && (
                <ScanAnomalyForm key={query} definition={definition} />
              )}
            </div>
          </Card>
          <section className="space-y-3" aria-label={t('findings')}>
            <h2 className="text-lg font-semibold">{t('findings')}</h2>
            {!inbox.data.findings.length && <p className="text-sm text-slate-600">{t('empty')}</p>}
            {inbox.data.findings.map((finding) => (
              <Card key={finding.id} title={t('rules.' + finding.definition.rule)}>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={finding.status === 'resolved' ? 'green' : 'blue'}>
                      {t('status.' + finding.status)}
                    </Badge>
                    {finding.ownedByMe && <Badge tone="slate">{t('mine')}</Badge>}
                    {finding.supersededAt && <Badge tone="amber">{t('superseded')}</Badge>}
                  </div>
                  <FindingEvidence evidence={finding.evidence} />
                  <div className="text-xs text-slate-600">
                    <p>
                      <bdi>
                        {[finding.version, finding.sourceVersion, finding.measuredAt].join(' · ')}
                      </bdi>
                    </p>
                    <p className="break-all">
                      {t('sourceRevision')} <bdi>{finding.sourceRevision}</bdi>
                    </p>
                  </div>
                  {finding.reason && (
                    <p className="break-words text-sm">
                      {t('dismissal', { reason: finding.reason })}
                    </p>
                  )}
                  {finding.resolution && (
                    <p className="break-all text-sm">
                      {t('resolvedEvidence', { at: finding.resolution.measuredAt })}{' '}
                      <bdi>{finding.resolution.sourceRevision}</bdi>
                    </p>
                  )}
                  {inbox.data.canReview && (
                    <AnomalyReviewForm finding={finding} canRelease={inbox.data.canRelease} />
                  )}
                </div>
              </Card>
            ))}
          </section>
          <nav className="flex gap-4" aria-label={t('pages')}>
            {cursor.data && (
              <Link href={href} className={sourceLink}>
                {t('firstPage')}
              </Link>
            )}
            {inbox.data.next && (
              <Link href={href + '&before=' + inbox.data.next} className={sourceLink}>
                {t('nextPage')}
              </Link>
            )}
          </nav>
        </>
      )}
    </>
  );
}
