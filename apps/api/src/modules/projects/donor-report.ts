import type { AllocationBasis } from '@gp/shared';
import { escapeHtml, page, type Letterhead } from '../letters/render.js';
import { amountText, date } from '../payroll/payslip.js';
import { csv } from '../payroll/disbursement.js';

/** One person's month charged to the project. */
export interface ScheduleRow {
  code: string;
  name: string;
  designation: string | null;
  month: string;
  basis: AllocationBasis;
  /** The share of the month's salary charged, in percent. */
  share: string;
  /** Hours on the project, when charged on a timesheet. */
  hours: string | null;
  earnings: string;
  employerCost: string;
  total: string;
}

export interface ScheduleData {
  language: 'en' | 'bn';
  company: Letterhead;
  project: { code: string; name: string };
  donor: string | null;
  grantReference: string | null;
  fd6ApprovalNo: string | null;
  fd6ApprovedOn: string | null;
  from: string;
  to: string;
  rows: ScheduleRow[];
  totals: { earnings: string; employerCost: string; total: string };
}

const bnDigits = (text: string) => text.replace(/\d/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]!);

const LABELS = {
  en: {
    title: 'Personnel cost schedule',
    project: 'Project',
    donor: 'Donor',
    coreFunds: 'Own funds',
    grant: 'Grant reference',
    fd6: 'FD-6 approval',
    dated: (d: string) => `dated ${d}`,
    period: 'Period',
    code: 'Code',
    name: 'Name',
    designation: 'Designation',
    month: 'Month',
    basis: 'Basis',
    bases: { timesheet: 'Timesheet', planned: 'Planned' } satisfies Record<AllocationBasis, string>,
    share: 'Share',
    hours: 'Hours',
    earnings: 'Gross charged (Tk)',
    employerCost: 'Employer cost (Tk)',
    total: 'Total (Tk)',
    totals: 'Total',
    none: 'No salaries were charged to this project in the period.',
    basisNote:
      'Timesheet: charged on the hours of the person’s approved timesheet. Planned: charged on the planned share of salary, an estimate until the work actually done is recorded.',
    certify:
      'I certify that the salary costs above were charged to this project from locked payroll, on the basis shown for each person and month, and that the records supporting them are kept for inspection.',
    signatory: 'Finance signatory',
    signName: 'Name',
    signDate: 'Date',
  },
  bn: {
    title: 'কর্মী ব্যয়ের তফসিল',
    project: 'প্রকল্প',
    donor: 'দাতা',
    coreFunds: 'নিজস্ব তহবিল',
    grant: 'অনুদান নম্বর',
    fd6: 'এফডি-৬ অনুমোদন',
    dated: (d: string) => `তারিখ ${d}`,
    period: 'মেয়াদ',
    code: 'কোড',
    name: 'নাম',
    designation: 'পদবি',
    month: 'মাস',
    basis: 'ভিত্তি',
    bases: { timesheet: 'টাইমশিট', planned: 'পরিকল্পিত' } satisfies Record<AllocationBasis, string>,
    share: 'অংশ',
    hours: 'ঘণ্টা',
    earnings: 'মোট বেতন (টাকা)',
    employerCost: 'নিয়োগকর্তার ব্যয় (টাকা)',
    total: 'সর্বমোট (টাকা)',
    totals: 'মোট',
    none: 'এই মেয়াদে এই প্রকল্পে কোনো বেতন ধরা হয়নি।',
    basisNote:
      'টাইমশিট: কর্মীর অনুমোদিত টাইমশিটের ঘণ্টা অনুযায়ী ধরা হয়েছে। পরিকল্পিত: বেতনের পরিকল্পিত অংশ অনুযায়ী ধরা হয়েছে, যা প্রকৃত কাজের হিসাব না আসা পর্যন্ত একটি প্রাক্কলন।',
    certify:
      'আমি প্রত্যয়ন করছি যে ওপরের বেতন ব্যয় লক করা বেতন-হিসাব থেকে, প্রত্যেক কর্মী ও মাসের জন্য দেখানো ভিত্তিতে এই প্রকল্পে ধরা হয়েছে, এবং এর সমর্থনে রেকর্ড পরিদর্শনের জন্য সংরক্ষিত আছে।',
    signatory: 'অর্থ বিভাগের স্বাক্ষরকারী',
    signName: 'নাম',
    signDate: 'তারিখ',
  },
};

const CSV_HEADINGS = [
  'Employee code',
  'Name',
  'Designation',
  'Month',
  'Basis',
  'Share %',
  'Hours on project',
  'Gross charged',
  'Employer cost charged',
  'Total charged',
];

