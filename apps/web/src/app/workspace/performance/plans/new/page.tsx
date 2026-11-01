import { todayIn, type EmployeeRef, type PerformanceRecord } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlanForm } from '@/components/performance/plan-forms';
import { nameOf, PlanLawNote } from '@/components/performance/plan-views';
import { buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

/**
 * A new improvement plan: first the person (someone below the login, or in HR's companies),
 * then the plan. `?employeeId=&reviewId=` comes from a review that recommended one.
 */
export default async function NewPlanPage({
  searchParams,
}: PageProps<'/workspace/performance/plans/new'>) {
  const sp = await searchParams;
  const employeeId = one(sp.employeeId);
  const search = one(sp.search);
  const t = await getTranslations('development.planForm');
  const locale = await getLocale();

  if (!employeeId) {
    const people = await load<EmployeeRef[]>(
      'tenant',
      `/tenant/performance/plans/people?${new URLSearchParams({ search })}`,
    );
    return (
      <>
        <Header title={t('title')} />
        <Card title={t('choosePerson')}>
          <form method="get" className="mb-4 flex flex-wrap gap-3">
            <input
              name="search"
              defaultValue={search}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className={`${inputClass} max-w-xs`}
            />
            <button type="submit" className={buttonClass.secondary}>
              {t('search')}
            </button>
          </form>
          {people.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noPeople')}</p>
          ) : (
            <ul className="-mx-5 divide-y divide-slate-100 text-sm">
              {people.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/workspace/performance/plans/new?employeeId=${p.id}`}
                    className="flex justify-between gap-3 px-5 py-2 hover:bg-slate-50"
                  >
                    <span className="font-medium text-brand-700">{nameOf(p, locale)}</span>
                    <span className="font-mono text-xs text-slate-400">{p.employeeCode}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  }

  const result = await authedFetch<PerformanceRecord>(
    'tenant',
    `/tenant/employees/${employeeId}/performance`,
  );
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const record = result.data;
  const reviews = record.reviews.map((r) => ({ id: r.id, label: r.cycle.name }));
  return (
    <>
      <Header title={t('titleFor', { name: nameOf(record.employee, locale) })} />
      <PlanLawNote />
      <Card>
        <PlanForm
          employeeId={employeeId}
          reviews={reviews}
          reviewId={one(sp.reviewId) || undefined}
          today={todayIn()}
        />
      </Card>
    </>
  );
}

async function Header({ title }: { title: string }) {
  const t = await getTranslations('development.plans');
  return (
    <div className="space-y-1">
      <Link href="/workspace/performance/plans" className="text-sm text-slate-500 hover:underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
    </div>
  );
}
