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
const BASE_TEMPLATES: Record<NotificationEvent, { en: TemplateText; bn: TemplateText }> = {
  'identity.emergency_used': {
    en: {
      title: 'Emergency administrator signed in',
      body: '{{person.name}} used emergency local access. Review the identity access audit.',
      sms: 'Good People: emergency local administrator signed in. Review the access audit.',
    },
    bn: {
      title: 'জরুরি প্রশাসক লগইন করেছেন',
      body: '{{person.name}} জরুরি স্থানীয় প্রবেশাধিকার ব্যবহার করেছেন। পরিচয় ও প্রবেশাধিকারের নিরীক্ষা দেখুন।',
      sms: 'গুড পিপল: জরুরি প্রশাসক লগইন করেছেন। প্রবেশাধিকারের নিরীক্ষা দেখুন।',
    },
  },
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
  // Email, push and the inbox say a payslip is ready; only the SMS, to the person's own
  // phone, carries the net amount.
  'payslip.published': {
    en: {
      title: 'Your payslip for {{period.name}} is ready',
      body: 'Open Payslips in Good People to see it, with every earning and deduction.',
      sms: 'Good People: your {{period.name}} pay of {{pay.net}} net is ready. Details in the app.',
    },
    bn: {
      title: '{{period.name}}-এর বেতন বিবরণী প্রস্তুত',
      body: 'প্রতিটি আয় ও কর্তনসহ দেখতে Good People-এ বেতন বিবরণী খুলুন।',
      sms: 'Good People: {{period.name}}-এর নিট বেতন {{pay.net}} প্রস্তুত। বিস্তারিত অ্যাপে।',
    },
  },
  'billing.invoice_issued': {
    en: {
      title: 'Invoice {{invoice.number}} for {{invoice.period}}',
      body: 'Good People invoice {{invoice.number}} for {{invoice.total}} is due by {{invoice.due}}. Open Billing to download it or pay.',
      sms: 'Good People: invoice {{invoice.number}} for {{invoice.total}} is due by {{invoice.due}}.',
    },
    bn: {
      title: '{{invoice.period}}-এর চালান {{invoice.number}}',
      body: 'Good People-এর চালান {{invoice.number}}, মোট {{invoice.total}}, {{invoice.due}}-এর মধ্যে পরিশোধযোগ্য। ডাউনলোড বা পরিশোধ করতে বিলিং খুলুন।',
      sms: 'Good People: চালান {{invoice.number}}, মোট {{invoice.total}}, {{invoice.due}}-এর মধ্যে পরিশোধযোগ্য।',
    },
  },
  'billing.payment_received': {
    en: {
      title: 'Payment received for {{invoice.number}}',
      body: 'We received {{payment.amount}} by {{payment.method}} for invoice {{invoice.number}}. Thank you.',
      sms: 'Good People: {{payment.amount}} received for invoice {{invoice.number}}. Thank you.',
    },
    bn: {
      title: '{{invoice.number}}-এর পরিশোধ পাওয়া গেছে',
      body: 'চালান {{invoice.number}}-এর জন্য {{payment.method}}-এ {{payment.amount}} পাওয়া গেছে। ধন্যবাদ।',
      sms: 'Good People: চালান {{invoice.number}}-এর {{payment.amount}} পাওয়া গেছে। ধন্যবাদ।',
    },
  },
  'billing.payment_due': {
    en: {
      title: '{{due.headline}}',
      body: 'Invoice {{invoice.number}} has {{invoice.balance}} still to pay. {{due.detail}} Open Billing to pay by card, bKash or bank transfer.',
      sms: 'Good People: invoice {{invoice.number}}, {{invoice.balance}} to pay. {{due.detail}}',
    },
    bn: {
      title: '{{due.headline}}',
      body: 'চালান {{invoice.number}}-এ আরও {{invoice.balance}} পরিশোধ বাকি। {{due.detail}} কার্ড, বিকাশ বা ব্যাংক ট্রান্সফারে পরিশোধ করতে বিলিং খুলুন।',
      sms: 'Good People: চালান {{invoice.number}}, বাকি {{invoice.balance}}। {{due.detail}}',
    },
  },
  'trial.ending': {
    en: {
      title: '{{trial.headline}}',
      body: 'Your free trial of Good People {{trial.when}}. Choose a plan in Billing to keep working; nothing you entered is lost either way.',
      sms: 'Good People: your free trial {{trial.when}}. Choose a plan in Billing to keep working.',
    },
    bn: {
      title: '{{trial.headline}}',
      body: 'Good People-এর বিনামূল্যে ট্রায়াল {{trial.when}}। কাজ চালিয়ে যেতে বিলিং-এ প্ল্যান বেছে নিন; যেভাবেই হোক আপনার তথ্য হারাবে না।',
      sms: 'Good People: আপনার ট্রায়াল {{trial.when}}। কাজ চালিয়ে যেতে বিলিং-এ প্ল্যান বেছে নিন।',
    },
  },
  'compliance.alert': {
    en: {
      title: '{{alert.headline}}',
      body: '{{alert.detail}} Open Compliance to see it and record what was done.',
      sms: 'Good People: {{alert.headline}}. {{alert.detail}}',
    },
    bn: {
      title: '{{alert.headline}}',
      body: '{{alert.detail}} বিস্তারিত দেখতে ও কী করা হয়েছে লিখতে কমপ্লায়েন্স খুলুন।',
      sms: 'Good People: {{alert.headline}}। {{alert.detail}}',
    },
  },
  'grievance.received': {
    en: {
      title: 'New grievance {{grievance.reference}}',
      body: 'A worker raised a grievance about {{grievance.category}} ({{grievance.reference}}). Open Grievances to read and answer it.',
      sms: 'Good People: new grievance {{grievance.reference}} about {{grievance.category}}.',
    },
    bn: {
      title: 'নতুন অভিযোগ {{grievance.reference}}',
      body: 'একজন কর্মী {{grievance.category}} বিষয়ে অভিযোগ করেছেন ({{grievance.reference}})। পড়তে ও উত্তর দিতে অভিযোগ খুলুন।',
      sms: 'Good People: নতুন অভিযোগ {{grievance.reference}}, বিষয় {{grievance.category}}।',
    },
  },
  'maternity.payment_due': {
    en: {
      title: 'Maternity benefit due for {{person.name}}',
      body: "Part {{maternity.part}} of {{person.name}}'s maternity benefit, {{maternity.amount}}, is due by {{maternity.due}} (Labour Act s.47).",
      sms: 'Good People: maternity benefit for {{person.name}}, {{maternity.amount}}, due by {{maternity.due}}.',
    },
    bn: {
      title: '{{person.name}}-এর প্রসূতি কল্যাণ সুবিধা পরিশোধযোগ্য',
      body: '{{person.name}}-এর প্রসূতি কল্যাণ সুবিধার {{maternity.part}} কিস্তি, {{maternity.amount}}, {{maternity.due}}-এর মধ্যে পরিশোধযোগ্য (শ্রম আইন ধারা ৪৭)।',
      sms: 'Good People: {{person.name}}-এর প্রসূতি সুবিধা {{maternity.amount}}, {{maternity.due}}-এর মধ্যে দিতে হবে।',
    },
  },
  'timesheet.due': {
    en: {
      title: 'Your timesheet for {{timesheet.month}} is due',
      body: 'Please fill in and submit your timesheet for {{timesheet.month}}. Your salary is charged to projects by the hours on it.',
      sms: 'Good People: please submit your timesheet for {{timesheet.month}}.',
    },
    bn: {
      title: '{{timesheet.month}}-এর টাইমশিট জমা দেওয়ার সময় হয়েছে',
      body: 'অনুগ্রহ করে {{timesheet.month}}-এর টাইমশিট পূরণ করে জমা দিন। এতে লেখা ঘণ্টা অনুযায়ী আপনার বেতন প্রকল্পগুলোতে ভাগ হয়।',
      sms: 'Good People: অনুগ্রহ করে {{timesheet.month}}-এর টাইমশিট জমা দিন।',
    },
  },
  'payment_account.changed': {
    en: {
      title: 'The account your salary is paid to was changed',
      body: 'From now on your salary is paid {{account.new}}. If you did not ask for this, tell HR or your manager straight away.',
      sms: 'Good People: your salary is now paid {{account.new}}. If you did not ask for this, tell HR at once.',
    },
    bn: {
      title: 'আপনার বেতনের অ্যাকাউন্ট বদলানো হয়েছে',
      body: 'এখন থেকে আপনার বেতন দেওয়া হবে {{account.new}}। আপনি এটি না চেয়ে থাকলে এখনই এইচআর বা আপনার ম্যানেজারকে জানান।',
      sms: 'Good People: আপনার বেতন এখন দেওয়া হবে {{account.new}}। আপনি না চেয়ে থাকলে এখনই এইচআরকে জানান।',
    },
  },
  'recruitment.application': {
    en: {
      title: 'New application for {{opening.title}}',
      body: '{{candidate.name}} applied for {{opening.title}} ({{application.source}}).',
      sms: 'Good People: {{candidate.name}} applied for {{opening.title}}.',
    },
    bn: {
      title: '{{opening.title}} পদে নতুন আবেদন',
      body: '{{candidate.name}} {{opening.title}} পদে আবেদন করেছেন ({{application.source}})।',
      sms: 'Good People: {{candidate.name}} {{opening.title}} পদে আবেদন করেছেন।',
    },
  },
  'recruitment.interview': {
    en: {
      title: 'Interview: {{candidate.name}}, {{interview.when}}',
      body: 'You are an interviewer for {{candidate.name}} ({{opening.title}}), {{interview.when}}, {{interview.where}}. {{interview.change}}',
      sms: 'Good People: interview with {{candidate.name}}, {{interview.when}}. {{interview.change}}',
    },
    bn: {
      title: 'সাক্ষাৎকার: {{candidate.name}}, {{interview.when}}',
      body: '{{candidate.name}}-এর ({{opening.title}}) সাক্ষাৎকারে আপনি আছেন: {{interview.when}}, {{interview.where}}। {{interview.change}}',
      sms: 'Good People: {{candidate.name}}-এর সাক্ষাৎকার, {{interview.when}}। {{interview.change}}',
    },
  },
  'recruitment.offer': {
    en: {
      title: '{{candidate.name}} {{offer.outcome}} the offer for {{opening.title}}',
      body: '{{candidate.name}} {{offer.outcome}} the offer for {{opening.title}}. {{offer.note}}',
      sms: 'Good People: {{candidate.name}} {{offer.outcome}} the offer for {{opening.title}}.',
    },
    bn: {
      title: '{{candidate.name}} {{opening.title}} পদের প্রস্তাব {{offer.outcome}}',
      body: '{{candidate.name}} {{opening.title}} পদের প্রস্তাব {{offer.outcome}}। {{offer.note}}',
      sms: 'Good People: {{candidate.name}} {{opening.title}} পদের প্রস্তাব {{offer.outcome}}।',
    },
  },
  'performance.task': {
    en: {
      title: '{{task.title}}',
      body: '{{task.detail}} Please finish it by {{task.due}}.',
      sms: 'Good People: {{task.title}}, by {{task.due}}.',
    },
    bn: {
      title: '{{task.title}}',
      body: '{{task.detail}} অনুগ্রহ করে {{task.due}}-এর মধ্যে শেষ করুন।',
      sms: 'Good People: {{task.title}}, {{task.due}}-এর মধ্যে।',
    },
  },
  'performance.released': {
    en: {
      title: 'Your review for {{cycle.name}} is ready',
      body: 'Your review for {{cycle.name}} is ready to read. Please read it and acknowledge it, with your comments.',
      sms: 'Good People: your review for {{cycle.name}} is ready to read.',
    },
    bn: {
      title: '{{cycle.name}}-এর আপনার মূল্যায়ন প্রস্তুত',
      body: '{{cycle.name}}-এর আপনার মূল্যায়ন পড়ার জন্য প্রস্তুত। পড়ে নিজের মন্তব্যসহ স্বীকার করুন।',
      sms: 'Good People: {{cycle.name}}-এর আপনার মূল্যায়ন পড়ার জন্য প্রস্তুত।',
    },
  },
  'learning.notice': {
    en: {
      title: '{{learning.title}}',
      body: '{{learning.detail}}',
      sms: 'Good People: {{learning.title}}',
    },
    bn: {
      title: '{{learning.title}}',
      body: '{{learning.detail}}',
      sms: 'Good People: {{learning.title}}',
    },
  },
  'engagement.notice': {
    en: {
      title: '{{service.title}}',
      body: '{{service.detail}}',
      sms: 'Good People: {{service.title}}',
    },
    bn: {
      title: '{{service.title}}',
      body: '{{service.detail}}',
      sms: 'Good People: {{service.title}}',
    },
  },
  'services.notice': {
    en: {
      title: '{{service.title}}',
      body: '{{service.detail}}',
      sms: 'Good People: {{service.title}}',
    },
    bn: {
      title: '{{service.title}}',
      body: '{{service.detail}}',
      sms: 'Good People: {{service.title}}',
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
export const DEFAULT_TEMPLATES = Object.fromEntries(
  Object.entries(BASE_TEMPLATES).map(([event, text]) => [
    event,
    {
      ...text,
      ar: {
        title: 'إشعار من Good People',
        body: 'المحتوى غير المراجع بالإنجليزية: ' + text.en.body,
        sms: text.en.sms,
      },
    },
  ]),
) as Record<NotificationEvent, Record<UserLanguage, TemplateText>>;

export const TEMPLATE_PLACEHOLDERS: Record<NotificationEvent, string[]> = {
  'identity.emergency_used': ['person.name'],
  'approval.requested': ['person.name', 'request.summary'],
  'approval.decided': ['request.summary', 'decision.outcome', 'decision.by', 'decision.note'],
  'document.expiring': ['person.name', 'document.title', 'document.when', 'document.expiresOn'],
  'probation.ending': ['person.name', 'probation.endsOn'],
  'letter.issued': ['letter.title'],
  'attendance.missing_punch': ['day.date'],
  'payslip.published': ['period.name', 'pay.net'],
  'billing.invoice_issued': ['invoice.number', 'invoice.period', 'invoice.total', 'invoice.due'],
  'billing.payment_received': ['invoice.number', 'payment.amount', 'payment.method'],
  'billing.payment_due': ['invoice.number', 'invoice.balance', 'due.headline', 'due.detail'],
  'trial.ending': ['trial.headline', 'trial.when'],
  'compliance.alert': ['alert.headline', 'alert.detail'],
  'grievance.received': ['grievance.reference', 'grievance.category'],
  'maternity.payment_due': ['person.name', 'maternity.part', 'maternity.amount', 'maternity.due'],
  'timesheet.due': ['timesheet.month'],
  'payment_account.changed': ['account.new'],
  'recruitment.application': ['candidate.name', 'opening.title', 'application.source'],
  'recruitment.interview': [
    'candidate.name',
    'opening.title',
    'interview.when',
    'interview.where',
    'interview.change',
  ],
  'recruitment.offer': ['candidate.name', 'opening.title', 'offer.outcome', 'offer.note'],
  'performance.task': ['task.title', 'task.detail', 'task.due'],
  'performance.released': ['cycle.name'],
  'learning.notice': ['learning.title', 'learning.detail'],
  'engagement.notice': ['service.title', 'service.detail'],
  'services.notice': ['service.title', 'service.detail'],
  'auth.otp': ['otp.code', 'otp.minutes', 'workspace.name'],
};
