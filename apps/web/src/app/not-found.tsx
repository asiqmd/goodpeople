import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LanguageToggle } from '@/components/forms';
import { buttonClass, Logo } from '@/components/ui';

/** Any address with no page, and every notFound(). */
export default async function NotFound() {
  const t = await getTranslations('common');
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <Logo />
        <LanguageToggle />
      </div>
      <div className="space-y-3">
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('notFoundTitle')}</h1>
        <p className="text-slate-600">{t('notFoundBody')}</p>
        <div className="pt-2">
          <Link href="/" className={buttonClass.primary}>
            {t('goHome')}
          </Link>
        </div>
      </div>
    </main>
  );
}
