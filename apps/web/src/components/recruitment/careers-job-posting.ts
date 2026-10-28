import { divisionName, type CareersJobView, type EmploymentType } from '@gp/shared';
import { inlineText, parseMarkdown } from '../../lib/help/markdown';

// Google's job-posting structured data for an open job's page, so Google's job search can list
// it: https://developers.google.com/search/docs/appearance/structured-data/job-posting

type GoogleEmploymentType = 'FULL_TIME' | 'CONTRACTOR' | 'TEMPORARY' | 'INTERN' | 'PER_DIEM';

/**
 * The Labour Act's classes of worker (s.4) as Google's employment types: a probationer is on
 * the way to a permanent job, an apprentice is in training, a casual worker is paid by the
 * day, and badli, temporary and seasonal work lasts a while.
 */
const GOOGLE_EMPLOYMENT_TYPES: Record<EmploymentType, GoogleEmploymentType> = {
  permanent: 'FULL_TIME',
  probationer: 'FULL_TIME',
  apprentice: 'INTERN',
  badli: 'TEMPORARY',
  casual: 'PER_DIEM',
  temporary: 'TEMPORARY',
  seasonal: 'TEMPORARY',
  contractual: 'CONTRACTOR',
};

export const googleEmploymentType = (type: EmploymentType) => GOOGLE_EMPLOYMENT_TYPES[type];

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const p = (content: Parameters<typeof inlineText>[0]) =>
  `<p>${escapeHtml(inlineText(content))}</p>`;

/**
 * A job description (the help centre's Markdown) as the HTML Google reads: paragraphs and
 * bulleted lists only, every word escaped. Headings and notes become paragraphs; bold, code
 * and links keep their words.
 */
export function descriptionHtml(markdown: string): string {
  return parseMarkdown(markdown)
    .map((block) => {
      switch (block.kind) {
        case 'heading':
        case 'paragraph':
          return p(block.content);
        case 'note':
          return block.paragraphs.map(p).join('');
        case 'list':
          return `<ul>${block.items.map((i) => `<li>${escapeHtml(inlineText(i))}</li>`).join('')}</ul>`;
      }
    })
    .join('');
}

/** The job in one language (falling back to the other), as a schema.org JobPosting. */
export function jobPosting(job: CareersJobView, locale: string) {
  const bn = locale === 'bn';
  const title = (bn ? (job.titleBn ?? job.titleEn) : (job.titleEn ?? job.titleBn)) ?? '';
  const description =
    (bn ? (job.descriptionBn ?? job.descriptionEn) : (job.descriptionEn ?? job.descriptionBn)) ??
    '';
  const place = job.locationAddress;
  const min = job.salary?.min;
  const max = job.salary?.max;
  return {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title,
    description: descriptionHtml(description),
    identifier: { '@type': 'PropertyValue', name: job.company, value: job.id },
    datePosted: job.publishedAt,
    // The end of the closing day in Dhaka.
    validThrough: `${job.closesOn}T23:59:59+06:00`,
    employmentType: googleEmploymentType(job.employmentType),
    hiringOrganization: { '@type': 'Organization', name: job.company },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: place?.line,
        addressLocality: place?.upazila ?? place?.district ?? job.location ?? undefined,
        addressRegion: place ? divisionName(place.division, 'en') : undefined,
        postalCode: place?.postcode,
        addressCountry: 'BD',
      },
    },
    ...(min || max
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'BDT',
            value: {
              '@type': 'QuantitativeValue',
              ...(min && max
                ? { minValue: Number(min), maxValue: Number(max) }
                : { value: Number(min ?? max) }),
              unitText: 'MONTH',
            },
          },
        }
      : {}),
    directApply: true,
  };
}

/** JSON for a script element: `<` escaped, so no text in it can close the element. */
export const scriptJson = (data: unknown) => JSON.stringify(data).replaceAll('<', '\\u003c');
