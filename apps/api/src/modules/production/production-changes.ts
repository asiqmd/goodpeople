import type { ProductionImportProblem, ProductionImportProblemCode } from '@gp/shared';
import { parseSheetDate, parseSheetQuantity, type SheetRow } from './production-sheet.js';

// What a batch or an import changes, worked out before anything is written: which entries
// are new or changed, which go, and which a locked payroll or an inactive operation refuses.

export interface Entry {
  employeeId: string;
  operationId: string;
  date: string;
  quantity: number;
}

export const entryKey = (e: Pick<Entry, 'employeeId' | 'operationId' | 'date'>) =>
  `${e.employeeId}|${e.operationId}|${e.date}`;

/** A period whose pay is locked for a person. */
export interface LockedPeriod {
  start: string;
  end: string;
}

export const isLockedOn = (periods: LockedPeriod[] | undefined, date: string) =>
  !!periods?.some((p) => p.start <= date && date <= p.end);

export type RefusalCode = Extract<
  ProductionImportProblemCode,
  'payroll_locked' | 'operation_inactive'
>;

export interface ChangePlan<T extends Entry> {
  upserts: T[];
  removals: T[];
  unchanged: T[];
  refused: { entry: T; code: RefusalCode }[];
}

/**
 * Sorts entries into what saving them does. Zero pieces removes an entry. An entry that
 * would stay as it is changes nothing, so a locked day or an inactive operation refuses only
 * real changes, and a sheet imported twice is harmless.
 */
export function planChanges<T extends Entry>(
  entries: T[],
  context: {
    existing: Map<string, number>;
    locked: Map<string, LockedPeriod[]>;
    inactive: Set<string>;
  },
): ChangePlan<T> {
  const plan: ChangePlan<T> = { upserts: [], removals: [], unchanged: [], refused: [] };
  for (const entry of entries) {
    if ((context.existing.get(entryKey(entry)) ?? 0) === entry.quantity) {
      plan.unchanged.push(entry);
    } else if (isLockedOn(context.locked.get(entry.employeeId), entry.date)) {
      plan.refused.push({ entry, code: 'payroll_locked' });
    } else if (entry.quantity > 0 && context.inactive.has(entry.operationId)) {
      plan.refused.push({ entry, code: 'operation_inactive' });
    } else if (entry.quantity === 0) {
      plan.removals.push(entry);
    } else {
      plan.upserts.push(entry);
    }
  }
  return plan;
}

export const PROBLEM_MESSAGES: Record<ProductionImportProblemCode, string> = {
  employee_unknown: 'No employee has this code',
  operation_unknown: 'No operation has this code',
  operation_inactive: 'This operation is no longer in use',
  date_invalid: 'Write the date as YYYY-MM-DD or DD/MM/YYYY',
  date_future: 'This day has not come yet',
  quantity_invalid: 'Write the pieces as a whole number, zero to remove an entry',
  not_employed: 'Not employed on this day',
  payroll_locked: "This day's pay is already locked in payroll",
  duplicate_row: 'The same worker, day and operation appear on an earlier row',
};

export const problemOf = (row: SheetRow, code: ProductionImportProblemCode) => ({
  ...row,
  code,
  message: PROBLEM_MESSAGES[code],
});

export interface ImportLookup {
  today: string;
  employee: (code: string) => { id: string; joinedOn: string; separatedOn: string | null } | null;
  operation: (code: string) => { id: string } | null;
}

/** A sheet's rows as entries, and the first problem of each row that cannot be one. */
export function checkRows(
  rows: SheetRow[],
  lookup: ImportLookup,
): { entries: (Entry & { source: SheetRow })[]; problems: ProductionImportProblem[] } {
  const entries: (Entry & { source: SheetRow })[] = [];
  const problems: ProductionImportProblem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const person = lookup.employee(row.employeeCode);
    const operation = lookup.operation(row.operationCode);
    const date = parseSheetDate(row.date);
    const quantity = parseSheetQuantity(row.quantity);
    let code: ProductionImportProblemCode | null = null;
    if (!person) code = 'employee_unknown';
    else if (!operation) code = 'operation_unknown';
    else if (!date) code = 'date_invalid';
    else if (date > lookup.today) code = 'date_future';
    else if (quantity === null) code = 'quantity_invalid';
    else if (person.joinedOn > date || (person.separatedOn !== null && person.separatedOn < date)) {
      code = 'not_employed';
    }
    if (code) {
      problems.push(problemOf(row, code));
      continue;
    }
    const entry = {
      employeeId: person!.id,
      operationId: operation!.id,
      date: date!,
      quantity: quantity!,
      source: row,
    };
    if (seen.has(entryKey(entry))) {
      problems.push(problemOf(row, 'duplicate_row'));
      continue;
    }
    seen.add(entryKey(entry));
    entries.push(entry);
  }
  return { entries, problems };
}
