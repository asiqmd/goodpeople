import { isClosedStage, type ApplicationDetail } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InterviewForm } from '@/components/recruitment/interview-forms';
import { InterviewList } from '@/components/recruitment/interview-views';
import { OfferCard } from '@/components/recruitment/offer-card';
import { MoveForm, NoteForm } from '@/components/recruitment/pipeline-forms';
import { dhakaFormat, EventsTimeline, StageBadge } from '@/components/recruitment/pipeline-views';
import { Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/**
 * One application: the candidate and the opening, its stage and moves, the CV and cover note,
 * its history, its interviews with their scorecards, and the offer.
 */
export default async function ApplicationPage({
  params,
}: PageProps<'/workspace/recruitment/applications/[id]'>) {
  const { id } = await params;
  const t = await getTranslations('pipeline');
  const ti = await getTranslations('interviews.panel');
  const { day } = await dhakaFormat();
  const result = await authedFetch<ApplicationDetail>(
    'tenant',
    `/tenant/recruitment/applications/${id}`,
  );
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const a = result.data;
  const c = a.candidate;
  const open = !isClosedStage(a.stage);

  return (
    <>
      <div className="space-y-1">
        <Link
          href={`/workspace/recruitment/openings/${a.opening.id}/pipeline`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t('application.back', { title: a.opening.title })}
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {c.erased ? t('erasedName') : c.fullName}
          <StageBadge stage={a.stage} />
        </h1>
        <p className="text-sm text-slate-600">
          {t('application.appliedFor', { title: a.opening.title, date: day(a.appliedAt) })} ·{' '}
          {t(`sources.${a.source}`)}
        </p>
      </div>

      {c.erased && <Banner tone="slate">{t('application.erased')}</Banner>}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title={t('application.candidate')}>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t('application.contact')}</dt>
                <dd>
                  {c.email || c.phone ? (
                    <>
                      {c.email && <span className="block">{c.email}</span>}
                      {c.phone && <span className="block">{c.phone}</span>}
                    </>
                  ) : (
                    t('application.noContact')
                  )}
                  <span className="block text-xs text-slate-500">
                    {t('application.language', { language: t(`languages.${c.language}`) })}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('candidate.cv')}</dt>
                <dd>
                  {c.cv ? (
                    <a
                      href={`/workspace/files/recruitment/applications/${a.id}/cv`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {t('application.cv', { name: c.cv.fileName })}
                    </a>
                  ) : (
                    t('candidate.noCv')
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">{t('application.coverNote')}</dt>
                <dd className="whitespace-pre-line text-slate-800">
                  {a.coverNote ?? t('application.noCoverNote')}
                </dd>
              </div>
            </dl>
            {a.manage && !c.erased && (
              <Link
                href={`/workspace/recruitment/candidates/${c.id}`}
                className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
              >
                {t('application.openCandidate')}
              </Link>
            )}
          </Card>

          <Card title={ti('title')}>
            <div className="space-y-5">
              <InterviewList
                interviews={a.interviews}
                applicationId={a.id}
                criteria={a.opening.scorecardCriteria}
                changeable={open}
              />
              {open ? (
                <details className="rounded-lg ring-1 ring-slate-200">
                  <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-brand-700 select-none">
                    {ti('schedule')}
                  </summary>
                  <div className="border-t border-slate-200 p-4">
                    <InterviewForm applicationId={a.id} />
                  </div>
                </details>
              ) : (
                <p className="text-sm text-slate-500">{ti('closed')}</p>
              )}
            </div>
          </Card>

          <OfferCard applicationId={a.id} />
        </div>

        <div className="space-y-6">
          <Card title={t('application.stage')}>
            <div className="space-y-3 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <StageBadge stage={a.stage} />
                <span className="text-slate-500">
                  {t('application.since', { date: day(a.stageChangedAt) })}
                </span>
              </p>
              {a.rejectionReason && (
                <p className="text-slate-700">{t('board.reason', { reason: a.rejectionReason })}</p>
              )}
              {a.moves.length > 0 ? (
                <MoveForm applicationId={a.id} moves={a.moves} />
              ) : (
                <p className="text-slate-500">{t('move.none')}</p>
              )}
            </div>
          </Card>

          <Card title={t('application.events')}>
            <div className="space-y-5">
              <EventsTimeline events={a.events} />
              <NoteForm applicationId={a.id} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
