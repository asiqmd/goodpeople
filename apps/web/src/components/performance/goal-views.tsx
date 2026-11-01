import type {
  EmployeeRef,
  GoalCycleRef,
  GoalStatus,
  GoalUnitRef,
  GoalView,
  KpiReading,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Badge, type Tone } from '../ui';

// Goals as lists and parts of the goal page: kind, weight, progress as a bar with its number,
// status and due date.

const GOAL_TONE: Record<GoalStatus, Tone> = {
  draft: 'amber',
  agreed: 'blue',
  completed: 'green',
  dropped: 'slate',
};

export const goalPersonName = (p: EmployeeRef, locale: string) =>
  locale === 'bn' && p.fullNameBn ? p.fullNameBn : p.fullName;

export const goalUnitName = (u: GoalUnitRef, locale: string) =>
  locale === 'bn' && u.nameBn ? u.nameBn : u.name;

/** A cycle whose goals still change. */
export const goalCycleOpen = (cycle: GoalCycleRef | null) =>
  !cycle || cycle.status === 'draft' || cycle.status === 'active';

/** Goals grouped by cycle in the order they come, goals outside any cycle last. */
export function byCycle(goals: GoalView[]): { cycle: GoalCycleRef | null; goals: GoalView[] }[] {
  const groups = new Map<string, { cycle: GoalCycleRef | null; goals: GoalView[] }>();
  for (const g of goals) {
    const key = g.cycle?.id ?? '';
    const group = groups.get(key) ?? { cycle: g.cycle, goals: [] };
    group.goals.push(g);
    groups.set(key, group);
  }
  return [...groups.values()].toSorted((a, b) => Number(!a.cycle) - Number(!b.cycle));
}

/** A date (an ISO day) as the reader reads it. */
export async function goalDay() {
  const format = await getFormatter();
  return (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
}

export async function GoalStatusBadge({ status }: { status: GoalStatus }) {
  const t = await getTranslations('goals.statuses');
  return <Badge tone={GOAL_TONE[status]}>{t(status)}</Badge>;
}

/** Progress as a bar with its number beside it, so it never rests on colour alone. */
export async function GoalProgress({ value, wide }: { value: number; wide?: boolean }) {
  const t = await getTranslations('goals');
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('progressLabel')}
        className={`block h-2 overflow-hidden rounded-full bg-slate-200 ${wide ? 'w-48' : 'w-24'}`}
      >
        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${value}%` }} />
      </span>
      <span className="text-sm font-medium text-slate-800 tabular-nums">
        {t('progress', { value })}
      </span>
    </span>
  );
}

/** How a KPI from the records got its value, in words. */
export async function KpiReadingText({ reading }: { reading: KpiReading }) {
  const t = await getTranslations('goals.reading');
  const day = await goalDay();
  const when = { from: day(reading.from), to: day(reading.to) };
  if (reading.source === 'attendance_rate') {
    if (reading.workingDays === 0) return <>{t('noAttendance', when)}</>;
    return (
      <>
        {t('attendance', {
          present: reading.presentDays,
          working: reading.workingDays,
          people: reading.people,
          ...when,
        })}
      </>
    );
  }
  if (reading.target === 0) return <>{t('noProduction', when)}</>;
  return (
    <>
      {t('production', {
        pieces: reading.pieces,
        target: reading.target,
        people: reading.people,
        ...when,
      })}
    </>
  );
}

/** A goal's measure: the key results done, or the value against the target. */
export async function GoalMeasure({ goal }: { goal: GoalView }) {
  const t = await getTranslations('goals');
  if (goal.kind === 'objective') {
    if (goal.keyResults.length === 0) return null;
    return (
      <>
        {t('keyResultsDone', {
          done: goal.keyResults.filter((k) => k.done).length,
          total: goal.keyResults.length,
        })}
      </>
    );
  }
  const target = Number(goal.target ?? 0);
  const unit = goal.measureUnit ?? '';
  return (
    <>
      {goal.currentValue === null
        ? t('measureNone', { target, unit })
        : t('measure', { value: Number(goal.currentValue), target, unit })}{' '}
      · {t(`directions.${goal.direction ?? 'higher'}`)}
    </>
  );
}

/** One goal in a list: its title, kind, weight, due date, status and progress. */
export async function GoalRow({
  goal,
  showOwner = false,
  action,
}: {
  goal: GoalView;
  showOwner?: boolean;
  action?: React.ReactNode;
}) {
  const t = await getTranslations('goals');
  const locale = await getLocale();
  const day = await goalDay();
  const owner = goal.employee
    ? goalPersonName(goal.employee, locale)
    : goal.orgUnit && goalUnitName(goal.orgUnit, locale);
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          <Link
            href={`/workspace/performance/goals/${goal.id}`}
            className="text-brand-700 hover:underline"
          >
            {goal.title}
          </Link>
        </p>
        <p className="text-sm text-slate-600">
          {[
            showOwner && owner,
            t(`kinds.${goal.kind}`),
            goal.weight !== null && t('weight', { weight: Number(goal.weight) }),
            goal.dueOn && t('due', { date: day(goal.dueOn) }),
            goal.parent && t('serves', { title: goal.parent.title }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {goal.kind === 'kpi' && (
          <p className="text-xs text-slate-500">
            <GoalMeasure goal={goal} />
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <GoalProgress value={goal.progress} />
        <GoalStatusBadge status={goal.status} />
        {action}
      </div>
    </li>
  );
}

/** A list of goals, or a line saying there are none. */
export async function GoalList({
  goals,
  showOwner,
  actions,
}: {
  goals: GoalView[];
  showOwner?: boolean;
  actions?: Map<string, React.ReactNode>;
}) {
  const t = await getTranslations('goals');
  if (goals.length === 0) return <p className="text-sm text-slate-500">{t('noGoals')}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {goals.map((g) => (
        <GoalRow key={g.id} goal={g} showOwner={showOwner} action={actions?.get(g.id)} />
      ))}
    </ul>
  );
}
