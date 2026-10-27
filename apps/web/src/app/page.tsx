import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LanguageToggle } from '@/components/forms';
import { SiteFooter } from '@/components/help/site-footer';
import { buttonClass, Logo } from '@/components/ui';

const SEGMENTS = ['rmg', 'corporate', 'ngo', 'group'] as const;
const POINTS = ['law', 'payroll', 'attendance', 'bangla'] as const;

export default async function Home() {
  const t = await getTranslations('home');
  const tc = await getTranslations('common');
  const th = await getTranslations('help');
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between gap-4">
        <Logo />
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/help" className="font-medium text-slate-600 hover:text-slate-900">
            {th('link')}
          </Link>
          <Link href="/pricing" className="font-medium text-slate-600 hover:text-slate-900">
            {t('pricing')}
          </Link>
          <Link href="/login" className="font-medium text-slate-600 hover:text-slate-900">
            {t('signIn')}
          </Link>
          <LanguageToggle />
        </nav>
      </header>
      <section className="max-w-2xl py-16">
        <p className="text-sm font-semibold text-brand-700">{tc('tagline')}</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-5 text-lg text-slate-600">{t('body')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className={buttonClass.primary}>
            {t('trialCta')}
          </Link>
          <Link href="/login" className={buttonClass.secondary}>
            {t('workspaceCta')}
          </Link>
        </div>
        <p className="mt-3 text-sm text-slate-500">{t('trialNote')}</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SEGMENTS.map((s) => (
          <div key={s} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">{t(`segments.${s}.title`)}</h2>
            <p className="mt-2 text-sm text-slate-600">{t(`segments.${s}.body`)}</p>
          </div>
        ))}
      </section>
      <section className="mt-12 grid gap-6 sm:grid-cols-2">
        {POINTS.map((p) => (
          <div key={p}>
            <h2 className="font-semibold">{t(`points.${p}.title`)}</h2>
            <p className="mt-1 text-sm text-slate-600">{t(`points.${p}.body`)}</p>
          </div>
        ))}
      </section>
      <SiteFooter>
        <Link href="/platform/login" className="hover:text-slate-700">
          {t('platformCta')}
        </Link>
      </SiteFooter>
    </main>
  );
}
