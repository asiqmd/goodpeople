import { isRecordSource, type GoalDetail } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  GoalCheckinForm,
  GoalDropForm,
  GoalForm,
  GoalStepButton,
  SubmitGoalsButton,
} from '@/components/performance/goal-forms';
import {
  goalDay,
  GoalList,
  GoalMeasure,
  goalPersonName,
  GoalProgress,
  GoalStatusBadge,
  goalUnitName,
  KpiReadingText,
} from '@/components/performance/goal-views';
import { Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

/**
 * One goal: what it is and how it is measured, its progress (for a KPI from the records, how
 * the value was read), what it serves and what serves it, its check-ins, and what the reader
 * may do with it.
 */
export default async function GoalPage({ params }: PageProps<'/workspace/performance/goals/[id]'>) {
  const { id } = await params;
  const t = await getTranslations('goals');
  const td = await getTranslations('goals.detail');
  const locale = await getLocale();
  const format = await getFormatter();
  const clock = await clockOptions();
  const day = await goalDay();
  const time = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dhaka',
      ...clock,
    });
  const result = await authedFetch<GoalDetail>('tenant', `/tenant/performance/goals/${id}`);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const goal = result.data;
  const owner = goal.employee
    ? goalPersonName(goal.employee, locale)
    : goal.orgUnit
      ? td('unitOwner', { unit: goalUnitName(goal.orgUnit, locale) })
      : '';
  const fromRecords = goal.kind === 'kpi' && isRecordSource(goal.source);

  return (
    <>
      <div className="space-y-1">
        <Link
          href="/workspace/performance/goals"
          className="text-sm text-slate-500 hover:underline"
        >
          ← {td('back')}
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {goal.title}
          <GoalStatusBadge status={goal.status} />
        </h1>
        <p className="text-sm text-slate-600">
          {[
            owner,
            t(`kinds.${goal.kind}`),
            goal.cycle?.name ?? t('outsideCycles'),
            goal.weight !== null && t('weight', { weight: Number(goal.weight) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {goal.status === 'dropped' && goal.dropNote && (
        <Banner tone="slate">{td('dropped', { note: goal.dropNote })}</Banner>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title={td('progress')}>
            <div className="space-y-3 text-sm">
              <GoalProgress value={goal.progress} wide />
              {goal.kind === 'kpi' && (
                <p className="text-slate-700">
                  <GoalMeasure goal={goal} />
                </p>
              )}
              {fromRecords && (
                <p className="text-slate-700">
                  {goal.reading ? <KpiReadingText reading={goal.reading} /> : td('readingClosed')}
                </p>
              )}
              {fromRecords && (
                <p className="text-xs text-slate-500">{t(`form.sourceHint.${goal.source}`)}</p>
              )}
              {goal.kind === 'objective' && goal.keyResults.length > 0 && (
                <ul className="space-y-1">
                  {goal.keyResults.map((k, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span aria-hidden className={k.done ? 'text-brand-700' : 'text-slate-400'}>
                        {k.done ? '✓' : '○'}
                      </span>
                      <span>
                        {k.text}{' '}
                        <span className="text-xs text-slate-500">
                          ({k.done ? td('krDone') : td('krOpen')})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {goal.description && (
                <p className="whitespace-pre-line text-slate-700">{goal.description}</p>
              )}
            </div>
          </Card>

          <Card title={td('checkins')}>
            {goal.can.checkin && (
              <div className="mb-5 border-b border-slate-100 pb-5">
                <GoalCheckinForm goal={goal} />
              </div>
            )}
            {goal.checkins.length === 0 ? (
              <p className="text-sm text-slate-500">{td('noCheckins')}</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {goal.checkins.map((c) => (
                  <li key={c.id} className="space-y-0.5">
                    <p className="text-xs text-slate-500">
                      {time(c.createdAt)}
                      {c.author && ` · ${c.author}`}
                    </p>
                    <p className="text-slate-800">
                      {[
                        c.progress !== null && t('progress', { value: c.progress }),
                        c.value !== null &&
                          td('checkinValue', {
                            value: Number(c.value),
                            unit: goal.measureUnit ?? '',
                          }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {c.note && <p className="whitespace-pre-line text-slate-700">{c.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {goal.can.edit && (
            <Card title={td('edit')}>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  {td('editOpen')}
                </summary>
                <div className="mt-4">
                  <GoalForm goal={goal} owner={{}} cycles={goal.cycles} alignTo={goal.alignTo} />
                </div>
              </details>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title={td('about')}>
            <dl className="space-y-2 text-sm">
              {goal.startsOn && (
                <div>
                  <dt className="text-slate-500">{td('startsOn')}</dt>
                  <dd>{day(goal.startsOn)}</dd>
                </div>
              )}
              {goal.dueOn && (
                <div>
                  <dt className="text-slate-500">{td('dueOn')}</dt>
                  <dd>{day(goal.dueOn)}</dd>
                </div>
              )}
              {goal.kind === 'kpi' && (
                <div>
                  <dt className="text-slate-500">{td('source')}</dt>
                  <dd>{t(`sources.${goal.source}`)}</dd>
                </div>
              )}
              {goal.agreedAt && (
                <div>
                  <dt className="text-slate-500">{goal.employee ? td('agreed') : td('set')}</dt>
                  <dd>
                    {time(goal.agreedAt)}
                    {goal.agreedBy && ` · ${goal.agreedBy}`}
                  </dd>
                </div>
              )}
            </dl>
            {(goal.can.agree || goal.can.submit || goal.can.complete || goal.can.drop) && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                {goal.can.submit && <SubmitGoalsButton cycleId={goal.cycle?.id ?? null} />}
                {goal.can.agree && (
                  <GoalStepButton goalId={goal.id} step="agree" label={t('agree')} />
                )}
                {goal.can.complete && (
                  <GoalStepButton
                    goalId={goal.id}
                    step="complete"
                    label={td('complete')}
                    confirmText={td('completeConfirm')}
                    variant="secondary"
                  />
                )}
                {goal.can.drop && <GoalDropForm goalId={goal.id} />}
              </div>
            )}
          </Card>

          <Card title={td('serves')}>
            {goal.parentGoal ? (
              <GoalList goals={[goal.parentGoal]} showOwner />
            ) : goal.parent ? (
              <p className="text-sm text-slate-700">{goal.parent.title}</p>
            ) : (
              <p className="text-sm text-slate-500">{td('servesNothing')}</p>
            )}
          </Card>

          <Card title={td('children')}>
            {goal.children.length === 0 ? (
              <p className="text-sm text-slate-500">{td('noChildren')}</p>
            ) : (
              <GoalList goals={goal.children} showOwner />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
