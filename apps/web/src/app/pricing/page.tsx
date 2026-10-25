import { PLAN_CATALOG, TRIAL_DAYS } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LanguageToggle } from '@/components/forms';
import { buttonClass, Logo } from '@/components/ui';

export default async function Pricing() {
  const t = await getTranslations('pricing');
  const tf = await getTranslations('features');
  const tl = await getTranslations('limits');
  const tc = await getTranslations('common');
  const format = await getFormatter();
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>
        <LanguageToggle />
      </header>
      <section className="max-w-2xl py-12">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-3 text-slate-600">{t('intro', { days: TRIAL_DAYS })}</p>
        <div className="mt-6">
          <Link href="/signup" className={buttonClass.primary}>
            {t('trialCta')}
          </Link>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_CATALOG.map((plan) => (
          <div
            key={plan.code}
            className={`flex flex-col rounded-xl bg-white p-5 shadow-sm ring-1 ${
              plan.code === 'business' ? 'ring-2 ring-brand-600' : 'ring-slate-200'
            }`}
          >
            <h2 className="font-semibold">{t(`plans.${plan.code}`)}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('price')}</p>
            {plan.code === 'business' && (
              <p className="mt-1 text-xs font-medium text-brand-700">{t('trialPlan')}</p>
            )}
            <ul className="mt-4 space-y-1 text-sm">
              {plan.features.map((f) => (
                <li key={f}>✓ {tf(f)}</li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
              {(['max_employees', 'max_legal_entities'] as const).map((k) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt>{tl(k)}</dt>
                  <dd className="tabular-nums">
                    {plan.limits[k] === null ? tc('unlimited') : format.number(plan.limits[k])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>
      <p className="mt-8 text-sm text-slate-500">{t('vatNote')}</p>
    </main>
  );
}
