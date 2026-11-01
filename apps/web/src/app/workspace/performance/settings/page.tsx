import { can, type PerformanceSettingsView } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PerformanceSettingsForm } from '@/components/performance/review-settings-form';
import { Banner, Card } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

/** The competencies reviews rate and the ratings guide, which new cycles start from. */
export default async function PerformanceSettingsPage() {
  if (!can((await currentTenantUser())?.role, 'performance.manage')) {
    redirect('/workspace/performance');
  }
  const t = await getTranslations('reviews');
  const result = await authedFetch<PerformanceSettingsView>(
    'tenant',
    '/tenant/performance/settings',
  );
  return (
    <>
      <div className="space-y-1">
        <Link
          href="/workspace/performance/cycles"
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t('cycle.list.title')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        <p className="text-sm text-slate-600">{t('settings.intro')}</p>
      </div>
      {result.ok ? (
        <Card>
          <PerformanceSettingsForm settings={result.data} />
        </Card>
      ) : (
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      )}
    </>
  );
}
