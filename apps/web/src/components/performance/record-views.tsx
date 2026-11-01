import type { PerformanceRecord } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { authedFetch } from '@/lib/api';
import { Badge, Card } from '../ui';
import { dhakaDay, PlanTable } from './plan-views';
import { ProbationTable } from './probation-views';

/** A rating as its number and its words, never colour alone. */
export async function RatingText({ rating }: { rating: number }) {
  const t = await getTranslations('development');
  return <>{t('ratingValue', { rating, words: t(`ratings.${rating}`) })}</>;
}

/**
 * A person's performance record: reviews by cycle with the final rating once released, goals
 * by cycle, improvement plans with their outcomes and, for HR and managers, probation reviews.
 * Each item links to its own page.
 */
export async function PerformanceRecordView({
  record,
  actions = false,
}: {
  record: PerformanceRecord;
  /** Link probation reviews to the person's probation actions. */
  actions?: boolean;
}) {
  const t = await getTranslations('development.record');
  const format = await getFormatter();
  const day = await dhakaDay();
  return (
    <div className="space-y-6">
      <Card title={t('reviews')}>
        {record.reviews.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noReviews')}</p>
        ) : (
          <ul className="-mx-5 divide-y divide-slate-100 text-sm">
            {record.reviews.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <span>
                  <Link
                    href={`/workspace/performance/reviews/${r.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {r.cycle.name}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {t('period', { start: day(r.cycle.periodStart), end: day(r.cycle.periodEnd) })}
                  </span>
                </span>
                <span className="text-right">
                  {r.finalRating !== null ? (
                    <span className="font-medium">
                      <RatingText rating={r.finalRating} />
                    </span>
                  ) : (
                    <Badge tone="slate">{t(`reviewStatuses.${r.status}`)}</Badge>
                  )}
                  {r.goalScore !== null && (
                    <span className="block text-xs text-slate-500">
                      {t('goalScore', { score: Number(r.goalScore) })}
                    </span>
                  )}
                  {r.releasedAt && (
                    <span className="block text-xs text-slate-500">
                      {r.acknowledgedAt
                        ? t(r.employeeAgrees === false ? 'disagreed' : 'acknowledged', {
                            date: day(r.acknowledgedAt),
                          })
                        : t('notAcknowledged')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('goals')}>
        {record.goals.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noGoals')}</p>
        ) : (
          <div className="space-y-5">
            {record.goals.map((group) => (
              <section key={group.cycle?.id ?? 'none'}>
                <h3 className="text-sm font-medium text-slate-500">
                  {group.cycle?.name ?? t('outsideCycle')}
                </h3>
                <ul className="mt-1 divide-y divide-slate-100 text-sm">
                  {group.goals.map((g) => (
                    <li
                      key={g.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2"
                    >
                      <span>
                        <Link
                          href={`/workspace/performance/goals/${g.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {g.title}
                        </Link>
                        <span className="block text-xs text-slate-500">
                          {t(`goalKinds.${g.kind}`)}
                          {g.weight !== null &&
                            ` · ${t('weight', { weight: Number(g.weight) / 100 })}`}
                          {g.dueOn && ` · ${t('due', { date: day(g.dueOn) })}`}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-slate-700">
                          {format.number(g.progress / 100, { style: 'percent' })}
                        </span>
                        <Badge
                          tone={
                            g.status === 'agreed' || g.status === 'completed' ? 'green' : 'slate'
                          }
                        >
                          {t(`goalStatuses.${g.status}`)}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('plans')}>
        <PlanTable plans={record.plans} showPerson={false} />
      </Card>

      {!record.self && (
        <Card title={t('probation')}>
          <ProbationTable reviews={record.probationReviews} actions={actions} />
        </Card>
      )}
    </div>
  );
}

/** The employee page's Performance tab, for HR. */
export async function EmployeePerformanceTab({ employeeId }: { employeeId: string }) {
  const t = await getTranslations('development.record');
  const result = await authedFetch<PerformanceRecord>(
    'tenant',
    `/tenant/employees/${employeeId}/performance`,
  );
  if (!result.ok) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </p>
      </Card>
    );
  }
  return <PerformanceRecordView record={result.data} actions />;
}
