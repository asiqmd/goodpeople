import { cookies } from 'next/headers';
import { startSso } from '@/app/actions/identity';
import type { LoginState } from '@/app/actions/auth';
import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/forms';
import { SiteFooter } from '@/components/help/site-footer';
import { StatusBanner } from '@/components/status/status-banner';
import { Banner } from '@/components/ui';

export default async function WorkspaceLogin({ searchParams }: PageProps<'/login'>) {
  const t = await getTranslations('login');
  const { expired, created, sso } = await searchParams;
  const jar = await cookies(),
    token = sso === 'step' ? jar.get('gp_sso_mfa')?.value : undefined;
  const initialState: LoginState = token
    ? { step: jar.get('gp_sso_setup')?.value === '1' ? 'mfa_setup_start' : 'mfa', mfaToken: token }
    : undefined;
  const ti = await getTranslations('identity');
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
      {sso === 'failed' && (
        <div className="mb-4">
          <Banner tone="red">{ti('ssoFailed')}</Banner>
        </div>
      )}
      {sso === 'mobile' && (
        <div className="mb-4">
          <Banner tone="green">{ti('mobileReturn')}</Banner>
        </div>
      )}
      <LoginForm kind="tenant" initialState={initialState} />
      {!initialState && (
        <form action={startSso} className="mt-6 space-y-3 border-t pt-5">
          <h2 className="text-sm font-medium">{ti('ssoLogin')}</h2>
          <label className="block text-sm">
            {t('workspace')}
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              name="tenant"
              required
              maxLength={100}
              autoComplete="organization"
            />
          </label>
          <button className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">
            {ti('continueSso')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
