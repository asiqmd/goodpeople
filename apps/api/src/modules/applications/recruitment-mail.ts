import type { InterviewKind, UserLanguage } from '@gp/shared';
import type { EmailMessage } from '../notifications/senders.js';

// What candidates and interviewers are told by email, in their own language. Candidates are
// not users, so they are written to directly rather than through notifications.

export type Localized = Record<UserLanguage, string>;

/** A moment in Bangladesh time, as each language writes it (Bangla on a 24-hour clock). */
export function dhakaWhen(date: Date): Localized {
  const format = (locale: string, extra: Intl.DateTimeFormatOptions = {}) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Dhaka',
      ...extra,
    }).format(date);
  return { en: format('en-GB'), bn: format('bn-BD', { hourCycle: 'h23' }) };
}

export const KIND_TEXT: Record<InterviewKind, Localized> = {
  in_person: { en: 'in person', bn: 'সরাসরি' },
  phone: { en: 'by phone', bn: 'ফোনে' },
  video: { en: 'by video', bn: 'ভিডিওতে' },
};

/** Where the interview is: the place, the phone note, or the meeting link. */
export function interviewWhere(i: {
  kind: InterviewKind;
  location: string | null;
  meetingUrl: string | null;
}): Localized {
  if (i.kind === 'video') {
    return { en: `Video call: ${i.meetingUrl ?? ''}`, bn: `ভিডিও কল: ${i.meetingUrl ?? ''}` };
  }
  if (i.kind === 'phone') {
    return i.location
      ? { en: `By phone: ${i.location}`, bn: `ফোনে: ${i.location}` }
      : { en: 'By phone', bn: 'ফোনে' };
  }
  return { en: i.location ?? '', bn: i.location ?? '' };
}

/** A short, polite no, in the candidate's language. */
export function rejectionMail(m: {
  to: string;
  language: UserLanguage;
  name: string;
  title: string;
  workspace: string;
}): EmailMessage {
  if (m.language === 'bn') {
    return {
      to: m.to,
      subject: `${m.workspace}-এ ${m.title} পদে আপনার আবেদন`,
      text: [
        `প্রিয় ${m.name},`,
        '',
        `${m.workspace}-এ ${m.title} পদে আবেদন করার এবং আমাদের সময় দেওয়ার জন্য আপনাকে ধন্যবাদ। ভালোভাবে বিবেচনা করে এবার আমরা আপনার আবেদনটি নিয়ে আর এগোচ্ছি না।`,
        '',
        'আপনার চাকরির খোঁজে সাফল্য কামনা করি।',
        '',
        m.workspace,
      ].join('\n'),
    };
  }
  return {
    to: m.to,
    subject: `Your application for ${m.title} at ${m.workspace}`,
    text: [
      `Dear ${m.name},`,
      '',
      `Thank you for applying for ${m.title} at ${m.workspace}, and for the time you gave us. After careful thought, we will not be taking your application further this time.`,
      '',
      'We wish you every success in your search.',
      '',
      m.workspace,
    ].join('\n'),
  };
}

/** What happened to an interview, as an invitation says it. */
export type InterviewChange = 'scheduled' | 'rescheduled' | 'cancelled' | 'removed';

export interface InterviewMailFacts {
  workspace: string;
  /** The job's title: the post's for the candidate, the internal one for staff. */
  title: string;
  candidateName: string;
  when: Localized;
  where: Localized;
}

