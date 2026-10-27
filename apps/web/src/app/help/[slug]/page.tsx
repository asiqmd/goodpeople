import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/help/site-footer';
import { day } from '@/components/leave/leave-views';
import { buttonClass } from '@/components/ui';
import { helpArticle, helpArticles } from '@/lib/help/content';
import { Markdown } from '@/lib/help/markdown';

export async function generateMetadata({ params }: PageProps<'/help/[slug]'>): Promise<Metadata> {
  const article = helpArticle(await getLocale(), (await params).slug);
  return article ? { title: `${article.title} · Good People`, description: article.summary } : {};
}

/** One help article, in the reader's language, with the rest of its topic beside it. */
export default async function HelpArticlePage({ params }: PageProps<'/help/[slug]'>) {
  const { slug } = await params;
  const locale = await getLocale();
  const article = helpArticle(locale, slug);
  if (!article) notFound();
  const t = await getTranslations('help');
  const format = await getFormatter();
  const others = helpArticles(locale).filter(
    (a) => a.category === article.category && a.slug !== article.slug,
  );
  const category = t(`categories.${article.category}`);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <SiteHeader />
      <nav aria-label={t('breadcrumb')} className="mt-10 text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/help" className="hover:text-slate-800">
              {t('title')}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>{category}</li>
        </ol>
      </nav>
      <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <article className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{article.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {t('updated', { date: day(format, article.updated) })}
          </p>
          <p className="mt-4 text-lg text-slate-600">{article.summary}</p>
          <div className="mt-6">
            <Markdown source={article.body} />
          </div>
          <section className="mt-10 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">{t('stuckTitle')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('stuckBody')}</p>
            <Link href="/workspace/support/new" className={`${buttonClass.secondary} mt-4`}>
              {t('contactSupport')}
            </Link>
          </section>
        </article>
        <aside className="space-y-8 text-sm">
          {others.length > 0 && (
            <section>
              <h2 className="font-semibold text-slate-900">{t('moreIn', { category })}</h2>
              <ul className="mt-3 space-y-2">
                {others.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/help/${a.slug}`} className="text-brand-700 hover:underline">
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {article.related.length > 0 && (
            <section>
              <h2 className="font-semibold text-slate-900">{t('inApp')}</h2>
              <ul className="mt-3 space-y-2">
                {article.related.map((path) => (
                  <li key={path}>
                    <Link href={path} className="font-mono text-xs text-brand-700 hover:underline">
                      {path}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      <SiteFooter />
    </main>
  );
}
