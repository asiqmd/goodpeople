import type { TeamReviewItem } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { day } from '@/components/leave/leave-views';
import { CycleStatusBadge } from '@/components/performance/cycle-views';
import { RatingText, ReviewStatusBadge } from '@/components/performance/review-views';
import { personName } from '@/components/recruitment/opening-views';
import { Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/** The reviews a manager writes or oversees, in the cycles under way, by cycle. */
export default async function TeamReviewsPage() {
  const t = await getTranslations('reviews');
  const format = await getFormatter();
  const locale = await getLocale();
  const result = await authedFetch<TeamReviewItem[]>('tenant', '/tenant/performance/team');
  const header = (
    <div className="space-y-1">
      <Link href="/workspace/performance" className="text-sm text-slate-500 hover:underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('team.title')}</h1>
      <p className="text-sm text-slate-600">{t('team.intro')}</p>
    </div>
  );
  if (!result.ok) {
    return (
      <>
        {header}
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      </>
    );
  }
  const cycles = [...new Map(result.data.map((r) => [r.cycle.id, r.cycle])).values()];
  return (
    <>
      {header}
      {cycles.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">{t('team.none')}</p>
        </Card>
      )}
      {cycles.map((cycle) => (
        <Card key={cycle.id} title={cycle.name} action={<CycleStatusBadge status={cycle.status} />}>
          <ul className="divide-y divide-slate-100">
            {result.data
              .filter((r) => r.cycle.id === cycle.id)
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <Link
                      href={`/workspace/performance/reviews/${r.id}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      {personName(r.employee, locale)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {[
                        r.employee.employeeCode,
                        !r.direct && t('team.further'),
                        r.dueOn && t('tasks.due', { date: day(format, r.dueOn) }),
                        r.peersToApprove > 0 &&
                          t('team.peersToApprove', {
                            count: r.peersToApprove,
                            n: format.number(r.peersToApprove),
                          }),
                        r.acknowledgedAt &&
                          (r.employeeAgrees ? t('acknowledge.agreed') : t('acknowledge.disagreed')),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {r.finalRating !== null ? (
                      <RatingText rating={r.finalRating} />
                    ) : (
                      r.proposedRating !== null && (
                        <span className="text-slate-600">
                          {t('team.proposed')} <RatingText rating={r.proposedRating} />
                        </span>
                      )
                    )}
                    <ReviewStatusBadge status={r.status} />
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
