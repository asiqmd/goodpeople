import { Decimal, money } from '@gp/shared';
import { escapeHtml, page, type Letterhead } from '../letters/render.js';
import { amountText, date, periodName } from './payslip.js';

// Printable payroll registers: one row per person, a column per component, by unit with
// subtotals, landscape (A3 when there are many columns).

const LABELS = {
  en: {
    register: 'Payroll register',
    notLocked: 'not locked: figures may still change',
    group: 'Pay group',
    paidOn: 'Payment date',
    sl: 'SL',
    code: 'Code',
    name: 'Name',
    designation: 'Designation',
    days: 'Paid days',
    earnings: 'Total earnings',
    deductions: 'Total deductions',
    net: 'Net pay',
    subtotal: 'Unit total',
    continued: 'continued',
    total: 'Total',
    people: (n: string) => `${n} people`,
    preparedBy: 'Prepared by',
    checkedBy: 'Checked by',
    approvedBy: 'Approved by',
  },
  bn: {
    register: 'বেতন রেজিস্টার',
    notLocked: 'লক করা হয়নি: অঙ্ক বদলাতে পারে',
    group: 'পে গ্রুপ',
    paidOn: 'পরিশোধের তারিখ',
    sl: 'ক্রম',
    code: 'কোড',
    name: 'নাম',
    designation: 'পদবি',
    days: 'বেতনযোগ্য দিন',
    earnings: 'মোট আয়',
    deductions: 'মোট কর্তন',
    net: 'নিট বেতন',
    subtotal: 'ইউনিটের মোট',
    continued: 'চলমান',
    total: 'সর্বমোট',
    people: (n: string) => `${n} জন`,
    preparedBy: 'প্রস্তুতকারী',
    checkedBy: 'যাচাইকারী',
    approvedBy: 'অনুমোদনকারী',
  },
};

export interface RegisterColumn {
  code: string;
  label: string;
  kind: 'earning' | 'deduction' | 'employer_cost';
}

export interface RegisterRow {
  code: string;
  name: string;
  designation: string | null;
  unit: string | null;
  paidDays: number;
  amounts: Record<string, string>;
  earnings: string;
  deductions: string;
  net: string;
}

const css = (wide: boolean) => `
@page{size:${wide ? 'A3' : 'A4'} landscape;margin:10mm 10mm}
body{font-size:${wide ? '7.5pt' : '8pt'}}
.head{border-bottom:2px solid #15803d;padding-bottom:4px;margin-bottom:8px}
.company{font-size:13pt;font-weight:700}
.details{font-size:8pt;color:#4b5563}
h1{font-size:12pt;margin:0 0 4px}
.meta{font-size:8.5pt;color:#374151;margin-bottom:8px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #d1d5db;padding:2px 3px}
th{background:#f3f4f6;font-weight:600}
thead{display:table-header-group}
tr{page-break-inside:avoid}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.unit td{background:#eef2ff;font-weight:600}
.sub td{background:#f9fafb;font-weight:600}
tfoot{display:table-row-group}
tfoot td{font-weight:700;background:#f3f4f6}
.code{white-space:nowrap}
.signatures{margin-top:32px;display:flex;justify-content:space-between;font-size:9pt}
.line{border-top:1px solid #111827;padding-top:4px;min-width:150px;text-align:center}`;

const th = (label: string) => `<th>${escapeHtml(label)}</th>`;

/** Rows printed per PDF part; long registers are printed in parts and joined. */
export const PART_ROWS = 1500;

/** The row ranges of the parts a register of `count` rows is printed in. */
export function partsOf(count: number): { from: number; to: number; last: boolean }[] {
  const parts = [];
  for (let from = 0; from < Math.max(count, 1); from += PART_ROWS) {
    const to = Math.min(from + PART_ROWS, count);
    parts.push({ from, to, last: to >= count });
  }
  return parts;
}

/**
 * The payroll register, or one part of it: rows `part.from` to `part.to` of all of them
 * (sorted by unit). Numbering runs on across parts; a unit's subtotal comes after its last row
 * and the grand total in the last part.
 */
