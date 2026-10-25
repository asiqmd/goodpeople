import { Decimal } from '@gp/shared';
import { parseCsv } from '../../common/sheets.js';
import {
  compareSheet,
  isHeading,
  matchedInARow,
  parseAmount,
  suggestMapping,
  type OurPerson,
} from './reconciliation.js';

const components = [
  { code: 'BASIC', name: 'Basic salary', nameBn: 'মূল বেতন' },
  { code: 'HOUSE_RENT', name: 'House rent', nameBn: 'বাড়ি ভাড়া' },
  { code: 'OVERTIME', name: 'Overtime', nameBn: 'অতিরিক্ত কাজের ভাতা' },
  { code: 'TAX', name: 'Income tax', nameBn: 'আয়কর' },
];

describe('reading a payroll sheet', () => {
  it('splits CSV with quotes, commas inside them and CRLF', () => {
    expect(parseCsv('﻿ID,Name,Net\r\n"P-1","Das, Anjali","12,500"\r\n')).toEqual([
      ['ID', 'Name', 'Net'],
      ['P-1', 'Das, Anjali', '12,500'],
    ]);
  });

  it('finds the heading row by its employee code column', () => {
    expect(isHeading(['My Group Textiles', '', ''])).toBe(false);
    expect(isHeading(['SL', 'Emp. ID', 'Name'])).toBe(true);
    expect(isHeading(['ক্রম', 'কোড', 'নাম'])).toBe(true);
  });

  it('reads amounts however the sheet writes them', () => {
    expect(parseAmount('12,500.00')!.toString()).toBe('12500');
    expect(parseAmount('৳ ১২,৫০০')!.toString()).toBe('12500');
    expect(parseAmount('(250)')!.toString()).toBe('-250');
    expect(parseAmount('-')!.toString()).toBe('0');
    expect(parseAmount('')!.toString()).toBe('0');
    expect(parseAmount('n/a')).toBeNull();
  });
});

describe('proposing a mapping', () => {
  it('matches codes, names in either language and common headings', () => {
    const mapping = suggestMapping(
      [
        'SL',
        'Emp ID',
        'Employee Name',
        'Basic',
        'বাড়ি ভাড়া',
        'OT Amount',
        'Gross Salary',
        'Net Pay',
        'Absent',
      ],
      components,
      null,
    );
    expect(mapping).toEqual({
      employeeCode: 'Emp ID',
      name: 'Employee Name',
      columns: {
        BASIC: 'Basic',
        HOUSE_RENT: 'বাড়ি ভাড়া',
        OVERTIME: 'OT Amount',
        GROSS: 'Gross Salary',
        NET: 'Net Pay',
        ABSENT_DAYS: 'Absent',
      },
    });
  });

  it('keeps last month’s mapping where the headings are still there', () => {
    const previous = { employeeCode: 'Card', columns: { NET: 'Take home', TAX: 'AIT' } };
    expect(suggestMapping(['Card', 'Take home', 'Other'], components, previous)).toEqual({
      employeeCode: 'Card',
      columns: { NET: 'Take home' },
    });
  });
});

const person = (code: string, values: Record<string, number>): OurPerson => ({
  employeeId: code,
  employeeCode: code,
  name: `Name ${code}`,
  values: new Map(Object.entries(values).map(([k, v]) => [k, new Decimal(v)])),
});

describe('comparing', () => {
  const sheet = {
    headers: ['ID', 'Name', 'Net', 'OT hrs'],
    rows: [
      ['A1', 'Asha', '12,500.40', '10'],
      ['a2', 'Babul', '9000', '4.5'],
      ['A4', 'Dipu', '7000', '0'],
    ],
  };
  const mapping = { employeeCode: 'ID', name: 'Name', columns: { NET: 'Net', OT_HOURS: 'OT hrs' } };

  it('matches money to the taka and hours to two decimals, and lists who is on one side', () => {
    const result = compareSheet(
      sheet,
      mapping,
      [
        person('A1', { NET: 12500.2, OT_HOURS: 10 }),
        person('A2', { NET: 9100, OT_HOURS: 4.5 }),
        person('A3', { NET: 8000, OT_HOURS: 0 }),
      ],
      (k) => k,
    );
    expect(result.summary).toEqual({
      people: 4,
      matched: 1,
      differing: 1,
      onlyOurs: 1,
      onlyTheirs: 1,
    });
    expect(result.differences.map((d) => [d.employeeCode, d.status])).toEqual([
      ['A2', 'differs'],
      ['A3', 'only_ours'],
      ['A4', 'only_theirs'],
    ]);
    expect(result.differences[0]!.lines).toEqual([
      { key: 'NET', ours: '9100.00', theirs: '9000.00', difference: '100.00' },
    ]);
    expect(result.differences[2]!.name).toBe('Dipu');
    expect(result.columns.find((c) => c.key === 'NET')).toMatchObject({
      matched: 1,
      differing: 1,
      ours: '29600.20',
      theirs: '28500.40',
    });
  });

  it('adds up a person split over several rows', () => {
    const result = compareSheet(
      {
        headers: ['ID', 'Net'],
        rows: [
          ['A1', '5000'],
          ['A1', '7500'],
        ],
      },
      { employeeCode: 'ID', columns: { NET: 'Net' } },
      [person('A1', { NET: 12500 })],
      (k) => k,
    );
    expect(result.summary.matched).toBe(1);
  });
});

const m = (period: string, status: string | null) => ({ period, status });

describe('months matched in a row', () => {
  it('counts back from the newest compared month, needing every pay group to match', () => {
    expect(
      matchedInARow([
        m('2026-10', null),
        m('2026-09', 'matched'),
        m('2026-08', 'matched'),
        m('2026-07', 'differences'),
      ]),
    ).toBe(2);
    expect(matchedInARow([m('2026-10', 'differences'), m('2026-09', 'matched')])).toBe(0);
    // Two pay groups in September, one not compared: the streak stops there.
    expect(
      matchedInARow([
        m('2026-10', 'matched'),
        m('2026-09', 'matched'),
        m('2026-09', null),
        m('2026-08', 'matched'),
      ]),
    ).toBe(1);
    expect(matchedInARow([])).toBe(0);
  });
});
