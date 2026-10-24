import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/forms';

export default async function PlatformLogin({ searchParams }: PageProps<'/platform/login'>) {
  const t = await getTranslations('login');
  const { expired } = await searchParams;
  return (
    <AuthShell
      title={t('platformTitle')}
      subtitle={t('platformSubtitle')}
      expired={expired === '1'}
    >
      <LoginForm kind="platform" />
    </AuthShell>
  );
}
