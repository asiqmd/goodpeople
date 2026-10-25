import ExcelJS from 'exceljs';

// Reading spreadsheets people upload: the first sheet of an .xlsx, or a .csv, as text cells.

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