export function registerHtml(
  d: {
    language: 'en' | 'bn';
    company: Letterhead;
    group: string;
    run: { periodStart: string; periodEnd: string; paymentDate: string; status: string };
    columns: RegisterColumn[];
    rows: RegisterRow[];
  },
  part = { from: 0, to: d.rows.length, last: true },
): string {
  const l = LABELS[d.language];
  const n = (v: string) => amountText(d.language, v);
  const earn = d.columns.filter((c) => c.kind === 'earning');
  const deduct = d.columns.filter((c) => c.kind === 'deduction');
  const employer = d.columns.filter((c) => c.kind === 'employer_cost');
  const wide = d.columns.length > 10;
  const sumOf = (rows: RegisterRow[], pick: (r: RegisterRow) => string | undefined) =>
    money(rows.reduce((s, r) => s.plus(pick(r) ?? 0), new Decimal(0)));
  const cells = (rows: RegisterRow[]) =>
    [
      ...earn.map((c) => sumOf(rows, (r) => r.amounts[c.code])),
      sumOf(rows, (r) => r.earnings),
      ...deduct.map((c) => sumOf(rows, (r) => r.amounts[c.code])),
      sumOf(rows, (r) => r.deductions),
      sumOf(rows, (r) => r.net),
      ...employer.map((c) => sumOf(rows, (r) => r.amounts[c.code])),
    ]
      .map((v) => `<td class="num">${n(v)}</td>`)
      .join('');
  const unitOf = (r: RegisterRow) => r.unit ?? '—';
  const units = new Map<string, RegisterRow[]>();
  for (const r of d.rows) units.set(unitOf(r), [...(units.get(unitOf(r)) ?? []), r]);
  const width = 5 + d.columns.length + 3;
  let body = '';
  for (let i = part.from; i < part.to; i++) {
    const r = d.rows[i]!;
    const unit = unitOf(r);
    const all = units.get(unit)!;
    if (i === part.from || unitOf(d.rows[i - 1]!) !== unit) {
      const continued = i > 0 && unitOf(d.rows[i - 1]!) === unit;
      body += `<tr class="unit"><td colspan="${width}">${escapeHtml(unit)} · ${l.people(n(String(all.length)))}${continued ? ` · ${l.continued}` : ''}</td></tr>`;
    }
    const amount = (code: string) =>
      `<td class="num">${r.amounts[code] ? n(r.amounts[code]!) : ''}</td>`;
    body += `<tr><td>${n(String(i + 1))}</td><td class="code">${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.designation ?? '')}</td><td class="num">${n(String(r.paidDays))}</td>${earn.map((c) => amount(c.code)).join('')}<td class="num">${n(r.earnings)}</td>${deduct.map((c) => amount(c.code)).join('')}<td class="num">${n(r.deductions)}</td><td class="num"><b>${n(r.net)}</b></td>${employer.map((c) => amount(c.code)).join('')}</tr>`;
    if (i === d.rows.length - 1 || unitOf(d.rows[i + 1]!) !== unit) {
      body += `<tr class="sub"><td colspan="5">${l.subtotal}</td>${cells(all)}</tr>`;
    }
  }
  return page(
    d.language,
    css(wide),
    `<div class="head"><div class="company">${escapeHtml(d.company.name)}</div><div class="details">${escapeHtml(d.company.details)}</div></div>
<h1>${l.register}: ${escapeHtml(periodName(d.language, d.run.periodStart, d.run.periodEnd))}</h1>
<div class="meta">${l.group}: ${escapeHtml(d.group)} · ${l.paidOn}: ${date(d.language, d.run.paymentDate)} · ${l.people(n(String(d.rows.length)))}${d.run.status === 'locked' ? '' : ` · <b>${l.notLocked}</b>`}</div>
<table><thead><tr>${th(l.sl)}${th(l.code)}${th(l.name)}${th(l.designation)}${th(l.days)}${earn.map((c) => th(c.label)).join('')}${th(l.earnings)}${deduct.map((c) => th(c.label)).join('')}${th(l.deductions)}${th(l.net)}${employer.map((c) => th(c.label)).join('')}</tr></thead>
<tbody>${body}</tbody>
${part.last ? `<tfoot><tr><td colspan="5">${l.total}</td>${cells(d.rows)}</tr></tfoot>` : ''}</table>
${part.last ? `<div class="signatures"><div class="line">${l.preparedBy}</div><div class="line">${l.checkedBy}</div><div class="line">${l.approvedBy}</div></div>` : ''}`,
  );
}
