import type { payrollRuns } from '@gp/db';
import { Decimal, money, type DisbursementChannel } from '@gp/shared';
import { escapeHtml, page, type Letterhead } from '../letters/render.js';
import { amountText, periodName } from './payslip.js';

type Run = typeof payrollRuns.$inferSelect;

const LABELS = {
  en: {
    cashSheet: 'Cash pay sheet',
    group: 'Pay group',
    paidOn: 'Payment date',
    sl: 'SL',
    code: 'Code',
    name: 'Name',
    designation: 'Designation',
    amount: 'Amount (Tk)',
    signature: 'Signature over revenue stamp, or thumbprint',
    form: 'Wage record, Form 38 (Bangladesh Labour Rules 2015, rule 111)',
    total: 'Total',
    paidBy: 'Paid by',
    checkedBy: 'Checked by',
    approvedBy: 'Approved by',
    adviceTitle: 'Salary payment advice',
    adviceTo: 'The Manager',
    adviceBody: (period: string) =>
      `Please debit our account and pay the salaries for ${period} as in the files we upload, totalling the amounts below.`,
    channel: 'By',
    people: 'People',
    channels: {
      bank: 'Bank transfer (BEFTN)',
      bkash: 'bKash',
      nagad: 'Nagad',
      rocket: 'Rocket',
      upay: 'Upay',
    } as Record<string, string>,
    signatory: 'Authorised signatory',
  },
  bn: {
    cashSheet: 'নগদ বেতন পরিশোধের তালিকা',
    group: 'পে গ্রুপ',
    paidOn: 'পরিশোধের তারিখ',
    sl: 'ক্রম',
    code: 'কোড',
    name: 'নাম',
    designation: 'পদবি',
    amount: 'পরিমাণ (টাকা)',
    signature: 'রেভিনিউ স্ট্যাম্পের উপর স্বাক্ষর বা টিপসই',
    form: 'মজুরি রেকর্ড, ফরম ৩৮ (বাংলাদেশ শ্রম বিধিমালা ২০১৫, বিধি ১১১)',
    total: 'মোট',
    paidBy: 'পরিশোধকারী',
    checkedBy: 'যাচাইকারী',
    approvedBy: 'অনুমোদনকারী',
    adviceTitle: 'বেতন পরিশোধের নির্দেশনা',
    adviceTo: 'ব্যবস্থাপক সমীপে',
    adviceBody: (period: string) =>
      `আমাদের হিসাব থেকে ডেবিট করে আপলোড করা ফাইল অনুযায়ী ${period}-এর বেতন পরিশোধ করুন; মোট পরিমাণ নিচে দেওয়া হলো।`,
    channel: 'মাধ্যম',
    people: 'জন',
    channels: {
      bank: 'ব্যাংক ট্রান্সফার (বিইএফটিএন)',
      bkash: 'বিকাশ',
      nagad: 'নগদ',
      rocket: 'রকেট',
      upay: 'উপায়',
    } as Record<string, string>,
    signatory: 'অনুমোদিত স্বাক্ষরকারী',
  },
};

const date = (language: 'en' | 'bn', iso: string) =>
  new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

const head = (company: Letterhead) =>
  `<div class="head"><div class="company">${escapeHtml(company.name)}</div><div class="details">${escapeHtml(company.details)}</div></div>`;

const CSS = `
@page{size:A4;margin:14mm 14mm}
.head{border-bottom:2px solid #15803d;padding-bottom:6px;margin-bottom:12px}
.company{font-size:14pt;font-weight:700}
.details{font-size:8.5pt;color:#4b5563}
h1{font-size:13pt;margin:0 0 6px}
.meta{font-size:9.5pt;color:#374151;margin-bottom:10px}
.num{text-align:right;font-variant-numeric:tabular-nums}
.sign{height:26px;min-width:150px}
tfoot td{font-weight:700;background:#f9fafb}
.unit td{background:#f3f4f6;font-weight:600}
.signatures{margin-top:42px;display:flex;justify-content:space-between;font-size:9.5pt}
.line{border-top:1px solid #111827;padding-top:4px;min-width:150px;text-align:center}`;

/** The cash pay sheet: by unit, each person with a column to sign or thumb-print. */
export function cashSheetHtml(d: {
  language: 'en' | 'bn';
  company: Letterhead;
  group: string;
  run: Run;
  rows: {
    code: string;
    name: string;
    designation: string | null;
    unit: string | null;
    amount: string;
  }[];
}): string {
  const l = LABELS[d.language];
  const units = new Map<string, typeof d.rows>();
  for (const r of d.rows) units.set(r.unit ?? '—', [...(units.get(r.unit ?? '—') ?? []), r]);
  let sl = 0;
  let total = new Decimal(0);
  const body = [...units]
    .map(
      ([unit, rows]) =>
        `<tr class="unit"><td colspan="6">${escapeHtml(unit)}</td></tr>` +
        rows
          .map((r) => {
            sl += 1;
            total = total.plus(r.amount);
            return `<tr><td>${amountText(d.language, String(sl))}</td><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.designation ?? '')}</td><td class="num">${amountText(d.language, r.amount)}</td><td class="sign"></td></tr>`;
          })
          .join(''),
    )
    .join('');
  return page(
    d.language,
    CSS,
    `${head(d.company)}<h1>${l.cashSheet}: ${escapeHtml(periodName(d.language, d.run.periodStart, d.run.periodEnd))}</h1>
<div class="meta">${l.form}<br>${l.group}: ${escapeHtml(d.group)} · ${l.paidOn}: ${date(d.language, d.run.paymentDate)}</div>
<table><thead><tr><th>${l.sl}</th><th>${l.code}</th><th>${l.name}</th><th>${l.designation}</th><th class="num">${l.amount}</th><th>${l.signature}</th></tr></thead>
<tbody>${body}</tbody>
<tfoot><tr><td colspan="4">${l.total}</td><td class="num">${amountText(d.language, money(total))}</td><td></td></tr></tfoot></table>
<div class="signatures"><div class="line">${l.paidBy}</div><div class="line">${l.checkedBy}</div><div class="line">${l.approvedBy}</div></div>`,
  );
}

/** The letter to the company's bank: totals by channel, signed. */
export function bankAdviceHtml(d: {
  language: 'en' | 'bn';
  company: Letterhead;
  run: Run;
  channels: DisbursementChannel[];
}): string {
  const l = LABELS[d.language];
  const total = d.channels.reduce((s, c) => s.plus(c.amount), new Decimal(0));
  const rows = d.channels
    .map(
      (c) =>
        `<tr><td>${escapeHtml(l.channels[c.channel] ?? c.channel)}</td><td class="num">${amountText(d.language, String(c.payments))}</td><td class="num">${amountText(d.language, c.amount)}</td></tr>`,
    )
    .join('');
  return page(
    d.language,
    CSS,
    `${head(d.company)}<div class="meta">${date(d.language, d.run.paymentDate)}</div>
<p>${l.adviceTo}</p>
<h1>${l.adviceTitle}</h1>
<p>${escapeHtml(l.adviceBody(periodName(d.language, d.run.periodStart, d.run.periodEnd)))}</p>
<table><thead><tr><th>${l.channel}</th><th class="num">${l.people}</th><th class="num">${l.amount}</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td>${l.total}</td><td></td><td class="num">${amountText(d.language, money(total))}</td></tr></tfoot></table>
<div class="signatures"><div></div><div class="line">${l.signatory}</div></div>`,
  );
}
