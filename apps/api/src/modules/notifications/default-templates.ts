import type { NotificationEvent, UserLanguage } from '@gp/shared';

export interface TemplateText {
  /** The inbox and push title, and the email subject. */
  title: string;
  /** The inbox, push and email text. */
  body: string;
  /** Kept short: one SMS is 160 Latin or 70 Bangla characters. */
  sms: string;
}

/**
 * The built-in wording, which a workspace may replace per event and language. Placeholders
 * are filled from what happened; one without a value becomes empty.
 */
export const DEFAULT_TEMPLATES: Record<NotificationEvent, Record<UserLanguage, TemplateText>> = {
  'approval.requested': {
    en: {
      title: '{{person.name}} is waiting for your decision',
      body: '{{request.summary}}. Open Approvals to approve or reject it.',
      sms: 'Good People: {{person.name}} is waiting for your decision on {{request.summary}}.',
    },
    bn: {
      title: '{{person.name}} আপনার সিদ্ধান্তের অপেক্ষায়',
      body: '{{request.summary}}। অনুমোদন বা প্রত্যাখ্যান করতে অনুমোদন পাতায় যান।',
      sms: 'Good People: {{person.name}}-এর {{request.summary}} আপনার সিদ্ধান্তের অপেক্ষায়।',
    },
  },
  'approval.decided': {
    en: {
      title: 'Your request was {{decision.outcome}}',
      body: '{{decision.by}} {{decision.outcome}} your request: {{request.summary}}.{{decision.note}}',
      sms: 'Good People: your request ({{request.summary}}) was {{decision.outcome}}.',
    },
    bn: {
      title: 'আপনার আবেদন {{decision.outcome}} হয়েছে',
      body: '{{request.summary}}: {{decision.by}}-এর সিদ্ধান্ত, {{decision.outcome}}।{{decision.note}}',
      sms: 'Good People: আপনার আবেদন ({{request.summary}}) {{decision.outcome}} হয়েছে।',
    },
  },
  'document.expiring': {
    en: {
      title: '{{document.title}}: {{document.when}}',
      body: "{{person.name}}'s {{document.title}} {{document.when}} ({{document.expiresOn}}). Upload the renewed copy to their documents.",
      sms: "Good People: {{person.name}}'s {{document.title}} {{document.when}} ({{document.expiresOn}}).",
    },
    bn: {
      title: '{{document.title}}: {{document.when}}',
      body: '{{person.name}}-এর {{document.title}}, {{document.when}} ({{document.expiresOn}})। নবায়িত কপি ডকুমেন্টে আপলোড করুন।',
      sms: 'Good People: {{person.name}}-এর {{document.title}}, {{document.when}} ({{document.expiresOn}})।',
    },
  },
  'probation.ending': {
    en: {
      title: 'Probation ends {{probation.endsOn}}: {{person.name}}',
      body: "{{person.name}}'s probation ends on {{probation.endsOn}}. Confirm them or extend the probation from their Job tab.",
      sms: "Good People: {{person.name}}'s probation ends on {{probation.endsOn}}.",
    },
    bn: {
      title: 'শিক্ষানবিশকাল শেষ {{probation.endsOn}}: {{person.name}}',
      body: '{{person.name}}-এর শিক্ষানবিশকাল {{probation.endsOn}} তারিখে শেষ হবে। জব ট্যাব থেকে স্থায়ী করুন বা মেয়াদ বাড়ান।',
      sms: 'Good People: {{person.name}}-এর শিক্ষানবিশকাল {{probation.endsOn}} তারিখে শেষ হবে।',
    },
  },
  'letter.issued': {
    en: {
      title: 'New letter: {{letter.title}}',
      body: 'HR issued {{letter.title}} to you. Read and download it from Documents in your profile.',
      sms: 'Good People: HR issued {{letter.title}} to you. See it in the app.',
    },
    bn: {
      title: 'নতুন চিঠি: {{letter.title}}',
      body: 'এইচআর আপনাকে {{letter.title}} দিয়েছে। প্রোফাইলের ডকুমেন্ট অংশে পড়ুন ও ডাউনলোড করুন।',
      sms: 'Good People: এইচআর আপনাকে {{letter.title}} দিয়েছে। অ্যাপে দেখুন।',
    },
  },
  'attendance.missing_punch': {
    en: {
      title: 'Missing punch on {{day.date}}',
      body: 'Your attendance on {{day.date}} has only one punch. Ask for a correction so the day counts.',
      sms: 'Good People: your attendance on {{day.date}} has one punch only. Please ask for a correction.',
    },
    bn: {
      title: '{{day.date}} তারিখে একটি পাঞ্চ নেই',
      body: '{{day.date}} তারিখে আপনার হাজিরায় একটি মাত্র পাঞ্চ আছে। দিনটি গণনার জন্য সংশোধনের আবেদন করুন।',
      sms: 'Good People: {{day.date}} তারিখে আপনার একটি মাত্র পাঞ্চ আছে। সংশোধনের আবেদন করুন।',
    },
  },
  'auth.otp': {
    en: {
      title: 'Your sign-in code',
      body: '{{otp.code}} is your sign-in code for {{workspace.name}}.',
      sms: '{{otp.code}} is your Good People sign-in code for {{workspace.name}}. It expires in {{otp.minutes}} minutes. Do not share it.',
    },
    bn: {
      title: 'আপনার সাইন-ইন কোড',
      body: '{{otp.code}} আপনার {{workspace.name}} সাইন-ইন কোড।',
      sms: '{{otp.code}} আপনার Good People সাইন-ইন কোড ({{workspace.name}})। {{otp.minutes}} মিনিট বৈধ। কাউকে জানাবেন না।',
    },
  },
};

/** The placeholders each event fills, listed for HR in the template editor. */
export const TEMPLATE_PLACEHOLDERS: Record<NotificationEvent, string[]> = {
  'approval.requested': ['person.name', 'request.summary'],
  'approval.decided': ['request.summary', 'decision.outcome', 'decision.by', 'decision.note'],
  'document.expiring': ['person.name', 'document.title', 'document.when', 'document.expiresOn'],
  'probation.ending': ['person.name', 'probation.endsOn'],
  'letter.issued': ['letter.title'],
  'attendance.missing_punch': ['day.date'],
  'auth.otp': ['otp.code', 'otp.minutes', 'workspace.name'],
};
