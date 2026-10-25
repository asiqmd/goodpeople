import { Decimal } from '@gp/shared';
import { balanceOf, monthBounds, quoteMonth } from './billing-math.js';

const price = { staffSeat: '250.00', workerSeat: '80.00', minimum: '5000.00' };

describe('a month’s charge', () => {
  it('prices staff and workers at their seats, then VAT', () => {
    const q = quoteMonth({
      planName: 'Business',
      seats: { staff: 40, workers: 600 },
      price,
      month: '2026-10',
      vatRate: 5,
    });
    // 40 × 250 + 600 × 80 = 58,000; VAT 5% = 2,900.
    expect(q.lines.map((l) => [l.quantity, l.unitPrice, l.amount])).toEqual([
      [40, '250.00', '10000.00'],
      [600, '80.00', '48000.00'],
    ]);
    expect(q).toMatchObject({
      subtotal: '58000.00',
      discount: '0.00',
      taxable: '58000.00',
      vat: '2900.00',
      total: '60900.00',
    });
  });

  it('charges the minimum for a small workspace', () => {
    const q = quoteMonth({
      planName: 'Business',
      seats: { staff: 8, workers: 0 },
      price,
      month: '2026-10',
      vatRate: 15,
    });
    // 8 × 250 = 2,000, topped up to 5,000; VAT 15% = 750.
    expect(q.lines.at(-1)).toMatchObject({ amount: '3000.00' });
    expect(q).toMatchObject({ subtotal: '5000.00', vat: '750.00', total: '5750.00' });
  });

  it('charges a first month from the day billing began', () => {
    const q = quoteMonth({
      planName: 'Growth',
      seats: { staff: 0, workers: 310 },
      price: { staffSeat: '180.00', workerSeat: '60.00', minimum: '0.00' },
      month: '2026-11',
      fromDay: 16,
      vatRate: 5,
    });
    // 15 of 30 days: 30.00 a worker, × 310 = 9,300.
    expect(q.lines[0]).toMatchObject({ unitPrice: '30.00', amount: '9300.00' });
    expect(q.lines[0]!.description).toContain('15 of 30 days');
    expect(q.total).toBe('9765.00');
  });

  it('takes a coupon off before VAT, never below nothing', () => {
    const percent = quoteMonth({
      planName: 'Business',
      seats: { staff: 40, workers: 0 },
      price,
      month: '2026-10',
      coupon: { code: 'LAUNCH20', percentOff: '20', amountOff: null },
      vatRate: 5,
    });
    expect(percent).toMatchObject({
      subtotal: '10000.00',
      discount: '2000.00',
      taxable: '8000.00',
      vat: '400.00',
    });
    const amount = quoteMonth({
      planName: 'Business',
      seats: { staff: 40, workers: 0 },
      price,
      month: '2026-10',
      coupon: { code: 'BIG', percentOff: null, amountOff: '50000' },
      vatRate: 5,
    });
    expect(amount).toMatchObject({ discount: '10000.00', taxable: '0.00', total: '0.00' });
  });

  it('knows a month’s bounds', () => {
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29', days: 29 });
  });
});

describe('what is still owed', () => {
  it('counts payments received, withholding unless rejected, and credit notes', () => {
    const owed = balanceOf(
      '60900.00',
      [
        { kind: 'payment', status: 'succeeded', amount: '50000.00' },
        { kind: 'payment', status: 'failed', amount: '60900.00' },
        { kind: 'payment', status: 'pending', amount: '10900.00' },
        { kind: 'vds', status: 'succeeded', amount: '2900.00' },
        { kind: 'tds', status: 'rejected', amount: '5800.00' },
      ],
      ['1050.00'],
    );
    expect(owed.equals(new Decimal('6950.00'))).toBe(true);
  });
});
