import { BD_VAT_STARTUP_EXEMPTION, bdVatOn, takaInWords } from '@gp/country-packs';
import type { InvoiceView } from '@gp/shared';
import { escapeHtml, page } from '../letters/render.js';
import { date } from '../payroll/payslip.js';

// Mushak 6.3 (tax invoice) and 6.7 (credit note) under rule 40 of the VAT and Supplementary
// Duty Rules 2016, in English or Bangla, issued electronically. The forms' headings, numbers and
// fields follow NBR's; a subscription carries no supplementary duty and no vehicle.

type Language = 'en' | 'bn';

const LABELS = {
  en: {
    government: "Government of the People's Republic of Bangladesh",
    nbr: 'National Board of Revenue',
    invoice: 'Tax invoice',
    invoiceForm: 'Mushak-6.3',
    invoiceRule: '[See clauses (c) and (f) of sub-rule (1) of rule 40]',
    note: 'Credit note',
    noteForm: 'Mushak-6.7',
    noteRule: '[See clause (g) of sub-rule (1) of rule 40]',
    supplier: 'Name of registered person',
    supplierBin: 'BIN of registered person',
    supplierAddress: 'Address of issue',
    buyer: 'Name of buyer',
    buyerBin: 'BIN of buyer',
    buyerAddress: 'Address of buyer',
    destination: 'Supply destination',
    online: 'Delivered online',
    vehicle: 'Type and number of vehicle',
    none: 'Not applicable',
    number: 'Invoice number',
    noteNumber: 'Credit note number',
    issued: 'Date of issue',
    time: 'Time of issue',
    period: 'Service period',
    dueDate: 'Due by',
    original: 'Original tax invoice',
    reason: 'Reason for issue',
    serial: 'No.',
    description: 'Description of service',
    unit: 'Unit',
    personMonth: 'person-month',
    item: 'item',
    quantity: 'Quantity',
    unitPrice: 'Unit price (Tk)',
    value: 'Value (Tk)',
    subtotal: 'Total value',
    discount: 'Discount',
    taxable: 'Value excluding VAT',
    sd: 'Supplementary duty',
    vat: (rate: string) => `VAT at ${rate}%`,
    exempt: 'VAT exempt',
    total: 'Value including all duties and taxes',
    noteTotal: 'Reduction including VAT',
    inWords: 'In words',
    service: (code: string, label: string) => `Service code ${code}: ${label}`,
    startup: `Exempt from VAT and from VAT deducted at source as a registered startup (${BD_VAT_STARTUP_EXEMPTION.reference.act}).`,
    vds: (rate: string) =>
      `If you deduct VAT at source (VDS, ${rate}%), send us the Mushak-6.6 certificate and record it in Billing.`,
    bank: 'Pay through a bank account or a mobile financial service: a supply above Tk 1,00,000 paid any other way loses its input tax credit (VAT Act 2012, s.46).',
    payTo: 'Bank transfer',
    status: 'Account',
    paid: 'Paid',
    withheld: 'Withheld at source',
    credited: 'Credited',
    balance: 'Balance due',
    electronic: 'This document was issued electronically by Good People and needs no signature.',
  },
  bn: {
    government: 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার',
    nbr: 'জাতীয় রাজস্ব বোর্ড',
    invoice: 'কর চালানপত্র',
    invoiceForm: 'মূসক-৬.৩',
    invoiceRule: '[বিধি ৪০ এর উপ-বিধি (১) এর দফা (গ) ও দফা (চ) দ্রষ্টব্য]',
    note: 'ক্রেডিট নোট',
    noteForm: 'মূসক-৬.৭',
    noteRule: '[বিধি ৪০ এর উপ-বিধি (১) এর দফা (ছ) দ্রষ্টব্য]',
    supplier: 'নিবন্ধিত ব্যক্তির নাম',
    supplierBin: 'নিবন্ধিত ব্যক্তির বিআইএন',
    supplierAddress: 'চালানপত্র ইস্যুর ঠিকানা',
    buyer: 'ক্রেতার নাম',
    buyerBin: 'ক্রেতার বিআইএন',
    buyerAddress: 'ক্রেতার ঠিকানা',
    destination: 'সরবরাহের গন্তব্যস্থল',
    online: 'অনলাইনে সরবরাহ',
    vehicle: 'যানবাহনের প্রকৃতি ও নম্বর',
    none: 'প্রযোজ্য নয়',
    number: 'চালানপত্র নম্বর',
    noteNumber: 'ক্রেডিট নোট নম্বর',
    issued: 'ইস্যুর তারিখ',
    time: 'ইস্যুর সময়',
    period: 'সেবার মেয়াদ',
    dueDate: 'পরিশোধের শেষ তারিখ',
    original: 'মূল কর চালানপত্র',
    reason: 'ইস্যুর কারণ',
    serial: 'ক্রমিক',
    description: 'সেবার বর্ণনা',
    unit: 'সরবরাহের একক',
    personMonth: 'জন-মাস',
    item: 'টি',
    quantity: 'পরিমাণ',
    unitPrice: 'একক মূল্য (টাকা)',
    value: 'মূল্য (টাকা)',
    subtotal: 'মোট মূল্য',
    discount: 'ছাড়',
    taxable: 'মূসক ব্যতীত মূল্য',
    sd: 'সম্পূরক শুল্ক',
    vat: (rate: string) => `মূল্য সংযোজন কর (${rate}%)`,
    exempt: 'মূসক অব্যাহতিপ্রাপ্ত',
    total: 'সকল প্রকার শুল্ক ও করসহ মূল্য',
    noteTotal: 'মূসকসহ হ্রাসকৃত মূল্য',
    inWords: 'কথায়',
    service: (code: string, label: string) => `সেবা কোড ${code}: ${label}`,
    startup: `নিবন্ধিত স্টার্টআপ হিসেবে মূসক ও উৎসে মূসক কর্তন থেকে অব্যাহতিপ্রাপ্ত (${BD_VAT_STARTUP_EXEMPTION.reference.act})।`,
    vds: (rate: string) =>
      `উৎসে মূসক কর্তন (ভিডিএস, ${rate}%) করলে মূসক-৬.৬ সনদ আমাদের পাঠান এবং বিলিং-এ লিপিবদ্ধ করুন।`,
    bank: 'ব্যাংক হিসাব বা মোবাইল আর্থিক সেবার মাধ্যমে পরিশোধ করুন: ১,০০,০০০ টাকার বেশি সরবরাহ অন্যভাবে পরিশোধ করলে উপকরণ কর রেয়াত পাওয়া যায় না (মূসক আইন ২০১২, ধারা ৪৬)।',
    payTo: 'ব্যাংক ট্রান্সফার',
    status: 'হিসাব',
    paid: 'পরিশোধিত',
    withheld: 'উৎসে কর্তিত',
    credited: 'ক্রেডিট নোট',
    balance: 'পরিশোধযোগ্য বাকি',
    electronic: 'এই দলিলটি Good People ইলেকট্রনিকভাবে ইস্যু করেছে; এতে স্বাক্ষরের প্রয়োজন নেই।',
  },
};

