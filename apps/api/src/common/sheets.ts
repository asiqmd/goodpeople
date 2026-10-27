import { inflateRawSync } from 'node:zlib';
import { HttpException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { badRequest } from './errors.js';

// Reading spreadsheets people upload: the first sheet of an .xlsx, or a .csv, as text cells.

/**
 * What an uploaded .xlsx (a zip) may unpack to. The upload limits count compressed bytes, and
 * a small crafted file can inflate to gigabytes; ExcelJS holds it all in memory.
 */
const XLSX_MAX_ENTRIES = 500;
const XLSX_MAX_BYTES = 32 * 1024 * 1024;
/** Real sheets compress 5–20 times; this is for entries over a megabyte. */
const XLSX_MAX_RATIO = 200;

const tooLarge = () =>
  badRequest(
    'spreadsheet_too_large',
    'This spreadsheet unpacks to more than can be read. Save it with fewer rows or sheets.',
  );

/** Callers' answer for a sheet that cannot be read, passing on a refusal with its own code. */
export function unreadableSheet(error: unknown): never {
  if (error instanceof HttpException) throw error;
  throw badRequest('sheet_unreadable', 'This file could not be read as a spreadsheet');
}

/**
 * Refuses an .xlsx whose entries unpack past the limits, before ExcelJS opens it. Sizes are
 * measured by inflating each entry with a ceiling, since a zip's declared sizes can lie.
 */
export function checkXlsxSize(buffer: Buffer): void {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  // Not a zip: ExcelJS says so.
  if (end < 0 || end + 22 > buffer.length) return;
  const entries = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  // ZIP64 markers: no sheet people upload needs one.
  if (entries === 0xffff || at === 0xffffffff || entries > XLSX_MAX_ENTRIES) throw tooLarge();
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50) unreadableSheet(null);
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const local = buffer.readUInt32LE(at + 42);
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) {
      unreadableSheet(null);
    }
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + compressed);
    const size = method === 0 ? data.length : inflatedSize(data, XLSX_MAX_BYTES - total);
    total += size;
    if (total > XLSX_MAX_BYTES) throw tooLarge();
    if (size > 1024 * 1024 && size > XLSX_MAX_RATIO * Math.max(1, compressed)) throw tooLarge();
    at +=
      46 +
      buffer.readUInt16LE(at + 28) +
      buffer.readUInt16LE(at + 30) +
      buffer.readUInt16LE(at + 32);
  }
}

/** A deflated entry's size, or just over `budget` once it passes it. */
function inflatedSize(data: Buffer, budget: number): number {
  try {
    return inflateRawSync(data, { maxOutputLength: Math.max(1, budget + 1) }).length;
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') return budget + 1;
    return unreadableSheet(null);
  }
}

/** A cell as text: dates as YYYY-MM-DD, numbers without trailing zeros, rich text joined. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if ('richText' in value)
      return value.richText
        .map((r) => r.text)
        .join('')
        .trim();
    if ('text' in value) return String(value.text).trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    return '';
  }
  return String(value).trim();
}

/** CSV rows: quoted fields with doubled quotes inside, commas, CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field.trim());
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

const filled = (r: string[]) => r.some((c) => c !== '');

export interface Sheet {
  headers: string[];
  rows: string[][];
}

/**
 * The table in an uploaded sheet: the heading row (the first that `isHeading` accepts within
 * the first 20, else the first with anything in it), and the non-empty rows under it, padded
 * to the headings. Repeated headings get a number so each column can be told apart.
 */
export async function readSheet(
  file: { buffer: Buffer; originalname: string },
  isHeading: (cells: string[]) => boolean,
): Promise<Sheet> {
  let grid: string[][];
  if (/\.csv$/i.test(file.originalname)) {
    grid = parseCsv(file.buffer.toString('utf8'));
  } else {
    checkXlsxSize(file.buffer);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    grid = [];
    sheet?.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, n) => {
        cells[n - 1] = cellText(cell.value);
      });
      grid.push(Array.from(cells, (c) => c ?? ''));
    });
  }
  const start = grid.slice(0, 20).findIndex(isHeading);
  const at = start >= 0 ? start : grid.findIndex(filled);
  if (at < 0) return { headers: [], rows: [] };
  const seen = new Map<string, number>();
  const headers = grid[at]!.map((h, i) => {
    const base = h || `Column ${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count > 1 ? `${base} (${count})` : base;
  });
  const rows = grid
    .slice(at + 1)
    .filter(filled)
    .map((r) => headers.map((_, i) => r[i] ?? ''));
  return { headers, rows };
}
