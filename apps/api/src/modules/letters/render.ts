import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { LetterLanguage } from '@gp/shared';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);

function fontFace(family: string, subset: string, weight: number) {
  const file = require.resolve(
    `@fontsource/noto-sans-bengali/files/noto-sans-bengali-${subset}-${weight}-normal.woff2`,
  );
  const data = readFileSync(file).toString('base64');
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2');}`;
}

/** Noto Sans Bengali (with its Latin subset), embedded so every server renders the same. */
let fontCss: string | undefined;
function fonts(): string {
  fontCss ??= [400, 700]
    .flatMap((w) => [fontFace('GP Latin', 'latin', w), fontFace('GP Bengali', 'bengali', w)])
    .join('\n');
  return fontCss;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** **bold**, and placeholders still unfilled marked so a preview shows what is missing. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\{\{[^}]+\}\}/g, (m) => `<mark>${m}</mark>`);
}

/**
 * A template's text as HTML: blank lines separate paragraphs, a line break stays a line
 * break, and a paragraph whose lines all start with "- " is a list. Nothing else is markup.
 */
export function markupToHtml(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.split('\n').filter((line) => line.trim() !== ''))
    .filter((lines) => lines.length > 0)
    .map((lines) =>
      lines.every((line) => line.startsWith('- '))
        ? `<ul>${lines.map((line) => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`
        : `<p>${lines.map(inline).join('<br>')}</p>`,
    )
    .join('\n');
}

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:'GP Latin','GP Bengali',sans-serif;color:#111827;font-size:10.5pt;line-height:1.55}
mark{background:#fef08a}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #d1d5db;padding:4px 6px;text-align:left;vertical-align:top;font-size:9pt}
th{background:#f3f4f6;font-weight:700}
`;

/** A complete page with the embedded fonts and base styles; `css` and `body` are the document's own. */
export function page(lang: LetterLanguage, css: string, body: string): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${fonts()}${BASE_CSS}${css}</style></head><body>${body}</body></html>`;
}

export interface Letterhead {
  name: string;
  /** Legal name, address, TIN and BIN, already in one line. */
  details: string;
}

const LETTER_LABELS = {
  en: {
    ref: 'Ref',
    date: 'Date',
    subject: 'Subject',
    signatory: 'Authorised signatory',
    hr: 'Human Resources',
  },
  bn: {
    ref: 'সূত্র',
    date: 'তারিখ',
    subject: 'বিষয়',
    signatory: 'অনুমোদিত স্বাক্ষরকারী',
    hr: 'মানবসম্পদ বিভাগ',
  },
};

export function letterHtml(input: {
  language: LetterLanguage;
  letterhead: Letterhead;
  refNo: string;
  date: string;
  subject: string;
  body: string;
}): string {
  const l = LETTER_LABELS[input.language];
  const css = `
@page{size:A4;margin:16mm 20mm 20mm}
.head{border-bottom:2px solid #15803d;padding-bottom:6px;margin-bottom:16px}
.company{font-size:15pt;font-weight:700}
.details{font-size:8.5pt;color:#4b5563}
.meta{display:flex;justify-content:space-between;font-size:9.5pt;margin-bottom:12px}
.subject{font-weight:700;margin:6px 0 14px}
p{margin:0 0 9px}
ul{margin:0 0 9px 18px;padding:0}
li{margin-bottom:2px}
.sign{margin-top:44px;font-size:10pt}
.line{width:200px;border-top:1px solid #111827;margin-bottom:4px}`;
  return page(
    input.language,
    css,
    `<div class="head"><div class="company">${escapeHtml(input.letterhead.name)}</div>
<div class="details">${escapeHtml(input.letterhead.details)}</div></div>
<div class="meta"><span>${l.ref}: ${escapeHtml(input.refNo)}</span><span>${l.date}: ${escapeHtml(input.date)}</span></div>
<div class="subject">${l.subject}: ${inline(input.subject)}</div>
${markupToHtml(input.body)}
<div class="sign"><div class="line"></div><div>${l.signatory}</div><div>${l.hr}, ${escapeHtml(input.letterhead.name)}</div></div>`,
  );
}

export interface IdCard {
  name: string;
  code: string;
  designation: string;
  department: string;
  bloodGroup: string;
  joinedOn: string;
  emergency: string;
  photo: { contentType: string; bytes: Buffer } | null;
}

const CARD_LABELS = {
  en: {
    id: 'Employee ID',
    blood: 'Blood group',
    joined: 'Joined',
    emergency: 'In an emergency',
    valid: 'Valid until',
    found: 'If found, please return to',
    issued: 'Identity card under section 5 of the Bangladesh Labour Act 2006',
  },
  bn: {
    id: 'কর্মী নম্বর',
    blood: 'রক্তের গ্রুপ',
    joined: 'যোগদান',
    emergency: 'জরুরি প্রয়োজনে',
    valid: 'মেয়াদ',
    found: 'কেউ পেলে অনুগ্রহ করে ফেরত দিন',
    issued: 'বাংলাদেশ শ্রম আইন ২০০৬-এর ধারা ৫ অনুযায়ী পরিচয়পত্র',
  },
};

/**
 * Photo ID cards at the standard card size (85.6 × 54 mm), front and back side by side,
 * four people to an A4 page, ready to print, cut and laminate.
 */
export function idCardsHtml(input: {
  language: LetterLanguage;
  company: Letterhead & { address: string };
  validUntil: string | null;
  cards: IdCard[];
}): string {
  const l = CARD_LABELS[input.language];
  const css = `
@page{size:A4;margin:12mm}
.sheet{display:grid;grid-template-columns:85.6mm 85.6mm;column-gap:8mm;row-gap:7mm;justify-content:center}
.card{width:85.6mm;height:54mm;border:0.3mm solid #9ca3af;border-radius:3mm;overflow:hidden;font-size:7pt;line-height:1.35;break-inside:avoid}
.band{background:#15803d;color:white;padding:1.6mm 3mm;font-weight:700;font-size:8pt}
.front{display:flex;gap:3mm;padding:2.5mm 3mm}
.photo{width:21mm;height:26mm;border-radius:1.5mm;object-fit:cover;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:14pt;font-weight:700;color:#6b7280}
.name{font-size:9.5pt;font-weight:700;margin-bottom:1mm}
.k{color:#6b7280}
.details{flex:1;min-width:0;overflow-wrap:anywhere}
.qr{width:15mm;height:15mm;flex:none;align-self:flex-end}
.back{padding:2.5mm 3mm}
.back p{margin:0 0 1.4mm}
.small{font-size:6pt;color:#6b7280}
.break{break-after:page}`;
  const cards = input.cards
    .map((c, i) => {
      const photo = c.photo
        ? `<img class="photo" src="data:${c.photo.contentType};base64,${c.photo.bytes.toString('base64')}">`
        : `<div class="photo">${escapeHtml(initials(c.name))}</div>`;
      const front = `<div class="card"><div class="band">${escapeHtml(input.company.name)}</div><div class="front">${photo}<div class="details">
<div class="name">${escapeHtml(c.name)}</div>
<div>${escapeHtml(c.designation)}</div><div>${escapeHtml(c.department)}</div>
<div style="margin-top:1.5mm"><span class="k">${l.id}:</span> <b>${escapeHtml(c.code)}</b></div>
<div><span class="k">${l.blood}:</span> ${escapeHtml(c.bloodGroup)}</div>
<div><span class="k">${l.joined}:</span> ${escapeHtml(c.joinedOn)}</div></div>${qrSvg(c.code)}</div></div>`;
      const back = `<div class="card"><div class="band">${escapeHtml(input.company.name)}</div><div class="back">
<p><span class="k">${l.emergency}:</span> ${escapeHtml(c.emergency)}</p>
${input.validUntil ? `<p><span class="k">${l.valid}:</span> ${escapeHtml(input.validUntil)}</p>` : ''}
<p><span class="k">${l.found}:</span><br>${escapeHtml(input.company.address)}</p>
<p class="small">${l.issued}</p></div></div>`;
      const pageEnd =
        (i + 1) % 4 === 0 && i + 1 < input.cards.length
          ? '</div><div class="sheet break-before">'
          : '';
      return front + back + pageEnd;
    })
    .join('');
  return page(
    input.language,
    `${css}.break-before{break-before:page;margin-top:0}`,
    `<div class="sheet">${cards}</div>`,
  );
}

/**
 * The employee code as a QR code, for signing in at a kiosk with the card. Medium error
 * correction survives a scratched laminate; at 15 mm a short code's modules are about 0.6 mm,
 * which tablet cameras read from a hand's length.
 */
function qrSvg(code: string): string {
  const { size, data } = QRCode.create(code, { errorCorrectionLevel: 'M' }).modules;
  const quiet = 2;
  const runs: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      let width = 1;
      while (x + width < size && data[y * size + x + width]) width++;
      runs.push(`M${x + quiet} ${y + quiet}h${width}v1h-${width}z`);
      x += width;
    }
  }
  const box = size + 2 * quiet;
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges" role="img" aria-label="${escapeHtml(code)}"><rect width="${box}" height="${box}" fill="#fff"/><path fill="#000" d="${runs.join('')}"/></svg>`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export interface ServiceBookSection {
  title: string;
  /** Label–value pairs, or a table. */
  rows?: [string, string][];
  table?: { head: string[]; body: string[][] };
  empty?: string;
}

