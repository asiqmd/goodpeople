import { can, type ProbationReviewView } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dhakaDay, nameOf } from '@/components/performance/plan-views';
import { ProbationReviewForm } from '@/components/performance/probation-forms';
import { ProbationStateBadge } from '@/components/performance/probation-views';
import { RatingText } from '@/components/performance/record-views';
import { buttonClass, Card } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

/**
 * One probation review: the form for the manager (or HR) while it is due, then what it said.
 * HR acts on it from the person's probation; a recommendation never acts by itself.
 */
export default async function ProbationReviewPage({
  params,
}: PageProps<'/workspace/performance/probation/[id]'>) {
  const { id } = await params;
  const t = await getTranslations('development.probation');
  const locale = await getLocale();
  const day = await dhakaDay();
  const accessPrincipal = await currentTenantUser();
  const result = await authedFetch<ProbationReviewView>(
    'tenant',
    `/tenant/performance/probation/${id}`,
  );
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const r = result.data;
  const label = (key: string) => {
    const c = r.competencies.find((x) => x.key === key);
    return c ? (locale === 'bn' ? c.bn : c.en) : key;
  };
  // Stored as jsonb, whose keys come back sorted by length: list them as the competencies are.
  const place = (key: string) => {
    const i = r.competencies.findIndex((x) => x.key === key);
    return i === -1 ? r.competencies.length : i;
  };
  const ratings = Object.entries(r.ratings ?? {}).toSorted(([a], [b]) => place(a) - place(b));

  return (
    <>
      <div className="space-y-1">
        <Link
          href="/workspace/performance/probation"
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t('title')}
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {t('reviewTitle', { name: nameOf(r.employee, locale) })}
          <ProbationStateBadge review={r} />
        </h1>
        <p className="text-sm text-slate-600">
          {[r.designation, r.orgUnit, r.legalEntity].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {r.canSubmit ? (
            <Card title={t('formTitle')}>
              <p className="mb-4 text-sm text-slate-600">{t('formIntro')}</p>
              <ProbationReviewForm reviewId={r.id} competencies={r.competencies} />
            </Card>
          ) : r.submittedAt ? (
            <Card title={t('submittedTitle')}>
              <dl className="space-y-2 text-sm">
                {ratings.map(([key, rating]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-slate-600">{label(key)}</dt>
                    <dd className="font-medium">
                      <RatingText rating={rating} />
                    </dd>
                  </div>
                ))}
              </dl>
              {r.recommendation && (
                <p className="mt-4 text-sm">
                  <span className="text-slate-500">{t('recommendation')}: </span>
                  <span className="font-medium">{t(`recommendations.${r.recommendation}`)}</span>
                </p>
              )}
              {r.comment && (
                <p className="mt-2 text-sm whitespace-pre-line text-slate-800">{r.comment}</p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                {t('submittedOn', { date: day(r.submittedAt) })}
              </p>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-slate-600">{t('closedWithout')}</p>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title={t('details')}>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">{t('manager')}</dt>
                <dd>{r.manager ? nameOf(r.manager, locale) : t('hrAsked')}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('joinedOn')}</dt>
                <dd>{day(r.joinedOn)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('endsOn')}</dt>
                <dd>{day(r.probationEndsOn)}</dd>
              </div>
              {r.currentProbationEndsOn && r.currentProbationEndsOn !== r.probationEndsOn && (
                <div>
                  <dt className="text-slate-500">{t('nowEndsOn')}</dt>
                  <dd>{day(r.currentProbationEndsOn)}</dd>
                </div>
              )}
              {r.confirmedOn && (
                <div>
                  <dt className="text-slate-500">{t('confirmedOn')}</dt>
                  <dd>{day(r.confirmedOn)}</dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">{t('dueOn')}</dt>
                <dd>{day(r.dueOn)}</dd>
              </div>
              {r.actedAt && (
                <div>
                  <dt className="text-slate-500">{t('actedOn')}</dt>
                  <dd>{day(r.actedAt)}</dd>
                </div>
              )}
            </dl>
          </Card>
          {r.manage && (
            <Card title={t('hrTitle')}>
              <p className="mb-3 text-sm text-slate-600">{t('hrHint')}</p>
              {can(accessPrincipal, 'employees.write') && r.state !== 'acted' && (
                <Link
                  href={`/workspace/employees/${r.employee.id}?tab=job`}
                  className={buttonClass.secondary}
                >
                  {t('actOnProbation')}
                </Link>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
