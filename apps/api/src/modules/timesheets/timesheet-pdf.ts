import type { BdForeignDonationRules } from '@gp/country-packs';
import {
  TIMESHEET_DECLARATION,
  weekdayOf,
  type TimesheetStatus,
  type TimesheetView,
} from '@gp/shared';
import { escapeHtml, page, type Letterhead } from '../letters/render.js';
import { periodName } from '../payroll/payslip.js';
import { cellKey } from './timesheet-month.js';
import { centi } from './timesheet-hours.js';

export interface TimesheetPdfData {
  language: 'en' | 'bn';
  company: Letterhead;
  employee: { code: string; name: string; designation: string | null };
  sheet: TimesheetView;
  /** Who decided it, in the language's name. */
  decidedBy: string | null;
  /** Grant details by project id, for the donor's reference. */
  grants: Map<string, { donor: string | null; grantReference: string | null; fd6: string | null }>;
  rules: BdForeignDonationRules;
}

const LABELS = {
  en: {
    title: 'Monthly timesheet',
    employee: 'Employee',
    code: 'Employee code',
    designation: 'Designation',
    month: 'Month',
    status: 'Status',
    statuses: {
      draft: 'Draft, not submitted',
      submitted: 'Submitted, awaiting approval',
      approved: 'Approved',
      rejected: 'Returned for correction',
    } satisfies Record<TimesheetStatus, string>,
    project: 'Project',
    total: 'Total',
    share: '%',
    hours: 'Hours',
    uncharged: 'Other work (not charged to a project)',
    dayTotal: 'Day total',
    weekdays: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    key: 'W: weekly holiday · H: public holiday · L: leave · O: rostered day off',
    marks: { weekend: 'W', holiday: 'H', leave: 'L', off: 'O' },
    donor: 'Donor',
    grant: 'Grant',
    fd6: 'FD-6',
    declaration: 'Employee’s declaration',
    submitted: (name: string, at: string) => `Certified and submitted by ${name} on ${at}.`,
    notSubmitted: 'Not yet submitted.',
    approval: 'Supervisor’s approval',
    approved: (name: string, at: string) => `Approved by ${name} on ${at}.`,
    rejected: (name: string, at: string) => `Returned for correction by ${name} on ${at}.`,
    pending: 'Not yet approved.',
    signEmployee: 'Employee’s signature',
    signSupervisor: 'Supervisor’s signature',
    keep: (years: string, cite: string) =>
      `Keep this timesheet with the project's expenditure vouchers for ${years} years after the project ends (${cite}).`,
    review: 'Rule to be confirmed against the gazette.',
    act: 'Foreign Donations (Voluntary Activities) Regulation Act 2016',
    section: (s: string) => `s.${s}`,
  },
  bn: {
    title: 'মাসিক টাইমশিট',
    employee: 'কর্মী',
    code: 'কর্মী কোড',
    designation: 'পদবি',
    month: 'মাস',
    status: 'অবস্থা',
    statuses: {
      draft: 'খসড়া, জমা দেওয়া হয়নি',
      submitted: 'জমা দেওয়া হয়েছে, অনুমোদনের অপেক্ষায়',
      approved: 'অনুমোদিত',
      rejected: 'সংশোধনের জন্য ফেরত',
    } satisfies Record<TimesheetStatus, string>,
    project: 'প্রকল্প',
    total: 'মোট',
    share: '%',
    hours: 'ঘণ্টা',
    uncharged: 'অন্যান্য কাজ (কোনো প্রকল্পে ধরা হয়নি)',
    dayTotal: 'দিনের মোট',
    weekdays: ['র', 'সো', 'ম', 'বু', 'বৃ', 'শু', 'শ'],
    key: 'সা: সাপ্তাহিক ছুটি · স: সরকারি ছুটি · ছু: ছুটি (লিভ) · অ: রোস্টার অনুযায়ী বন্ধ',
    marks: { weekend: 'সা', holiday: 'স', leave: 'ছু', off: 'অ' },
    donor: 'দাতা',
    grant: 'অনুদান',
    fd6: 'এফডি-৬',
    declaration: 'কর্মীর ঘোষণা',
    submitted: (name: string, at: string) => `${name} ${at}-এ প্রত্যয়ন করে জমা দিয়েছেন।`,
    notSubmitted: 'এখনো জমা দেওয়া হয়নি।',
    approval: 'তত্ত্বাবধায়কের অনুমোদন',
    approved: (name: string, at: string) => `${name} ${at}-এ অনুমোদন করেছেন।`,
    rejected: (name: string, at: string) => `${name} ${at}-এ সংশোধনের জন্য ফেরত পাঠিয়েছেন।`,
    pending: 'এখনো অনুমোদিত হয়নি।',
    signEmployee: 'কর্মীর স্বাক্ষর',
    signSupervisor: 'তত্ত্বাবধায়কের স্বাক্ষর',
    keep: (years: string, cite: string) =>
      `প্রকল্প শেষ হওয়ার পর ${years} বছর এই টাইমশিট প্রকল্পের ব্যয়ের ভাউচারের সঙ্গে সংরক্ষণ করুন (${cite})।`,
    review: 'গেজেটের সঙ্গে মিলিয়ে নিশ্চিত করতে হবে।',
    act: 'বৈদেশিক অনুদান (স্বেচ্ছাসেবী কার্যক্রম) রেগুলেশন আইন, ২০১৬',
    section: (s: string) => `ধারা ${s}`,
  },
};

