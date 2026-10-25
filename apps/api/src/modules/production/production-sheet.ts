import { MAX_PRODUCTION_QUANTITY } from '@gp/shared';
import type { Sheet } from '../../common/sheets.js';
import { normalize } from '../payroll/reconciliation.js';

// Reading a production sheet: which column is which, however it is headed in English or
// Bangla, and dates and pieces as factories write them.

/** Headings each column may have; matched ignoring case, spaces and punctuation. */
export const PRODUCTION_HEADINGS = {
  employeeCode: [
    'employee code',
    'employee id',
    'emp code',
    'emp id',
    'worker id',
    'code',
    'id',
    'id no',
    'card no',
    'কর্মী কোড',
    'কর্মীর কোড',
    'শ্রমিক কোড',
    'কোড',
    'আইডি',
    'আইডি নম্বর',
    'কার্ড নম্বর',
  ],
  date: ['date', 'production date', 'তারিখ', 'উৎপাদনের তারিখ'],
  operationCode: [
    'operation code',
    'operation',
    'op code',
    'op',
    'process',
    'process code',
    'অপারেশন কোড',
    'অপারেশন',
    'প্রসেস',
    'কাজের কোড',
  ],
  quantity: ['quantity', 'qty', 'pieces', 'pcs', 'output', 'production', 'পরিমাণ', 'পিস', 'উৎপাদন'],
} as const;
export type ProductionColumn = keyof typeof PRODUCTION_HEADINGS;

/** The template's headings, in column order. */
export const TEMPLATE_HEADINGS = ['Employee code', 'Date', 'Operation code', 'Quantity'];

/** Where each column is, by its heading; -1 where no heading matches. */
export function productionColumns(headers: string[]): Record<ProductionColumn, number> {
  const names = headers.map(normalize);
  const at = (aliases: readonly string[]) => {
    for (const alias of aliases) {
      const i = names.indexOf(normalize(alias));
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    employeeCode: at(PRODUCTION_HEADINGS.employeeCode),
    date: at(PRODUCTION_HEADINGS.date),
    operationCode: at(PRODUCTION_HEADINGS.operationCode),
    quantity: at(PRODUCTION_HEADINGS.quantity),
  };
}

/** The heading row names an employee code and a quantity. */
export const isProductionHeading = (cells: string[]) => {
  const at = productionColumns(cells);
  return at.employeeCode >= 0 && at.quantity >= 0;
};

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const western = (text: string) =>
  text.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d))).trim();
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * A sheet's date: YYYY-MM-DD, day first as Bangladesh writes it (DD/MM/YYYY, DD-MM-YYYY or
 * DD.MM.YYYY), or an Excel day number; null unless it is a real date.
 */
export function parseSheetDate(text: string): string | null {
  const t = western(text);
  let parts: [number, number, number];
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (iso) parts = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dayFirst) parts = [Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1])];
  else if (/^\d{5}$/.test(t)) {
    return new Date(EXCEL_EPOCH + Number(t) * 86_400_000).toISOString().slice(0, 10);
  } else return null;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Pieces as a sheet writes them (Bangla digits, thousands separators); null unless whole. */
export function parseSheetQuantity(text: string): number | null {
  const t = western(text).replace(/[,\s]/g, '');
  if (!/^\d+(\.0+)?$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_PRODUCTION_QUANTITY ? n : null;
}

/** One row of the sheet as written, with its position under the headings (from 1). */
export interface SheetRow {
  row: number;
  employeeCode: string;
  date: string;
  operationCode: string;
  quantity: string;
}

export function sheetRows(sheet: Sheet, at: Record<ProductionColumn, number>): SheetRow[] {
  return sheet.rows.map((cells, i) => ({
    row: i + 1,
    employeeCode: cells[at.employeeCode]?.trim() ?? '',
    date: cells[at.date]?.trim() ?? '',
    operationCode: cells[at.operationCode]?.trim() ?? '',
    quantity: cells[at.quantity]?.trim() ?? '',
  }));
}
