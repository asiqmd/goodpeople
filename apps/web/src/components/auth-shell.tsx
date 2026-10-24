import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LanguageToggle } from './forms';
import { Banner, Logo } from './ui';

export async function AuthShell({
  title,
  subtitle,
  expired,
  children,
}: {
  title: string;
  subtitle?: string;
  expired: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations('login');
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>
        <LanguageToggle />
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
    </main>
  );
}
