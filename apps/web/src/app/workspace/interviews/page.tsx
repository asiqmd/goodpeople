import type { MyInterviewItem, MyInterviews } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { InterviewStatusBadge, InterviewWhen } from '@/components/recruitment/interview-views';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/** The interviews the signed-in login is on, to come and past, each with its scorecard. */
export default async function MyInterviewsPage() {
  const t = await getTranslations('interviews');
  const locale = await getLocale();
  const result = await authedFetch<MyInterviews>('tenant', '/tenant/interviews');
  if (!result.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Banner tone="amber">{result.error.message}</Banner>
      </>
    );
  }
  const { upcoming, past } = result.data;
  const title = (i: MyInterviewItem) =>
    (locale === 'bn' ? i.opening.postTitleBn : i.opening.postTitleEn) ?? i.opening.title;
  const list = (items: MyInterviewItem[], empty: string) =>
    items.length === 0 ? (
      <p className="text-sm text-slate-500">{empty}</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="space-y-1">
              <Link
                href={`/workspace/interviews/${i.id}`}
                className="font-medium text-slate-900 hover:underline"
              >
                {t('candidateFor', { name: i.candidateName, title: title(i) })}
              </Link>
              <InterviewWhen interview={i} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {i.status !== 'scheduled' && <InterviewStatusBadge status={i.status} />}
              {i.status !== 'cancelled' && (
                <Badge tone={i.submitted ? 'green' : 'amber'}>
                  {i.submitted ? t('submitted') : t('toScore')}
                </Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-slate-600">{t('intro')}</p>
      </div>
      <Card title={t('upcoming')}>{list(upcoming, t('noUpcoming'))}</Card>
      <Card title={t('past')}>{list(past, t('noPast'))}</Card>
    </>
  );
}
