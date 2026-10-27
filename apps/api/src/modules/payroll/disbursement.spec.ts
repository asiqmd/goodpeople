import { allocate, channelOf, csv, type PayableAccount } from './disbursement.js';

const bank: PayableAccount = {
  method: 'bank',
  provider: 'Dutch-Bangla Bank',
  branchName: 'Gazipur',
  routingNumber: '090270563',
  accountName: 'Rahima Khatun',
  accountNumber: '1234567890',
  isPrimary: true,
  splitAmount: null,
};
const bkash: PayableAccount = {
  method: 'mfs',
  provider: 'bkash',
  branchName: null,
  routingNumber: null,
  accountName: null,
  accountNumber: '01712345678',
  isPrimary: false,
  splitAmount: '5000',
};

describe('splitting net pay across accounts', () => {
  it('sends a fixed part to a wallet and the rest to the primary account', () => {
    const payments = allocate('15200.00', [bank, bkash]);
    expect(payments.map((p) => [channelOf(p), p.amount])).toEqual([
      ['bkash', '5000.00'],
      ['bank', '10200.00'],
    ]);
  });

  it('never sends more than there is', () => {
    expect(allocate('3000', [bank, bkash]).map((p) => [channelOf(p), p.amount])).toEqual([
      ['bkash', '3000.00'],
    ]);
    expect(allocate('0', [bank])).toEqual([]);
  });

  it('pays cash when there is no account, and uses the only account even if not primary', () => {
    expect(allocate('12500', [])).toEqual([
      expect.objectContaining({ method: 'cash', amount: '12500.00' }),
    ]);
    expect(allocate('12500', [{ ...bkash, splitAmount: null }])).toEqual([
      expect.objectContaining({ method: 'mfs', provider: 'bkash', amount: '12500.00' }),
    ]);
  });

  it('quotes CSV fields that need it', () => {
    expect(
      csv([
        ['Name', 'Amount'],
        ['Khatun, Rahima', '10200.00'],
        ['A "nick"', '1'],
      ]),
    ).toBe('Name,Amount\n"Khatun, Rahima",10200.00\n"A ""nick""",1\n');
  });

  it('keeps formulas out of CSV text cells but leaves signed numbers alone', () => {
    expect(
      csv([
        ['=HYPERLINK("http://x.example","Pay")', '-1250.00'],
        ["+cmd|' /C calc'!A0", '+8801712345678'],
        ['-2+3', '@SUM(A1)'],
        ['\tTabbed', '\rReturn'],
      ]),
    ).toBe(
      `"'=HYPERLINK(""http://x.example"",""Pay"")",-1250.00\n` +
        `'+cmd|' /C calc'!A0,+8801712345678\n` +
        `'-2+3,'@SUM(A1)\n` +
        `'\tTabbed,"'\rReturn"\n`,
    );
  });
});
