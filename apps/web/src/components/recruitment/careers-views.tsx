import 'server-only';
import type { CareersJob, CareersJobSummary, CareersPageView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { apiFetch } from '@/lib/api';
import { day } from '../leave/leave-views';
import { payRange } from './opening-views';

/** A careers page from the API, once per request (the page and its metadata share it). */
async function loadPublic<T>(path: string): Promise<T> {
  const result = await apiFetch<T>(path);
  if (result.ok) return result.data;
  if (result.status === 404) notFound();
  const { message, requestId } = result.error;
  throw new Error(`${path}: ${message}${requestId ? ` (request ${requestId})` : ''}`);
}

export const loadCareersPage = cache((slug: string) =>
  loadPublic<CareersPageView>(`/careers/${encodeURIComponent(slug)}`),
);

export const loadCareersJob = cache((slug: string, id: string) =>
  loadPublic<CareersJob>(`/careers/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(id)}`),
);

/** The text in the reader's language, falling back to the other one. */
export const inLocale = (locale: string, en: string | null, bn: string | null) =>
  (locale === 'bn' ? (bn ?? en) : (en ?? bn)) ?? '';

/** Company, place, kind of job, salary when shown, and the closing date. */
export async function JobFacts({ job }: { job: CareersJobSummary }) {
  const t = await getTranslations('careers');
  const types = await getTranslations('hr.employmentTypes');
  const format = await getFormatter();
  const salary = job.salary ? payRange(format, job.salary.min, job.salary.max) : null;
  return (
    <p className="text-sm text-slate-600">
      {[
        job.company,
        job.location,
        types(job.employmentType),
        salary && t('salary', { salary }),
        t('closesOn', { date: day(format, job.closesOn) }),
      ]
        .filter(Boolean)
        .join(' · ')}
    </p>
  );
}
