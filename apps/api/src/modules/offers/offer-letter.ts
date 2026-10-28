import type { EmploymentType, OfferLanguage } from '@gp/shared';
import { escapeHtml, markupToHtml, page } from '../letters/render.js';
import { amountText } from '../payroll/payslip.js';

// The offer letter (English or Bangla) and the emails that carry it to the candidate. Pure
// functions, so the wording is tested without a browser.

export interface OfferLetterData {
  language: OfferLanguage;
  /** e.g. OFFER-1A2B3C4D */
  refNo: string;
  /** The letter's date: when it was sent, or today for a draft. */
  date: string;
  company: { name: string; address: string };
  candidate: string;
  position: string;
  unit: string | null;
  location: string | null;
  grade: string | null;
  employmentType: EmploymentType;
  joiningOn: string;
  monthlyGross: string;
  probationMonths: number | null;
  expiresOn: string;
  terms: string | null;
  /** Set on the copy kept as accepted: who typed their name, and when. */
  acceptance?: { name: string; at: Date };
}

export const EMPLOYMENT_TYPE_NAMES: Record<EmploymentType, Record<OfferLanguage, string>> = {
  permanent: { en: 'Permanent', bn: 'স্থায়ী' },
  probationer: { en: 'Probationer', bn: 'শিক্ষানবিশ' },
  apprentice: { en: 'Apprentice', bn: 'শিক্ষাধীন' },
  badli: { en: 'Badli (substitute)', bn: 'বদলি' },
  casual: { en: 'Casual', bn: 'সাময়িক' },
  temporary: { en: 'Temporary', bn: 'অস্থায়ী' },
  seasonal: { en: 'Seasonal', bn: 'মৌসুমি' },
  contractual: { en: 'Contractual', bn: 'চুক্তিভিত্তিক' },
};

const locale = (language: OfferLanguage) => (language === 'bn' ? 'bn-BD' : 'en-GB');

