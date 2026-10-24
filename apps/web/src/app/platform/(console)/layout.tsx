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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/platform" className="flex items-center gap-3">
              <Logo />
              <Badge tone="slate">{t('staffOnly')}</Badge>
            </Link>
            <nav className="flex gap-4 text-sm font-medium text-slate-600">
              <Link href="/platform" className="hover:text-slate-900">
                {t('tenants')}
              </Link>
              <Link href="/platform/audit" className="hover:text-slate-900">
                {t('audit')}
              </Link>
              <Link href="/platform/account" className="hover:text-slate-900">
                {t('account')}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
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
