import { EMPLOYMENT_TYPES, type CareersJobView } from '@gp/shared';
import { describe, expect, it } from 'vitest';
import {
  descriptionHtml,
  googleEmploymentType,
  jobPosting,
  scriptJson,
} from './careers-job-posting';

const GOOGLE_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR',
  'TEMPORARY',
  'INTERN',
  'VOLUNTEER',
  'PER_DIEM',
  'OTHER',
];

const job: CareersJobView = {
  closed: false,
  id: '5b1f0c1e-0a51-4d43-9b34-6a1f1f5d2c11',
  titleEn: 'Sewing Machine Operator',
  titleBn: 'সেলাই মেশিন অপারেটর',
  company: 'My Group Textiles Ltd',
  location: 'Gazipur Factory',
  employmentType: 'probationer',
  closesOn: '2026-11-27',
  publishedAt: '2026-10-28T04:00:00.000Z',
  salary: { min: '12500.00', max: '14000.00' },
  workspace: { name: 'My Group', slug: 'my-group' },
  descriptionEn: 'We are hiring.\n\n- Single-needle machines\n- Overtime paid',
  descriptionBn: null,
  locationAddress: {
    line: 'Konabari Industrial Area',
    upazila: 'Gazipur Sadar',
    district: 'Gazipur',
    division: 'dhaka',
  },
  retentionMonths: 12,
  privacyEmail: 'hr@my-group.test',
};

describe("a job's Google markup", () => {
  it('maps every Bangladeshi employment type to one of Google’s', () => {
    for (const type of EMPLOYMENT_TYPES) {
      expect(GOOGLE_TYPES).toContain(googleEmploymentType(type));
    }
    expect(googleEmploymentType('permanent')).toBe('FULL_TIME');
    expect(googleEmploymentType('probationer')).toBe('FULL_TIME');
    expect(googleEmploymentType('apprentice')).toBe('INTERN');
    expect(googleEmploymentType('casual')).toBe('PER_DIEM');
    expect(googleEmploymentType('contractual')).toBe('CONTRACTOR');
    expect(googleEmploymentType('seasonal')).toBe('TEMPORARY');
  });

  it('describes the job with paragraphs and lists only, every word escaped', () => {
    const html = descriptionHtml(
      [
        '## What you do',
        '',
        'Sew **shirts** on line 4 <script>alert(1)</script> & more.',
        '',
        '1. Single-needle [machines](https://example.com)',
        '2. `Overlock` "machines"',
        '',
        '> Bring your ID card.',
      ].join('\n'),
    );
    expect(html).toBe(
      '<p>What you do</p>' +
        '<p>Sew shirts on line 4 &lt;script&gt;alert(1)&lt;/script&gt; &amp; more.</p>' +
        '<ul><li>Single-needle machines</li><li>Overlock &quot;machines&quot;</li></ul>' +
        '<p>Bring your ID card.</p>',
    );
    const tags = [...html.matchAll(/<\/?([a-z]+)/g)].map((m) => m[1]);
    expect(new Set(tags)).toEqual(new Set(['p', 'ul', 'li']));
  });

  it('carries the properties Google requires, the salary only when shown', () => {
    const posting = jobPosting(job, 'en');
    expect(posting).toMatchObject({
      '@type': 'JobPosting',
      title: 'Sewing Machine Operator',
      description:
        '<p>We are hiring.</p><ul><li>Single-needle machines</li><li>Overtime paid</li></ul>',
      datePosted: '2026-10-28T04:00:00.000Z',
      validThrough: '2026-11-27T23:59:59+06:00',
      employmentType: 'FULL_TIME',
      hiringOrganization: { '@type': 'Organization', name: 'My Group Textiles Ltd' },
      jobLocation: {
        address: {
          streetAddress: 'Konabari Industrial Area',
          addressLocality: 'Gazipur Sadar',
          addressRegion: 'Dhaka',
          addressCountry: 'BD',
        },
      },
      baseSalary: {
        currency: 'BDT',
        value: { minValue: 12500, maxValue: 14000, unitText: 'MONTH' },
      },
      directApply: true,
      identifier: { value: job.id },
    });
    // In Bangla, the Bangla title, and the English description when there is no other.
    expect(jobPosting(job, 'bn')).toMatchObject({
      title: 'সেলাই মেশিন অপারেটর',
      description: expect.stringContaining('We are hiring.'),
    });
    expect(jobPosting({ ...job, salary: null }, 'en')).not.toHaveProperty('baseSalary');
    expect(
      jobPosting({ ...job, salary: { min: null, max: '15000.00' } }, 'en').baseSalary?.value,
    ).toEqual({ '@type': 'QuantitativeValue', value: 15000, unitText: 'MONTH' });
  });

  it('cannot close its script element', () => {
    const json = scriptJson(
      jobPosting({ ...job, titleEn: '</script><script>alert(1)</script>' }, 'en'),
    );
    expect(json).not.toContain('<');
    expect(JSON.parse(json).title).toBe('</script><script>alert(1)</script>');
  });
});
