import type { EmployeeRef, GoalChoices, MyGoals } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GoalForm } from '@/components/performance/goal-forms';
import { goalPersonName, goalUnitName } from '@/components/performance/goal-views';
import { buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * A new goal: the login's own, a team member's (`?employee=`) or a unit's (`?unit=`). Managers
 * and HR find the person to draft for by name or code.
 */
export default async function NewGoalPage({
  searchParams,
}: PageProps<'/workspace/performance/goals/new'>) {
  const t = await getTranslations('goals.new');
  const locale = await getLocale();
  const query = await searchParams;
  const employee = one(query.employee);
  const unit = one(query.unit);
  const search = one(query.search);
  const my = await load<MyGoals>('tenant', '/tenant/performance/goals/mine');
  const findsOthers = my.managesPeople || my.manage;

  const owner = unit
    ? `?orgUnitId=${encodeURIComponent(unit)}`
    : employee
      ? `?employeeId=${encodeURIComponent(employee)}`
      : '';
  const choices =
    unit || employee || my.employee
      ? await authedFetch<GoalChoices>('tenant', `/tenant/performance/goals/choices${owner}`)
      : null;
  if (choices && !choices.ok) {
    if (choices.status === 404 || choices.status === 400) notFound();
    throw new Error(choices.error.message);
  }
  const found =
    findsOthers && search !== undefined
      ? await load<EmployeeRef[]>(
          'tenant',
          `/tenant/performance/goals/people?search=${encodeURIComponent(search)}`,
        )
      : null;
  const c = choices?.data;
  const forWhom = c?.orgUnit
    ? t('forUnit', { unit: goalUnitName(c.orgUnit, locale) })
    : c?.employee && c.employee.id !== my.employee?.id
      ? t('forPerson', { name: goalPersonName(c.employee, locale) })
      : c
        ? t('forYou')
        : null;

  return (
    <>
      <div className="space-y-1">
        <Link
          href="/workspace/performance/goals"
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t('back')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {forWhom && <p className="text-sm text-slate-600">{forWhom}</p>}
      </div>

      {findsOthers && !unit && (
        <Card title={t('someoneElse')}>
          <form action="/workspace/performance/goals/new" className="flex flex-wrap gap-2">
            <input
              name="search"
              defaultValue={search}
              placeholder={t('searchPlaceholder')}
              aria-label={t('search')}
              className={`${inputClass} max-w-sm`}
            />
            <button className={buttonClass.secondary}>{t('search')}</button>
          </form>
          {found && (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {found.length === 0 && <li className="py-2 text-slate-500">{t('nobodyFound')}</li>}
              {found.map((p) => (
                <li key={p.id} className="py-2">
                  <Link
                    href={`/workspace/performance/goals/new?employee=${p.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {goalPersonName(p, locale)}
                  </Link>{' '}
                  <span className="text-slate-500">{p.employeeCode}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {c ? (
        <Card>
          <GoalForm
            owner={{
              employeeId: c.employee?.id,
              orgUnitId: c.orgUnit?.id,
            }}
            cycles={c.cycles}
            alignTo={c.alignTo}
            defaults={{ cycleId: one(query.cycle), parentGoalId: one(query.parent) }}
          />
        </Card>
      ) : (
        <p className="text-sm text-slate-600">{t('choosePerson')}</p>
      )}
    </>
  );
}