export const letterDate = (iso: string, language: OfferLanguage) =>
  new Intl.DateTimeFormat(locale(language), { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** A moment's date and time in Bangladesh; a 24-hour clock in Bangla, as the web shows it. */
const letterMoment = (at: Date, language: OfferLanguage) => {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale(language), { timeZone: 'Asia/Dhaka', ...options }).format(at);
  return {
    date: format({ dateStyle: 'long' }),
    time: format({ timeStyle: 'short', ...(language === 'bn' ? { hourCycle: 'h23' } : {}) }),
  };
};

const months = (n: number, language: OfferLanguage) =>
  language === 'bn'
    ? `${new Intl.NumberFormat('bn-BD').format(n)} মাস`
    : `${n} month${n === 1 ? '' : 's'}`;

const LABELS = {
  en: {
    ref: 'Ref',
    date: 'Date',
    subject: (position: string) => `Offer of employment: ${position}`,
    dear: (name: string) => `Dear ${name},`,
    intro: (company: string) =>
      `We are pleased to offer you employment with ${company} on the terms below.`,
    position: 'Position',
    unit: 'Department',
    location: 'Place of work',
    grade: 'Grade',
    type: 'Employment',
    joining: 'Joining date',
    gross: 'Monthly gross pay',
    money: (amount: string) => `Tk ${amount}`,
    probation: 'Probation',
    probationText: (n: string) => `${n} (Bangladesh Labour Act 2006, s.4)`,
    none: 'None',
    expires: 'Offer valid until',
    terms: 'Other terms',
    howTitle: 'How to accept',
    how: (expiry: string) =>
      `Open the link in the email that brought you this letter, read the offer, and accept it by typing your full name by ${expiry}. You can also decline it there. If we have not heard from you by then, the offer lapses.`,
    appointment:
      'On joining you will receive your letter of appointment, as the Bangladesh Labour Act 2006 requires (s.5).',
    signatory: 'Authorised signatory',
    hr: 'Human Resources',
    accepted: (name: string, at: { date: string; time: string }) =>
      `Accepted online by ${name} on ${at.date} at ${at.time} (Bangladesh time). An electronic record under the Information and Communication Technology Act 2006, ss.6–7.`,
  },
  bn: {
    ref: 'সূত্র',
    date: 'তারিখ',
    subject: (position: string) => `চাকরির প্রস্তাব: ${position}`,
    dear: (name: string) => `প্রিয় ${name},`,
    intro: (company: string) =>
      `নিচের শর্তে ${company}-এ আপনাকে চাকরির প্রস্তাব দিতে পেরে আমরা আনন্দিত।`,
    position: 'পদ',
    unit: 'বিভাগ',
    location: 'কর্মস্থল',
    grade: 'গ্রেড',
    type: 'চাকরির ধরন',
    joining: 'যোগদানের তারিখ',
    gross: 'মাসিক মোট বেতন',
    money: (amount: string) => `${amount} টাকা`,
    probation: 'শিক্ষানবিশকাল',
    probationText: (n: string) => `${n} (বাংলাদেশ শ্রম আইন ২০০৬, ধারা ৪)`,
    none: 'নেই',
    expires: 'প্রস্তাবের মেয়াদ',
    terms: 'অন্যান্য শর্ত',
    howTitle: 'কীভাবে গ্রহণ করবেন',
    how: (expiry: string) =>
      `যে ইমেইলে এই চিঠি পেয়েছেন, তার লিংকটি খুলুন, প্রস্তাবটি পড়ুন এবং ${expiry}-এর মধ্যে আপনার পুরো নাম লিখে তা গ্রহণ করুন। সেখানে প্রস্তাবটি ফিরিয়েও দিতে পারেন। এর মধ্যে আপনার উত্তর না পেলে প্রস্তাবটির মেয়াদ শেষ হয়ে যাবে।`,
    appointment:
      'যোগদানের সময় বাংলাদেশ শ্রম আইন ২০০৬ অনুযায়ী (ধারা ৫) আপনাকে নিয়োগপত্র দেওয়া হবে।',
    signatory: 'অনুমোদিত স্বাক্ষরকারী',
    hr: 'মানবসম্পদ বিভাগ',
    accepted: (name: string, at: { date: string; time: string }) =>
      `${name} ${at.date} তারিখ ${at.time}-এ (বাংলাদেশ সময়) অনলাইনে প্রস্তাবটি গ্রহণ করেছেন। তথ্য ও যোগাযোগ প্রযুক্তি আইন ২০০৬-এর ধারা ৬–৭ অনুযায়ী একটি ইলেকট্রনিক রেকর্ড।`,
  },
};

const CSS = `
@page{size:A4;margin:16mm 20mm 20mm}
.head{border-bottom:2px solid #15803d;padding-bottom:6px;margin-bottom:16px}
.company{font-size:15pt;font-weight:700}
.details{font-size:8.5pt;color:#4b5563}
.meta{display:flex;justify-content:space-between;font-size:9.5pt;margin-bottom:12px}
.subject{font-weight:700;margin:6px 0 14px}
p{margin:0 0 9px}
ul{margin:0 0 9px 18px;padding:0}
h3{font-size:10.5pt;margin:14px 0 6px}
table.terms{margin:4px 0 14px}
table.terms th{width:38%}
.sign{margin-top:40px;font-size:10pt}
.line{width:200px;border-top:1px solid #111827;margin-bottom:4px}
.accepted{margin-top:22px;padding:8px 10px;border:1px solid #15803d;background:#f0fdf4;font-size:9.5pt}`;

/** The offer letter as a printable A4 page in the offer's language. */
export function offerLetterHtml(d: OfferLetterData): string {
  const l = LABELS[d.language];
  const expiry = letterDate(d.expiresOn, d.language);
  const rows: [string, string | null][] = [
    [l.position, d.position],
    [l.unit, d.unit],
    [l.location, d.location],
    [l.grade, d.grade],
    [l.type, EMPLOYMENT_TYPE_NAMES[d.employmentType][d.language]],
    [l.joining, letterDate(d.joiningOn, d.language)],
    [l.gross, l.money(amountText(d.language, d.monthlyGross))],
    [
      l.probation,
      d.probationMonths ? l.probationText(months(d.probationMonths, d.language)) : l.none,
    ],
    [l.expires, expiry],
  ];
  const table = rows
    .filter((r): r is [string, string] => r[1] !== null)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  const terms = d.terms?.trim() ? `<h3>${l.terms}</h3>\n${markupToHtml(d.terms)}` : '';
  const accepted = d.acceptance
    ? `<div class="accepted">${escapeHtml(l.accepted(d.acceptance.name, letterMoment(d.acceptance.at, d.language)))}</div>`
    : '';
  return page(
    d.language,
    CSS,
    `<div class="head"><div class="company">${escapeHtml(d.company.name)}</div>
<div class="details">${escapeHtml(d.company.address)}</div></div>
<div class="meta"><span>${l.ref}: ${escapeHtml(d.refNo)}</span><span>${l.date}: ${escapeHtml(letterDate(d.date, d.language))}</span></div>
<div class="subject">${escapeHtml(l.subject(d.position))}</div>
<p>${escapeHtml(l.dear(d.candidate))}</p>
<p>${escapeHtml(l.intro(d.company.name))}</p>
<table class="terms">${table}</table>
${terms}
<h3>${l.howTitle}</h3>
<p>${escapeHtml(l.how(expiry))}</p>
<p>${escapeHtml(l.appointment)}</p>
<div class="sign"><div class="line"></div><div>${l.signatory}</div><div>${l.hr}, ${escapeHtml(d.company.name)}</div></div>
${accepted}`,
  );
}

/** The email with the candidate's private link, in their language. */
export function offerEmail(
  language: OfferLanguage,
  v: { candidate: string; company: string; position: string; expiresOn: string; link: string },
) {
  const expiry = letterDate(v.expiresOn, language);
  return language === 'bn'
    ? {
        subject: `${v.company} থেকে চাকরির প্রস্তাব`,
        text: `প্রিয় ${v.candidate},\n\n${v.company} আপনাকে ${v.position} পদে চাকরির প্রস্তাব দিয়েছে। নিয়োগ প্রস্তাবের চিঠিটি পড়ুন এবং ${expiry}-এর মধ্যে এখানে তা গ্রহণ করুন বা ফিরিয়ে দিন:\n${v.link}\n\nলিংকটি শুধু আপনার জন্য; কাউকে দেবেন না।\n\n${v.company}`,
      }
    : {
        subject: `Job offer from ${v.company}`,
        text: `Dear ${v.candidate},\n\n${v.company} is offering you the position of ${v.position}. Read the offer letter and accept or decline it here by ${expiry}:\n${v.link}\n\nThis link is yours alone; please do not share it.\n\n${v.company}`,
      };
}

/** The confirmation of acceptance, which carries the letter as accepted. */
export function acceptedEmail(
  language: OfferLanguage,
  v: { candidate: string; company: string; position: string; joiningOn: string },
) {
  const joining = letterDate(v.joiningOn, language);
  return language === 'bn'
    ? {
        subject: `আপনি ${v.company}-এর নিয়োগ প্রস্তাব গ্রহণ করেছেন`,
        text: `প্রিয় ${v.candidate},\n\n${v.position} পদে ${v.company}-এর নিয়োগ প্রস্তাব গ্রহণ করার জন্য ধন্যবাদ। আপনার গ্রহণ করা চিঠিটি সংযুক্ত করা হলো। আপনার যোগদানের তারিখ ${joining}।\n\n${v.company}`,
      }
    : {
        subject: `You accepted the offer from ${v.company}`,
        text: `Dear ${v.candidate},\n\nThank you for accepting the offer of the position of ${v.position} at ${v.company}. The letter you accepted is attached. You join on ${joining}.\n\n${v.company}`,
      };
}
