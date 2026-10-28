import { can, type RecruitmentSettingsView, type TenantAccessView } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { siteOrigin } from '@/components/recruitment/opening-copy';
import { RecruitmentSettingsForm } from '@/components/recruitment/opening-forms';
import { Banner, Card } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';

/** The careers page and how long candidates' data is kept. */
export default async function RecruitmentSettingsPage() {
  if (!can((await currentTenantUser())?.role, 'recruitment.manage')) redirect('/workspace');
  const t = await getTranslations('openings');
  const result = await authedFetch<RecruitmentSettingsView>(
    'tenant',
    '/tenant/recruitment/settings',
  );
  if (!result.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      </>
    );
  }
  const { tenant } = await load<TenantAccessView>('tenant', '/tenant/access');
  const link = `${await siteOrigin()}/careers/${tenant.slug}`;
  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/recruitment" className="text-sm text-slate-500 hover:underline">
          ← {t('title')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        <p className="text-sm text-slate-600">{t('settings.intro')}</p>
      </div>
      <Banner tone={result.data.careersEnabled ? 'green' : 'slate'}>
        {result.data.careersEnabled ? t('settings.live') : t('settings.off')}{' '}
        <a href={link} target="_blank" rel="noopener" className="font-medium underline">
          {link}
        </a>
      </Banner>
      <Card>
        <RecruitmentSettingsForm settings={result.data} />
      </Card>
    </>
  );
}
