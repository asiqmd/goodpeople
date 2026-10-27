import { LEGAL_DOCUMENTS, TERMS_VERSION, type LegalDocument } from '@gp/shared';
import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/help/site-footer';
import { day } from '@/components/leave/leave-views';
import { Banner } from '@/components/ui';
import { legalText } from '@/lib/help/content';
import { Markdown } from '@/lib/help/markdown';

const isLegalDocument = (doc: string): doc is LegalDocument =>
  (LEGAL_DOCUMENTS as readonly string[]).includes(doc);

export async function generateMetadata({ params }: PageProps<'/legal/[doc]'>): Promise<Metadata> {
  const { doc } = await params;
  const text = isLegalDocument(doc) ? legalText(await getLocale(), doc) : null;
  return text ? { title: `${text.title} · Good People`, description: text.summary } : {};
}

/** The terms, privacy policy, refund policy and data processing agreement. */
export default async function LegalPage({ params }: PageProps<'/legal/[doc]'>) {
  const { doc } = await params;
  const locale = await getLocale();
  const text = isLegalDocument(doc) ? legalText(locale, doc) : null;
  if (!text) notFound();
  const t = await getTranslations('legal');
  const format = await getFormatter();
  const all = LEGAL_DOCUMENTS.map((d) => legalText(locale, d)).filter((d) => d !== null);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <SiteHeader />
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="min-w-0">
          <Banner tone="amber">{t('draft', { version: TERMS_VERSION })}</Banner>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">{text.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {t('version', { version: text.version, date: day(format, text.updated) })}
          </p>
          <div className="mt-6">
            <Markdown source={text.body} />
          </div>
        </article>
        <aside className="text-sm">
          <h2 className="font-semibold text-slate-900">{t('documents')}</h2>
          <ul className="mt-3 space-y-2">
            {all.map((d) => (
              <li key={d.doc}>
                {d.doc === text.doc ? (
                  <span className="font-medium text-slate-900">{d.title}</span>
                ) : (
                  <Link href={`/legal/${d.doc}`} className="text-brand-700 hover:underline">
                    {d.title}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <SiteFooter />
    </main>
  );
}
