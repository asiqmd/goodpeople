// Letters every Bangladesh workspace starts with, in English and Bangla. HR can edit them;
// "Reset" brings back these texts. Placeholders like {{employee.name}} are filled when a
// letter is generated; **bold** and lines starting with "- " are the only formatting.

export type LetterLanguage = 'en' | 'bn';

export interface LetterTemplateDefault {
  code: string;
  language: LetterLanguage;
  name: string;
  subject: string;
  body: string;
}

const ADDRESSEE_EN = `To
{{employee.name}}
Father: {{employee.fatherName}}, Mother: {{employee.motherName}}
{{employee.address}}`;

const ADDRESSEE_BN = `প্রতি
{{employee.name}}
পিতা: {{employee.fatherName}}, মাতা: {{employee.motherName}}
{{employee.address}}`;

export const BD_LETTER_TEMPLATES: readonly LetterTemplateDefault[] = [
  {
    code: 'appointment',
    language: 'en',
    name: 'Appointment letter',
    subject: 'Letter of appointment',
    body: `${ADDRESSEE_EN}

Dear {{employee.name}},

Following your application and interview, we are pleased to appoint you as **{{job.designation}}** in the {{job.department}} department at {{job.location}}, on these terms:

- Date of joining: {{employee.joinedOn}}
- Employee ID: {{employee.code}}
- Grade: {{job.grade}}
- Gross monthly wages: Tk {{extra.grossWages}}
- Probation: until {{probation.endsOn}}. If you keep working after probation without a written decision, you will be deemed permanent under section 4 of the Bangladesh Labour Act 2006.
- Working hours, leave, holidays and other benefits follow the Bangladesh Labour Act 2006 and the company's service rules.
- Either side may end this employment by giving the notice the Act requires.

Your identity card and service book will be issued to you, as sections 5 and 6 of the Act require.

Please sign and return the copy of this letter to accept the appointment.`,
  },
  {
    code: 'appointment',
    language: 'bn',
    name: 'নিয়োগপত্র',
    subject: 'নিয়োগপত্র',
    body: `${ADDRESSEE_BN}

প্রিয় {{employee.name}},

আপনার আবেদন ও সাক্ষাৎকারের পরিপ্রেক্ষিতে আপনাকে {{job.location}}-এর {{job.department}} বিভাগে **{{job.designation}}** পদে নিচের শর্তে নিয়োগ দেওয়া হলো:

- যোগদানের তারিখ: {{employee.joinedOn}}
- কর্মী নম্বর: {{employee.code}}
- গ্রেড: {{job.grade}}
- মাসিক মোট মজুরি: {{extra.grossWages}} টাকা
- শিক্ষানবিশকাল: {{probation.endsOn}} পর্যন্ত। শিক্ষানবিশকাল শেষে লিখিত সিদ্ধান্ত ছাড়া কাজ চালিয়ে গেলে বাংলাদেশ শ্রম আইন ২০০৬-এর ধারা ৪ অনুযায়ী আপনি স্থায়ী বলে গণ্য হবেন।
- কর্মঘণ্টা, ছুটি, ছুটির দিন ও অন্যান্য সুবিধা বাংলাদেশ শ্রম আইন ২০০৬ এবং প্রতিষ্ঠানের চাকরি বিধিমালা অনুযায়ী হবে।
- আইন অনুযায়ী নোটিশ দিয়ে যেকোনো পক্ষ এই চাকরির অবসান ঘটাতে পারবে।

আইনের ধারা ৫ ও ৬ অনুযায়ী আপনাকে পরিচয়পত্র ও সার্ভিস বই দেওয়া হবে।

নিয়োগে সম্মতি জানাতে এই পত্রের অনুলিপিতে স্বাক্ষর করে ফেরত দিন।`,
  },
  {
    code: 'confirmation',
    language: 'en',
    name: 'Confirmation letter',
    subject: 'Confirmation of employment',
    body: `Dear {{employee.name}},

Having completed your probation satisfactorily, you are confirmed as a permanent **{{job.designation}}** with effect from **{{confirmation.date}}**.

All other terms of your appointment remain unchanged. Thank you for your work, and we wish you continued success.`,
  },
  {
    code: 'confirmation',
    language: 'bn',
    name: 'স্থায়ীকরণ পত্র',
    subject: 'চাকরি স্থায়ীকরণ',
    body: `প্রিয় {{employee.name}},

সন্তোষজনকভাবে শিক্ষানবিশকাল সম্পন্ন করায় **{{confirmation.date}}** তারিখ থেকে আপনাকে স্থায়ী **{{job.designation}}** হিসেবে নিশ্চিত করা হলো।

আপনার নিয়োগের অন্যান্য সব শর্ত অপরিবর্তিত থাকবে। আপনার কাজের জন্য ধন্যবাদ এবং ভবিষ্যৎ সাফল্য কামনা করছি।`,
  },
  {
    code: 'probation_extension',
    language: 'en',
    name: 'Probation extension',
    subject: 'Extension of probation',
    body: `Dear {{employee.name}},

As it has not been possible to judge the quality of your work as {{job.designation}} within your probation, your probation is extended until **{{probation.endsOn}}**, as section 4 of the Bangladesh Labour Act 2006 allows.

Your work will be reviewed before that date.`,
  },
  {
    code: 'probation_extension',
    language: 'bn',
    name: 'শিক্ষানবিশকাল বর্ধিতকরণ',
    subject: 'শিক্ষানবিশকাল বর্ধিতকরণ',
    body: `প্রিয় {{employee.name}},

শিক্ষানবিশকালের মধ্যে {{job.designation}} পদে আপনার কাজের মান নির্ধারণ করা সম্ভব না হওয়ায় বাংলাদেশ শ্রম আইন ২০০৬-এর ধারা ৪ অনুযায়ী আপনার শিক্ষানবিশকাল **{{probation.endsOn}}** পর্যন্ত বাড়ানো হলো।

এই তারিখের আগে আপনার কাজ পর্যালোচনা করা হবে।`,
  },
  {
    code: 'job_change',
    language: 'en',
    name: 'Transfer or promotion letter',
    subject: 'Change in your position',
    body: `Dear {{employee.name}},

With effect from **{{change.effectiveFrom}}**, you are posted as **{{job.designation}}** in the {{job.department}} department at {{job.location}}, grade {{job.grade}}.

{{change.reason}}

All other terms of your employment remain unchanged.`,
  },
  {
    code: 'job_change',
    language: 'bn',
    name: 'বদলি বা পদোন্নতি পত্র',
    subject: 'পদ পরিবর্তন',
    body: `প্রিয় {{employee.name}},

**{{change.effectiveFrom}}** তারিখ থেকে আপনাকে {{job.location}}-এর {{job.department}} বিভাগে **{{job.designation}}** পদে, গ্রেড {{job.grade}}-এ পদায়ন করা হলো।

{{change.reason}}

আপনার চাকরির অন্যান্য সব শর্ত অপরিবর্তিত থাকবে।`,
  },
  {
    code: 'resignation_acceptance',
    language: 'en',
    name: 'Acceptance of resignation',
    subject: 'Acceptance of resignation',
    body: `Dear {{employee.name}},

We acknowledge your notice of resignation dated {{separation.noticeDate}}. Your resignation is accepted, and you will be released from your duties as {{job.designation}} at the close of work on **{{separation.lastWorkingDay}}**.

Your final settlement, including your dues under the Bangladesh Labour Act 2006, will be paid as the Act requires. Please hand over company property and complete clearance before your last working day.

Thank you for your service. We wish you well.`,
  },
  {
    code: 'resignation_acceptance',
    language: 'bn',
    name: 'পদত্যাগপত্র গ্রহণ',
    subject: 'পদত্যাগপত্র গ্রহণ',
    body: `প্রিয় {{employee.name}},

{{separation.noticeDate}} তারিখের আপনার পদত্যাগের নোটিশ আমরা পেয়েছি। আপনার পদত্যাগপত্র গৃহীত হলো এবং **{{separation.lastWorkingDay}}** তারিখের কর্মদিবস শেষে আপনাকে {{job.designation}} পদের দায়িত্ব থেকে অব্যাহতি দেওয়া হবে।

বাংলাদেশ শ্রম আইন ২০০৬ অনুযায়ী প্রাপ্য পাওনাসহ আপনার চূড়ান্ত নিষ্পত্তি আইন অনুযায়ী পরিশোধ করা হবে। শেষ কর্মদিবসের আগে প্রতিষ্ঠানের সম্পদ বুঝিয়ে দিয়ে ছাড়পত্রের প্রক্রিয়া সম্পন্ন করুন।

আপনার সেবার জন্য ধন্যবাদ। আপনার মঙ্গল কামনা করছি।`,
  },
  {
    code: 'service_certificate',
    language: 'en',
    name: 'Certificate of service',
    subject: 'Certificate of service',
    body: `This is to certify that **{{employee.name}}** (employee ID {{employee.code}}), father's name {{employee.fatherName}}, worked at {{company.name}} from **{{employee.joinedOn}}** to **{{separation.lastWorkingDay}}**. On leaving, the position held was {{job.designation}} in the {{job.department}} department.

This certificate is issued under section 31 of the Bangladesh Labour Act 2006. We wish {{employee.name}} every success.`,
  },
  {
    code: 'service_certificate',
    language: 'bn',
    name: 'চাকরির প্রত্যয়নপত্র',
    subject: 'চাকরির প্রত্যয়নপত্র',
    body: `এই মর্মে প্রত্যয়ন করা যাচ্ছে যে **{{employee.name}}** (কর্মী নম্বর {{employee.code}}), পিতা: {{employee.fatherName}}, {{company.name}}-এ **{{employee.joinedOn}}** থেকে **{{separation.lastWorkingDay}}** পর্যন্ত কর্মরত ছিলেন। চাকরি ছাড়ার সময় তিনি {{job.department}} বিভাগে {{job.designation}} পদে ছিলেন।

বাংলাদেশ শ্রম আইন ২০০৬-এর ধারা ৩১ অনুযায়ী এই প্রত্যয়নপত্র দেওয়া হলো। আমরা তাঁর সাফল্য কামনা করি।`,
  },
];