const SERVICE_BN: Record<string, string> = {
  'IT-enabled services (ITES)': 'তথ্যপ্রযুক্তি নির্ভর সেবা (আইটিইএস)',
  'Other miscellaneous services': 'অন্যান্য বিবিধ সেবা',
};

const n = (language: Language, value: number | string) =>
  new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-IN', { maximumFractionDigits: 2 }).format(
    Number(value),
  );
const tk = (language: Language, value: string) =>
  new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));

/** A line's description in Bangla: the invoice keeps the English it was issued with. */
export function lineText(language: Language, description: string): string {
  if (language === 'en') return description;
  return description
    .replace(/: staff, per person/, ': স্টাফ, প্রতি জন')
    .replace(/: workers, per person/, ': শ্রমিক, প্রতি জন')
    .replace(/: minimum monthly charge/, ': ন্যূনতম মাসিক মূল্য')
    .replace(
      /\((\d+) of (\d+) days\)/,
      (_, a: string, b: string) => `(${n('bn', b)} দিনের ${n('bn', a)} দিন)`,
    )
    .replace(/^Credit against ([^:]+): /, (_, num: string) => `${num}-এর বিপরীতে ক্রেডিট: `);
}

const timeOf = (language: Language, iso: string) =>
  new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    // Bangla reads the 24-hour clock; "PM" would be the one Latin word on the page.
    hour12: language === 'en',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(iso));
const dhakaDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(iso));

const CSS = `
@page{size:A4;margin:12mm 14mm}
.gov{text-align:center;font-size:9pt;line-height:1.35}
.form{display:flex;justify-content:space-between;align-items:flex-start;margin:6px 0 10px}
.form .title{font-size:14pt;font-weight:700;text-align:center;flex:1}
.form .code{border:1.5px solid #111827;padding:2px 8px;font-weight:700;font-size:10pt}
.rule{text-align:center;font-size:8pt;color:#4b5563;margin-top:-6px;margin-bottom:10px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;font-size:9pt;margin-bottom:10px}
.parties span{color:#4b5563}
.num{text-align:right;font-variant-numeric:tabular-nums}
.c{text-align:center}
.totals{width:60%;margin-left:40%;margin-top:8px}
.totals td{font-size:9.5pt}
.totals tr.strong td{font-weight:700;background:#f9fafb}
.words{margin-top:6px;font-size:9pt}
.notes{margin-top:12px;font-size:8.5pt;color:#374151}
.notes p{margin:3px 0}
.box{margin-top:10px;border:1px solid #d1d5db;border-radius:4px;padding:6px 10px;font-size:9pt;white-space:pre-line}
.status{margin-top:10px;width:50%}
.foot{margin-top:16px;font-size:8pt;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:6px}`;

const field = (label: string, value: string) => `<div><span>${label}:</span> ${value}</div>`;
const total = (label: string, value: string, strong = false) =>
  `<tr${strong ? ' class="strong"' : ''}><td>${label}</td><td class="num">${value}</td></tr>`;

/**
 * An invoice (Mushak-6.3) or credit note (Mushak-6.7) as a printable A4 page. `bankDetails`
 * appear on an invoice with something still owed.
 */
