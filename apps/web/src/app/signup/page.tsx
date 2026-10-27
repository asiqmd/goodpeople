import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { SiteFooter } from '@/components/help/site-footer';
import { SignupForm } from '@/components/signup-form';

export default async function Signup() {
  const t = await getTranslations('signup');
  return (
    <AuthShell title={t('title')} subtitle={t('subtitle')} expired={false} footer={<SiteFooter />}>
      <SignupForm />
      <p className="mt-6 text-sm text-slate-600">
        {t('haveWorkspace')}{' '}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
