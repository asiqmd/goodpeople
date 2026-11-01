import { can, type EmployeeRef, type OutcomeCycle, type PlanListItem } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { isRunning, PlanTable } from '@/components/performance/plan-views';
import { buttonClass, Card, Field, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

/**
 * Improvement plans: the ones the login runs (for people below them, or for HR's companies)
 * by status, their own, and for HR the review outcomes to download.
 */
export default async function PlansPage() {
  const t = await getTranslations('development.plans');
  const role = (await currentTenantUser())?.role;
  const manage = can(role, 'performance.manage');
  const [plans, people, cycles] = await Promise.all([
    load<PlanListItem[]>('tenant', '/tenant/performance/plans'),
    load<EmployeeRef[]>('tenant', '/tenant/performance/plans/people'),
    manage
      ? load<OutcomeCycle[]>('tenant', '/tenant/performance/outcomes/cycles')
      : Promise.resolve([]),
  ]);
  const mine = plans.filter((p) => p.mine);
  const theirs = plans.filter((p) => !p.mine);
  const groups = [
    { key: 'running', plans: theirs.filter((p) => isRunning(p.status)) },
    { key: 'drafts', plans: theirs.filter((p) => p.status === 'draft') },
    { key: 'closed', plans: theirs.filter((p) => p.status !== 'draft' && !isRunning(p.status)) },
  ] as const;
  const runsPlans = people.length > 0 || theirs.length > 0;

  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/performance" className="text-sm text-slate-500 hover:underline">
          ← {t('back')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <div className="flex gap-3">
            <Link href="/workspace/performance/probation" className={buttonClass.secondary}>
              {t('probationLink')}
            </Link>
            {people.length > 0 && (
              <Link href="/workspace/performance/plans/new" className={buttonClass.primary}>
                {t('new')}
              </Link>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-600">{t('intro')}</p>
      </div>

      {mine.length > 0 && (
        <Card title={t('mine')}>
          <PlanTable plans={mine} showPerson={false} />
        </Card>
      )}

      {runsPlans &&
        groups.map((g) => (
          <Card key={g.key} title={t(g.key)}>
            <PlanTable plans={g.plans} />
          </Card>
        ))}

      {!runsPlans && mine.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">{t('none')}</p>
        </Card>
      )}

      {manage && (
        <Card title={t('outcomes.title')}>
          <p className="mb-3 text-sm text-slate-600">{t('outcomes.hint')}</p>
          {cycles.length === 0 ? (
            <p className="text-sm text-slate-500">{t('outcomes.none')}</p>
          ) : (
            <form
              method="get"
              action="/workspace/files/performance-outcomes"
              className="flex flex-wrap items-end gap-3"
            >
              <Field label={t('outcomes.cycle')}>
                <select name="cycleId" required className={inputClass}>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {t('outcomes.option', { name: c.name, count: c.released })}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit" className={buttonClass.secondary}>
                {t('outcomes.download')}
              </button>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
