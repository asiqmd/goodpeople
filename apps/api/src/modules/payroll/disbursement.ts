import { Decimal, money, type PaymentMethod } from '@gp/shared';

// How a person's net pay is split across their payment accounts, and the files banks and
// mobile wallets take. Pure, so the split is tested on its own.

export interface PayableAccount {
  method: PaymentMethod;
  /** Bank name, or bkash / nagad / rocket / upay. */
  provider: string | null;
  branchName: string | null;
  routingNumber: string | null;
  accountName: string | null;
  accountNumber: string | null;
  isPrimary: boolean;
  splitAmount: string | null;
}

export interface Payment {
  method: PaymentMethod;
  provider: string | null;
  branchName: string | null;
  routingNumber: string | null;
  accountName: string | null;
  accountNumber: string | null;
  amount: string;
}

/** The channel a payment goes out through: a bank transfer, one wallet, or cash. */
export const channelOf = (p: Pick<Payment, 'method' | 'provider'>) =>
  p.method === 'mfs' ? (p.provider ?? 'mfs') : p.method;

/**
 * Splits a net amount: each other account takes its fixed amount while money is left, then
 * the primary account takes the rest. With no accounts at all, the pay is cash.
 */
export function allocate(net: string, accounts: PayableAccount[]): Payment[] {
  let left = new Decimal(net);
  if (left.lessThanOrEqualTo(0)) return [];
  const pay = (a: PayableAccount | null, amount: Decimal): Payment => ({
    method: a?.method ?? 'cash',
    provider: a?.provider ?? null,
    branchName: a?.branchName ?? null,
    routingNumber: a?.routingNumber ?? null,
    accountName: a?.accountName ?? null,
    accountNumber: a?.accountNumber ?? null,
    amount: money(amount),
  });
  const primary = accounts.find((a) => a.isPrimary) ?? accounts[0] ?? null;
  const out: Payment[] = [];
  for (const a of accounts) {
    if (a === primary || !a.splitAmount) continue;
    const part = Decimal.min(left, a.splitAmount);
    if (part.lessThanOrEqualTo(0)) continue;
    out.push(pay(a, part));
    left = left.minus(part);
  }
  if (left.greaterThan(0)) out.push(pay(primary, left));
  return out;
}

/** A CSV field, quoted when it holds a comma, quote or line break. */
const field = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
export const csv = (rows: string[][]) => `${rows.map((r) => r.map(field).join(',')).join('\n')}\n`;