/** The schedule as CSV, a row per person and month, for the donor's own templates. */
export const scheduleCsv = (rows: ScheduleRow[]) =>
  csv([
    CSV_HEADINGS,
    ...rows.map((r) => [
      r.code,
      r.name,
      r.designation ?? '',
      r.month,
      r.basis,
      r.share,
      r.hours ?? '',
      r.earnings,
      r.employerCost,
      r.total,
    ]),
  ]);

/** The schedule, or one part of a long one, as a printable A4 landscape page. */
export function scheduleHtml(
  d: ScheduleData,
  part: { from: number; to: number; last: boolean },
): string {
  const l = LABELS[d.language];
  const bn = d.language === 'bn';
  const n = (v: string) => (bn ? bnDigits(v) : v);
  const tk = (v: string) => amountText(d.language, v);
  const monthName = (month: string) =>
    new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${month}-01T00:00:00Z`));
  const period = d.from === d.to ? monthName(d.from) : `${monthName(d.from)} – ${monthName(d.to)}`;
  const fd6 = d.fd6ApprovalNo
    ? `${escapeHtml(d.fd6ApprovalNo)}${d.fd6ApprovedOn ? `, ${l.dated(date(d.language, d.fd6ApprovedOn))}` : ''}`
    : '—';
  const rows = d.rows
    .slice(part.from, part.to)
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.designation ?? '')}</td><td>${monthName(r.month)}</td><td>${l.bases[r.basis]}</td><td class="num">${n(r.share)}%</td><td class="num">${r.hours ? n(r.hours) : ''}</td><td class="num">${tk(r.earnings)}</td><td class="num">${tk(r.employerCost)}</td><td class="num">${tk(r.total)}</td></tr>`,
    )
    .join('');
  const css = `
@page{size:A4 landscape;margin:10mm 12mm}
.head{border-bottom:2px solid #15803d;padding-bottom:6px;margin-bottom:10px}
.company{font-size:14pt;font-weight:700}
.details{font-size:8.5pt;color:#4b5563}
h1{font-size:13pt;margin:0 0 6px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;font-size:9.5pt;margin-bottom:10px}
.grid span{color:#4b5563}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tfoot td{font-weight:700;background:#f9fafb}
.note{margin-top:8px;font-size:8pt;color:#4b5563}
.certify{margin-top:14px;font-size:9.5pt}
.sign{margin-top:36px;display:flex;justify-content:space-between;gap:24px;font-size:9.5pt}
.line{border-top:1px solid #111827;padding-top:4px;min-width:200px;text-align:center}`;
  const head =
    part.from === 0
      ? `<div class="head"><div class="company">${escapeHtml(d.company.name)}</div>
<div class="details">${escapeHtml(d.company.details)}</div></div>
<h1>${l.title}</h1>
<div class="grid">
<div><span>${l.project}:</span> ${escapeHtml(`${d.project.code} · ${d.project.name}`)}</div>
<div><span>${l.donor}:</span> ${escapeHtml(d.donor ?? l.coreFunds)}</div>
<div><span>${l.grant}:</span> ${escapeHtml(d.grantReference ?? '—')}</div>
<div><span>${l.fd6}:</span> ${fd6}</div>
<div><span>${l.period}:</span> ${period}</div>
</div>`
      : '';
  const foot = part.last
    ? `<tfoot><tr><td colspan="7">${l.totals}</td><td class="num">${tk(d.totals.earnings)}</td><td class="num">${tk(d.totals.employerCost)}</td><td class="num">${tk(d.totals.total)}</td></tr></tfoot>`
    : '';
  const end = part.last
    ? `<p class="note">${l.basisNote}</p>
<p class="certify">${l.certify}</p>
<div class="sign"><div class="line">${l.signatory}</div><div class="line">${l.signName}</div><div class="line">${l.signDate}</div></div>`
    : '';
  return page(
    d.language,
    css,
    `${head}${
      d.rows.length === 0
        ? `<p>${l.none}</p>`
        : `<table><thead><tr><th>${l.code}</th><th>${l.name}</th><th>${l.designation}</th><th>${l.month}</th><th>${l.basis}</th><th class="num">${l.share}</th><th class="num">${l.hours}</th><th class="num">${l.earnings}</th><th class="num">${l.employerCost}</th><th class="num">${l.total}</th></tr></thead>
<tbody>${rows}</tbody>${foot}</table>`
    }${end}`,
  );
}
