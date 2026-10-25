import { escapeHtml, page, type Letterhead } from '../letters/render.js';
import { amountText, periodName } from './payslip.js';

export interface CertificateData {
  language: 'en' | 'bn';
  company: Letterhead & { tin: string | null };
  fiscalYear: string;
  employee: { code: string; name: string; tin: string | null; designation: string | null };
  /** Opening figures from before the workspace's first run of the year, if any. */
  opening: { salary: string; tax: string } | null;
  months: {
    periodStart: string;
    periodEnd: string;
    kind: string;
    salary: string;
    tax: string;
    challanNo: string | null;
    depositedOn: string | null;
  }[];
  salary: string;
  tax: string;
  issuedOn: string;
}

const LABELS = {
  en: {
    title: 'Certificate of salary and tax deducted at source',
    intro: (year: string) =>
      `This is to certify that the salary below was paid to the employee for the income year ${year}, and that tax was deducted from it at source under section 86 of the Income Tax Act 2023 and deposited to the government as shown.`,
    employee: 'Employee',
    code: 'Employee code',
    tin: 'TIN',
    designation: 'Designation',
    employerTin: 'Employer TIN',
    period: 'Period',
    salary: 'Salary (Tk)',
    tax: 'Tax deducted (Tk)',
    challan: 'Challan',
    opening: 'Before this system',
    total: 'Total',
    kinds: { regular: '', adjustment: ' (adjustment)', bonus: ' (festival bonus)' } as Record<
      string,
      string
    >,
    issued: 'Issued on',
    signature: 'Authorised signatory',
  },
  bn: {
    title: 'বেতন ও উৎসে কর্তিত করের সনদ',
    intro: (year: string) =>
      `এই মর্মে প্রত্যয়ন করা যাচ্ছে যে ${year} আয় বছরে কর্মীকে নিচের বেতন পরিশোধ করা হয়েছে এবং আয়কর আইন ২০২৩-এর ধারা ৮৬ অনুযায়ী উৎসে কর কর্তন করে সরকারি কোষাগারে জমা দেওয়া হয়েছে।`,
    employee: 'কর্মী',
    code: 'কর্মী কোড',
    tin: 'টিআইএন',
    designation: 'পদবি',
    employerTin: 'নিয়োগকর্তার টিআইএন',
    period: 'মেয়াদ',
    salary: 'বেতন (টাকা)',
    tax: 'কর্তিত কর (টাকা)',
    challan: 'চালান',
    opening: 'এই সিস্টেমের আগে',
    total: 'মোট',
    kinds: { regular: '', adjustment: ' (সমন্বয়)', bonus: ' (উৎসব বোনাস)' } as Record<
      string,
      string
    >,
    issued: 'ইস্যুর তারিখ',
    signature: 'অনুমোদিত স্বাক্ষরকারী',
  },
};

/** "2026-27" as "২০২৬-২৭". */
const bnDigits = (text: string) => text.replace(/\d/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]!);

const date = (language: 'en' | 'bn', iso: string) =>
  new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

/** The salary certificate an employee files with their return, as an A4 page. */
export function certificateHtml(d: CertificateData): string {
  const l = LABELS[d.language];
  const n = (amount: string) => amountText(d.language, amount);
  const rows = [
    ...(d.opening
      ? [
          `<tr><td>${l.opening}</td><td class="num">${n(d.opening.salary)}</td><td class="num">${n(d.opening.tax)}</td><td></td></tr>`,
        ]
      : []),
    ...d.months.map(
      (m) =>
        `<tr><td>${escapeHtml(periodName(d.language, m.periodStart, m.periodEnd))}${l.kinds[m.kind] ?? ''}</td><td class="num">${n(m.salary)}</td><td class="num">${n(m.tax)}</td><td>${m.challanNo ? `${escapeHtml(m.challanNo)}, ${date(d.language, m.depositedOn!)}` : '—'}</td></tr>`,
    ),
  ].join('');
  const css = `
@page{size:A4;margin:16mm 18mm}
.head{border-bottom:2px solid #15803d;padding-bottom:6px;margin-bottom:14px}
.company{font-size:14pt;font-weight:700}
.details{font-size:8.5pt;color:#4b5563}
h1{font-size:13pt;margin:0 0 10px}
.intro{font-size:10pt;margin-bottom:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:9.5pt;margin-bottom:12px}
.grid span{color:#4b5563}
.num{text-align:right;font-variant-numeric:tabular-nums}
tfoot td{font-weight:700;background:#f9fafb}
.sign{margin-top:48px;display:flex;justify-content:space-between;font-size:9.5pt}
.line{border-top:1px solid #111827;padding-top:4px;min-width:200px;text-align:center}`;
  return page(
    d.language,
    css,
    `<div class="head"><div class="company">${escapeHtml(d.company.name)}</div>
<div class="details">${escapeHtml(d.company.details)}</div></div>
<h1>${l.title}</h1>
<p class="intro">${escapeHtml(l.intro(d.language === 'bn' ? bnDigits(d.fiscalYear) : d.fiscalYear))}</p>
<div class="grid">
<div><span>${l.employee}:</span> ${escapeHtml(d.employee.name)}</div>
<div><span>${l.code}:</span> ${escapeHtml(d.employee.code)}</div>
<div><span>${l.tin}:</span> ${escapeHtml(d.employee.tin ?? '—')}</div>
<div><span>${l.designation}:</span> ${escapeHtml(d.employee.designation ?? '—')}</div>
<div><span>${l.employerTin}:</span> ${escapeHtml(d.company.tin ?? '—')}</div>
</div>
<table><thead><tr><th>${l.period}</th><th class="num">${l.salary}</th><th class="num">${l.tax}</th><th>${l.challan}</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td>${l.total}</td><td class="num">${n(d.salary)}</td><td class="num">${n(d.tax)}</td><td></td></tr></tfoot></table>
<div class="sign"><div>${l.issued}: ${date(d.language, d.issuedOn)}</div><div class="line">${l.signature}</div></div>`,
  );
}
