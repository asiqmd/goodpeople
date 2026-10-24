import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LanguageToggle } from '@/components/forms';
import { buttonClass, Logo } from '@/components/ui';

export default async function Home() {
  const t = await getTranslations('home');
  const tc = await getTranslations('common');
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <LanguageToggle />
      </header>
      <section className="my-auto max-w-2xl py-16">
        <p className="text-sm font-semibold text-brand-700">{tc('tagline')}</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-5 text-lg text-slate-600">{t('body')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className={buttonClass.primary}>
            {t('workspaceCta')}
          </Link>
          <Link href="/platform/login" className={buttonClass.secondary}>
            {t('platformCta')}
          </Link>
        </div>
      </section>
    </main>
  );
}
