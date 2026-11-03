import type { PerformanceMe, PerformanceTask } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpLink } from '@/components/help/help-link';
import { day } from '@/components/leave/leave-views';
import { ProgressBar, RatingText, ReviewStatusBadge } from '@/components/performance/review-views';
import { personName } from '@/components/recruitment/opening-views';
import { Banner, buttonClass, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/** What waits for the login, their goals, and their reviews by cycle. */
export default async function PerformancePage() {
  const t = await getTranslations('reviews');
  const tc = await getTranslations('compensation');
  const format = await getFormatter();
  const locale = await getLocale();
  const result = await authedFetch<PerformanceMe>('tenant', '/tenant/performance/me');
  if (!result.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">
          {t('title')}
          <HelpLink slug="performance" />
        </h1>
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      </>
    );
  }
  const me = result.data;
  const who = (task: PerformanceTask) => (task.person ? personName(task.person, locale) : '');
  const taskText = (task: PerformanceTask) => {
    const values = {
      person: who(task),
      cycle: task.cycle ?? '',
      count: task.count,
      n: format.number(task.count),
    };
    if (task.kind === 'manager_review' && !task.person) return t('tasks.noManager', values);
    return t(`tasks.${task.kind}`, values);
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {t('title')}
            <HelpLink slug="performance" />
          </h1>
          <p className="text-sm text-slate-600">{t('intro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/workspace/performance/compensation" className={buttonClass.secondary}>
            {tc('title')}
          </Link>
          {me.manager && (
            <Link href="/workspace/performance/team" className={buttonClass.secondary}>
              {t('team.title')}
            </Link>
          )}
          <Link href="/workspace/performance/peers" className={buttonClass.secondary}>
            {t('peers.title')}
          </Link>
          {me.manage && (
            <>
              <Link href="/workspace/performance/cycles" className={buttonClass.secondary}>
                {t('cycle.list.title')}
              </Link>
              <Link href="/workspace/performance/settings" className={buttonClass.secondary}>
                {t('settings.title')}
              </Link>
            </>
          )}
        </div>
      </div>

      <Card title={t('tasks.title')}>
        {me.items.length === 0 ? (
          <p className="text-sm text-slate-500">{t('tasks.none')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {me.items.map((task) => (
              <li
                key={`${task.kind}:${task.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <Link
                  href={task.link}
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  {taskText(task)}
                </Link>
                {task.dueOn && (
                  <span className="text-xs text-slate-500">
                    {t('tasks.due', { date: day(format, task.dueOn) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={t('myGoals.title')}
          action={
            <Link
              href="/workspace/performance/goals"
              className="text-sm text-brand-700 hover:underline"
            >
              {t('myGoals.open')}
            </Link>
          }
        >
          {me.goals.total === 0 ? (
            <p className="text-sm text-slate-500">{t('myGoals.none')}</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                {t('myGoals.counts', {
                  total: format.number(me.goals.total),
                  agreed: format.number(me.goals.agreed),
                  draft: format.number(me.goals.draft),
                  completed: format.number(me.goals.completed),
                })}
              </p>
              {me.goals.progress !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">{t('myGoals.progress')}</span>
                  <ProgressBar value={me.goals.progress} />
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title={t('myReviews.title')}>
          {me.reviews.length === 0 ? (
            <p className="text-sm text-slate-500">{t('myReviews.none')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {me.reviews.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                  <div className="space-y-0.5">
                    <Link
                      href={`/workspace/performance/reviews/${r.id}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      {r.cycle.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {day(format, r.cycle.periodStart)} – {day(format, r.cycle.periodEnd)}
                    </p>
                    {r.finalRating !== null && (
                      <p className="text-sm">
                        <RatingText rating={r.finalRating} />
                      </p>
                    )}
                  </div>
                  <ReviewStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