export function invoiceHtml(
  invoice: InvoiceView,
  language: Language,
  options: { bankDetails: string | null },
): string {
  const l = LABELS[language];
  const note = invoice.kind === 'credit_note';
  const issuedOn = dhakaDate(invoice.issuedAt);
  const service = bdVatOn(issuedOn).services[invoice.serviceCode];
  const serviceLabel =
    language === 'bn' ? (SERVICE_BN[service.label] ?? service.label) : service.label;
  const exempt = Number(invoice.vatRate) === 0;
  const rows = invoice.lines
    .map(
      (
        line,
        i,
      ) => `<tr><td class="c">${n(language, i + 1)}</td><td>${escapeHtml(lineText(language, line.description))}</td>
<td class="c">${note ? l.item : l.personMonth}</td><td class="num">${n(language, line.quantity)}</td>
<td class="num">${tk(language, line.unitPrice)}</td><td class="num">${tk(language, line.amount)}</td></tr>`,
    )
    .join('');
  const totals = [
    total(l.subtotal, tk(language, invoice.subtotal)),
    Number(invoice.discount) > 0 ? total(l.discount, `− ${tk(language, invoice.discount)}`) : '',
    total(l.taxable, tk(language, invoice.taxable)),
    total(l.sd, tk(language, '0')),
    total(exempt ? l.exempt : l.vat(n(language, invoice.vatRate)), tk(language, invoice.vat)),
    total(note ? l.noteTotal : l.total, tk(language, invoice.total), true),
  ].join('');
  const settled = (kind: 'payment' | 'deduction') =>
    invoice.settlements
      .filter((s) =>
        kind === 'payment'
          ? s.kind === 'payment' && s.status === 'succeeded'
          : s.kind !== 'payment' && s.status !== 'rejected',
      )
      .reduce((sum, s) => sum + Number(s.amount), 0);
  const paid = settled('payment');
  const withheld = settled('deduction');
  const credited = Number(invoice.total) - paid - withheld - Number(invoice.balance);
  const status =
    !note && (paid > 0 || withheld > 0 || credited > 0.004)
      ? `<table class="status"><thead><tr><th colspan="2">${l.status}</th></tr></thead><tbody>
${paid > 0 ? total(l.paid, tk(language, String(paid))) : ''}
${withheld > 0 ? total(l.withheld, tk(language, String(withheld))) : ''}
${credited > 0.004 ? total(l.credited, tk(language, String(credited))) : ''}
${total(l.balance, tk(language, invoice.balance), true)}</tbody></table>`
      : '';
  const owed = !note && Number(invoice.balance) > 0;
  const notes = [
    `<p>${l.service(invoice.serviceCode, escapeHtml(serviceLabel))}</p>`,
    exempt ? `<p>${l.startup}</p>` : '',
    !note && !exempt
      ? `<p>${l.vds(n(language, Math.min(service.vdsRate, Number(invoice.vatRate))))}</p>`
      : '',
    !note ? `<p>${l.bank}</p>` : '',
  ].join('');
  const buyerBin = invoice.buyer.bin ? escapeHtml(invoice.buyer.bin) : '—';
  return page(
    language,
    CSS,
    `<div class="gov">${l.government}<br>${l.nbr}</div>
<div class="form"><div style="width:90px"></div><div class="title">${note ? l.note : l.invoice}</div><div class="code">${note ? l.noteForm : l.invoiceForm}</div></div>
<div class="rule">${note ? l.noteRule : l.invoiceRule}</div>
<div class="parties">
${field(l.supplier, escapeHtml(invoice.supplier.name))}
${field(l.supplierBin, escapeHtml(invoice.supplier.bin ?? '—'))}
${field(l.supplierAddress, escapeHtml(invoice.supplier.address))}
${field(note ? l.noteNumber : l.number, escapeHtml(invoice.number))}
${field(l.buyer, escapeHtml(invoice.buyer.name))}
${field(l.buyerBin, buyerBin)}
${field(l.buyerAddress, escapeHtml(invoice.buyer.address || '—'))}
${field(l.issued, date(language, issuedOn))}
${field(l.destination, l.online)}
${field(l.time, timeOf(language, invoice.issuedAt))}
${field(l.vehicle, l.none)}
${
  note
    ? field(l.original, escapeHtml(invoice.credits?.number ?? '—'))
    : invoice.periodStart && invoice.periodEnd
      ? field(
          l.period,
          `${date(language, invoice.periodStart)} – ${date(language, invoice.periodEnd)}`,
        )
      : ''
}
${note && invoice.reason ? field(l.reason, escapeHtml(invoice.reason)) : ''}
${!note && invoice.dueDate ? field(l.dueDate, date(language, invoice.dueDate)) : ''}
</div>
<table><thead><tr><th class="c">${l.serial}</th><th>${l.description}</th><th class="c">${l.unit}</th><th class="num">${l.quantity}</th><th class="num">${l.unitPrice}</th><th class="num">${l.value}</th></tr></thead>
<tbody>${rows}</tbody></table>
<table class="totals"><tbody>${totals}</tbody></table>
<div class="words">${l.inWords}: ${escapeHtml(takaInWords(invoice.total, language))}</div>
${status}
${owed && options.bankDetails ? `<div class="box"><strong>${l.payTo}</strong>\n${escapeHtml(options.bankDetails)}</div>` : ''}
<div class="notes">${notes}</div>
<div class="foot">${l.electronic}</div>`,
  );
}

export const invoiceFileName = (
  invoice: Pick<InvoiceView, 'number' | 'kind'>,
  language: Language,
) =>
  `${invoice.kind === 'credit_note' ? 'mushak-6.7' : 'mushak-6.3'}-${invoice.number.replaceAll('/', '-')}${language === 'bn' ? '-bn' : ''}.pdf`;
