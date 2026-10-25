import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/forms';
import { Banner } from '@/components/ui';

export default async function WorkspaceLogin({ searchParams }: PageProps<'/login'>) {
  const t = await getTranslations('login');
  const { expired, created } = await searchParams;
  return (
    <AuthShell title={t('workspaceTitle')} expired={expired === '1'}>
      {typeof created === 'string' && (
        <div className="mb-4">
          <Banner tone="green">{t('created', { slug: created })}</Banner>
        </div>
      )}
      <LoginForm kind="tenant" />
    </AuthShell>
  );
}
