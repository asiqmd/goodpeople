import type {
  MaternityCaseView,
  MaternityPartBasis,
  MaternityPartCovers,
  MaternityPartStatus,
  MaternityPaymentOption,
  MaternityPayMethod,
  MaternityRuleRef,
} from '@gp/shared';
import { escapeHtml, page, type Letterhead } from '../letters/render.js';
import { amountText, date, periodName } from '../payroll/payslip.js';

export interface StatementData {
  language: 'en' | 'bn';
  company: Letterhead;
  employee: { code: string; name: string; designation: string | null };
  maternity: MaternityCaseView;
  issuedOn: string;
}

const bnDigits = (text: string) => text.replace(/\d/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]!);

const LABELS = {
  en: {
    title: 'Maternity benefit statement',
    intro:
      'Maternity benefit under Chapter IV of the Bangladesh Labour Act 2006: who is owed it, the average daily wage it is paid at, and its parts.',
    employee: 'Employee',
    code: 'Employee code',
    designation: 'Designation',
    joined: 'Joined',
    nominee: 'Nominee',
    option: 'Payment chosen',
    options: {
      before_and_after: 'Before and after the delivery, s.47(4)(a)',
      after_birth_two_parts: 'In two parts after the birth, s.47(4)(b)',
      after_birth_at_once: 'All at once after the birth, s.47(4)(c)',
    } satisfies Record<MaternityPaymentOption, string>,
    dates: 'Dates',
    notice: 'Notice given',
    expected: 'Expected delivery',
    delivered: 'Delivery',
    proof: 'Proof of birth produced',
    proofBy: (d: string) => `due by ${d}`,
    late: 'late',
    eligibility: 'Eligibility',
    requirement: 'Requirement',
    found: 'This case',
    met: 'Met',
    section: 'Section',
    service: (days: string) => `At least ${days} days' service before the delivery`,
    served: (days: string) => `${days} days`,
    children: (limit: string) => `Fewer than ${limit} surviving children`,
    surviving: (n: string) => `${n} surviving`,
    yes: 'Yes',
    no: 'No',
    eligible: 'The benefit is payable.',
    ineligible: 'No benefit is payable.',
    leaveStill: 'She is still entitled to any leave due to her (s.46).',
    average: 'Average daily wage',
    window: (from: string, to: string) => `Wages earned from ${from} to ${to}`,
    period: 'Pay period',
    wages: 'Wages (Tk)',
    worked: 'Days worked',
    total: 'Total',
    missing: (months: string) => `No locked pay for ${months}.`,
    perDay: 'Average daily wage (Tk)',
    working: (wages: string, days: string, avg: string) =>
      `Tk ${wages} ÷ ${days} days = Tk ${avg} a day`,
    entered: (avg: string, reason: string) =>
      `Tk ${avg} a day, entered by HR because no locked pay covers these months: ${reason}`,
    noAverage: 'Not worked out yet.',
    status: 'Status',
    days: (before: string, after: string, total: string) =>
      `${before} days before the expected delivery and ${after} days after the delivery: ${total} days`,
    parts: 'The benefit and its payment',
    part: 'Part',
    covers: {
      before: 'Before the delivery',
      after: 'After the delivery',
      whole: 'The whole benefit',
    } satisfies Record<MaternityPartCovers, string>,
    daysCol: 'Days',
    amount: 'Amount (Tk)',
    basis: {
      certificate: (n: string) => `${n} working days after the doctor's certificate`,
      proof: (n: string) => `${n} working days after proof of birth`,
      after_proof: () => 'Within 8 weeks of proof of birth',
    } satisfies Record<MaternityPartBasis, (n: string) => string>,
    payable: 'Payable',
    due: 'Due by',
    paid: 'Paid',
    statuses: {
      waiting: 'Waiting',
      due: 'Due',
      overdue: 'Overdue',
      paid: 'Paid',
      lost: 'Lost',
    } satisfies Record<MaternityPartStatus, string>,
    methods: { cash: 'cash', bank: 'bank', mfs: 'mobile wallet' } satisfies Record<
      MaternityPayMethod,
      string
    >,
    lostNote: (d: string) =>
      `Proof of birth was not produced by ${d}, so the parts that wait for it are not payable (s.47).`,
    noParts: 'No part is payable.',
    protection: 'Protection from dismissal',
    protected: (from: string, to: string) =>
      `A notice of dismissal, discharge or termination given without sufficient cause from ${from} to ${to} does not take away the benefit.`,
    review: 'Rule to be confirmed against the gazette.',
    issued: 'Issued on',
    signature: 'Authorised signatory',
  },
  bn: {
    title: 'প্রসূতি কল্যাণ সুবিধার বিবরণী',
    intro:
      'বাংলাদেশ শ্রম আইন ২০০৬-এর চতুর্থ অধ্যায় অনুযায়ী প্রসূতি কল্যাণ সুবিধা: কে পাবেন, কোন গড় দৈনিক মজুরিতে পাবেন এবং কোন কোন কিস্তিতে।',
    employee: 'কর্মী',
    code: 'কর্মী কোড',
    designation: 'পদবি',
    joined: 'যোগদান',
    nominee: 'মনোনীত ব্যক্তি',
    option: 'বেছে নেওয়া পরিশোধের ধরন',
    options: {
      before_and_after: 'প্রসবের আগে ও পরে, ধারা ৪৭(৪)(ক)',
      after_birth_two_parts: 'সন্তান জন্মের পর দুই কিস্তিতে, ধারা ৪৭(৪)(খ)',
      after_birth_at_once: 'সন্তান জন্মের পর একবারে, ধারা ৪৭(৪)(গ)',
    } satisfies Record<MaternityPaymentOption, string>,
    dates: 'তারিখ',
    notice: 'নোটিশ দেওয়ার তারিখ',
    expected: 'প্রসবের সম্ভাব্য তারিখ',
    delivered: 'প্রসবের তারিখ',
    proof: 'সন্তান জন্মের প্রমাণ জমা',
    proofBy: (d: string) => `${d}-এর মধ্যে জমা দিতে হবে`,
    late: 'দেরিতে',
    eligibility: 'যোগ্যতা',
    requirement: 'শর্ত',
    found: 'এই ক্ষেত্রে',
    met: 'পূরণ হয়েছে',
    section: 'ধারা',
    service: (days: string) => `প্রসবের আগে অন্তত ${days} দিন চাকরি`,
    served: (days: string) => `${days} দিন`,
    children: (limit: string) => `জীবিত সন্তান ${limit}-এর কম`,
    surviving: (n: string) => `${n} জন জীবিত`,
    yes: 'হ্যাঁ',
    no: 'না',
    eligible: 'প্রসূতি কল্যাণ সুবিধা প্রদেয়।',
    ineligible: 'কোনো প্রসূতি কল্যাণ সুবিধা প্রদেয় নয়।',
    leaveStill: 'তবে তাঁর প্রাপ্য যেকোনো ছুটি তিনি পাবেন (ধারা ৪৬)।',
    average: 'গড় দৈনিক মজুরি',
    window: (from: string, to: string) => `${from} থেকে ${to} পর্যন্ত অর্জিত মজুরি`,
    period: 'বেতনের মেয়াদ',
    wages: 'মজুরি (টাকা)',
    worked: 'কাজের দিন',
    total: 'মোট',
    missing: (months: string) => `${months}-এর লক করা বেতন নেই।`,
    perDay: 'গড় দৈনিক মজুরি (টাকা)',
    working: (wages: string, days: string, avg: string) =>
      `${wages} টাকা ÷ ${days} দিন = দৈনিক ${avg} টাকা`,
    entered: (avg: string, reason: string) =>
      `দৈনিক ${avg} টাকা, মানবসম্পদ বিভাগ লিখেছে কারণ এই মাসগুলোর লক করা বেতন নেই: ${reason}`,
    noAverage: 'এখনো হিসাব করা হয়নি।',
    status: 'অবস্থা',
    days: (before: string, after: string, total: string) =>
      `প্রসবের সম্ভাব্য তারিখের আগে ${before} দিন এবং প্রসবের পরে ${after} দিন: মোট ${total} দিন`,
    parts: 'সুবিধা ও তার পরিশোধ',
    part: 'কিস্তি',
    covers: {
      before: 'প্রসবের আগের অংশ',
      after: 'প্রসবের পরের অংশ',
      whole: 'পুরো সুবিধা',
    } satisfies Record<MaternityPartCovers, string>,
    daysCol: 'দিন',
    amount: 'টাকা',
    basis: {
      certificate: (n: string) => `চিকিৎসকের সনদ দেওয়ার ${n} কর্মদিবসের মধ্যে`,
      proof: (n: string) => `সন্তান জন্মের প্রমাণ দেওয়ার ${n} কর্মদিবসের মধ্যে`,
      after_proof: () => 'সন্তান জন্মের প্রমাণ দেওয়ার ৮ সপ্তাহের মধ্যে',
    } satisfies Record<MaternityPartBasis, (n: string) => string>,
    payable: 'কখন প্রদেয়',
    due: 'শেষ তারিখ',
    paid: 'পরিশোধ',
    statuses: {
      waiting: 'অপেক্ষমাণ',
      due: 'প্রদেয়',
      overdue: 'মেয়াদোত্তীর্ণ',
      paid: 'পরিশোধিত',
      lost: 'প্রাপ্য নয়',
    } satisfies Record<MaternityPartStatus, string>,
    methods: { cash: 'নগদ', bank: 'ব্যাংক', mfs: 'মোবাইল ওয়ালেট' } satisfies Record<
      MaternityPayMethod,
      string
    >,
    lostNote: (d: string) =>
      `${d}-এর মধ্যে সন্তান জন্মের প্রমাণ জমা হয়নি, তাই যে কিস্তিগুলো প্রমাণের ওপর নির্ভর করে সেগুলো প্রদেয় নয় (ধারা ৪৭)।`,
    noParts: 'কোনো কিস্তি প্রদেয় নয়।',
    protection: 'চাকরিচ্যুতি থেকে সুরক্ষা',
    protected: (from: string, to: string) =>
      `${from} থেকে ${to} পর্যন্ত পর্যাপ্ত কারণ ছাড়া বরখাস্ত, ডিসচার্জ বা চাকরি অবসানের নোটিশ দেওয়া হলেও তিনি প্রসূতি কল্যাণ সুবিধা থেকে বঞ্চিত হবেন না।`,
    review: 'গেজেটের সঙ্গে মিলিয়ে নিশ্চিত করতে হবে।',
    issued: 'ইস্যুর তারিখ',
    signature: 'অনুমোদিত স্বাক্ষরকারী',
  },
};

