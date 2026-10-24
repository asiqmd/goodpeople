import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/forms';

export default async function WorkspaceLogin({ searchParams }: PageProps<'/login'>) {
  const t = await getTranslations('login');
  const { expired } = await searchParams;
  return (
    <AuthShell title={t('workspaceTitle')} expired={expired === '1'}>
      <LoginForm kind="tenant" />
    </AuthShell>
  );
}
