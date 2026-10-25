import { Decimal, money } from '@gp/shared';
import { escapeHtml, page } from '../letters/render.js';
import { amountText, date } from './payslip.js';

// The Labour Rules 2015 registers payroll keeps: the wage register (Form 38, rule 111) and the
// daily attendance and overtime register (Form 34, rule 102(4)), kept monthly as the form's
// note allows. Headings follow the forms; registers are kept for three years (rule 363).

export interface Establishment {
  name: string;
  address: string;
  registrationNo: string | null;
}

const LABELS = {
  en: {
    form38: 'Wage register (Form 38, Bangladesh Labour Rules 2015, rule 111)',
    form34: 'Daily attendance and overtime register (Form 34, rule 102(4))',
    reg: 'Registration no.',
    period: 'Wage period',
    sl: 'SL',
    code: 'Worker no.',
    name: 'Name',
    basic: 'Basic',
    houseRent: 'House rent',
    conveyance: 'Conveyance',
    medical: 'Medical',
    food: 'Food',
    attendanceBonus: 'Attendance bonus',
    otHours: 'OT hours',
    otRate: 'OT rate (per hour)',
    otAmount: 'OT amount',
    other: 'Other',
    total: 'Total',
    deduction: 'Deduction',
    net: 'Net payable',
    signature: 'Signature over revenue stamp',
    designation: 'Designation and card',
    shift: 'Shift',
    hours: 'Total hours',
    payable: 'Payable OT hours',
    rate: 'Hourly rate',
    amount: 'OT amount (Tk)',
    over: 'Shaded: more than 10 hours in a day.',
    totals: 'Total',
  },
  bn: {
    form38: 'মজুরি রেজিস্টার (ফরম ৩৮, বাংলাদেশ শ্রম বিধিমালা ২০১৫, বিধি ১১১)',
    form34: 'দৈনিক হাজিরা ও অধিকাল রেজিস্টার (ফরম ৩৪, বিধি ১০২(৪))',
    reg: 'নিবন্ধন নং',
    period: 'মজুরি কাল',
    sl: 'ক্রম',
    code: 'শ্রমিক নং',
    name: 'নাম',
    basic: 'মূল মজুরি',
    houseRent: 'বাড়ি ভাড়া',
    conveyance: 'যাতায়াত',
    medical: 'চিকিৎসা',
    food: 'খাদ্য',
    attendanceBonus: 'হাজিরা বোনাস',
    otHours: 'অধিকাল ঘণ্টা',
    otRate: 'অধিকাল হার (ঘণ্টা)',
    otAmount: 'অধিকাল ভাতা',
    other: 'অন্যান্য',
    total: 'মোট',
    deduction: 'কর্তন',
    net: 'নিট প্রদেয়',
    signature: 'রেভিনিউ স্ট্যাম্পের উপর স্বাক্ষর',
    designation: 'পদবি ও কার্ড',
    shift: 'শিফট',
    hours: 'মোট ঘণ্টা',
    payable: 'প্রদেয় অধিকাল ঘণ্টা',
    rate: 'ঘণ্টাপ্রতি হার',
    amount: 'অধিকাল ভাতা (টাকা)',
    over: 'ছায়াযুক্ত: দিনে ১০ ঘণ্টার বেশি।',
    totals: 'মোট',
  },
};

const css = (size: 'A4' | 'A3') => `
@page{size:${size} landscape;margin:9mm 9mm}
body{font-size:${size === 'A3' ? '7pt' : '8pt'}}
h1{font-size:11.5pt;margin:0 0 2px}
.est{font-size:12pt;font-weight:700}
.meta{font-size:8.5pt;color:#374151;margin:2px 0 8px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #9ca3af;padding:2px 3px;vertical-align:top}
th{background:#f3f4f6;font-weight:600}
thead{display:table-header-group}
tfoot{display:table-row-group}
tfoot td{font-weight:700;background:#f3f4f6}
tr{page-break-inside:avoid}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.code{white-space:nowrap}
.sign{min-width:110px;height:36px}
.over{background:#fde68a}
.note{font-size:8pt;color:#4b5563;margin-top:6px}`;

const header = (e: Establishment, title: string, period: string, l: (typeof LABELS)['en']) =>
  `<div class="est">${escapeHtml(e.name)}</div>
<div class="meta">${escapeHtml(e.address)}${e.registrationNo ? ` · ${l.reg} ${escapeHtml(e.registrationNo)}` : ''}</div>
<h1>${title}</h1>
<div class="meta">${l.period}: ${period}</div>`;

const th = (t: string) => `<th>${escapeHtml(t)}</th>`;

export interface WageRow {
  code: string;
  name: string;
  basic: string;
  houseRent: string;
  conveyance: string;
  medical: string;
  food: string;
  attendanceBonus: string;
  otHours: number;
  otRate: string;
  otAmount: string;
  other: string;
  total: string;
  deduction: string;
  net: string;
}

