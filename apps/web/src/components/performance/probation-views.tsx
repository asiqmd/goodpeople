import type { ProbationReviewListItem, ProbationReviewState } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Badge, type Tone } from '../ui';
import { dhakaDay, nameOf } from './plan-views';

const STATE_TONE: Record<ProbationReviewState, Tone> = {
  due: 'amber',
  submitted: 'blue',
  acted: 'green',
};

export async function ProbationStateBadge({ review }: { review: ProbationReviewListItem }) {
  const t = await getTranslations('development.probation.states');
  // Acted on before anyone wrote the review: HR decided without it.
  const key = review.state === 'acted' && !review.submittedAt ? 'actedWithout' : review.state;
  return <Badge tone={STATE_TONE[review.state]}>{t(key)}</Badge>;
}

/**
 * Probation reviews as a table: whose, their manager, when the probation ends and the review
 * is due, where it stands and what it recommends. HR also gets a link to the person's
 * probation, where they act on it.
 */
export async function ProbationTable({
  reviews,
  actions,
}: {
  reviews: ProbationReviewListItem[];
  /** Link to each person's probation actions (HR who may change the job). */
  actions: boolean;
}) {
  const t = await getTranslations('development.probation');
  const locale = await getLocale();
  const day = await dhakaDay();
  if (reviews.length === 0) return <p className="text-sm text-slate-500">{t('none')}</p>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="px-5 py-2 font-medium">{t('columns.person')}</th>
            <th className="px-5 py-2 font-medium">{t('columns.manager')}</th>
            <th className="px-5 py-2 font-medium">{t('columns.endsOn')}</th>
            <th className="px-5 py-2 font-medium">{t('columns.dueOn')}</th>
            <th className="px-5 py-2 font-medium">{t('columns.state')}</th>
            <th className="px-5 py-2 font-medium">{t('columns.recommendation')}</th>
            {actions && <th className="px-5 py-2 font-medium" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reviews.map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-2">
                <Link
                  href={`/workspace/performance/probation/${r.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {nameOf(r.employee, locale)}
                </Link>
                <span className="block font-mono text-xs text-slate-400">
                  {r.employee.employeeCode}
                </span>
              </td>
              <td className="px-5 py-2 text-slate-700">
                {r.manager ? nameOf(r.manager, locale) : t('hrAsked')}
              </td>
              <td className="px-5 py-2 whitespace-nowrap">{day(r.probationEndsOn)}</td>
              <td className="px-5 py-2 whitespace-nowrap">{day(r.dueOn)}</td>
              <td className="px-5 py-2">
                <ProbationStateBadge review={r} />
              </td>
              <td className="px-5 py-2">
                {r.recommendation ? t(`recommendations.${r.recommendation}`) : '–'}
              </td>
              {actions && (
                <td className="px-5 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/workspace/employees/${r.employee.id}?tab=job`}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    {t('actOnProbation')}
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
