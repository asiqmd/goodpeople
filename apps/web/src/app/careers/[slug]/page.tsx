import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/help/site-footer';
import { inLocale, JobFacts, loadCareersPage } from '@/components/recruitment/careers-views';

export async function generateMetadata({
  params,
}: PageProps<'/careers/[slug]'>): Promise<Metadata> {
  const page = await loadCareersPage((await params).slug);
  const t = await getTranslations('careers');
  const intro = inLocale(await getLocale(), page.introEn, page.introBn);
  return {
    title: t('metaTitle', { name: page.workspace.name }),
    ...(intro ? { description: intro.slice(0, 160) } : {}),
  };
}

/**
 * A workspace's careers page: its introduction and open jobs, in the site's language (each
 * job's title in the other language when it has only that). No job markup here: Google reads
 * it from each job's own page.
 */
export default async function CareersPage({ params }: PageProps<'/careers/[slug]'>) {
  const { slug } = await params;
  const page = await loadCareersPage(slug);
  const t = await getTranslations('careers');
  const locale = await getLocale();
  const intro = inLocale(locale, page.introEn, page.introBn);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-8">
      <SiteHeader />
      <section className="py-10">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('title', { name: page.workspace.name })}
        </h1>
        {intro && <p className="mt-3 whitespace-pre-line text-slate-600">{intro}</p>}
      </section>
      <section aria-labelledby="jobs" className="space-y-4">
        <h2 id="jobs" className="text-lg font-semibold">
          {t('openJobs')}
        </h2>
        {page.jobs.length === 0 ? (
          <p className="rounded-xl bg-white p-5 text-slate-600 shadow-sm ring-1 ring-slate-200">
            {t('noJobs')}
          </p>
        ) : (
          <ul className="space-y-3">
            {page.jobs.map((job) => (
              <li key={job.id} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <Link
                  href={`/careers/${page.workspace.slug}/${job.id}`}
                  className="text-lg font-semibold text-brand-700 hover:underline"
                >
                  {inLocale(locale, job.titleEn, job.titleBn)}
                </Link>
                <div className="mt-1">
                  <JobFacts job={job} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
