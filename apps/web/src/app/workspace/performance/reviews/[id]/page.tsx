import type { EmployeeRef, PerformanceRecord, ReviewDetail } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { PeerDecision } from '@/components/performance/peer-forms';
import { PerformanceRecordView } from '@/components/performance/record-views';
import {
  AcknowledgeForm,
  ManagerReviewForm,
  PeerProposeForm,
  SelfReviewForm,
} from '@/components/performance/review-forms';
import {
  AnswersView,
  PeerFeedbackList,
  PeerSummaryView,
  RatingText,
  ReviewGoals,
  ReviewStatusBadge,
} from '@/components/performance/review-views';
import { personName } from '@/components/recruitment/opening-views';
import { Badge, Banner, Card, inputClass } from '@/components/ui';
import { authedFetch } from '@/lib/api';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * One review, as the login stands to it: the person's self review, the manager's review beside
 * the self review, and the released review with the person's acknowledgement.
 */
export default async function ReviewPage({
  params,
  searchParams,
}: PageProps<'/workspace/performance/reviews/[id]'>) {
  const { id } = await params;
  const result = await authedFetch<ReviewDetail>('tenant', `/tenant/performance/reviews/${id}`);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  const t = await getTranslations('reviews');
  if (!result.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      </>
    );
  }
  const review = result.data;
  const format = await getFormatter();
  const locale = await getLocale();
  const person = review.role === 'person';
  const released = review.status === 'released' || review.status === 'acknowledged';
  const search = one((await searchParams).peer) ?? '';
  const choices = review.can.proposePeers
    ? await authedFetch<EmployeeRef[]>(
        'tenant',
        `/tenant/performance/reviews/${id}/peer-choices${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      )
    : null;
  const record = person
    ? null
    : await authedFetch<PerformanceRecord>(
        'tenant',
        `/tenant/employees/${review.employee.id}/performance`,
      );
  const recommendsPlan = !person && review.managerReview?.recommendations?.plan;
  const goalsAndCompetencies = {
    goals: review.goals,
    competencies: review.cycle.competencies,
  };

  return (
    <>
      <div className="space-y-1">
        <Link
          href={person ? '/workspace/performance' : '/workspace/performance/team'}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {person ? t('title') : t('team.title')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {person
              ? t('review.mine', { cycle: review.cycle.name })
              : personName(review.employee, locale)}
          </h1>
          <ReviewStatusBadge status={review.status} />
        </div>
        <p className="text-sm text-slate-600">
          {[
            !person && review.cycle.name,
            `${day(format, review.cycle.periodStart)} – ${day(format, review.cycle.periodEnd)}`,
            review.employee.designation,
            review.employee.legalEntity,
            review.manager
              ? t('review.manager', { name: personName(review.manager, locale) })
              : t('review.noManager'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {released && (
        <Card title={t('review.outcome')}>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">{t('review.finalRating')}</dt>
              <dd className="text-base">
                <RatingText rating={review.finalRating} />
              </dd>
            </div>
            {review.goalScore !== null && (
              <div>
                <dt className="text-slate-500">{t('review.goalScore')}</dt>
                <dd className="text-base tabular-nums">
                  {format.number(Number(review.goalScore))}
                </dd>
              </div>
            )}
            {review.releasedAt && (
              <div>
                <dt className="text-slate-500">{t('review.releasedOn')}</dt>
                <dd>
                  {format.dateTime(new Date(review.releasedAt), {
                    dateStyle: 'medium',
                    timeZone: 'Asia/Dhaka',
                  })}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      <Card title={t('goals.title')}>
        <ReviewGoals goals={review.goals} />
      </Card>

      {/* The person's own part. */}
      {person && review.can.writeSelf && (
        <Card title={t('review.selfTitle')}>
          {review.cycle.selfDueOn && (
            <p className="mb-4 text-sm text-slate-600">
              {t('tasks.due', { date: day(format, review.cycle.selfDueOn) })}
            </p>
          )}
          <SelfReviewForm review={review} />
        </Card>
      )}
      {person && !review.can.writeSelf && review.self?.submittedAt && (
        <Card title={t('review.selfTitle')}>
          {!released && <p className="mb-3 text-sm text-slate-600">{t('review.withManager')}</p>}
          <AnswersView answers={review.self.answers} {...goalsAndCompetencies} />
        </Card>
      )}
      {person && !review.self?.submittedAt && !review.can.writeSelf && !released && (
        <Banner tone="slate">{t('review.managerOnly')}</Banner>
      )}

      {/* The manager's part, with the self review beside it. */}
      {!person && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t('review.selfTitle')}>
            {review.self ? (
              <AnswersView answers={review.self.answers} {...goalsAndCompetencies} />
            ) : (
              <p className="text-sm text-slate-500">
                {review.cycle.selfReview && review.status === 'self'
                  ? t('review.selfPending')
                  : t('review.noSelf')}
              </p>
            )}
          </Card>
          <Card title={t('review.managerTitle')}>
            {review.can.writeManager ? (
              <ManagerReviewForm review={review} />
            ) : review.managerReview?.submittedAt ? (
              <div className="space-y-4">
                <AnswersView answers={review.managerReview.answers} {...goalsAndCompetencies} />
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">{t('review.proposedRating')}</dt>
                    <dd>
                      <RatingText rating={review.managerReview.proposedRating} />
                    </dd>
                  </div>
                  {review.goalScore !== null && (
                    <div>
                      <dt className="text-slate-500">{t('review.goalScore')}</dt>
                      <dd className="tabular-nums">{format.number(Number(review.goalScore))}</dd>
                    </div>
                  )}
                </dl>
                {review.managerReview.recommendations && (
                  <ul className="flex flex-wrap gap-2">
                    {review.managerReview.recommendations.increment && (
                      <li>
                        <Badge tone="green">{t('form.increment')}</Badge>
                      </li>
                    )}
                    {review.managerReview.recommendations.promotion && (
                      <li>
                        <Badge tone="blue">
                          {t('review.promotionTo', {
                            designation: review.managerReview.recommendations.promotion.name,
                          })}
                        </Badge>
                      </li>
                    )}
                    {review.managerReview.recommendations.plan && (
                      <li>
                        <Badge tone="amber">{t('form.plan')}</Badge>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {review.status === 'self' ? t('review.waitsForSelf') : t('review.notWritten')}
              </p>
            )}
          </Card>
        </div>
      )}

      {!person && review.calibration?.at && (
        <Card title={t('review.calibrationTitle')}>
          <p className="text-sm">
            <RatingText rating={review.finalRating} />
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('review.calibratedBy', {
              name: review.calibration.by ?? '–',
              date: format.dateTime(new Date(review.calibration.at), {
                dateStyle: 'medium',
                timeZone: 'Asia/Dhaka',
              }),
            })}
          </p>
          {review.calibration.note && (
            <p className="mt-2 text-sm text-slate-700">“{review.calibration.note}”</p>
          )}
        </Card>
      )}

      {person && released && review.managerReview && (
        <Card title={t('review.managerTitle')}>
          <AnswersView answers={review.managerReview.answers} {...goalsAndCompetencies} />
        </Card>
      )}

      {/* Peer feedback: with names for the manager and HR, together for the person. */}
      {review.cycle.peerReview && (
        <Card title={t('peers.feedbackTitle')}>
          <div className="space-y-5">
            {review.peers && <PeerFeedbackList peers={review.peers} />}
            {review.can.approvePeers &&
              review.peers
                ?.filter((p) => p.status === 'proposed')
                .map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm">
                      {t('peers.toApproveOne', { name: personName(p.peer, locale) })}
                    </span>
                    <PeerDecision peerId={p.id} />
                  </div>
                ))}
            {review.peerProposals && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">{t('peers.yourNames')}</p>
                {review.peerProposals.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('peers.noneNamed')}</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {review.peerProposals.map((p) => (
                      <li key={p.id}>
                        <Badge
                          tone={
                            p.status === 'declined'
                              ? 'slate'
                              : p.status === 'approved'
                                ? 'green'
                                : 'amber'
                          }
                        >
                          {personName(p.peer, locale)} · {t(`peers.status.${p.status}`)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {review.peerSummary && <PeerSummaryView summary={review.peerSummary} />}
            {review.can.proposePeers && choices?.ok && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <p className="text-sm font-medium text-slate-800">
                  {person ? t('peers.nameTitle') : t('peers.askTitle')}
                </p>
                <p className="text-xs text-slate-500">{t('peers.nameHint')}</p>
                <form className="flex gap-2">
                  <input
                    name="peer"
                    defaultValue={search}
                    placeholder={t('peers.search')}
                    aria-label={t('peers.search')}
                    className={`${inputClass} max-w-xs`}
                  />
                  <button className="text-sm font-medium text-brand-700">{t('peers.find')}</button>
                </form>
                <PeerProposeForm reviewId={review.id} choices={choices.data} byManager={!person} />
              </div>
            )}
          </div>
        </Card>
      )}

      {person && review.can.acknowledge && (
        <Card title={t('acknowledge.title')}>
          <p className="mb-4 text-sm text-slate-600">{t('acknowledge.intro')}</p>
          <AcknowledgeForm reviewId={review.id} />
        </Card>
      )}
      {review.acknowledgement && (
        <Card title={t('acknowledge.title')}>
          <p className="text-sm">
            {review.acknowledgement.agrees ? t('acknowledge.agreed') : t('acknowledge.disagreed')}{' '}
            <span className="text-xs text-slate-500">
              {format.dateTime(new Date(review.acknowledgement.at), {
                dateStyle: 'medium',
                timeZone: 'Asia/Dhaka',
              })}
            </span>
          </p>
          {review.acknowledgement.comment && (
            <p className="mt-2 text-sm text-slate-700">“{review.acknowledgement.comment}”</p>
          )}
        </Card>
      )}

      {recommendsPlan && (
        <Banner tone="amber">
          {t('review.planRecommended')}{' '}
          <Link
            href={`/workspace/performance/plans/new?employeeId=${review.employee.id}&reviewId=${review.id}`}
            className="font-medium underline"
          >
            {t('review.newPlan')}
          </Link>
        </Banner>
      )}
      {record?.ok && (
        <details className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <summary className="cursor-pointer text-base font-semibold text-slate-900">
            {t('review.record')}
          </summary>
          <div className="mt-4">
            <PerformanceRecordView record={record.data} />
          </div>
        </details>
      )}
    </>
  );
}
