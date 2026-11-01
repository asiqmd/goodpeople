import { can, type CycleListItem } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { CycleStatusBadge } from '@/components/performance/cycle-views';
import { Banner, buttonClass, Card } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

/** Every review cycle of the login's companies, newest first. */
export default async function CyclesPage() {
  if (!can((await currentTenantUser())?.role, 'performance.manage')) {
    redirect('/workspace/performance');
  }
  const t = await getTranslations('reviews');
  const format = await getFormatter();
  const result = await authedFetch<CycleListItem[]>('tenant', '/tenant/performance/cycles');
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/workspace/performance" className="text-sm text-slate-500 hover:underline">
            ← {t('title')}
          </Link>
          <h1 className="text-2xl font-semibold">{t('cycle.list.title')}</h1>
          <p className="text-sm text-slate-600">{t('cycle.list.intro')}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/workspace/performance/settings" className={buttonClass.secondary}>
            {t('settings.title')}
          </Link>
          <Link href="/workspace/performance/cycles/new" className={buttonClass.primary}>
            {t('cycle.list.new')}
          </Link>
        </div>
      </div>
      {!result.ok ? (
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      ) : (
        <Card>
          {result.data.length === 0 ? (
            <p className="text-sm text-slate-500">{t('cycle.list.none')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {result.data.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="space-y-0.5">
                    <Link
                      href={`/workspace/performance/cycles/${c.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="text-sm text-slate-600">
                      {[
                        `${day(format, c.periodStart)} – ${day(format, c.periodEnd)}`,
                        c.legalEntities.length
                          ? c.legalEntities.map((e) => e.name).join(', ')
                          : t('cycle.allCompanies'),
                        c.status !== 'draft' &&
                          t('cycle.list.reviews', {
                            count: c.reviews,
                            n: format.number(c.reviews),
                            released: format.number(c.released),
                          }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <CycleStatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
