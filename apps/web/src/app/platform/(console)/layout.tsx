import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { LanguageToggle } from '@/components/forms';
import { Badge, buttonClass, Logo } from '@/components/ui';

export default async function ConsoleLayout({ children }: LayoutProps<'/platform'>) {
  const t = await getTranslations('platform');
  const tc = await getTranslations('common');
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-4 lg:flex-row lg:items-center lg:gap-6">
            <Link href="/platform" className="flex shrink-0 items-center gap-3 whitespace-nowrap">
              <Logo />
              <Badge tone="slate">{t('staffOnly')}</Badge>
            </Link>
            <nav className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm font-medium whitespace-nowrap text-slate-600">
              <Link href="/platform" className="hover:text-slate-900">
                {t('tenants')}
              </Link>
              <Link href="/platform/international" className="hover:text-slate-900">
                USD / AED
              </Link>
              <Link href="/platform/signups" className="hover:text-slate-900">
                {t('signupsNav')}
              </Link>
              <Link href="/platform/billing" className="hover:text-slate-900">
                {t('billingNav')}
              </Link>
              <Link href="/platform/support" className="hover:text-slate-900">
                {t('supportNav')}
              </Link>
              <Link href="/platform/status" className="hover:text-slate-900">
                {t('statusNav')}
              </Link>
              <Link href="/platform/operations" className="hover:text-slate-900">
                {t('operationsNav')}
              </Link>
              <Link href="/platform/audit" className="hover:text-slate-900">
                {t('audit')}
              </Link>
              <Link href="/platform/placements" className="hover:text-slate-900">
                {(await getTranslations('placements'))('title')}
              </Link>
              <Link href="/platform/assurance" className="hover:text-slate-900">
                {(await getTranslations('assurance'))('title')}
              </Link>
              <Link href="/platform/account" className="hover:text-slate-900">
                {t('account')}
              </Link>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-4 lg:shrink-0">
            <LanguageToggle />
            <form action={signOut.bind(null, 'platform')}>
              <button className={buttonClass.ghost}>{tc('signOut')}</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">{children}</main>
    </>
  );
}
