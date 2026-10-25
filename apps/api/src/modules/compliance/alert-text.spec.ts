import { alertText, citation, duration } from './alert-text.js';

const name = { en: 'Rahima Begum', bn: 'রহিমা বেগম' };
const BLA = { act: 'Bangladesh Labour Act 2006', section: '100' };

describe('alert text', () => {
  it('writes durations and sections in both languages, with Bangla digits', () => {
    expect(duration(600)).toEqual({ en: '10 hours', bn: '১০ ঘণ্টা' });
    expect(duration(150)).toEqual({ en: '2 hours 30 minutes', bn: '২ ঘণ্টা ৩০ মিনিট' });
    expect(duration(45)).toEqual({ en: '45 minutes', bn: '৪৫ মিনিট' });
    expect(duration(60)).toEqual({ en: '1 hour', bn: '১ ঘণ্টা' });
    expect(citation({ act: 'Bangladesh Labour Act 2006', section: '90A' })).toEqual({
      en: 'Bangladesh Labour Act 2006, s.90A',
      bn: 'বাংলাদেশ শ্রম আইন ২০০৬, ধারা ৯০A',
    });
  });

  it('names the person, the day, the hours and the section that was passed', () => {
    const text = alertText(
      {
        kind: 'daily_hours',
        periodStart: '2026-10-12',
        periodEnd: '2026-10-12',
        value: 690,
        limit: 600,
        detail: {
          reference: BLA,
          rule: 'work.daily_max_hours_with_overtime',
          firstIn: '08:00',
          lastOut: '20:30',
        },
      },
      name,
    );
    expect(text.headline).toEqual({
      en: 'Rahima Begum worked over 10 hours on 12 Oct 2026',
      bn: 'রহিমা বেগম ১২ অক্টো, ২০২৬ তারিখে ১০ ঘণ্টার বেশি কাজ করেছেন',
    });
    expect(text.detail.en).toBe(
      'At work from 08:00 to 20:30: 11 hours 30 minutes. The most allowed is 10 hours a day, overtime included (Bangladesh Labour Act 2006, s.100).',
    );
    expect(text.detail.bn).toContain('০৮:০০ থেকে ২০:৩০');
    expect(text.detail.bn).toContain('ধারা ১০০');
  });

  it('reminds that capped overtime is still paid, and dates an expired certificate', () => {
    const cap = alertText(
      {
        kind: 'overtime_weekly',
        periodStart: '2026-10-10',
        periodEnd: '2026-10-16',
        value: 900,
        limit: 720,
        detail: { reference: null, rule: null },
      },
      name,
    );
    expect(cap.detail.en).toBe(
      "15 hours of overtime against the company's cap of 12 hours. Every minute of it is still paid as overtime.",
    );
    const expired = alertText(
      {
        kind: 'adolescent_certificate',
        periodStart: '2026-09-01',
        periodEnd: '2026-10-25',
        value: 55,
        limit: 0,
        detail: {
          reference: { act: 'Bangladesh Labour Act 2006', section: '37' },
          rule: 'adolescent.fitness_certificate_months',
          certificate: { reason: 'expired', documentId: 'd1', expiredOn: '2026-08-31' },
        },
      },
      name,
    );
    expect(expired.detail.en).toMatch(/^The certificate of fitness expired on 31 Aug 2026\./);
    expect(expired.detail.en).toContain('s.37');
  });
});
