import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LanguageToggle } from './forms';
import { Banner, Logo } from './ui';

export async function AuthShell({
  title,
  subtitle,
  expired,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  expired: boolean;
  /** The public site's footer, for the workspace sign-in and sign-up (not the console's). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations('login');
  const th = await getTranslations('help');
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {footer && (
            <Link href="/help" className="font-medium text-slate-600 hover:text-slate-900">
              {th('link')}
            </Link>
          )}
          <LanguageToggle />
        </nav>
      </header>
      <div className="my-auto rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        {expired && (
          <div className="mt-4">
            <Banner tone="amber">{t('expired')}</Banner>
          </div>
        )}
        <div className="mt-6">{children}</div>
      </div>
      {footer}
    </main>
  );
}