/** A maternity case as a printable A4 statement in English or Bangla. */
export function statementHtml(d: StatementData): string {
  const l = LABELS[d.language];
  const m = d.maternity;
  const bn = d.language === 'bn';
  const n = (v: number) => (bn ? bnDigits(String(v)) : String(v));
  const tk = (v: string) => amountText(d.language, v);
  const day = (iso: string | null) => (iso ? date(d.language, iso) : '—');
  const monthName = (month: string) =>
    new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${month}-01T00:00:00Z`));
  // "s.46", or "ধারা ৪৬"; the 2025 amendment marked as such, and rules not yet verified starred.
  const cite = (...rules: MaternityRuleRef[]) =>
    [
      ...new Set(
        rules.map((rule) => {
          const section = bn
            ? `ধারা ${bnDigits(rule.reference.section)}`
            : `s.${rule.reference.section}`;
          const amended = rule.reference.act.includes('Amendment')
            ? bn
              ? ' (সংশোধিত)'
              : ' (amended)'
            : '';
          return `${section}${amended}${rule.status === 'needs_review' ? '*' : ''}`;
        }),
      ),
    ].join(', ');
  const cited = [
    m.eligibility.service.rule,
    m.eligibility.children.rule,
    m.rules.benefitDays,
    m.rules.daysBefore,
    m.rules.paymentWorkingDays,
    m.rules.proofWithinMonths,
    ...m.protection.rules,
    ...(m.average ? [m.average.rule] : []),
  ];

  const average = m.average;
  const averageBlock = !average
    ? `<p>${l.noAverage}</p>`
    : `<p>${escapeHtml(l.window(day(average.windowStart), day(average.windowEnd)))} (${cite(average.rule)})</p>
${
  average.source === 'payroll'
    ? `<table><thead><tr><th>${l.period}</th><th class="num">${l.wages}</th><th class="num">${l.worked}</th></tr></thead>
<tbody>${average.months
        .map(
          (p) =>
            `<tr><td>${escapeHtml(periodName(d.language, p.periodStart, p.periodEnd))}</td><td class="num">${tk(p.wages)}</td><td class="num">${n(p.workedDays)}</td></tr>`,
        )
        .join('')}</tbody>
<tfoot><tr><td>${l.total}</td><td class="num">${tk(average.wages!)}</td><td class="num">${n(average.workedDays!)}</td></tr></tfoot></table>
${average.missingMonths.length ? `<p class="muted">${escapeHtml(l.missing(average.missingMonths.map(monthName).join(', ')))}</p>` : ''}
<p class="strong">${escapeHtml(l.working(tk(average.wages!), n(average.workedDays!), tk(average.averageDailyWage)))}</p>`
    : `<p class="strong">${escapeHtml(l.entered(tk(average.averageDailyWage), average.reason ?? ''))}</p>`
}`;

  const partRows = m.parts
    .map(
      (p) =>
        `<tr><td>${n(p.part)}. ${l.covers[p.covers]}</td><td class="num">${n(p.days)}</td><td class="num">${tk(p.amount)}</td><td>${l.basis[p.basis](n(m.rules.paymentWorkingDays.value))}</td><td>${day(p.dueOn)}</td><td>${
          p.paidOn
            ? `${day(p.paidOn)}, ${l.methods[p.method!]}${p.reference ? ` (${escapeHtml(p.reference)})` : ''}`
            : '—'
        }</td><td>${l.statuses[p.status]}</td></tr>`,
    )
    .join('');
  const total = m.parts.reduce((s, p) => s + Number(p.amount), 0);

  const css = `
@page{size:A4;margin:12mm 15mm}
.head{border-bottom:2px solid #15803d;padding-bottom:6px;margin-bottom:12px}
.company{font-size:14pt;font-weight:700}
.details{font-size:8.5pt;color:#4b5563}
h1{font-size:13pt;margin:0 0 6px}
h2{font-size:11pt;margin:10px 0 4px}
p{margin:4px 0}
.intro{font-size:9.5pt;color:#374151}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:9.5pt}
.grid span{color:#4b5563}
.num{text-align:right;font-variant-numeric:tabular-nums}
.muted{color:#6b7280;font-size:9pt}
.strong{font-weight:700}
.bad{color:#b91c1c;font-weight:700}
tfoot td{font-weight:700;background:#f9fafb}
.note{margin-top:10px;font-size:8pt;color:#6b7280}
.sign{margin-top:28px;display:flex;justify-content:space-between;font-size:9.5pt}
.line{border-top:1px solid #111827;padding-top:4px;min-width:200px;text-align:center}`;

  return page(
    d.language,
    css,
    `<div class="head"><div class="company">${escapeHtml(d.company.name)}</div>
<div class="details">${escapeHtml(d.company.details)}</div></div>
<h1>${l.title}</h1>
<p class="intro">${l.intro}</p>
<div class="grid">
<div><span>${l.employee}:</span> ${escapeHtml(d.employee.name)}</div>
<div><span>${l.code}:</span> ${escapeHtml(d.employee.code)}</div>
<div><span>${l.designation}:</span> ${escapeHtml(d.employee.designation ?? '—')}</div>
<div><span>${l.joined}:</span> ${day(m.employee.joinedOn)}</div>
<div><span>${l.nominee}:</span> ${m.nomineeName ? `${escapeHtml(m.nomineeName)}${m.nomineeRelation ? ` (${escapeHtml(m.nomineeRelation)})` : ''}` : '—'}</div>
<div><span>${l.option}:</span> ${l.options[m.paymentOption]}</div>
</div>

<h2>${l.dates}</h2>
<div class="grid">
<div><span>${l.notice}:</span> ${day(m.noticeOn)}</div>
<div><span>${l.expected}:</span> ${day(m.expectedDeliveryOn)}</div>
<div><span>${l.delivered}:</span> ${day(m.deliveredOn)}</div>
<div><span>${l.proof}:</span> ${m.proofOn ? `${day(m.proofOn)}${m.proofLate ? ` <span class="bad">(${l.late})</span>` : ''}` : escapeHtml(l.proofBy(day(m.proofDeadline)))} (${cite(m.rules.proofWithinMonths)})</div>
</div>

<h2>${l.eligibility}</h2>
<table><thead><tr><th>${l.requirement}</th><th>${l.found}</th><th>${l.met}</th><th>${l.section}</th></tr></thead><tbody>
<tr><td>${escapeHtml(l.service(n(m.eligibility.service.rule.value)))}</td><td>${escapeHtml(l.served(n(m.eligibility.service.days)))}</td><td>${m.eligibility.service.ok ? l.yes : `<span class="bad">${l.no}</span>`}</td><td>${cite(m.eligibility.service.rule)}</td></tr>
<tr><td>${escapeHtml(l.children(n(m.eligibility.children.rule.value)))}</td><td>${escapeHtml(l.surviving(n(m.survivingChildren)))}</td><td>${m.eligibility.children.ok ? l.yes : `<span class="bad">${l.no}</span>`}</td><td>${cite(m.eligibility.children.rule)}</td></tr>
</tbody></table>
<p class="strong">${m.eligible ? l.eligible : l.ineligible}${!m.eligibility.children.ok ? ` ${l.leaveStill}` : ''}</p>

${m.eligible ? `<h2>${l.average}</h2>${averageBlock}` : ''}

${
  m.eligible || m.parts.length
    ? `<h2>${l.parts}</h2>
${m.eligible ? `<p>${escapeHtml(l.days(n(m.daysBefore), n(m.daysAfter), n(m.benefitDays)))} (${cite(m.rules.benefitDays, m.rules.daysBefore)})</p>` : ''}
${
  m.parts.length
    ? `<table><thead><tr><th>${l.part}</th><th class="num">${l.daysCol}</th><th class="num">${l.amount}</th><th>${l.payable} (${cite(m.rules.paymentWorkingDays)})</th><th>${l.due}</th><th>${l.paid}</th><th>${l.status}</th></tr></thead>
<tbody>${partRows}</tbody>
<tfoot><tr><td>${l.total}</td><td class="num">${n(m.parts.reduce((s, p) => s + p.days, 0))}</td><td class="num">${tk(String(total))}</td><td colspan="4"></td></tr></tfoot></table>`
    : `<p>${l.noParts}</p>`
}
${m.parts.some((p) => p.status === 'lost') ? `<p class="bad">${escapeHtml(l.lostNote(day(m.proofDeadline)))}</p>` : ''}`
    : ''
}

<h2>${l.protection}</h2>
<p>${escapeHtml(l.protected(day(m.protection.from), day(m.protection.to)))} (${cite(...m.protection.rules)})</p>

${cited.some((r) => r.status === 'needs_review') ? `<p class="note">* ${l.review}</p>` : ''}
<div class="sign"><div>${l.issued}: ${day(d.issuedOn)}</div><div class="line">${l.signature}</div></div>`,
  );
}
