import type { SUPPORT_ATTACHMENT_TYPES } from '@gp/shared';
import { cleanFileName } from '../documents/documents.service.js';

export type SupportAttachmentType = (typeof SUPPORT_ATTACHMENT_TYPES)[number];

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The extensions each type may carry; the first is added to a name that has none of them. */
const EXTENSIONS: Record<SupportAttachmentType, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt', '.log'],
  'text/csv': ['.csv'],
  [XLSX]: ['.xlsx'],
};

const startsWith = (bytes: Buffer, magic: number[], at = 0) =>
  bytes.length >= at + magic.length && magic.every((b, i) => bytes[at + i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const utf8 = new TextDecoder('utf-8', { fatal: true });
function isText(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false;
  try {
    utf8.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * What a file is, read from its bytes rather than its name or the browser's word for it: a
 * renamed program is refused. The name only tells a CSV from other plain text, both inert.
 */
export function supportFileType(bytes: Buffer, fileName: string): SupportAttachmentType | null {
  if (bytes.length === 0) return null;
  if (startsWith(bytes, [0x89, ...ascii('PNG\r\n'), 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(bytes, ascii('%PDF-'))) return 'application/pdf';
  if (startsWith(bytes, ascii('PK\x03\x04'))) {
    // An Office Open XML package names its parts in [Content_Types].xml; a workbook has xl/.
    const names = bytes.toString('latin1');
    return names.includes('[Content_Types].xml') && names.includes('xl/workbook') ? XLSX : null;
  }
  if (isText(bytes)) return /\.csv$/i.test(fileName) ? 'text/csv' : 'text/plain';
  return null;
}

/**
 * A name safe to keep and to send back in a header, ending in an extension that matches what
 * the file is, so `notes.html` that is really text is saved as `notes.html.txt`.
 */
export function attachmentName(fileName: string, type: SupportAttachmentType): string {
  const allowed = EXTENSIONS[type];
  const name = cleanFileName(fileName).slice(0, 150);
  return allowed.some((ext) => name.toLowerCase().endsWith(ext)) ? name : `${name}${allowed[0]}`;
}
