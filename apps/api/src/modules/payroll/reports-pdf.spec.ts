import { PART_ROWS, partsOf, registerHtml, type RegisterRow } from './reports-pdf.js';

const row = (code: string, unit: string): RegisterRow => ({
  code,
  name: `Name ${code}`,
  designation: null,
  unit,
  paidDays: 30,
  amounts: { BASIC: '100.00' },
  earnings: '100.00',
  deductions: '0.00',
  net: '100.00',
});

describe('printing a long register in parts', () => {
  it('splits the rows into parts, the last one marked', () => {
    expect(partsOf(0)).toEqual([{ from: 0, to: 0, last: true }]);
    expect(partsOf(PART_ROWS)).toEqual([{ from: 0, to: PART_ROWS, last: true }]);
    expect(partsOf(PART_ROWS * 2 + 1).map((p) => [p.from, p.to, p.last])).toEqual([
      [0, PART_ROWS, false],
      [PART_ROWS, PART_ROWS * 2, false],
      [PART_ROWS * 2, PART_ROWS * 2 + 1, true],
    ]);
  });

  it('numbers on across parts, continues a unit, and totals only at the end', () => {
    const doc = {
      language: 'en' as const,
      company: { name: 'Co', details: '' },
      group: 'Monthly',
      run: {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        paymentDate: '2026-11-07',
        status: 'locked',
      },
      columns: [{ code: 'BASIC', label: 'Basic', kind: 'earning' as const }],
      rows: [row('A1', 'Line 1'), row('A2', 'Line 1'), row('A3', 'Line 1'), row('B1', 'Line 2')],
    };
    const first = registerHtml(doc, { from: 0, to: 2, last: false });
    const second = registerHtml(doc, { from: 2, to: 4, last: true });
    // Line 1's subtotal comes with its last row, in the second part, over all three people.
    expect(first).not.toContain('Unit total');
    expect(first).not.toContain('<tfoot>');
    expect(second).toContain('Line 1 · 3 people · continued');
    expect(second).toContain('<td>3</td><td class="code">A3</td>');
    expect(second.match(/Unit total/g)).toHaveLength(2);
    expect(second).toContain('<tfoot>');
    expect(second).toContain('Prepared by');
  });
});