const bnDigits = (text: string) => text.replace(/\d/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]!);

/** Off days and leave are shaded across the sheet. */
function shaded(day: TimesheetView['days'][number], extra?: string) {
  const names = [extra, day.offDay || day.leave ? 'off' : null].filter(Boolean);
  return names.length ? ` class="${names.join(' ')}"` : '';
}

/** A person's month as a printable A4 landscape sheet, days across and projects down. */
export function timesheetHtml(d: TimesheetPdfData): string {
  const l = LABELS[d.language];
  const bn = d.language === 'bn';
  const s = d.sheet;
  const locale = bn ? 'bn-BD' : 'en-GB';
  const n = (v: string | number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(v));
  const digits = (text: string) => (bn ? bnDigits(text) : text);
  // "27 October 2026, 14:05" in Dhaka time; one style in both languages.
  const at = (iso: string) => {
    const instant = new Date(iso);
    const day = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Dhaka',
    }).format(instant);
    const time = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Dhaka',
    }).format(instant);
    return `${day}, ${time}`;
  };

  const cells = new Map<string, number>();
  for (const e of s.entries) {
    const key = cellKey(e.date, e.projectId);
    cells.set(key, (cells.get(key) ?? 0) + centi(e.hours));
  }
  const hoursIn = (key: string) => {
    const h = cells.get(key);
    return h ? n(h / 100) : '';
  };
  const mark = (day: TimesheetView['days'][number]) =>
    day.leave
      ? l.marks.leave
      : day.holiday
        ? l.marks.holiday
        : day.weekend
          ? l.marks.weekend
          : day.offDay
            ? l.marks.off
            : '';
  const projectName = (p: { code: string; name: string; nameBn: string | null }) =>
    `${escapeHtml(p.code)} · ${escapeHtml(bn && p.nameBn ? p.nameBn : p.name)}`;
  const grantLine = (id: string) => {
    const g = d.grants.get(id);
    if (!g) return '';
    const parts = [
      g.donor ? `${l.donor}: ${escapeHtml(g.donor)}` : null,
      g.grantReference ? `${l.grant}: ${escapeHtml(g.grantReference)}` : null,
      g.fd6 ? `${l.fd6}: ${escapeHtml(g.fd6)}` : null,
    ].filter(Boolean);
    return parts.length ? `<div class="grant">${parts.join(' · ')}</div>` : '';
  };

  const head = `<tr><th class="name">${l.project}</th>${s.days
    .map((day) => `<th${shaded(day)}>${digits(String(Number(day.date.slice(8))))}</th>`)
    .join(
      '',
    )}<th class="num">${l.total}</th><th class="num">${l.share}</th></tr><tr><th class="name"></th>${s.days
    .map(
      (day) =>
        `<th${shaded(day, 'wd')}>${l.weekdays[weekdayOf(day.date)]}${mark(day) ? `<br>${mark(day)}` : ''}</th>`,
    )
    .join('')}<th></th><th></th></tr>`;
  const rows = s.totals
    .map(
      (t) =>
        `<tr><td class="name">${t.project ? `${projectName(t.project)}${grantLine(t.project.id)}` : l.uncharged}</td>${s.days
          .map(
            (day) => `<td${shaded(day)}>${hoursIn(cellKey(day.date, t.project?.id ?? null))}</td>`,
          )
          .join(
            '',
          )}<td class="num strong">${n(t.hours)}</td><td class="num">${n(t.percent)}</td></tr>`,
    )
    .join('');
  const foot = `<tr><td class="name">${l.dayTotal}</td>${s.days
    .map((day) => `<td${shaded(day)}>${Number(day.hours) ? n(day.hours) : ''}</td>`)
    .join('')}<td class="num strong">${n(s.totalHours)}</td><td class="num">${n(100)}</td></tr>`;

  const decided =
    s.decidedAt && d.decidedBy
      ? s.status === 'approved'
        ? l.approved(escapeHtml(d.decidedBy), at(s.decidedAt))
        : s.status === 'rejected'
          ? l.rejected(escapeHtml(d.decidedBy), at(s.decidedAt))
          : l.pending
      : l.pending;
  const cite = `${l.act}, ${digits(l.section(d.rules.voucherReference.section))}${d.rules.status === 'needs_review' ? '*' : ''}`;

  const css = `
@page{size:A4 landscape;margin:10mm 10mm}
body{font-size:9pt}
.head{border-bottom:2px solid #15803d;padding-bottom:4px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-end}
.company{font-size:13pt;font-weight:700}
.details{font-size:8pt;color:#4b5563}
h1{font-size:12pt;margin:0}
.grid{display:grid;grid-template-columns:repeat(4,auto);gap:2px 18px;font-size:9pt;margin-bottom:8px}
.grid span{color:#4b5563}
table.sheet{table-layout:fixed}
table.sheet th,table.sheet td{font-size:7pt;padding:2px 1px;text-align:center}
table.sheet .name{width:46mm;text-align:left;padding-left:3px}
table.sheet .num{width:11mm;text-align:right;padding-right:3px}
table.sheet .wd{font-weight:400;color:#4b5563}
.off{background:#f3f4f6}
.grant{color:#6b7280;font-size:6.5pt}
.strong{font-weight:700}
.badge{font-weight:700;color:${s.status === 'approved' ? '#15803d' : '#b45309'}}
.key{font-size:7.5pt;color:#6b7280;margin:3px 0 8px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 18px;font-size:9pt}
h2{font-size:10pt;margin:0 0 3px}
p{margin:2px 0}
.line{border-top:1px solid #111827;padding-top:3px;margin-top:26px;width:70mm;font-size:8.5pt}
.note{margin-top:8px;font-size:7.5pt;color:#6b7280}`;

  return page(
    d.language,
    css,
    `<div class="head"><div><div class="company">${escapeHtml(d.company.name)}</div>
<div class="details">${escapeHtml(d.company.details)}</div></div><h1>${l.title}</h1></div>
<div class="grid">
<div><span>${l.employee}:</span> ${escapeHtml(d.employee.name)}</div>
<div><span>${l.code}:</span> ${escapeHtml(d.employee.code)}</div>
<div><span>${l.designation}:</span> ${escapeHtml(d.employee.designation ?? '—')}</div>
<div><span>${l.month}:</span> ${escapeHtml(periodName(d.language, s.from, s.to))}</div>
<div><span>${l.status}:</span> <span class="badge">${l.statuses[s.status]}</span></div>
<div><span>${l.hours}:</span> ${n(s.totalHours)}</div>
</div>
<table class="sheet"><thead>${head}</thead><tbody>${rows}</tbody><tfoot>${foot}</tfoot></table>
<p class="key">${l.key}</p>
<div class="cols">
<div><h2>${l.declaration}</h2>
<p>${escapeHtml(TIMESHEET_DECLARATION[d.language])}</p>
<p class="strong">${s.submittedAt ? l.submitted(escapeHtml(d.employee.name), at(s.submittedAt)) : l.notSubmitted}</p></div>
<div><h2>${l.approval}</h2>
<p class="strong">${decided}</p></div>
<div class="line">${l.signEmployee}</div>
<div class="line">${l.signSupervisor}</div>
</div>
<p class="note">${escapeHtml(l.keep(digits(String(d.rules.voucherYears)), cite))}${d.rules.status === 'needs_review' ? `<br>* ${l.review}` : ''}</p>`,
  );
}
