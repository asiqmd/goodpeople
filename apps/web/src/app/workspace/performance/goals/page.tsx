import {
  GOAL_STATUSES,
  goalWeights,
  weightsComplete,
  type GoalStatus,
  type GoalView,
  type MyGoals,
  type Page,
  type TeamGoals,
  type UnitGoals,
} from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  AgreeAllGoalsButton,
  GoalStepButton,
  SubmitGoalsButton,
} from '@/components/performance/goal-forms';
import {
  byCycle,
  goalCycleOpen,
  goalPersonName,
  goalUnitName,
  GoalList,
} from '@/components/performance/goal-views';
import { Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';

const TABS = ['mine', 'team', 'units', 'all'] as const;
type Tab = (typeof TABS)[number];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
  }`;

/** Weights of one person's goals for a cycle, as the line above them shows. */
async function WeightLine({ goals }: { goals: GoalView[] }) {
  const t = await getTranslations('goals');
  const { agreed, draft, total } = goalWeights(goals);
  return (
    <p className={`text-xs ${weightsComplete(total) ? 'text-slate-500' : 'text-amber-800'}`}>
      {t('weights', { total })} · {t('weightsSplit', { agreed, draft })}
    </p>
  );
}

/**
 * Goals: the login's own by cycle, their team's for managers (with what waits for agreement),
 * units' goals, and everyone's for HR.
 */
export default async function GoalsPage({
  searchParams,
}: PageProps<'/workspace/performance/goals'>) {
  const t = await getTranslations('goals');
  const query = await searchParams;
  const result = await authedFetch<MyGoals>('tenant', '/tenant/performance/goals/mine');
  if (!result.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      </>
    );
  }
  const my = result.data;
  const shown: Tab[] = TABS.filter(
    (tab) => (tab !== 'team' || my.managesPeople) && (tab !== 'all' || my.manage),
  );
  const wanted = one(query.tab) as Tab | undefined;
  const tab: Tab = wanted && shown.includes(wanted) ? wanted : shown[0]!;
  const cycle = one(query.cycle) ?? '';
  const status = GOAL_STATUSES.includes(one(query.status) as GoalStatus)
    ? (one(query.status) as GoalStatus)
    : '';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-slate-600">{t('intro')}</p>
        </div>
        <Link href="/workspace/performance/goals/new" className={buttonClass.primary}>
          {t('new.title')}
        </Link>
      </div>
      <nav className="flex w-fit flex-wrap gap-0.5 rounded-lg bg-slate-100 p-0.5">
        {shown.map((s) => (
          <Link
            key={s}
            href={`/workspace/performance/goals?tab=${s}`}
            className={tabClass(s === tab)}
            aria-current={s === tab}
          >
            {t(`tabs.${s}`)}
          </Link>
        ))}
      </nav>
      {tab === 'mine' && <MineTab my={my} />}
      {tab === 'team' && <TeamTab cycle={cycle} status={status} />}
      {tab === 'units' && <UnitsTab />}
      {tab === 'all' && (
        <AllTab cycle={cycle} status={status} page={Number(one(query.page) ?? 1) || 1} />
      )}
    </>
  );
}

async function MineTab({ my }: { my: MyGoals }) {
  const t = await getTranslations('goals');
  if (!my.employee) return <Banner tone="slate">{t('noEmployee')}</Banner>;
  const groups = byCycle(my.goals);
  return (
    <>
      {my.manager && (
        <p className="text-sm text-slate-600">
          {t('agreedWith', { name: goalPersonName(my.manager, await getLocale()) })}
        </p>
      )}
      {groups.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">{t('noGoals')}</p>
        </Card>
      )}
      {groups.map(({ cycle, goals }) => {
        const drafts = goals.some((g) => g.status === 'draft');
        return (
          <Card
            key={cycle?.id ?? 'none'}
            title={cycle?.name ?? t('outsideCycles')}
            action={
              drafts && goalCycleOpen(cycle) ? (
                <SubmitGoalsButton cycleId={cycle?.id ?? null} />
              ) : null
            }
          >
            {cycle && <WeightLine goals={goals} />}
            <GoalList goals={goals} />
          </Card>
        );
      })}
      {my.alignTo.length > 0 && (
        <Card title={t('alignHeading')}>
          <p className="mb-2 text-sm text-slate-600">{t('alignHint')}</p>
          <GoalList goals={my.alignTo} showOwner />
        </Card>
      )}
    </>
  );
}

/** A filter of cycles and statuses, kept in the address. */
async function Filters({
  tab,
  cycles,
  cycle,
  status,
}: {
  tab: Tab;
  cycles: { id: string; name: string }[];
  cycle: string;
  status: string;
}) {
  const t = await getTranslations('goals');
  return (
    <form action="/workspace/performance/goals" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="tab" value={tab} />
      <select
        name="cycle"
        defaultValue={cycle}
        aria-label={t('filter.cycle')}
        className={inputClass}
      >
        <option value="">{t('filter.allCycles')}</option>
        <option value="none">{t('outsideCycles')}</option>
        {cycles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        name="status"
        defaultValue={status}
        aria-label={t('filter.status')}
        className={inputClass}
      >
        <option value="">{t('filter.allStatuses')}</option>
        {GOAL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`statuses.${s}`)}
          </option>
        ))}
      </select>
      <button className={buttonClass.secondary}>{t('filter.apply')}</button>
    </form>
  );
}

async function TeamTab({ cycle, status }: { cycle: string; status: string }) {
  const t = await getTranslations('goals');
  const locale = await getLocale();
  const params = new URLSearchParams({
    ...(cycle ? { cycleId: cycle } : {}),
    ...(status ? { status } : {}),
  });
  const team = await load<TeamGoals>(
    'tenant',
    `/tenant/performance/goals/team${params.size ? `?${params}` : ''}`,
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">{t('toAgree', { count: team.toAgree })}</p>
        <Filters tab="team" cycles={team.cycles} cycle={cycle} status={status} />
      </div>
      {team.people.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">{t('team.none')}</p>
        </Card>
      )}
      {team.people.map((p) => (
        <Card
          key={p.employee.id}
          title={
            <>
              {goalPersonName(p.employee, locale)}{' '}
              <span className="font-normal text-slate-500">{p.employee.employeeCode}</span>
            </>
          }
          action={
            <Link
              href={`/workspace/performance/goals/new?employee=${p.employee.id}${cycle && cycle !== 'none' ? `&cycle=${cycle}` : ''}`}
              className={buttonClass.secondary}
            >
              {t('newFor')}
            </Link>
          }
        >
          {p.manager && (
            <p className="mb-2 text-sm text-slate-600">
              {t('reportsTo', { name: goalPersonName(p.manager, locale) })}
            </p>
          )}
          {p.goals.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noGoals')}</p>
          ) : (
            byCycle(p.goals).map(({ cycle: c, goals }) => {
              const drafts = goals.filter((g) => g.status === 'draft');
              const open = goalCycleOpen(c);
              const { total } = goalWeights(goals);
              const agree = new Map(
                open
                  ? drafts.map((g) => [
                      g.id,
                      <GoalStepButton
                        key={g.id}
                        goalId={g.id}
                        step="agree"
                        label={t('agree')}
                        variant="secondary"
                      />,
                    ])
                  : [],
              );
              return (
                <div key={c?.id ?? 'none'} className="mt-3 first:mt-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800">
                      {c?.name ?? t('outsideCycles')}
                    </h3>
                    {open && drafts.length > 1 && (
                      <AgreeAllGoalsButton
                        employeeId={p.employee.id}
                        cycleId={c?.id ?? null}
                        label={
                          c
                            ? t('agreeAll', { count: drafts.length, total })
                            : t('agreeAllNoCycle', { count: drafts.length })
                        }
                      />
                    )}
                  </div>
                  {c && <WeightLine goals={goals} />}
                  <GoalList goals={goals} actions={agree} />
                </div>
              );
            })
          )}
        </Card>
      ))}
    </>
  );
}

async function UnitsTab() {
  const t = await getTranslations('goals');
  const locale = await getLocale();
  const { units } = await load<UnitGoals>('tenant', '/tenant/performance/goals/units');
  return (
    <>
      <p className="text-sm text-slate-600">{t('units.hint')}</p>
      {units.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">{t('units.none')}</p>
        </Card>
      )}
      {units.map(({ unit, goals, canWrite }) => (
        <Card
          key={unit.id}
          title={
            <>
              {goalUnitName(unit, locale)}{' '}
              <span className="font-normal text-slate-500">{unit.code}</span>
            </>
          }
          action={
            canWrite ? (
              <Link
                href={`/workspace/performance/goals/new?unit=${unit.id}`}
                className={buttonClass.secondary}
              >
                {t('newUnit')}
              </Link>
            ) : null
          }
        >
          <GoalList goals={goals} />
        </Card>
      ))}
    </>
  );
}

async function AllTab({ cycle, status, page }: { cycle: string; status: string; page: number }) {
  const t = await getTranslations('goals');
  const params = new URLSearchParams({
    ...(cycle ? { cycleId: cycle } : {}),
    ...(status ? { status } : {}),
    page: String(page),
    pageSize: '50',
  });
  const [list, { cycles }] = await Promise.all([
    load<Page<GoalView>>('tenant', `/tenant/performance/goals?${params}`),
    load<UnitGoals>('tenant', '/tenant/performance/goals/units'),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (p: number) => {
    const next = new URLSearchParams({
      tab: 'all',
      ...(cycle ? { cycle } : {}),
      ...(status ? { status } : {}),
      page: String(p),
    });
    return `/workspace/performance/goals?${next}`;
  };
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">{t('all.count', { count: list.total })}</p>
        <Filters tab="all" cycles={cycles} cycle={cycle} status={status} />
      </div>
      <GoalList goals={list.items} showOwner />
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1)} className="text-brand-700 hover:underline">
              {t('all.previous')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-600">{t('all.page', { page, pages })}</span>
          {page < pages ? (
            <Link href={href(page + 1)} className="text-brand-700 hover:underline">
              {t('all.next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </Card>
  );
}