const MONEY_KEYS = [
  'basic',
  'houseRent',
  'conveyance',
  'medical',
  'food',
  'attendanceBonus',
] as const;

/** Form 38, or one part of it: one row per worker, signed over a revenue stamp when paid. */
export function wageRegisterHtml(
  d: {
    language: 'en' | 'bn';
    establishment: Establishment;
    from: string;
    to: string;
    rows: WageRow[];
  },
  part = { from: 0, to: d.rows.length, last: true },
): string {
  const l = LABELS[d.language];
  const n = (v: string) => amountText(d.language, v);
  const sum = (pick: (r: WageRow) => string) =>
    money(d.rows.reduce((s, r) => s.plus(pick(r)), new Decimal(0)));
  const body = d.rows
    .slice(part.from, part.to)
    .map(
      (r, i) =>
        `<tr><td class="num">${n(String(part.from + i + 1))}</td><td class="code">${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td>${MONEY_KEYS.map((k) => `<td class="num">${n(r[k])}</td>`).join('')}<td class="num">${n(String(r.otHours))}</td><td class="num">${n(r.otRate)}</td><td class="num">${n(r.otAmount)}</td><td class="num">${n(r.other)}</td><td class="num">${n(r.total)}</td><td class="num">${n(r.deduction)}</td><td class="num"><b>${n(r.net)}</b></td><td class="sign"></td></tr>`,
    )
    .join('');
  const totals = [
    ...MONEY_KEYS.map((k) => sum((r) => r[k])),
    String(d.rows.reduce((s, r) => s + r.otHours, 0)),
    '',
    sum((r) => r.otAmount),
    sum((r) => r.other),
    sum((r) => r.total),
    sum((r) => r.deduction),
    sum((r) => r.net),
  ]
    .map((v) => `<td class="num">${v === '' ? '' : n(v)}</td>`)
    .join('');
  return page(
    d.language,
    css('A3'),
    `${header(d.establishment, l.form38, `${date(d.language, d.from)} – ${date(d.language, d.to)}`, l)}
<table><thead><tr>${[l.sl, l.code, l.name, l.basic, l.houseRent, l.conveyance, l.medical, l.food, l.attendanceBonus, l.otHours, l.otRate, l.otAmount, l.other, l.total, l.deduction, l.net, l.signature].map(th).join('')}</tr></thead>
<tbody>${body}</tbody>
${part.last ? `<tfoot><tr><td colspan="3">${l.totals}</td>${totals}<td></td></tr></tfoot>` : ''}</table>`,
  );
}

export interface OvertimeRow {
  code: string;
  name: string;
  designation: string;
  shift: string;
  /** Hours worked each day of the period, null where nothing was recorded. */
  days: (number | null)[];
  hours: number;
  otHours: number;
  rate: string;
  amount: string;
}

/** Form 34, monthly, or one part of it: hours each day, payable overtime, rate and amount. */
export function overtimeRegisterHtml(
  d: {
    language: 'en' | 'bn';
    establishment: Establishment;
    from: string;
    to: string;
    dates: string[];
    rows: OvertimeRow[];
  },
  part = { from: 0, to: d.rows.length, last: true },
): string {
  const l = LABELS[d.language];
  const n = (v: number | string) => amountText(d.language, String(v));
  const day = (iso: string) => n(Number(iso.slice(8, 10)));
  const body = d.rows
    .slice(part.from, part.to)
    .map(
      (r, i) =>
        `<tr><td class="num">${n(part.from + i + 1)}</td><td class="code">${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.designation)}</td><td>${escapeHtml(r.shift)}</td>${r.days
          .map(
            (h) =>
              `<td class="num${h !== null && h > 10 ? ' over' : ''}">${h === null ? '' : n(h)}</td>`,
          )
          .join(
            '',
          )}<td class="num">${n(r.hours)}</td><td class="num">${n(r.otHours)}</td><td class="num">${n(r.rate)}</td><td class="num"><b>${n(r.amount)}</b></td></tr>`,
    )
    .join('');
  const total = money(d.rows.reduce((s, r) => s.plus(r.amount), new Decimal(0)));
  return page(
    d.language,
    css('A3'),
    `${header(d.establishment, l.form34, `${date(d.language, d.from)} – ${date(d.language, d.to)}`, l)}
<table><thead><tr><th>${l.sl}</th><th>${l.code}</th><th>${l.name}</th><th>${l.designation}</th><th>${l.shift}</th>${d.dates.map((x) => `<th>${day(x)}</th>`).join('')}<th>${l.hours}</th><th>${l.payable}</th><th>${l.rate}</th><th>${l.amount}</th></tr></thead>
<tbody>${body}</tbody>
${part.last ? `<tfoot><tr><td colspan="${5 + d.dates.length + 3}">${l.totals}</td><td class="num">${n(total)}</td></tr></tfoot>` : ''}</table>
${part.last ? `<div class="note">${l.over}</div>` : ''}`,
  );
}
