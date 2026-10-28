import { inflateRawSync } from 'node:zlib';
import type { CvContacts } from '@gp/shared';
import { getDocumentProxy } from 'unpdf';
import type { CvType } from '../recruitment/intake.js';

// Reads a CV's contact details to fill the add-by-hand form; HR checks them before saving.
// Only the first pages are read: contact details are at the top. Nothing here is a decision.

const PDF_PAGES = 3;
/** The most a Word part may inflate to, against zip bombs. */
const MAX_PART_BYTES = 10 * 1024 * 1024;

/** The CV's text, or empty when it cannot be read (damaged, encrypted, scanned). */
export async function cvText(bytes: Buffer, type: CvType): Promise<string> {
  try {
    return type === 'application/pdf' ? await pdfText(bytes) : docxText(bytes);
  } catch {
    return '';
  }
}

async function pdfText(bytes: Buffer): Promise<string> {
  // A copy: PDF.js takes over the buffer it is given.
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  try {
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, PDF_PAGES); n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ''}` : ''))
          .join(''),
      );
    }
    return pages.join('\n');
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** The named parts of a zip file (a Word document is one), read from its central directory. */
export function unzip(zip: Buffer, wanted: (name: string) => boolean): Map<string, Buffer> {
  const parts = new Map<string, Buffer>();
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > zip.length) return parts;
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count && at + 46 <= zip.length; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) break;
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    if (!wanted(name) || local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) {
      continue;
    }
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    if (method === 0) parts.set(name, data);
    else if (method === 8) {
      parts.set(name, inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }));
    }
  }
  return parts;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e.startsWith('#x') || e.startsWith('#X')
      ? String.fromCodePoint(parseInt(e.slice(2), 16))
      : e.startsWith('#')
        ? String.fromCodePoint(Number(e.slice(1)))
        : ENTITIES[e.toLowerCase()]!,
  );

/** The text of a WordprocessingML part: paragraphs as lines, without deleted text or fields. */
export const wordXmlText = (xml: string) =>
  decodeEntities(
    xml
      .replace(/<w:(delText|instrText)\b[^>]*>[\s\S]*?<\/w:\1>/g, '')
      .replace(/<w:tab\s*\/>/g, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/>|<\/w:p>/g, '\n')
      .replace(/<[^>]*>/g, ''),
  );

/** The page headers first (CV templates often put the name there), then the body. */
function docxText(bytes: Buffer): string {
  const parts = unzip(bytes, (n) => n === 'word/document.xml' || /^word\/header\d*\.xml$/.test(n));
  const names = [...parts.keys()].toSorted((a, b) =>
    a === 'word/document.xml' ? 1 : b === 'word/document.xml' ? -1 : a.localeCompare(b),
  );
  return names.map((n) => wordXmlText(parts.get(n)!.toString('utf8'))).join('\n');
}

// ── Contact details ──────────────────────────────────────────────────────────

const latinDigits = (text: string) =>
  text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

/**
 * Digit runs that may be a mobile number: +880 1712-345678, (+88) 01712 345678,
 * 01712-345678, and the like, never part of a longer number.
 */
const PHONE = /(?<![\d+])(?:\+\s?)?(?:\(\s?\+?880?\s?\)\s?)?\d(?:[\s.-]?\d){9,12}(?![\s.-]?\d)/g;
const BD_MOBILE_DIGITS = /^(?:88)?01[3-9]\d{8}$/;

/**
 * Characters legacy Bangla fonts (Bijoy, SutonnyMJ) put in place of Bangla letters: their
 * text extracts as Latin letters mixed with these, e.g. "RxebeÉvšÍ" for জীবনবৃত্তান্ত.
 */
const LEGACY_BANGLA =
  /[\u00a1-\u00ff\u0152\u0153\u0160\u0161\u0178\u0192\u02c6\u2020\u2021\u2030\u2039\u203a]/g;

export function looksLikeLegacyBangla(text: string): boolean {
  const marks = text.match(LEGACY_BANGLA)?.length ?? 0;
  const visible = text.replace(/\s/g, '').length;
  return marks >= 5 && marks / visible > 0.02;
}

const LABELLED_NAME =
  /^(?:full\s+name|name|candidate'?s?\s+name|applicant'?s?\s+name|name\s+of\s+(?:the\s+)?(?:candidate|applicant)|নাম|পূর্ণ\s*নাম|প্রার্থীর\s*নাম)(?:\s*[:：ঃ]|\t)\s*(.+)$/iu;

/** Words that make a line a heading, a label or a job title rather than a person's name. */
const NOT_A_NAME = new Set([
  'curriculum',
  'vitae',
  'vita',
  'resume',
  'résumé',
  'cv',
  'biodata',
  'bio-data',
  'profile',
  'objective',
  'career',
  'personal',
  'information',
  'details',
  'contact',
  'address',
  'education',
  'educational',
  'qualification',
  'qualifications',
  'experience',
  'skills',
  'summary',
  'references',
  'reference',
  'declaration',
  'page',
  'mobile',
  'phone',
  'email',
  'e-mail',
  'present',
  'permanent',
  'birth',
  'nationality',
  'religion',
  'of',
  'for',
  'the',
  'and',
  'to',
  'engineer',
  'officer',
  'manager',
  'executive',
  'operator',
  'assistant',
  'developer',
  'designer',
  'accountant',
  'supervisor',
  'student',
  'graduate',
  'জীবন',
  'বৃত্তান্ত',
  'জীবনবৃত্তান্ত',
  'জীবন-বৃত্তান্ত',
  'বায়োডাটা',
  'ঠিকানা',
  'মোবাইল',
  'ফোন',
  'ইমেইল',
  'শিক্ষাগত',
  'যোগ্যতা',
  'অভিজ্ঞতা',
  'উদ্দেশ্য',
]);

const NAME_WORD = /^[\p{L}\p{M}][\p{L}\p{M}.'’-]*$/u;

/** "MD. RAKIBUL HASAN" as "Md. Rakibul Hasan"; anything else as typed. */
const titleCase = (name: string) =>
  /[A-Z]/.test(name) && name === name.toUpperCase()
    ? name.replace(/[\p{L}\p{M}]+/gu, (w) => w[0] + w.slice(1).toLowerCase())
    : name;

function asName(text: string): string | null {
  const name = text.replace(/\s+/g, ' ').trim();
  const words = name.split(' ');
  if (name.length < 3 || name.length > 60 || words.length < 2 || words.length > 5) return null;
  if (!words.every((w) => NAME_WORD.test(w))) return null;
  if (words.some((w) => NOT_A_NAME.has(w.toLowerCase().replace(/[.:’']/g, '')))) return null;
  return titleCase(name);
}

function nameOf(lines: string[]): string | null {
  for (const line of lines) {
    const labelled = LABELLED_NAME.exec(line)?.[1];
    if (labelled) return asName(labelled);
  }
  // Otherwise the first line near the top that reads as a name.
  for (const line of lines.slice(0, 15)) {
    const name = asName(line);
    if (name) return name;
  }
  return null;
}

function phoneOf(text: string): string | null {
  for (const match of latinDigits(text).matchAll(PHONE)) {
    const digits = match[0].replace(/\D/g, '');
    if (BD_MOBILE_DIGITS.test(digits)) return digits.slice(-11);
  }
  return null;
}

/** The name, email and Bangladeshi mobile number a CV's text gives, where it gives them. */
export function contactsFromText(text: string): CvContacts {
  const none = { fullName: null, email: null, phone: null };
  if (looksLikeLegacyBangla(text)) return { ...none, legacyBangla: true };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 40);
  return {
    fullName: nameOf(lines),
    email: EMAIL.exec(text)?.[0].toLowerCase() ?? null,
    phone: phoneOf(text),
    legacyBangla: false,
  };
}
