import {
  Decimal,
  money,
  type EmployeeRef,
  type PaymentCheckView,
  type ReturnedPayment,
} from '@gp/shared';
import { normalize, parseAmount } from './reconciliation.js';

// Matching a bank's or wallet provider's report on a salary batch to the payments we sent:
// a returns file lists only what bounced; a full status report has a status for every row.

const ACCOUNT = [
  'accountno',
  'accountnumber',
  'acno',
  'acnumber',
  'account',
  'beneficiaryaccount',
  'beneficiaryaccountno',
  'beneficiaryaccountnumber',
  'creditaccount',
  'creditaccountno',
  'walletno',
  'walletnumber',
  'wallet',
  'mobileno',
  'mobilenumber',
  'hisabnumber',
  'হিসাবনম্বর',
];
const AMOUNT = [
  'amount',
  'creditamount',
  'amt',
  'transactionamount',
  'paidamount',
  'amountbdt',
  'টাকা',
];
const STATUS = [
  'status',
  'result',
  'transactionstatus',
  'returnstatus',
  'paymentstatus',
  'txnstatus',
];
const REASON = [
  'reason',
  'returnreason',
  'reasoncode',
  'returncode',
  'rejectreason',
  'rejectionreason',
  'failurereason',
  'remarks',
];

const find = (headers: string[], names: string[]) => {
  const wanted = new Set(names.map(normalize));
  return headers.findIndex((h) => wanted.has(normalize(h)));
};

/** Whether a row looks like the report's heading row: it names an account column. */
export const isReportHeading = (cells: string[]) => find(cells, ACCOUNT) >= 0;

const CREDITED = /success|succeeded|credited|paid|complete|settled|accepted|^ok$|সফল/i;
const RETURNED = /return|fail|reject|invalid|unsuccess|error|cancel|bounce|ব্যর্থ|ফেরত/i;
/** A BEFTN-style return code such as R03 at the start of the reason. */
const CODE = /^\s*(R\d{2})\b/i;

export interface SentPayment {
  employee: EmployeeRef;
  channel: string;
  accountNumber: string;
  amount: string;
}

const digits = (account: string) => account.replace(/\D/g, '');
const lastFour = (account: string) => `•••• ${digits(account).slice(-4)}`;

export interface CheckResult {
  summary: PaymentCheckView['summary'];
  returned: ReturnedPayment[];
}

/**
 * Our bank and wallet payments against the report's rows, by account number (and amount where
 * one account was paid twice). Without a status column every row is taken as returned. There
 * is no published table of BEFTN return codes, so the bank's own words are the reason.
 */
export function checkPayments(
  sheet: { headers: string[]; rows: string[][] },
  sent: SentPayment[],
): CheckResult {
  const at = {
    account: find(sheet.headers, ACCOUNT),
    amount: find(sheet.headers, AMOUNT),
    status: find(sheet.headers, STATUS),
    reason: find(sheet.headers, REASON),
  };
  const full = at.status >= 0;
  const open = sent.map((p) => ({ ...p, digits: digits(p.accountNumber), matched: false }));
  const returned: ReturnedPayment[] = [];
  let credited = 0;
  let unknown = 0;
  for (const row of sheet.rows) {
    const account = digits(row[at.account] ?? '');
    if (!account) continue;
    const amount = at.amount >= 0 ? parseAmount(row[at.amount] ?? '') : null;
    const candidates = open.filter((p) => !p.matched && p.digits === account);
    const payment =
      candidates.length > 1 && amount
        ? (candidates.find((p) => new Decimal(p.amount).equals(amount)) ?? candidates[0])
        : candidates[0];
    const status = full ? (row[at.status] ?? '') : 'returned';
    const isReturned = RETURNED.test(status) || (!CREDITED.test(status) && !full);
    const reasonText = at.reason >= 0 ? (row[at.reason] ?? '').trim() : '';
    const code = CODE.exec(reasonText)?.[1]?.toUpperCase() ?? null;
    const reason = reasonText || (full ? status.trim() : 'Returned by the bank');
    if (!payment) {
      unknown += 1;
      continue;
    }
    payment.matched = true;
    if (isReturned) {
      returned.push({
        employee: payment.employee,
        channel: payment.channel,
        account: lastFour(payment.accountNumber),
        amount: money(payment.amount),
        code,
        reason,
      });
    } else if (CREDITED.test(status)) credited += 1;
  }
  return {
    summary: {
      full,
      payments: sent.length,
      credited,
      returned: returned.length,
      notReported: full ? open.filter((p) => !p.matched).length : 0,
      unknown,
    },
    returned,
  };
}
