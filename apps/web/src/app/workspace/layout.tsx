import { can, type NotificationInbox, type Permission, type TenantAccessView } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { LanguageToggle } from '@/components/forms';
import { NavLinks } from '@/components/nav-links';
import { Banner, buttonClass, Logo } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

/** Read-only reasons that choosing a plan or paying an invoice ends. */
const PAYING_RESTORES = new Set<string>([
  'trial_ended',
  'payment_overdue',
  'subscription_ended',
  'no_subscription',
]);

/** Whole days until a trial ends, counting today's remainder as a day. */
const daysLeft = (expiresAt: string) =>
  Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000));

export default async function WorkspaceLayout({ children }: LayoutProps<'/workspace'>) {
  const t = await getTranslations('workspace');
  const tn = await getTranslations('hr.nav');
  const tc = await getTranslations('common');
  const tr = await getTranslations('reasons');
  const tl = await getTranslations('leave.nav');
  const ta = await getTranslations('attendance.nav');
  const tlc = await getTranslations('lifecycle.nav');
  const tw = await getTranslations('workspace.nav');
  const result = await authedFetch<TenantAccessView>('tenant', '/tenant/access');
  const user = await currentTenantUser();
  const may = (permission: Permission) => can(user?.role, permission);
  const hasLeave = result.ok && result.data.access.features.includes('leave');
  const hasAttendance = result.ok && result.data.access.features.includes('attendance');
  const hasPayroll = result.ok && result.data.access.features.includes('payroll');
  const hasProduction = result.ok && result.data.access.features.includes('production');
  // Resignations need approval in every workspace; leave and corrections where enabled.
  const [approvals, inbox] = result.ok
    ? await Promise.all([
        authedFetch<{ count: number }>('tenant', '/tenant/approvals/count'),
        authedFetch<NotificationInbox>('tenant', '/tenant/notifications?unread=true'),
      ])
    : [null, null];
  const waiting = approvals?.ok ? approvals.data.count : 0;
  // Complaint committee members hear harassment cases whatever their role (s.332A).
  const handlesGrievances =
    may('grievances.manage') ||
    (result.ok && (await authedFetch('tenant', '/tenant/grievances/access')).ok);
  const unread = inbox?.ok ? inbox.data.unread : 0;

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
    ...(may('employees.read') ? [{ href: '/workspace/employees', label: tn('employees') }] : []),
    ...(may('lifecycle.manage') ? [{ href: '/workspace/people', label: tlc('people') }] : []),
    ...(may('org.manage') ? [{ href: '/workspace/organization', label: tn('organization') }] : []),
    ...(may('documents.manage') ? [{ href: '/workspace/letters', label: tlc('letters') }] : []),
    ...(hasLeave && may('leave.manage')
      ? [
          { href: '/workspace/leave/settings', label: tl('settings') },
          { href: '/workspace/leave/maternity', label: tw('maternity') },
        ]
      : []),
    ...(hasAttendance && may('attendance.manage')
      ? [
          {
            href: '/workspace/attendance/settings',
            label: ta('setup'),
            match: ['roster', 'devices', 'summary', 'kiosks'].map(
              (p) => `/workspace/attendance/${p}`,
            ),
          },
        ]
      : []),
    ...(may('payroll.view') && hasPayroll
      ? [
          {
            href: '/workspace/payroll/runs',
            label: tw('payroll'),
            match: ['/workspace/payroll'],
          },
        ]
      : []),
    ...(hasPayroll ? [{ href: '/workspace/payslips', label: tw('payslips') }] : []),
    ...(hasProduction && may('production.manage')
      ? [{ href: '/workspace/production', label: tw('production') }]
      : []),
    ...(may('compliance.manage')
      ? [{ href: '/workspace/compliance', label: tw('compliance') }]
      : []),
    ...(handlesGrievances ? [{ href: '/workspace/grievances', label: tw('grievances') }] : []),
    ...(may('users.manage') ? [{ href: '/workspace/users', label: tw('users') }] : []),
    ...(may('billing.manage') ? [{ href: '/workspace/billing', label: tw('billing') }] : []),
    ...(may('org.manage') ? [{ href: '/workspace/setup', label: tw('setup') }] : []),
    { href: '/workspace/profile', label: tn('profile') },
    { href: '/workspace/account', label: tw('account') },
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
            {result.ok && (
              <Link
                href="/workspace/notifications"
                aria-label={tw('notificationsLabel', { count: unread })}
                className="relative rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="size-5"
                >
                  <path
                    d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
            )}
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
                {may('billing.manage') && PAYING_RESTORES.has(result.data.access.reason) && (
                  <>
                    {' '}
                    <Link href="/workspace/billing" className="font-medium underline">
                      {t('payToRestore')}
                    </Link>
                  </>
                )}
              </Banner>
            )}
            {result.data.tenant.billingMode === 'trial' &&
              result.data.access.accessState === 'full' &&
              result.data.tenant.accessExpiresAt && (
                <Banner tone="slate">
                  {t('trial', { days: daysLeft(result.data.tenant.accessExpiresAt) })}{' '}
                  <Link href="/workspace/welcome" className="font-medium underline">
                    {t('gettingStarted')}
                  </Link>{' '}
                  ·{' '}
                  <Link
                    href={may('billing.manage') ? '/workspace/billing' : '/pricing'}
                    className="font-medium underline"
                  >
                    {t('plans')}
                  </Link>
                </Banner>
              )}
            {children}
          </main>
        </div>
      )}
    </>
  );
}
