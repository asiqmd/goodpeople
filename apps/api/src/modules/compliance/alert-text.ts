import type { LegalRef, UserLanguage, WorkerAlertDetail, WorkerAlertKind } from '@gp/shared';
import { localDate } from '../notifications/notifications.service.js';

// The headline and detail of a worker alert in English and Bangla, for the compliance.alert
// notification. Every limit names the section of the act that sets it.

type Text = Record<UserLanguage, string>;

const bnDigits = (text: string) => text.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]!);

const ACTS_BN: Record<string, string> = {
  'Bangladesh Labour Act 2006': 'বাংলাদেশ শ্রম আইন ২০০৬',
  'Bangladesh Labour (Amendment) Ordinance 2025 (Act No. 43 of 2026)':
    'বাংলাদেশ শ্রম (সংশোধন) অধ্যাদেশ ২০২৫',
  'Bangladesh Labour Rules 2015': 'বাংলাদেশ শ্রম বিধিমালা ২০১৫',
};

export const citation = (ref: LegalRef): Text => ({
  en: `${ref.act}, s.${ref.section}`,
  bn: `${ACTS_BN[ref.act] ?? ref.act}, ধারা ${bnDigits(ref.section)}`,
});

/** 600 → "10 hours"; 150 → "2 hours 30 minutes". */
export function duration(minutes: number): Text {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const en = [
    h ? `${h} hour${h === 1 ? '' : 's'}` : '',
    m || !h ? `${m} minute${m === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const bn = [h ? `${h} ঘণ্টা` : '', m || !h ? `${m} মিনিট` : ''].filter(Boolean).join(' ');
  return { en, bn: bnDigits(bn) };
}

/** "১০ ঘণ্টা" → "১০ ঘণ্টার", "৩০ মিনিট" → "৩০ মিনিটের". */
const possessive = (text: Text): Text => ({
  en: text.en,
  bn: text.bn.endsWith('া') ? `${text.bn}র` : `${text.bn}ের`,
});

const clock = (time: string | null | undefined): Text => ({
  en: time ?? '—',
  bn: bnDigits(time ?? '—'),
});
const count = (n: number): Text => ({ en: String(n), bn: bnDigits(String(n)) });
const month = (iso: string): Text => {
  const date = new Date(`${iso}T00:00:00Z`);
  const format = (locale: string) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      date,
    );
  return { en: format('en-GB'), bn: format('bn-BD') };
};

/** Fills `{name}`-style slots in both languages from texts given in both. */
function both(en: string, bn: string, slots: Record<string, Text>): Text {
  const fill = (text: string, lang: UserLanguage) =>
    text.replace(/\{(\w+)\}/g, (_, key: string) => slots[key]?.[lang] ?? '');
  return { en: fill(en, 'en'), bn: fill(bn, 'bn') };
}

export interface AlertFacts {
  kind: WorkerAlertKind;
  periodStart: string;
  periodEnd: string;
  value: number;
  limit: number;
  detail: WorkerAlertDetail;
}

export function alertText(facts: AlertFacts, name: Text): { headline: Text; detail: Text } {
  const { kind, detail } = facts;
  const slots: Record<string, Text> = {
    name,
    date: localDate(facts.periodStart),
    start: localDate(facts.periodStart),
    end: localDate(facts.periodEnd),
    expired: localDate(detail.certificate?.expiredOn ?? facts.periodStart),
    month: month(facts.periodStart),
    value: duration(facts.value),
    limit: duration(facts.limit),
    limitOf: possessive(duration(facts.limit)),
    days: count(facts.value),
    worked: count(detail.daysWorked ?? 0),
    firstIn: clock(detail.firstIn),
    lastOut: clock(detail.lastOut),
    from: clock(detail.window?.from),
    to: clock(detail.window?.to),
    ref: detail.reference ? citation(detail.reference) : { en: '', bn: '' },
    place:
      detail.workplace === 'other'
        ? { en: 'an establishment', bn: 'প্রতিষ্ঠানে' }
        : { en: 'a factory', bn: 'কারখানায়' },
  };
  const t = (en: [string, string], bn: [string, string]) => ({
    headline: both(en[0], bn[0], slots),
    detail: both(en[1], bn[1], slots),
  });
  const paid = [
    ' Every minute of it is still paid as overtime.',
    ' পুরো সময়ের ওভারটাইম মজুরি দিতে হবে।',
  ] as const;

  switch (kind) {
    case 'daily_hours':
      return t(
        [
          '{name} worked over {limit} on {date}',
          'At work from {firstIn} to {lastOut}: {value}. The most allowed is {limit} a day, overtime included ({ref}).',
        ],
        [
          '{name} {date} তারিখে {limitOf} বেশি কাজ করেছেন',
          '{firstIn} থেকে {lastOut} পর্যন্ত কাজ: {value}। ওভারটাইমসহ দিনে সর্বোচ্চ {limit} কাজ করা যায় ({ref})।',
        ],
      );
    case 'weekly_hours':
      return t(
        [
          '{name} worked over {limit} in the week from {start}',
          '{value} in {worked} days. The most allowed is {limit} a week, overtime included ({ref}).',
        ],
        [
          '{name} {start} থেকে শুরু সপ্তাহে {limitOf} বেশি কাজ করেছেন',
          '{worked} দিনে {value}। ওভারটাইমসহ সপ্তাহে সর্বোচ্চ {limit} কাজ করা যায় ({ref})।',
        ],
      );
    case 'no_weekly_holiday':
      return t(
        [
          '{name} worked {days} days in a row without a holiday',
          'From {start} to {end}. Every worker is entitled to a weekly holiday ({ref}).',
        ],
        [
          '{name} ছুটি ছাড়া টানা {days} দিন কাজ করেছেন',
          '{start} থেকে {end} পর্যন্ত। প্রত্যেক শ্রমিক সাপ্তাহিক ছুটির অধিকারী ({ref})।',
        ],
      );
    case 'overtime_daily':
      return t(
        [
          '{name} passed the daily overtime cap on {date}',
          `{value} of overtime against the company's cap of {limit}.${paid[0]}`,
        ],
        [
          '{name} {date} তারিখে দৈনিক ওভারটাইমের সীমা ছাড়িয়েছেন',
          `কোম্পানির সীমা {limit}, ওভারটাইম হয়েছে {value}।${paid[1]}`,
        ],
      );
    case 'overtime_weekly':
      return t(
        [
          '{name} passed the weekly overtime cap in the week from {start}',
          `{value} of overtime against the company's cap of {limit}.${paid[0]}`,
        ],
        [
          '{name} {start} থেকে শুরু সপ্তাহে ওভারটাইমের সীমা ছাড়িয়েছেন',
          `কোম্পানির সীমা {limit}, ওভারটাইম হয়েছে {value}।${paid[1]}`,
        ],
      );
    case 'overtime_monthly':
      return t(
        [
          '{name} passed the monthly overtime cap in {month}',
          `{value} of overtime against the company's cap of {limit}.${paid[0]}`,
        ],
        [
          '{name} {month}-এ মাসিক ওভারটাইমের সীমা ছাড়িয়েছেন',
          `কোম্পানির সীমা {limit}, ওভারটাইম হয়েছে {value}।${paid[1]}`,
        ],
      );
    case 'adolescent_daily':
      return t(
        [
          'Adolescent {name} worked over {limit} on {date}',
          'At work from {firstIn} to {lastOut}: {value}. An adolescent may work at most {limit} a day in {place} ({ref}).',
        ],
        [
          'কিশোর শ্রমিক {name} {date} তারিখে {limitOf} বেশি কাজ করেছেন',
          '{firstIn} থেকে {lastOut} পর্যন্ত কাজ: {value}। {place} কিশোর শ্রমিক দিনে সর্বোচ্চ {limit} কাজ করতে পারে ({ref})।',
        ],
      );
    case 'adolescent_weekly':
      return t(
        [
          'Adolescent {name} worked over {limit} in the week from {start}',
          '{value} in {worked} days. An adolescent may work at most {limit} a week in {place}, overtime included ({ref}).',
        ],
        [
          'কিশোর শ্রমিক {name} {start} থেকে শুরু সপ্তাহে {limitOf} বেশি কাজ করেছেন',
          '{worked} দিনে {value}। {place} কিশোর শ্রমিক ওভারটাইমসহ সপ্তাহে সর্বোচ্চ {limit} কাজ করতে পারে ({ref})।',
        ],
      );
    case 'adolescent_night':
      return t(
        [
          'Adolescent {name} worked between {from} and {to} on {date}',
          'At work from {firstIn} to {lastOut}, {value} of it in hours when no adolescent may work ({ref}).',
        ],
        [
          'কিশোর শ্রমিক {name} {date} তারিখে {from} থেকে {to}-এর মধ্যে কাজ করেছেন',
          '{firstIn} থেকে {lastOut} পর্যন্ত কাজে ছিলেন, এর {value} এমন সময়ে যখন কিশোর শ্রমিকের কাজ নিষিদ্ধ ({ref})।',
        ],
      );
    case 'adolescent_certificate':
      return detail.certificate?.reason === 'expired'
        ? t(
            [
              'Adolescent {name} has no valid certificate of fitness',
              'The certificate of fitness expired on {expired}. An adolescent may work only with a valid one from a registered medical practitioner ({ref}).',
            ],
            [
              'কিশোর শ্রমিক {name}-এর বৈধ সক্ষমতা সনদ নেই',
              'সক্ষমতা সনদের মেয়াদ {expired} তারিখে শেষ হয়েছে। রেজিস্টার্ড চিকিৎসকের দেওয়া বৈধ সনদ ছাড়া কিশোর শ্রমিক কাজ করতে পারে না ({ref})।',
            ],
          )
        : t(
            [
              'Adolescent {name} has no valid certificate of fitness',
              'No certificate of fitness is on file. An adolescent may work only with a valid one from a registered medical practitioner ({ref}).',
            ],
            [
              'কিশোর শ্রমিক {name}-এর বৈধ সক্ষমতা সনদ নেই',
              'কোনো সক্ষমতা সনদ জমা নেই। রেজিস্টার্ড চিকিৎসকের দেওয়া বৈধ সনদ ছাড়া কিশোর শ্রমিক কাজ করতে পারে না ({ref})।',
            ],
          );
    case 'women_night':
      return t(
        [
          '{name} worked between {from} and {to} on {date} without her consent',
          'At work from {firstIn} to {lastOut}, {value} of it at night. A woman works at night only with her written consent ({ref}).',
        ],
        [
          '{name} সম্মতি ছাড়া {date} তারিখে {from} থেকে {to}-এর মধ্যে কাজ করেছেন',
          '{firstIn} থেকে {lastOut} পর্যন্ত কাজে ছিলেন, এর {value} রাতে। নারী শ্রমিক কেবল লিখিত সম্মতিতে রাতে কাজ করতে পারেন ({ref})।',
        ],
      );
  }
}
