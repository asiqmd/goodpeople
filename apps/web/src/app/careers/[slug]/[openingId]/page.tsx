import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/help/site-footer';
import { CareersApplyForm } from '@/components/recruitment/careers-apply-form';
import { jobPosting, scriptJson } from '@/components/recruitment/careers-job-posting';
import { inLocale, JobFacts, loadCareersJob } from '@/components/recruitment/careers-views';
import { Markdown } from '@/lib/help/markdown';

export async function generateMetadata({
  params,
}: PageProps<'/careers/[slug]/[openingId]'>): Promise<Metadata> {
  const { slug, openingId } = await params;
  const job = await loadCareersJob(slug, openingId);
  const title = inLocale(await getLocale(), job.titleEn, job.titleBn);
  return { title: job.closed ? title : `${title} · ${job.company}` };
}

/**
 * One job and the form to apply for it, with Google's job-posting markup while it is open. A
 * job no longer open says so, without the markup.
 */
export default async function CareersJobPage({ params }: PageProps<'/careers/[slug]/[openingId]'>) {
  const { slug, openingId } = await params;
  const job = await loadCareersJob(slug, openingId);
  const t = await getTranslations('careers');
  const locale = await getLocale();
  const title = inLocale(locale, job.titleEn, job.titleBn);
  const back = (
    <Link
      href={`/careers/${job.workspace.slug}`}
      className="text-sm text-slate-500 hover:underline"
    >
      ← {t('allJobs', { name: job.workspace.name })}
    </Link>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-8">
      <SiteHeader />
      <div className="mt-10">{back}</div>
      {job.closed ? (
        <section className="py-6">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-4 rounded-xl bg-white p-5 text-slate-600 shadow-sm ring-1 ring-slate-200">
            {t('closed')}
          </p>
        </section>
      ) : (
        <>
          <script
            type="application/ld+json"
            // scriptJson escapes `<`, so nothing in the post can end the element.
            dangerouslySetInnerHTML={{ __html: scriptJson(jobPosting(job, locale)) }}
          />
          <article className="py-6">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <div className="mt-2">
              <JobFacts job={job} />
            </div>
            <div className="mt-6">
              <Markdown source={inLocale(locale, job.descriptionEn, job.descriptionBn)} />
            </div>
          </article>
          <section
            aria-labelledby="apply"
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
          >
            <h2 id="apply" className="mb-4 text-lg font-semibold">
              {t('apply.title')}
            </h2>
            <CareersApplyForm
              slug={job.workspace.slug}
              openingId={job.id}
              company={job.company}
              retentionMonths={job.retentionMonths}
              privacyEmail={job.privacyEmail}
            />
          </section>
        </>
      )}
      <SiteFooter />
    </main>
  );
}
