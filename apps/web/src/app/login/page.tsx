import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/forms';
import { SiteFooter } from '@/components/help/site-footer';
import { StatusBanner } from '@/components/status/status-banner';
import { Banner } from '@/components/ui';

export default async function WorkspaceLogin({ searchParams }: PageProps<'/login'>) {
  const t = await getTranslations('login');
  const { expired, created } = await searchParams;
  return (
    <AuthShell title={t('workspaceTitle')} expired={expired === '1'} footer={<SiteFooter />}>
      <div className="mb-4 empty:hidden">
        <StatusBanner />
      </div>
      {typeof created === 'string' && (
        <div className="mb-4">
          <Banner tone="green">{t('created', { slug: created })}</Banner>
        </div>
      )}
      <LoginForm kind="tenant" />
    </AuthShell>
  );
}
