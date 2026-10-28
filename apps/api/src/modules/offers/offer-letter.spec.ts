import {
  acceptedEmail,
  offerEmail,
  offerLetterHtml,
  type OfferLetterData,
} from './offer-letter.js';
import { offerProbation, probationEnd } from './offer-terms.js';

const letter: OfferLetterData = {
  language: 'en',
  refNo: 'OFFER-1A2B3C4D',
  date: '2026-10-28',
  company: { name: 'My Group Textiles Ltd', address: 'Konabari, Gazipur' },
  candidate: 'Ayesha Siddika',
  position: 'Sewing Operator',
  unit: 'Line 1',
  location: 'Gazipur factory',
  grade: 'W5',
  employmentType: 'probationer',
  joiningOn: '2026-12-01',
  monthlyGross: '13000',
  probationMonths: 3,
  expiresOn: '2026-11-10',
  terms: 'Lunch on working days.\n\n- Transport from Konabari',
};

describe('the offer letter', () => {
  it('states the job, pay, probation under s.4, the expiry and how to accept', () => {
    const html = offerLetterHtml(letter);
    for (const text of [
      'My Group Textiles Ltd',
      'Dear Ayesha Siddika,',
      'Offer of employment: Sewing Operator',
      'Tk 13,000',
      '3 months (Bangladesh Labour Act 2006, s.4)',
      '1 December 2026',
      '10 November 2026',
      'accept it by typing your full name by 10 November 2026',
      '(s.5)',
      '<li>Transport from Konabari</li>',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('Accepted online');
  });

  it('is in Bangla with Bangla digits', () => {
    const html = offerLetterHtml({
      ...letter,
      language: 'bn',
      position: 'সেলাই অপারেটর',
      acceptance: { name: 'আয়েশা সিদ্দিকা', at: new Date('2026-10-30T04:15:00Z') },
    });
    for (const text of [
      'lang="bn"',
      'চাকরির প্রস্তাব: সেলাই অপারেটর',
      '১৩,০০০ টাকা',
      '৩ মাস (বাংলাদেশ শ্রম আইন ২০০৬, ধারা ৪)',
      'শিক্ষানবিশ',
      '১০ নভেম্বর, ২০২৬',
      'আয়েশা সিদ্দিকা ৩০ অক্টোবর, ২০২৬ তারিখ ১০:১৫-এ (বাংলাদেশ সময়)',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('escapes what people typed and records the acceptance on the kept copy', () => {
    const html = offerLetterHtml({
      ...letter,
      candidate: 'Ayesha <b>Siddika</b>',
      probationMonths: null,
      employmentType: 'permanent',
      acceptance: { name: 'Ayesha Siddika', at: new Date('2026-10-30T04:15:00Z') },
    });
    expect(html).toContain('Ayesha &lt;b&gt;Siddika&lt;/b&gt;');
    expect(html).toContain('<td>None</td>');
    // 10:15 in Dhaka (UTC+6).
    expect(html).toContain('Accepted online by Ayesha Siddika on 30 October 2026 at 10:15');
  });

  it('emails the link and the confirmation in the candidate’s language', () => {
    const link = 'https://app.example/offers/my-group/abc';
    const en = offerEmail('en', {
      candidate: 'Ayesha',
      company: 'My Group',
      position: 'Sewing Operator',
      expiresOn: '2026-11-10',
      link,
    });
    expect(en.text).toContain(link);
    expect(en.text).toContain('10 November 2026');
    const bn = acceptedEmail('bn', {
      candidate: 'আয়েশা',
      company: 'মাই গ্রুপ',
      position: 'সেলাই অপারেটর',
      joiningOn: '2026-12-01',
    });
    expect(bn.text).toContain('১ ডিসেম্বর, ২০২৬');
  });
});

describe('probation on an offer', () => {
  it('defaults to the Act’s period and refuses more (s.4)', () => {
    expect(offerProbation('probationer', 'worker', '2026-12-01', null)).toEqual({
      months: 3,
      limit: 3,
      tooLong: false,
    });
    expect(offerProbation('probationer', 'staff', '2026-12-01', undefined).months).toBe(6);
    expect(offerProbation('probationer', 'worker', '2026-12-01', 4).tooLong).toBe(true);
    expect(offerProbation('probationer', 'staff', '2026-12-01', 2).months).toBe(2);
    expect(offerProbation('permanent', 'worker', '2026-12-01', 3).months).toBeNull();
  });

  it('ends the day before the same date months later', () => {
    expect(probationEnd('2026-12-01', 3)).toBe('2027-02-28');
    expect(probationEnd('2026-11-30', 3)).toBe('2027-02-27');
  });
});
