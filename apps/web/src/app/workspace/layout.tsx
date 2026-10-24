import { HR_ROLES, type TenantAccessView } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/actions/auth';
import { LanguageToggle } from '@/components/forms';
import { NavLinks } from '@/components/nav-links';
import { Banner, buttonClass, Logo } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

export default async function WorkspaceLayout({ children }: LayoutProps<'/workspace'>) {
  const t = await getTranslations('workspace');
  const tn = await getTranslations('hr.nav');
  const tc = await getTranslations('common');
  const tr = await getTranslations('reasons');
  const tl = await getTranslations('leave.nav');
  const ta = await getTranslations('attendance.nav');
  const tlc = await getTranslations('lifecycle.nav');
  const result = await authedFetch<TenantAccessView>('tenant', '/tenant/access');
  const user = await currentTenantUser();
  const isHr = !!user && (HR_ROLES as readonly string[]).includes(user.role);
  const hasLeave = result.ok && result.data.access.features.includes('leave');
  const hasAttendance = result.ok && result.data.access.features.includes('attendance');
  // Resignations need approval in every workspace; leave and corrections where enabled.
  const approvals = result.ok
    ? await authedFetch<{ count: number }>('tenant', '/tenant/approvals/count')
    : null;
  const waiting = approvals?.ok ? approvals.data.count : 0;

  const links = [
    { href: '/workspace', label: tn('home') },
    ...(hasAttendance
      ? [
          { href: '/workspace/attendance', label: ta('attendance') },
          { href: '/workspace/attendance/team', label: ta('team') },
        ]
      : []),
    ...(hasLeave ? [{ href: '/workspace/leave', label: tl('leave') }] : []),
    { href: '/workspace/approvals', label: tl('approvals'), badge: waiting },
    ...(isHr
      ? [
          { href: '/workspace/employees', label: tn('employees') },
          { href: '/workspace/people', label: tlc('people') },
          { href: '/workspace/organization', label: tn('organization') },
          { href: '/workspace/letters', label: tlc('letters') },
          ...(hasLeave ? [{ href: '/workspace/leave/settings', label: tl('settings') }] : []),
          ...(hasAttendance
            ? [
                {
                  href: '/workspace/attendance/settings',
                  label: ta('setup'),
                  match: ['roster', 'devices', 'summary'].map((p) => `/workspace/attendance/${p}`),
                },
              ]
            : []),
        ]
      : []),
    { href: '/workspace/profile', label: tn('profile') },
  ];

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Logo />
            {result.ok && (
              <span className="text-sm text-slate-500">/ {result.data.tenant.name}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <form action={signOut.bind(null, 'tenant')}>
              <button className={buttonClass.ghost}>{tc('signOut')}</button>
            </form>
          </div>
        </div>
      </header>
      {/* A suspended workspace gets a 403 for everything, so show only why. */}
      {!result.ok ? (
        <main className="mx-auto max-w-6xl px-6 py-8">
          <Banner tone="red">
            {result.error.code === 'tenant_suspended' ? t('suspended') : result.error.message}
          </Banner>
        </main>
      ) : (
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6 md:flex-row">
          <aside className="md:w-52 md:shrink-0">
            <NavLinks links={links} />
          </aside>
          <main className="min-w-0 flex-1 space-y-6">
            {result.data.access.accessState === 'read_only' && (
              <Banner tone="amber">
                {t('readOnly')} ({tr(result.data.access.reason)})
              </Banner>
            )}
            {children}
          </main>
        </div>
      )}
    </>
  );
}
