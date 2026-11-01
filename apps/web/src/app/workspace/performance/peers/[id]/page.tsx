import { PEER_QUESTIONS, type PeerRequestView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { PeerAnswerForm } from '@/components/performance/peer-forms';
import { RatingText } from '@/components/performance/review-views';
import { personName } from '@/components/recruitment/opening-views';
import { Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/** A request for the login's feedback on a colleague: the two questions and a rating. */
export default async function PeerRequestPage({
  params,
}: PageProps<'/workspace/performance/peers/[id]'>) {
  const { id } = await params;
  const result = await authedFetch<PeerRequestView>('tenant', `/tenant/performance/peers/${id}`);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  const t = await getTranslations('reviews');
  if (!result.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('peers.title')}</h1>
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      </>
    );
  }
  const request = result.data;
  const format = await getFormatter();
  const locale = await getLocale();
  return (
    <>
      <div className="space-y-1">
        <Link
          href="/workspace/performance/peers"
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t('peers.title')}
        </Link>
        <h1 className="text-2xl font-semibold">
          {t('peers.feedbackOn', { person: personName(request.person, locale) })}
        </h1>
        <p className="text-sm text-slate-600">
          {[
            request.cycle.name,
            request.dueOn && t('tasks.due', { date: day(format, request.dueOn) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <Card>
        {request.open ? (
          <PeerAnswerForm request={request} />
        ) : request.status === 'submitted' ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">{t('peers.yourAnswer')}</p>
            {PEER_QUESTIONS.map((q) => (
              <div key={q}>
                <p className="font-medium text-slate-800">{t(`peers.questions.${q}`)}</p>
                <p className="whitespace-pre-line text-slate-700">{request.answers?.[q]}</p>
              </div>
            ))}
            <p>
              <RatingText rating={request.rating} />
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('peers.closed')}</p>
        )}
      </Card>
    </>
  );
}
