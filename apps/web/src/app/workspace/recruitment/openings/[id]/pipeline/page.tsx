import type { PipelineView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddCandidateForm, MoveForm } from '@/components/recruitment/pipeline-forms';
import { dhakaFormat, STAGE_TONE } from '@/components/recruitment/pipeline-views';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/**
 * An opening's applications in a column per stage, each moved on with a select (and a
 * reason when rejecting or withdrawing). Those who manage recruitment add candidates here.
 */
export default async function PipelinePage({
  params,
}: PageProps<'/workspace/recruitment/openings/[id]/pipeline'>) {
  const { id } = await params;
  const t = await getTranslations('pipeline');
  const format = await getFormatter();
  const locale = await getLocale();
  const { day } = await dhakaFormat();
  const result = await authedFetch<PipelineView>(
    'tenant',
    `/tenant/recruitment/openings/${id}/pipeline`,
  );
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Banner tone="amber">{result.error.message}</Banner>
      </>
    );
  }
  const { opening, columns, manage } = result.data;
  const manager = opening.hiringManager;
  const total = columns.reduce((sum, c) => sum + c.applications.length, 0);

  return (
    <>
      <div className="space-y-1">
        <Link
          href={`/workspace/recruitment/openings/${opening.id}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t('board.back')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('board.title', { title: opening.title })}</h1>
        <p className="flex flex-wrap gap-x-3 text-sm text-slate-600">
          <span>{opening.legalEntity.name}</span>
          <span>
            ·{' '}
            {manager
              ? t('board.manager', {
                  name:
                    locale === 'bn' && manager.fullNameBn ? manager.fullNameBn : manager.fullName,
                })
              : t('board.noManager')}
          </span>
          <span>· {t('board.total', { count: total })}</span>
          {manage && (
            <Link
              href={`/workspace/recruitment/candidates?openingId=${opening.id}`}
              className="font-medium text-brand-700 hover:underline"
            >
              · {t('board.viewCandidates')}
            </Link>
          )}
        </p>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="grid min-w-[84rem] grid-cols-7 gap-3">
          {columns.map((column) => (
            <section key={column.stage} className="space-y-2 rounded-xl bg-slate-100 p-2">
              <h2 className="flex items-center justify-between px-1 text-sm font-semibold text-slate-800">
                <Badge tone={STAGE_TONE[column.stage]}>{t(`stages.${column.stage}`)}</Badge>
                <span className="tabular-nums text-slate-500">
                  {format.number(column.applications.length)}
                </span>
              </h2>
              {column.applications.length === 0 && (
                <p className="px-1 py-2 text-xs text-slate-500">{t('board.empty')}</p>
              )}
              {column.applications.map((a) => (
                <article
                  key={a.id}
                  className="space-y-2 rounded-lg bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200"
                >
                  <Link
                    href={`/workspace/recruitment/applications/${a.id}`}
                    className="block font-medium text-slate-900 hover:underline"
                  >
                    {a.candidate.erased ? t('erasedName') : a.candidate.fullName}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {t(`sources.${a.source}`)} · {t('board.applied', { date: day(a.appliedAt) })}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t('board.since', { date: day(a.stageChangedAt) })}
                  </p>
                  <p className="text-xs text-slate-600">
                    {t('board.interviews', { count: a.interviews })}
                    {a.averageRating !== null &&
                      ` · ${t('board.rating', {
                        rating: format.number(a.averageRating, { maximumFractionDigits: 1 }),
                      })}`}
                  </p>
                  {a.rejectionReason && (
                    <p className="text-xs text-slate-600">
                      {t('board.reason', { reason: a.rejectionReason })}
                    </p>
                  )}
                  <MoveForm applicationId={a.id} moves={a.moves} compact />
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>

      {manage && (opening.status === 'open' || opening.status === 'approved') && (
        <Card title={t('add.title')}>
          <p className="mb-4 text-sm text-slate-600">{t('add.intro')}</p>
          <AddCandidateForm openingId={opening.id} />
        </Card>
      )}
    </>
  );
}