/** The service book (Labour Act s.6): the worker's record of employment, in sections. */
export function serviceBookHtml(input: {
  language: LetterLanguage;
  company: Letterhead;
  title: string;
  subtitle: string;
  sections: ServiceBookSection[];
  footer: string;
}): string {
  const css = `
@page{size:A4;margin:14mm 16mm 16mm}
.head{border-bottom:2px solid #15803d;padding-bottom:6px;margin-bottom:12px}
.company{font-size:13pt;font-weight:700}
.details{font-size:8.5pt;color:#4b5563}
h1{font-size:14pt;margin:4px 0 0}
.sub{font-size:9pt;color:#4b5563;margin-bottom:12px}
h2{font-size:10.5pt;margin:14px 0 6px;color:#15803d}
.kv td:first-child{width:38%;color:#4b5563}
.empty{font-size:9pt;color:#6b7280}
.footer{margin-top:18px;font-size:8pt;color:#6b7280}`;
  const sections = input.sections
    .map((s) => {
      let content = '';
      if (s.rows) {
        content = `<table class="kv">${s.rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>`;
      } else if (s.table && s.table.body.length) {
        content = `<table><tr>${s.table.head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>${s.table.body
          .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
          .join('')}</table>`;
      } else {
        content = `<p class="empty">${escapeHtml(s.empty ?? '')}</p>`;
      }
      return `<h2>${escapeHtml(s.title)}</h2>${content}`;
    })
    .join('');
  return page(
    input.language,
    css,
    `<div class="head"><div class="company">${escapeHtml(input.company.name)}</div><div class="details">${escapeHtml(input.company.details)}</div></div>
<h1>${escapeHtml(input.title)}</h1><div class="sub">${escapeHtml(input.subtitle)}</div>${sections}<div class="footer">${escapeHtml(input.footer)}</div>`,
  );
}
