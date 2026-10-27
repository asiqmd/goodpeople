import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/help/site-footer';
import { buttonClass, inputClass } from '@/components/ui';
import { HELP_CATEGORIES, helpArticles, type HelpArticle } from '@/lib/help/content';
import { searchArticles } from '@/lib/help/search';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('help');
  return { title: `${t('title')} · Good People`, description: t('intro') };
}

const supportLink = (chunks: ReactNode) => (
  <Link href="/workspace/support/new" className="font-medium text-brand-700 hover:underline">
    {chunks}
  </Link>
);

function ArticleLink({ article }: { article: HelpArticle }) {
  return (
    <li>
      <Link href={`/help/${article.slug}`} className="font-medium text-brand-700 hover:underline">
        {article.title}
      </Link>
      <p className="text-sm text-slate-600">{article.summary}</p>
    </li>
  );
}

/** The help centre: every article by topic, or the articles matching a search. */
export default async function HelpCentre({ searchParams }: PageProps<'/help'>) {
  const t = await getTranslations('help');
  const locale = await getLocale();
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  const articles = helpArticles(locale);
  const results = query ? searchArticles(articles, query) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <SiteHeader />
      <section className="max-w-2xl py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-3 text-slate-600">{t('intro')}</p>
        <form action="/help" role="search" className="mt-6 flex gap-2">
          <label className="sr-only" htmlFor="help-q">
            {t('searchLabel')}
          </label>
          <input
            id="help-q"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            placeholder={t('searchPlaceholder')}
            className={inputClass}
          />
          <button className={buttonClass.primary}>{t('search')}</button>
        </form>
      </section>

      {results ? (
        <section aria-live="polite" className="max-w-2xl">
          {results.length ? (
            <>
              <p className="text-sm text-slate-500">
                {t('results', { count: results.length, query })}
              </p>
              <ul className="mt-4 space-y-4">
                {results.map((a) => (
                  <ArticleLink key={a.slug} article={a} />
                ))}
              </ul>
            </>
          ) : (
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="font-medium">{t('nothingFound', { query })}</p>
              <p className="mt-1 text-sm text-slate-600">
                {t.rich('nothingFoundHint', { link: supportLink })}
              </p>
            </div>
          )}
          <p className="mt-6 text-sm">
            <Link href="/help" className="font-medium text-brand-700 hover:underline">
              ← {t('allTopics')}
            </Link>
          </p>
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_CATEGORIES.map((category) => {
            const inCategory = articles.filter((a) => a.category === category);
            if (!inCategory.length) return null;
            return (
              <div
                key={category}
                className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              >
                <h2 className="font-semibold">{t(`categories.${category}`)}</h2>
                <ul className="mt-3 space-y-3">
                  {inCategory.map((a) => (
                    <ArticleLink key={a.slug} article={a} />
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}
      <SiteFooter />
    </main>
  );
}