/** To the candidate, with the calendar invitation. */
export function candidateInterviewMail(
  m: InterviewMailFacts & {
    to: string;
    language: UserLanguage;
    change: Exclude<InterviewChange, 'removed'>;
    ics: EmailMessage['icalEvent'];
  },
): EmailMessage {
  const when = m.when[m.language];
  const where = m.where[m.language];
  if (m.language === 'bn') {
    const job = `${m.workspace}-এ ${m.title} পদ`;
    const [subject, opening] =
      m.change === 'cancelled'
        ? [
            `সাক্ষাৎকার বাতিল: ${job}`,
            `${when}-এ ${m.workspace}-এ ${m.title} পদে আপনার সাক্ষাৎকারটি বাতিল করা হয়েছে। নতুন করে আয়োজন করলে আমরা আপনাকে জানাব।`,
          ]
        : m.change === 'rescheduled'
          ? [
              `সাক্ষাৎকারের সময়সূচি বদলেছে: ${job}`,
              `${m.workspace}-এ ${m.title} পদে আপনার সাক্ষাৎকারের সময়সূচি বদলেছে। নতুন সময়সূচি:`,
            ]
          : [
              `${job}ের সাক্ষাৎকার`,
              `${m.workspace}-এ ${m.title} পদে আবেদন করার জন্য ধন্যবাদ। আমরা আপনার সাক্ষাৎকার নিতে চাই:`,
            ];
    return {
      to: m.to,
      subject,
      text: [
        `প্রিয় ${m.candidateName},`,
        '',
        opening,
        ...(m.change === 'cancelled'
          ? []
          : [
              '',
              `সময়: ${when} (বাংলাদেশ সময়)`,
              `স্থান: ${where}`,
              '',
              'সংযুক্ত আমন্ত্রণটি সাক্ষাৎকারটি আপনার ক্যালেন্ডারে যোগ করবে।',
            ]),
        '',
        m.workspace,
      ].join('\n'),
      icalEvent: m.ics,
    };
  }
  const job = `${m.title} at ${m.workspace}`;
  const [subject, opening] =
    m.change === 'cancelled'
      ? [
          `Interview cancelled: ${job}`,
          `Your interview for ${job} on ${when} is cancelled. We will be in touch if we arrange another.`,
        ]
      : m.change === 'rescheduled'
        ? [`Interview moved: ${job}`, `Your interview for ${job} has changed. It is now:`]
        : [`Interview for ${job}`, `Thank you for applying for ${job}. We would like to meet you:`];
  return {
    to: m.to,
    subject,
    text: [
      `Dear ${m.candidateName},`,
      '',
      opening,
      ...(m.change === 'cancelled'
        ? []
        : [
            '',
            `When: ${when} (Bangladesh time)`,
            `Where: ${where}`,
            '',
            'The attached invitation adds the interview to your calendar.',
          ]),
      '',
      m.workspace,
    ].join('\n'),
    icalEvent: m.ics,
  };
}

/** To an interviewer, with the calendar invitation and where to find the CV and scorecard. */
export function interviewerMail(
  m: InterviewMailFacts & {
    to: string;
    language: UserLanguage;
    change: InterviewChange;
    link: string;
    ics: EmailMessage['icalEvent'];
  },
): EmailMessage {
  const when = m.when[m.language];
  const where = m.where[m.language];
  const who = `${m.candidateName} (${m.title})`;
  if (m.language === 'bn') {
    const whose = `${m.candidateName}-এর (${m.title})`;
    const texts: Record<InterviewChange, [string, string]> = {
      scheduled: [
        `সাক্ষাৎকার: ${m.candidateName}, ${m.title}, ${when}`,
        `${whose} সাক্ষাৎকার প্যানেলে আপনি আছেন।`,
      ],
      rescheduled: [
        `সাক্ষাৎকারের সময়সূচি বদলেছে: ${m.candidateName}, ${m.title}`,
        `${whose} সাক্ষাৎকারের সময়সূচি বদলেছে।`,
      ],
      cancelled: [
        `সাক্ষাৎকার বাতিল: ${m.candidateName}, ${m.title}`,
        `${when}-এ ${whose} সাক্ষাৎকারটি বাতিল করা হয়েছে।`,
      ],
      removed: [
        `সাক্ষাৎকার প্যানেল থেকে বাদ: ${m.candidateName}, ${m.title}`,
        `${when}-এ ${whose} সাক্ষাৎকার প্যানেলে আপনি আর নেই।`,
      ],
    };
    const [subject, opening] = texts[m.change];
    const going = m.change === 'scheduled' || m.change === 'rescheduled';
    return {
      to: m.to,
      subject,
      text: [
        opening,
        ...(going
          ? [
              '',
              `সময়: ${when} (বাংলাদেশ সময়)`,
              `স্থান: ${where}`,
              '',
              `সিভি, আবেদনের সঙ্গের বার্তা ও আপনার স্কোরকার্ড: ${m.link}`,
            ]
          : []),
      ].join('\n'),
      icalEvent: m.ics,
    };
  }
  const texts: Record<InterviewChange, [string, string]> = {
    scheduled: [
      `Interview: ${m.candidateName}, ${m.title}, ${when}`,
      `You are on the interview panel for ${who}.`,
    ],
    rescheduled: [
      `Interview moved: ${m.candidateName}, ${m.title}`,
      `The interview with ${who} has changed.`,
    ],
    cancelled: [
      `Interview cancelled: ${m.candidateName}, ${m.title}`,
      `The interview with ${who} on ${when} is cancelled.`,
    ],
    removed: [
      `Interview: you are no longer on the panel for ${m.candidateName}`,
      `You are no longer on the panel for the interview with ${who} on ${when}.`,
    ],
  };
  const [subject, opening] = texts[m.change];
  const going = m.change === 'scheduled' || m.change === 'rescheduled';
  return {
    to: m.to,
    subject,
    text: [
      opening,
      ...(going
        ? [
            '',
            `When: ${when} (Bangladesh time)`,
            `Where: ${where}`,
            '',
            `The CV, the cover note and your scorecard: ${m.link}`,
          ]
        : []),
    ].join('\n'),
    icalEvent: m.ics,
  };
}
