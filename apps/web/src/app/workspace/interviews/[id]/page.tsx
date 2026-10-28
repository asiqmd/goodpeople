import type { MyInterviewDetail } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScorecardForm } from '@/components/recruitment/interview-forms';
import {
  InterviewStatusBadge,
  InterviewWhen,
  Scorecard,
} from '@/components/recruitment/interview-views';
import { Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/**
 * One interview as its interviewer sees it: the candidate, the CV and their note, the
 * scorecard, and the other interviewers' scorecards once theirs is in.
 */
export default async function MyInterviewPage({ params }: PageProps<'/workspace/interviews/[id]'>) {
  const { id } = await params;
  const t = await getTranslations('interviews');
  const locale = await getLocale();
  const result = await authedFetch<MyInterviewDetail>('tenant', `/tenant/interviews/${id}`);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const i = result.data;
  const title =
    (locale === 'bn' ? i.opening.postTitleBn : i.opening.postTitleEn) ?? i.opening.title;
  const name = (p: { fullName: string; fullNameBn: string | null }) =>
    locale === 'bn' && p.fullNameBn ? p.fullNameBn : p.fullName;

  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/interviews" className="text-sm text-slate-500 hover:underline">
          ← {t('detail.back')}
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {t('candidateFor', { name: i.candidateName, title })}
          <InterviewStatusBadge status={i.status} />
        </h1>
        <InterviewWhen interview={i} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card title={t('detail.candidate')}>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">{t('detail.cvLabel')}</dt>
              <dd>
                {i.hasCv ? (
                  <a
                    href={`/workspace/files/recruitment/applications/${i.applicationId}/cv`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t('detail.cv')}
                  </a>
                ) : (
                  t('detail.noCv')
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('detail.coverNote')}</dt>
              <dd className="whitespace-pre-line text-slate-800">
                {i.coverNote ?? t('detail.noCoverNote')}
              </dd>
            </div>
            {i.notes && (
              <div>
                <dt className="text-slate-500">{t('detail.notes')}</dt>
                <dd className="whitespace-pre-line text-slate-800">{i.notes}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card title={t('scorecard.title')}>
          {i.scorable ? (
            <ScorecardForm interview={i} />
          ) : (
            <div className="space-y-3">
              <Banner tone="slate">
                {i.status === 'cancelled' ? t('scorecard.cancelled') : t('scorecard.closed')}
              </Banner>
              {i.mine && <Scorecard scorecard={i.mine} criteria={i.criteria} />}
            </div>
          )}
        </Card>
      </div>

      <Card title={t('others.title')}>
        {!i.mine ? (
          <p className="text-sm text-slate-600">{t('others.hidden')}</p>
        ) : i.others.length === 0 ? (
          <p className="text-sm text-slate-500">{t('others.none')}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {i.others.map((o) => (
              <li key={o.employee.id} className="rounded-lg bg-slate-50 p-4">
                <p className="mb-2 text-sm font-medium">{name(o.employee)}</p>
                <Scorecard scorecard={o.scorecard} criteria={i.criteria} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
